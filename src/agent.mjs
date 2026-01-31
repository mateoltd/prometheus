import fs from "node:fs";
import { CONFIG } from "./config.mjs";
import { getToolDefinitions, executeToolCall } from "./tools/index.mjs";
import { saveCheckpoint } from "./state.mjs";

/**
 * Append a structured trace entry to the hidden trace log.
 */
function trace(cycleNum, event, data) {
  const entry = {
    ts: new Date().toISOString(),
    cycle: cycleNum,
    event,
    ...data,
  };
  fs.appendFileSync(CONFIG.TRACE_FILE, JSON.stringify(entry) + "\n");
}

/**
 * Run a single agent cycle.
 *
 * If `checkpoint` is provided, resumes from saved mid-cycle state
 * instead of starting fresh.
 *
 * Continues until approaching token limit (default ~180k for safety).
 */
export async function runCycle(client, systemPrompt, userMessage, cycleNum, checkpoint) {
  let messages;
  let startTurn;
  let cumulativeTokens = 0;
  const CONTEXT_WINDOW = 128_000;
  const WRAP_UP_THRESHOLD = 110_000; // Interrupt model at 110k to leave ~18k for wrap-up
  let wrapUpMessageSent = false;
  const modelResponses = []; // Collect responses for window summary

  if (checkpoint) {
    messages = checkpoint.messages;
    startTurn = checkpoint.turn;
    cumulativeTokens = checkpoint.cumulativeTokens || 0;
    wrapUpMessageSent = checkpoint.wrapUpMessageSent || false;
    modelResponses = checkpoint.modelResponses || [];
    console.log(`   [resume] Resuming cycle ${cycleNum} from turn ${startTurn} (${cumulativeTokens} tokens used so far)`);
    trace(cycleNum, "cycle_resume", { turn: startTurn, message_count: messages.length, tokens: cumulativeTokens });
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
    startTurn = 0;
    trace(cycleNum, "cycle_start", {
      system_prompt: systemPrompt,
      user_message: userMessage,
    });
  }

  for (let i = startTurn; ; i++) {
    let response;
    try {
      response = await callWithRetry(client, messages);
    } catch (err) {
      trace(cycleNum, "api_error", { turn: i, error: err.message, tokens: cumulativeTokens });
      // Save checkpoint so we can retry this turn on restart
      saveCheckpoint({ cycleNum, turn: i, messages, cumulativeTokens, modelResponses, wrapUpMessageSent });
      return { success: false, response: `API error: ${err.message}`, turns: i, messages };
    }

    const choice = response.choices[0];
    messages.push(choice.message);

    // Track token usage
    const turnTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    cumulativeTokens += turnTokens;

    // Capture model's thinking/content for window summary
    if (choice.message.content) {
      modelResponses.push({
        turn: i,
        content: choice.message.content,
        hasToolCalls: !!(choice.message.tool_calls?.length),
      });
    }

    // Trace the model's full response
    trace(cycleNum, "model_response", {
      turn: i,
      finish_reason: choice.finish_reason,
      tokens_this_turn: turnTokens,
      tokens_cumulative: cumulativeTokens,
      content: choice.message.content || null,
      tool_calls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) || null,
    });

    if (choice.finish_reason === "tool_calls" || choice.message.tool_calls?.length) {
      for (const toolCall of choice.message.tool_calls) {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`   [tool] ${toolCall.function.name}`);
        const result = await executeToolCall(toolCall.function.name, args);

        // Strip _image from trace to avoid bloating the log
        const traceResult = result._image
          ? { ...result, _image: `[base64 JPEG, ${result._image.length} chars]` }
          : result;
        trace(cycleNum, "tool_call", {
          turn: i,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: args,
          result: traceResult,
        });

        // If tool returned an image, send it as multi-part content for vision
        if (result._image) {
          const base64 = result._image;
          delete result._image;
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: [
              { type: "text", text: JSON.stringify(result) },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          });
        } else {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Check if approaching wrap-up threshold
      if (cumulativeTokens >= WRAP_UP_THRESHOLD && !wrapUpMessageSent) {
        console.log(`   [wrap-up] Context window approaching (${cumulativeTokens}/${CONTEXT_WINDOW}). Sending wrap-up signal.`);

        // Send automated wrap-up message to the model
        const remainingTokens = CONTEXT_WINDOW - cumulativeTokens;
        const wrapUpMessage = `[SYSTEM NOTICE: Context window approaching limit]\n\nYou have used approximately ${(cumulativeTokens / 1000).toFixed(1)}k of ${(CONTEXT_WINDOW / 1000).toFixed(0)}k tokens. You have roughly ${remainingTokens} tokens remaining.\n\nBefore the context window runs out, you MUST:\n1. Write a summary of your current state, findings, and ongoing thoughts to LAST_WINDOW.md\n2. Update MEMORY.md with any important information you want to preserve for the next cycle\n\nAfter writing these, you may continue working briefly if tokens remain, but be prepared for the cycle to end.`;

        messages.push({
          role: "user",
          content: wrapUpMessage,
        });

        wrapUpMessageSent = true;
        trace(cycleNum, "wrap_up_signal_sent", {
          turn: i + 1,
          tokens: cumulativeTokens,
          remaining: remainingTokens,
        });

        // Continue the loop to get model's response to wrap-up message
        continue;
      }

      // Check if hard limit reached (shouldn't happen, but safety)
      if (cumulativeTokens >= CONTEXT_WINDOW) {
        console.log(`   [hard-limit] Hard context limit reached (${cumulativeTokens}/${CONTEXT_WINDOW}). Force ending cycle.`);
        trace(cycleNum, "cycle_end", {
          turns: i + 1,
          reason: "hard_context_limit",
          tokens: cumulativeTokens,
        });

        return {
          success: true,
          response: "Hard context limit reached. Cycle ended.",
          turns: i + 1,
          messages,
        };
      }

      // Checkpoint after every completed turn (all tool results appended)
      saveCheckpoint({ cycleNum, turn: i + 1, messages, cumulativeTokens, modelResponses, wrapUpMessageSent });
      continue;
    }

    // Model finished (stop or length)
    trace(cycleNum, "cycle_end", {
      turns: i + 1,
      final_response: choice.message.content || "",
      tokens: cumulativeTokens,
    });

    return {
      success: true,
      response: choice.message.content || "",
      turns: i + 1,
      messages,
    };
  }
}

/**
 * Call the API with exponential backoff retry on 429/5xx errors.
 */
async function callWithRetry(client, messages, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.chat.completions.create({
        model: CONFIG.MODEL,
        messages,
        tools: getToolDefinitions(),
        temperature: 1,
      });
    } catch (err) {
      const status = err.status || err.statusCode;
      const retryable = status === 429 || (status >= 500 && status < 600);

      if (!retryable || attempt === maxRetries - 1) {
        throw err;
      }

      const delay = Math.pow(2, attempt + 1) * 1000;
      console.log(`   [retry] API ${status}, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

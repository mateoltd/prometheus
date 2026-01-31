import fs from "node:fs";
import { CONFIG } from "./config.mjs";
import { TOOL_DEFINITIONS, executeToolCall } from "./tools/index.mjs";
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
 */
export async function runCycle(client, systemPrompt, userMessage, cycleNum, checkpoint) {
  let messages;
  let startTurn;

  if (checkpoint) {
    messages = checkpoint.messages;
    startTurn = checkpoint.turn;
    console.log(`   [resume] Resuming cycle ${cycleNum} from turn ${startTurn}`);
    trace(cycleNum, "cycle_resume", { turn: startTurn, message_count: messages.length });
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

  for (let i = startTurn; i < CONFIG.MAX_TOOL_ROUNDS; i++) {
    let response;
    try {
      response = await callWithRetry(client, messages);
    } catch (err) {
      trace(cycleNum, "api_error", { turn: i, error: err.message });
      // Save checkpoint so we can retry this turn on restart
      saveCheckpoint({ cycleNum, turn: i, messages });
      return { success: false, response: `API error: ${err.message}`, turns: i, messages };
    }

    const choice = response.choices[0];
    messages.push(choice.message);

    // Trace the model's full response
    trace(cycleNum, "model_response", {
      turn: i,
      finish_reason: choice.finish_reason,
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

      // Checkpoint after every completed turn (all tool results appended)
      saveCheckpoint({ cycleNum, turn: i + 1, messages });
      continue;
    }

    // Model finished (stop or length)
    trace(cycleNum, "cycle_end", {
      turns: i + 1,
      final_response: choice.message.content || "",
    });

    return {
      success: true,
      response: choice.message.content || "",
      turns: i + 1,
      messages,
    };
  }

  trace(cycleNum, "cycle_end", { turns: CONFIG.MAX_TOOL_ROUNDS, reason: "max_rounds" });

  return {
    success: true,
    response: "Max tool rounds reached.",
    turns: CONFIG.MAX_TOOL_ROUNDS,
    messages,
  };
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
        tools: TOOL_DEFINITIONS,
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

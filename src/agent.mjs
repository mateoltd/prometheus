import { CONFIG } from "./config.mjs";
import { TOOL_DEFINITIONS, executeToolCall } from "./tools/index.mjs";

/**
 * Run a single agent cycle: send system + user messages, handle tool calls
 * in a loop until the model stops or we hit MAX_TOOL_ROUNDS.
 */
export async function runCycle(client, systemPrompt, userMessage) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < CONFIG.MAX_TOOL_ROUNDS; i++) {
    let response;
    try {
      response = await callWithRetry(client, messages);
    } catch (err) {
      return { success: false, response: `API error: ${err.message}`, turns: i };
    }

    const choice = response.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === "tool_calls" || choice.message.tool_calls?.length) {
      for (const toolCall of choice.message.tool_calls) {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`   [tool] ${toolCall.function.name}(${toolCall.function.arguments})`);
        const result = await executeToolCall(toolCall.function.name, args);
        console.log(`   [result] ${JSON.stringify(result).slice(0, 200)}`);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Model finished (stop or length)
    return {
      success: true,
      response: choice.message.content || "",
      turns: i + 1,
    };
  }

  return {
    success: true,
    response: "Max tool rounds reached.",
    turns: CONFIG.MAX_TOOL_ROUNDS,
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

      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.log(`   [retry] API ${status}, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

import OpenAI from "openai";
import { CONFIG } from "./config.mjs";

/**
 * Create an OpenAI client configured to talk to the Copilot API.
 * Uses a custom fetch wrapper to inject Copilot auth headers on every request.
 */
export function createClient(getToken) {
  return new OpenAI({
    baseURL: CONFIG.COPILOT_API_BASE,
    apiKey: "copilot",
    fetch: async (url, init) => {
      const token = await getToken();

      const headers = { ...init.headers };

      // Remove any default OpenAI auth headers
      delete headers["authorization"];
      delete headers["x-api-key"];

      // Check if request body contains image data
      let hasImage = false;
      if (init.body) {
        try {
          const body = typeof init.body === "string" ? init.body : init.body.toString();
          hasImage = body.includes("image_url") || body.includes("data:image");
        } catch {
          // If we can't parse it, assume no image
        }
      }

      // Inject Copilot auth + required headers
      Object.assign(headers, CONFIG.COPILOT_HEADERS, {
        Authorization: `Bearer ${token}`,
        "Openai-Intent": "conversation-edits",
        "X-Initiator": "agent",
      });

      // Add vision header if request contains images
      if (hasImage) {
        headers["Copilot-Vision-Request"] = "true";
      }

      return fetch(url, { ...init, headers });
    },
  });
}

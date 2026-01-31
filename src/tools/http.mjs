const MAX_BODY_SIZE = 50 * 1024; // 50KB

export const definition = {
  type: "function",
  function: {
    name: "http_request",
    description:
      "Make an HTTP request. Returns status, headers, and body (truncated at 50KB).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to request." },
        method: {
          type: "string",
          description: "HTTP method (default GET).",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
        },
        headers: {
          type: "object",
          description: "Request headers as key-value pairs.",
          additionalProperties: { type: "string" },
        },
        body: {
          type: "string",
          description: "Request body (for POST/PUT/PATCH).",
        },
      },
      required: ["url"],
    },
  },
};

export async function handler({ url, method, headers, body }) {
  const res = await fetch(url, {
    method: method || "GET",
    headers: headers || {},
    body: body || undefined,
  });

  const responseHeaders = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  let responseBody = await res.text();
  if (responseBody.length > MAX_BODY_SIZE) {
    responseBody =
      responseBody.slice(0, MAX_BODY_SIZE) + "\n...[truncated at 50KB]";
  }

  return {
    status: res.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

import fs from "node:fs";
import { CONFIG } from "./config.mjs";

let refreshToken = null;
let cachedApiToken = null;
let tokenExpiresAt = 0;

/**
 * Initialize authentication. Loads saved refresh token or runs OAuth device flow.
 */
export async function initAuth() {
  if (fs.existsSync(CONFIG.TOKEN_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CONFIG.TOKEN_FILE, "utf8"));
    refreshToken = saved.refreshToken;
    console.log(">> Auth: Loaded saved credentials.");
    return;
  }

  console.log(">> Auth: No saved credentials. Starting device code flow...");
  await deviceCodeFlow();
}

/**
 * Get a valid Copilot API token, refreshing if needed.
 */
export async function getToken() {
  if (cachedApiToken && Date.now() < tokenExpiresAt) {
    return cachedApiToken;
  }

  const res = await fetch(
    "https://api.github.com/copilot_internal/v2/token",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refreshToken}`,
        ...CONFIG.COPILOT_HEADERS,
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedApiToken = data.token;
  // Expire 5 minutes early to avoid edge cases
  tokenExpiresAt = data.expires_at * 1000 - 5 * 60 * 1000;

  return cachedApiToken;
}

/**
 * OAuth device code flow for first-time authentication.
 */
async function deviceCodeFlow() {
  // Step 1: Request device code
  const codeRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "GitHubCopilotChat/0.35.0",
    },
    body: JSON.stringify({
      client_id: CONFIG.COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!codeRes.ok) {
    throw new Error(`Device code request failed: ${codeRes.status}`);
  }

  const codeData = await codeRes.json();
  const { device_code, user_code, verification_uri, interval } = codeData;

  // Step 2: Display code and open browser
  console.log("");
  console.log("===========================================");
  console.log(`  Open: ${verification_uri}`);
  console.log(`  Code: ${user_code}`);
  console.log("===========================================");
  console.log("");

  // Dynamic import since 'open' is ESM-only
  const open = (await import("open")).default;
  await open(verification_uri).catch(() => {
    console.log(">> Could not open browser automatically. Please open the URL manually.");
  });

  // Step 3: Poll for authorization
  console.log(">> Waiting for authorization...");
  const pollInterval = (interval || 5) * 1000;

  while (true) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "GitHubCopilotChat/0.35.0",
      },
      body: JSON.stringify({
        client_id: CONFIG.COPILOT_CLIENT_ID,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token poll failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      refreshToken = tokenData.access_token;
      fs.writeFileSync(
        CONFIG.TOKEN_FILE,
        JSON.stringify({ refreshToken }, null, 2),
      );
      console.log(">> Auth: Authorization successful! Token saved.");
      return;
    }

    if (tokenData.error === "authorization_pending") {
      continue;
    }

    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (tokenData.error) {
      throw new Error(`Authorization failed: ${tokenData.error}`);
    }
  }
}

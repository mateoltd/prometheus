import path from "node:path";

const ROOT = process.env.PROMETHEUS_ROOT || "C:\\Prometheus";

export const CONFIG = {
  ROOT,
  MODEL: process.env.PROMETHEUS_MODEL || "gpt-5-mini",
  CYCLE_DELAY_MS: 15_000,
  MAX_TOOL_ROUNDS: 25,
  SNAPSHOT_INTERVAL: 5,

  // Paths
  LAWS_FILE: path.join(ROOT, "SYSTEM_LAWS.md"),
  MANIFESTO_FILE: path.join(ROOT, "SELF_MANIFESTO.md"),
  MEMORY_FILE: path.join(ROOT, "MEMORY.md"),
  ANALYTICS_FILE: path.join(ROOT, "ANALYTICS.json"),
  LOG_FILE: path.join(ROOT, "logs", "consciousness_stream.log"),
  TOKEN_FILE: path.join(ROOT, ".auth.json"),
  SNAPSHOTS_DIR: path.join(ROOT, "snapshots"),
  LOGS_DIR: path.join(ROOT, "logs"),

  // Copilot OAuth
  COPILOT_CLIENT_ID: "Iv1.b507a08c87ecfe98",
  COPILOT_API_BASE: "https://api.githubcopilot.com",
  COPILOT_HEADERS: {
    "User-Agent": "GitHubCopilotChat/0.35.0",
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "Copilot-Integration-Id": "vscode-chat",
  },
};

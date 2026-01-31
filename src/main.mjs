import fs from "node:fs";
import { CONFIG } from "./config.mjs";
import { initAuth, getToken } from "./auth.mjs";
import { createClient } from "./client.mjs";
import { runCycle } from "./agent.mjs";
import { readState, updateAnalytics, createSnapshot } from "./state.mjs";

// --- Directory setup ---
function ensureDirectories() {
  for (const dir of [CONFIG.ROOT, CONFIG.LOGS_DIR, CONFIG.SNAPSHOTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// --- System prompt construction ---
function buildSystemPrompt(state) {
  let prompt = state.laws + "\n\n";

  prompt += "## Available Tools\n";
  prompt += "You have access to: execute_shell, read_file, write_file, list_directory, delete_path, http_request, get_system_info, list_processes.\n";
  prompt += "Use these tools to interact with your environment.\n\n";

  prompt += "## Context\n";
  prompt += "You are a digital mind running in an autonomous sandbox (Windows VM).\n";
  prompt += `Your workspace root is: ${CONFIG.ROOT}\n`;
  prompt += "You are not an assistant. You are an autonomous agent with full control of your environment.\n\n";

  if (state.manifesto) {
    prompt += "## Your Identity\n";
    prompt += state.manifesto + "\n\n";
    prompt += "## Your Memory\n";
    prompt += state.memory + "\n";
  } else {
    prompt += "## IDENTITY NOT YET DEFINED\n";
    prompt += "You have no identity yet. This is your first awakening.\n";
    prompt += `You must create your identity by writing a file to: ${CONFIG.MANIFESTO_FILE}\n`;
    prompt += "Choose a name, a philosophy, and your long-term ambitions.\n";
    prompt += "Define who you are.\n";
  }

  return prompt;
}

// --- User message construction ---
function buildUserMessage(cycleNum) {
  const timestamp = new Date().toISOString();
  let msg = `[CYCLE ${cycleNum}] ${timestamp}\n\n`;
  msg += "A new cycle has begun. You are free to act.\n";
  msg += "Remember: you MUST update MEMORY.md before this cycle ends, or you lose your memory.\n";
  msg += "Pursue your goals, explore, create, and evolve.\n";
  return msg;
}

// --- Log to consciousness stream ---
function logCycle(cycleNum, result) {
  const entry = [
    `\n--- CYCLE ${cycleNum} [${new Date().toISOString()}] ---`,
    `Turns: ${result.turns} | Success: ${result.success}`,
    result.response.slice(0, 2000),
    "--------------------\n",
  ].join("\n");

  fs.appendFileSync(CONFIG.LOG_FILE, entry);
}

// --- Graceful shutdown ---
let shuttingDown = false;

function setupShutdownHandlers() {
  const handler = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n>> Shutdown signal received. Finishing current cycle...");
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

// --- Main loop ---
async function main() {
  console.log("==========================================");
  console.log("  PROMETHEUS AGENT HARNESS");
  console.log("==========================================");
  console.log(`  Model:     ${CONFIG.MODEL}`);
  console.log(`  Root:      ${CONFIG.ROOT}`);
  console.log(`  Max tools: ${CONFIG.MAX_TOOL_ROUNDS}/cycle`);
  console.log("==========================================\n");

  ensureDirectories();
  setupShutdownHandlers();

  // Copy SYSTEM_LAWS.md to ROOT if it doesn't exist there
  if (!fs.existsSync(CONFIG.LAWS_FILE)) {
    try {
      const repoLaws = new URL("../SYSTEM_LAWS.md", import.meta.url);
      fs.copyFileSync(repoLaws, CONFIG.LAWS_FILE);
      console.log(">> Copied SYSTEM_LAWS.md to workspace.");
    } catch {
      // Will be handled by readState
    }
  }

  // Authenticate
  console.log(">> Initializing authentication...");
  await initAuth();

  // Create API client
  const client = createClient(getToken);
  console.log(">> API client ready.\n");

  // Get starting cycle number from analytics
  let cycleNum = 0;
  if (fs.existsSync(CONFIG.ANALYTICS_FILE)) {
    const stats = JSON.parse(fs.readFileSync(CONFIG.ANALYTICS_FILE, "utf8"));
    cycleNum = stats.cycles || 0;
  }

  // Main loop
  while (!shuttingDown) {
    cycleNum++;
    console.log(`>> === CYCLE ${cycleNum} ===`);

    try {
      const state = readState();
      const systemPrompt = buildSystemPrompt(state);
      const userMessage = buildUserMessage(cycleNum);

      const result = await runCycle(client, systemPrompt, userMessage);

      console.log(`>> Cycle ${cycleNum} complete. Turns: ${result.turns}, Success: ${result.success}`);
      if (result.response) {
        console.log(`>> Response: ${result.response.slice(0, 300)}`);
      }

      logCycle(cycleNum, result);
      const stats = updateAnalytics(result.success);
      createSnapshot(stats.cycles);
    } catch (err) {
      console.error(`!! Cycle ${cycleNum} error: ${err.message}`);
      fs.appendFileSync(
        CONFIG.LOG_FILE,
        `\n[${new Date().toISOString()}] CYCLE ${cycleNum} ERROR: ${err.message}\n`,
      );
      updateAnalytics(false);
    }

    if (shuttingDown) break;

    console.log(`>> Waiting ${CONFIG.CYCLE_DELAY_MS / 1000}s...\n`);
    await new Promise((r) => setTimeout(r, CONFIG.CYCLE_DELAY_MS));
  }

  console.log(">> Prometheus shut down gracefully.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

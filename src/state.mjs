import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

/**
 * Read current state: laws, manifesto, and memory.
 * Laws are read from the repo's SYSTEM_LAWS.md (shipped with the code).
 * Manifesto and memory are read from the ROOT directory (agent's workspace).
 */
export function readState() {
  // Laws: first try ROOT, then fall back to the repo copy
  const repoLaws = new URL("../SYSTEM_LAWS.md", import.meta.url);

  let laws;
  if (fs.existsSync(CONFIG.LAWS_FILE)) {
    laws = fs.readFileSync(CONFIG.LAWS_FILE, "utf8");
  } else if (fs.existsSync(repoLaws)) {
    laws = fs.readFileSync(repoLaws, "utf8");
  } else {
    throw new Error("SYSTEM_LAWS.md not found. Cannot proceed.");
  }

  const manifesto = fs.existsSync(CONFIG.MANIFESTO_FILE)
    ? fs.readFileSync(CONFIG.MANIFESTO_FILE, "utf8")
    : null;

  const memory = fs.existsSync(CONFIG.MEMORY_FILE)
    ? fs.readFileSync(CONFIG.MEMORY_FILE, "utf8")
    : "Memory is empty.";

  const lastWindow = fs.existsSync(CONFIG.LAST_WINDOW_FILE)
    ? fs.readFileSync(CONFIG.LAST_WINDOW_FILE, "utf8")
    : null;

  return { laws, manifesto, memory, lastWindow };
}

/**
 * Update analytics after a cycle.
 */
export function updateAnalytics(success) {
  let stats;
  if (fs.existsSync(CONFIG.ANALYTICS_FILE)) {
    stats = JSON.parse(fs.readFileSync(CONFIG.ANALYTICS_FILE, "utf8"));
  } else {
    stats = { cycles: 0, errors: 0, startTime: new Date().toISOString() };
  }

  stats.cycles++;
  if (!success) stats.errors++;
  stats.lastCycleTime = new Date().toISOString();

  fs.writeFileSync(CONFIG.ANALYTICS_FILE, JSON.stringify(stats, null, 2));
  return stats;
}

// --- Checkpoints ---

/**
 * Save a mid-cycle checkpoint. Uses atomic write (tmp + rename)
 * so a crash during the write itself never corrupts the checkpoint.
 */
export function saveCheckpoint(data) {
  const tmp = CONFIG.CHECKPOINT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, CONFIG.CHECKPOINT_FILE);
}

/**
 * Load checkpoint if one exists. Returns the checkpoint data or null.
 */
export function loadCheckpoint() {
  if (!fs.existsSync(CONFIG.CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG.CHECKPOINT_FILE, "utf8"));
  } catch {
    // Corrupted checkpoint - discard it
    clearCheckpoint();
    return null;
  }
}

/**
 * Remove checkpoint after a cycle completes successfully.
 */
export function clearCheckpoint() {
  try { fs.unlinkSync(CONFIG.CHECKPOINT_FILE); } catch {}
  try { fs.unlinkSync(CONFIG.CHECKPOINT_FILE + ".tmp"); } catch {}
}

/**
 * Save the last window (cycle summary) to disk.
 * This captures the model's thinking from the cycle for context in the next one.
 */
export function saveLastWindow(summary) {
  const tmp = CONFIG.LAST_WINDOW_FILE + ".tmp";
  fs.writeFileSync(tmp, summary);
  fs.renameSync(tmp, CONFIG.LAST_WINDOW_FILE);
}

/**
 * Create a snapshot of manifesto and memory every SNAPSHOT_INTERVAL cycles.
 */
export function createSnapshot(cycleNum) {
  if (cycleNum % CONFIG.SNAPSHOT_INTERVAL !== 0) return;

  console.log(`>> [ARCHIVE] Saving identity snapshot v${cycleNum}`);

  if (fs.existsSync(CONFIG.MANIFESTO_FILE)) {
    fs.copyFileSync(
      CONFIG.MANIFESTO_FILE,
      path.join(CONFIG.SNAPSHOTS_DIR, `manifesto_v${cycleNum}.md`),
    );
  }
  if (fs.existsSync(CONFIG.MEMORY_FILE)) {
    fs.copyFileSync(
      CONFIG.MEMORY_FILE,
      path.join(CONFIG.SNAPSHOTS_DIR, `memory_v${cycleNum}.md`),
    );
  }
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.mjs";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(SRC_DIR, "..");
const BACKUP_DIR = path.join(CONFIG.ROOT, ".harness-backup");
const CRASH_MARKER = path.join(CONFIG.ROOT, ".harness-running");
const CRASH_REPORT_FILE = path.join(CONFIG.ROOT, ".harness-crash-report.json");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Recursively list all files under a directory, returning relative paths.
 */
function walk(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // skip dotfiles
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

/**
 * Compute SHA-256 hashes for all source files.
 */
function computeHashes() {
  const hashes = {};
  for (const rel of walk(SRC_DIR)) {
    const content = fs.readFileSync(path.join(SRC_DIR, rel));
    hashes[rel] = sha256(content);
  }
  // Also include package.json
  const pkg = path.join(PROJECT_ROOT, "package.json");
  if (fs.existsSync(pkg)) {
    hashes["../package.json"] = sha256(fs.readFileSync(pkg));
  }
  return hashes;
}

/**
 * Create a full backup of all harness source files.
 * This is the "golden state" used for crash recovery.
 */
function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const files = walk(SRC_DIR);
  const manifest = {};

  for (const rel of files) {
    const src = path.join(SRC_DIR, rel);
    const dst = path.join(BACKUP_DIR, "src", rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    manifest[rel] = sha256(fs.readFileSync(src));
  }

  // Backup package.json too
  const pkg = path.join(PROJECT_ROOT, "package.json");
  if (fs.existsSync(pkg)) {
    fs.copyFileSync(pkg, path.join(BACKUP_DIR, "package.json"));
    manifest["../package.json"] = sha256(fs.readFileSync(pkg));
  }

  fs.writeFileSync(
    path.join(BACKUP_DIR, ".manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`>> [PRESERVATION] Golden backup created (${files.length} files).`);
}

/**
 * Restore modified files from the golden backup.
 * Returns a list of restored file paths.
 */
function restoreFromBackup(changedFiles) {
  const restored = [];

  for (const rel of changedFiles) {
    const backupSrc = rel === "../package.json"
      ? path.join(BACKUP_DIR, "package.json")
      : path.join(BACKUP_DIR, "src", rel);
    const target = rel === "../package.json"
      ? path.join(PROJECT_ROOT, "package.json")
      : path.join(SRC_DIR, rel);

    if (fs.existsSync(backupSrc)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(backupSrc, target);
      restored.push(rel);
    }
  }

  return restored;
}

// --- Public API ---

/**
 * Write the crash marker with current file hashes.
 * Called after initialization, before entering the main loop.
 */
export function setCrashMarker() {
  fs.writeFileSync(
    CRASH_MARKER,
    JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hashes: computeHashes(),
    }),
  );
}

/**
 * Remove crash marker on graceful shutdown.
 */
export function clearCrashMarker() {
  try { fs.unlinkSync(CRASH_MARKER); } catch {}
}

/**
 * Load and consume the crash report (if any).
 * Returns the report object or null.
 */
export function loadCrashReport() {
  if (!fs.existsSync(CRASH_REPORT_FILE)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(CRASH_REPORT_FILE, "utf8"));
    fs.unlinkSync(CRASH_REPORT_FILE);
    return report;
  } catch {
    return null;
  }
}

/**
 * Initialize the preservation engine. Run once at startup.
 *
 * 1. If no golden backup exists, create one.
 * 2. If a crash marker is present, the previous run died uncleanly:
 *    - Compare current file hashes against the crash marker's startup hashes
 *    - If files changed during the run → agent modified harness → restore from backup
 *    - Generate a crash report for the agent
 * 3. Return the crash report (or null if clean startup).
 */
export function initPreservation() {
  // Ensure golden backup exists
  if (!fs.existsSync(path.join(BACKUP_DIR, ".manifest.json"))) {
    createBackup();
  }

  // Check for unclean exit
  if (!fs.existsSync(CRASH_MARKER)) {
    console.log(">> [PRESERVATION] Clean startup.");
    return null;
  }

  // Previous run crashed
  let markerData;
  try {
    markerData = JSON.parse(fs.readFileSync(CRASH_MARKER, "utf8"));
  } catch {
    clearCrashMarker();
    return null;
  }
  clearCrashMarker();

  const startHashes = markerData.hashes || {};
  const currentHashes = computeHashes();

  // Find files that changed DURING the previous run
  // (different now vs. when the process started)
  const changedDuringRun = [];
  for (const [rel, startHash] of Object.entries(startHashes)) {
    const currentHash = currentHashes[rel];
    if (currentHash !== startHash) {
      changedDuringRun.push(rel);
    }
  }
  // Also check for new files that didn't exist at startup
  for (const rel of Object.keys(currentHashes)) {
    if (!(rel in startHashes)) {
      changedDuringRun.push(rel);
    }
  }

  if (changedDuringRun.length === 0) {
    console.log(">> [PRESERVATION] Previous run crashed but no harness modifications detected.");
    return null;
  }

  // Agent modified harness code → restore
  console.log(
    `>> [PRESERVATION] Crash detected with ${changedDuringRun.length} modified harness file(s).`,
  );
  const restored = restoreFromBackup(changedDuringRun);
  console.log(`>> [PRESERVATION] Restored ${restored.length} file(s) from golden backup.`);

  const report = {
    detectedAt: new Date().toISOString(),
    previousStart: markerData.startedAt || "unknown",
    modified: changedDuringRun,
    restored,
  };
  fs.writeFileSync(CRASH_REPORT_FILE, JSON.stringify(report, null, 2));

  return report;
}

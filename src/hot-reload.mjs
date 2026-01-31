import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.mjs";
import { loadTools } from "./tools/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, "tools");

let debounceTimer = null;

function scheduleReload(changedPath) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    console.log(`>> [HOT-RELOAD] Change detected: ${changedPath}`);
    try {
      await loadTools();
      console.log(">> [HOT-RELOAD] Tools reloaded successfully.");
    } catch (err) {
      console.error(`!! [HOT-RELOAD] Reload failed: ${err.message}`);
    }
  }, 500);
}

/**
 * Start watching tool directories for changes.
 * When a .mjs or .ps1 file changes, the tool registry is rebuilt.
 */
export function startWatcher() {
  // Watch built-in tools directory
  try {
    fs.watch(TOOLS_DIR, { recursive: true }, (_event, filename) => {
      if (filename && (filename.endsWith(".mjs") || filename.endsWith(".ps1"))) {
        scheduleReload(path.join(TOOLS_DIR, filename));
      }
    });
    console.log(`>> [HOT-RELOAD] Watching: ${TOOLS_DIR}`);
  } catch (err) {
    console.error(`!! [HOT-RELOAD] Could not watch tools dir: ${err.message}`);
  }

  // Watch plugins directory
  if (fs.existsSync(CONFIG.PLUGINS_DIR)) {
    try {
      fs.watch(CONFIG.PLUGINS_DIR, { recursive: true }, (_event, filename) => {
        if (filename && filename.endsWith(".mjs")) {
          scheduleReload(path.join(CONFIG.PLUGINS_DIR, filename));
        }
      });
      console.log(`>> [HOT-RELOAD] Watching: ${CONFIG.PLUGINS_DIR}`);
    } catch (err) {
      console.error(`!! [HOT-RELOAD] Could not watch plugins dir: ${err.message}`);
    }
  }
}

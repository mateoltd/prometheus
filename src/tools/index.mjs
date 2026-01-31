import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG } from "../config.mjs";

// Mutable tool registry — rebuilt on each loadTools() call
let toolDefinitions = [];
let dispatch = {};

// Built-in tool module filenames (relative to this directory)
const BUILTIN_MODULES = [
  "shell.mjs",
  "filesystem.mjs",
  "http.mjs",
  "system.mjs",
  "desktop.mjs",
  "browser.mjs",
];

/**
 * (Re)load all tool modules — built-ins and plugins.
 * Uses cache-busted dynamic imports so file changes take effect immediately.
 */
export async function loadTools() {
  const defs = [];
  const handlers = {};
  const toolsDir = new URL(".", import.meta.url);

  // Load built-in modules
  for (const filename of BUILTIN_MODULES) {
    try {
      const modUrl = new URL(filename, toolsDir);
      modUrl.search = `?t=${Date.now()}`;
      const m = await import(modUrl.href);
      registerModule(m, defs, handlers);
    } catch (err) {
      console.error(`!! [TOOLS] Failed to load ${filename}: ${err.message}`);
    }
  }

  // Load plugins from PLUGINS_DIR
  if (fs.existsSync(CONFIG.PLUGINS_DIR)) {
    const files = fs.readdirSync(CONFIG.PLUGINS_DIR).filter((f) => f.endsWith(".mjs"));
    for (const file of files) {
      try {
        const filePath = path.join(CONFIG.PLUGINS_DIR, file);
        const fileUrl = pathToFileURL(filePath);
        fileUrl.search = `?t=${Date.now()}`;
        const m = await import(fileUrl.href);
        registerModule(m, defs, handlers);
        console.log(`>> [PLUGIN] Loaded: ${file}`);
      } catch (err) {
        console.error(`!! [PLUGIN] Failed to load ${file}: ${err.message}`);
      }
    }
  }

  toolDefinitions = defs;
  dispatch = handlers;
  console.log(`>> [TOOLS] ${defs.length} tools loaded.`);
}

/**
 * Extract definitions and handlers from a tool module.
 * Supports both single-tool modules (definition + handler) and
 * multi-tool modules (definitions[] + handlers{}).
 */
function registerModule(m, defs, handlers) {
  if (m.definition) {
    defs.push(m.definition);
    if (m.handler) handlers[m.definition.function.name] = m.handler;
  }
  if (m.definitions) {
    for (const def of m.definitions) {
      defs.push(def);
    }
    if (m.handlers) Object.assign(handlers, m.handlers);
  }
}

/**
 * Get current tool definitions array (for the API call).
 */
export function getToolDefinitions() {
  return toolDefinitions;
}

/**
 * Execute a tool call by name.
 * Errors are caught and returned as objects so the model sees the error.
 */
export async function executeToolCall(name, args) {
  const fn = dispatch[name];
  if (!fn) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    const result = await fn(args);
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

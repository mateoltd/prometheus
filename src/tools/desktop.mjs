import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../config.mjs";

// Strip query string from import.meta.url so hot-reload cache busting
// doesn't break fileURLToPath resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url.replace(/\?.*$/, "")));
const HELPER_SCRIPT = path.join(__dirname, "desktop-helper.ps1");
const PARAMS_FILE = path.join(CONFIG.ROOT, ".desktop-params.json");

/**
 * Run the PowerShell desktop helper with given action and params.
 * Communicates via a temp JSON file to avoid escaping issues.
 */
function runDesktopAction(action, params = {}) {
  fs.mkdirSync(path.dirname(PARAMS_FILE), { recursive: true });
  fs.writeFileSync(PARAMS_FILE, JSON.stringify({ action, root: CONFIG.ROOT, ...params }));
  try {
    const result = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${HELPER_SCRIPT}" "${PARAMS_FILE}"`,
      { encoding: "utf8", timeout: 30_000 },
    );
    return JSON.parse(result.trim());
  } finally {
    try { fs.unlinkSync(PARAMS_FILE); } catch {}
  }
}

// --- Key mapping for keyboard_hotkey ---

const MODIFIER_MAP = { ctrl: "^", alt: "%", shift: "+" };
const KEY_MAP = {
  enter: "{ENTER}", return: "{ENTER}", tab: "{TAB}",
  escape: "{ESC}", esc: "{ESC}",
  backspace: "{BACKSPACE}", bs: "{BACKSPACE}",
  delete: "{DELETE}", del: "{DELETE}",
  up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}",
  home: "{HOME}", end: "{END}",
  pageup: "{PGUP}", pgup: "{PGUP}",
  pagedown: "{PGDN}", pgdn: "{PGDN}",
  space: " ",
  f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}",
  f5: "{F5}", f6: "{F6}", f7: "{F7}", f8: "{F8}",
  f9: "{F9}", f10: "{F10}", f11: "{F11}", f12: "{F12}",
};

/**
 * Convert a human-readable hotkey like "ctrl+shift+s" to SendKeys format "^+s".
 */
function toSendKeys(combo) {
  const parts = combo.toLowerCase().split("+").map((s) => s.trim());
  let prefix = "";
  let key = "";
  for (const p of parts) {
    if (MODIFIER_MAP[p]) {
      prefix += MODIFIER_MAP[p];
    } else {
      key = KEY_MAP[p] || p;
    }
  }
  return prefix + key;
}

// --- Tool definitions ---

export const definitions = [
  {
    type: "function",
    function: {
      name: "screenshot",
      description:
        "Take a screenshot of the entire screen. Returns the image so you can see what is on screen, plus saves a full-resolution PNG to disk.",
      parameters: {
        type: "object",
        properties: {
          save_path: {
            type: "string",
            description: "Optional path to save the PNG. Defaults to ROOT/screenshot.png.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mouse_move",
      description: "Move the mouse cursor to the given screen coordinates.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (pixels from left)." },
          y: { type: "number", description: "Y coordinate (pixels from top)." },
        },
        required: ["x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mouse_click",
      description:
        "Click the mouse at the given coordinates (or current position if omitted).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate." },
          y: { type: "number", description: "Y coordinate." },
          button: {
            type: "string",
            enum: ["left", "right", "middle"],
            description: "Mouse button (default: left).",
          },
          double_click: {
            type: "boolean",
            description: "If true, double-click instead of single click.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mouse_scroll",
      description: "Scroll the mouse wheel up or down.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Scroll direction.",
          },
          clicks: {
            type: "number",
            description: "Number of scroll clicks (default: 3).",
          },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "keyboard_type",
      description:
        "Type a string of text as keyboard input into the currently focused window. For special keys or shortcuts, use keyboard_hotkey instead.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to type." },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "keyboard_hotkey",
      description:
        'Press a keyboard shortcut or special key. Use human-readable format like "ctrl+c", "alt+f4", "ctrl+shift+s", "enter", "tab", "escape", "f5", etc.',
      parameters: {
        type: "object",
        properties: {
          keys: {
            type: "string",
            description:
              'The key combination, e.g. "ctrl+c", "alt+tab", "enter", "ctrl+shift+s".',
          },
        },
        required: ["keys"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_screen_size",
      description: "Get the screen resolution (width and height in pixels).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_windows",
      description:
        "List all visible windows with their PID, process name, and title.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "focus_window",
      description: "Bring a window to the foreground by matching its title (partial match).",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Text to match against window titles.",
          },
        },
        required: ["title"],
      },
    },
  },
];

// --- Handlers ---

export const handlers = {
  screenshot({ save_path }) {
    return runDesktopAction("screenshot", { path: save_path || null });
  },

  mouse_move({ x, y }) {
    return runDesktopAction("mouse_move", { x, y });
  },

  mouse_click({ x, y, button, double_click }) {
    return runDesktopAction("mouse_click", { x, y, button, double_click });
  },

  mouse_scroll({ direction, clicks }) {
    return runDesktopAction("mouse_scroll", { direction, clicks });
  },

  keyboard_type({ text }) {
    // Escape SendKeys special characters so literal text is typed
    const escaped = text.replace(/([+^%~(){}[\]])/g, "{$1}");
    return runDesktopAction("keyboard_type", { text: escaped });
  },

  keyboard_hotkey({ keys }) {
    return runDesktopAction("keyboard_hotkey", { keys: toSendKeys(keys) });
  },

  get_screen_size() {
    return runDesktopAction("get_screen_size");
  },

  list_windows() {
    return runDesktopAction("list_windows");
  },

  focus_window({ title }) {
    return runDesktopAction("focus_window", { title });
  },
};

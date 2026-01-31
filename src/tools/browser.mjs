import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";

// Browser state lives on globalThis to survive hot-reloads
function getState() {
  if (!globalThis.__prometheusBrowser) {
    globalThis.__prometheusBrowser = {
      browser: null,
      context: null,
      pages: [],
      activeIndex: 0,
    };
  }
  return globalThis.__prometheusBrowser;
}

async function ensureBrowser() {
  const s = getState();
  if (s.browser?.isConnected()) return s;

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
    );
  }

  try {
    s.browser = await chromium.launch({ headless: false });
  } catch (err) {
    throw new Error(
      `Browser launch failed (run: npx playwright install chromium). ${err.message}`,
    );
  }

  s.context = await s.browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  s.pages = [await s.context.newPage()];
  s.activeIndex = 0;
  return s;
}

async function activePage() {
  const s = await ensureBrowser();
  if (!s.pages[s.activeIndex] || s.pages[s.activeIndex].isClosed()) {
    s.pages[s.activeIndex] = await s.context.newPage();
  }
  return s.pages[s.activeIndex];
}

// --- Definitions ---

export const definitions = [
  {
    type: "function",
    function: {
      name: "browser_navigate",
      description:
        "Navigate the browser to a URL. Returns page title and a snippet of visible text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_screenshot",
      description:
        "Take a screenshot of the current browser page. Returns the image so you can see the page.",
      parameters: {
        type: "object",
        properties: {
          full_page: {
            type: "boolean",
            description:
              "Capture the full scrollable page instead of just the viewport (default: false).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_click",
      description:
        'Click an element on the page. Use a CSS selector, a text selector like "text=Submit", or raw x,y coordinates.',
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              'CSS selector or Playwright selector (e.g. "text=Submit", "#login-btn").',
          },
          x: { type: "number", description: "X coordinate (alternative to selector)." },
          y: { type: "number", description: "Y coordinate (alternative to selector)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_type",
      description:
        "Type text into an input element on the page. Clears the field first.",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector for the input element.",
          },
          text: { type: "string", description: "Text to type." },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_get_text",
      description:
        "Get the visible text content of the page or a specific element.",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "Optional CSS selector. If omitted, returns all visible text on the page.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_eval",
      description:
        "Execute JavaScript code in the browser page context. Returns the result.",
      parameters: {
        type: "object",
        properties: {
          script: { type: "string", description: "JavaScript code to execute." },
        },
        required: ["script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_back",
      description: "Navigate back in browser history.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_forward",
      description: "Navigate forward in browser history.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_scroll",
      description: "Scroll the browser page up or down.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Scroll direction.",
          },
          pixels: {
            type: "number",
            description: "Pixels to scroll (default: 500).",
          },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_new_tab",
      description: "Open a new browser tab, optionally navigating to a URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Optional URL to navigate to." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_close_tab",
      description: "Close the current browser tab.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_tabs",
      description: "List all open browser tabs with their index, URL, and title.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_switch_tab",
      description: "Switch to a browser tab by its index (0-based).",
      parameters: {
        type: "object",
        properties: {
          index: { type: "number", description: "Tab index (0-based)." },
        },
        required: ["index"],
      },
    },
  },
];

// --- Handlers ---

export const handlers = {
  async browser_navigate({ url }) {
    const page = await activePage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    let text = "";
    try {
      text = await page.innerText("body");
      if (text.length > 3000) text = text.slice(0, 3000) + "\n...[truncated]";
    } catch {}
    return { title, url: page.url(), text };
  },

  async browser_screenshot({ full_page } = {}) {
    const page = await activePage();
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: full_page || false,
    });
    const savePath = path.join(CONFIG.ROOT, "browser_screenshot.jpg");
    fs.writeFileSync(savePath, buffer);
    return {
      path: savePath,
      url: page.url(),
      title: await page.title(),
      _image: buffer.toString("base64"),
    };
  },

  async browser_click({ selector, x, y }) {
    const page = await activePage();
    if (selector) {
      await page.locator(selector).click({ timeout: 5000 });
    } else if (x !== undefined && y !== undefined) {
      await page.mouse.click(x, y);
    } else {
      throw new Error("Provide either 'selector' or both 'x' and 'y' coordinates.");
    }
    return { success: true };
  },

  async browser_type({ selector, text }) {
    const page = await activePage();
    await page.locator(selector).fill(text, { timeout: 5000 });
    return { success: true };
  },

  async browser_get_text({ selector } = {}) {
    const page = await activePage();
    let text;
    if (selector) {
      text = await page.locator(selector).innerText({ timeout: 5000 });
    } else {
      text = await page.innerText("body");
    }
    if (text.length > 50_000) text = text.slice(0, 50_000) + "\n...[truncated]";
    return { text };
  },

  async browser_eval({ script }) {
    const page = await activePage();
    const result = await page.evaluate(script);
    const output = JSON.stringify(result ?? null, null, 2);
    if (output.length > 50_000) {
      return { output: output.slice(0, 50_000) + "\n...[truncated]" };
    }
    return { output };
  },

  async browser_back() {
    const page = await activePage();
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 });
    return { url: page.url(), title: await page.title() };
  },

  async browser_forward() {
    const page = await activePage();
    await page.goForward({ waitUntil: "domcontentloaded", timeout: 10_000 });
    return { url: page.url(), title: await page.title() };
  },

  async browser_scroll({ direction, pixels }) {
    const page = await activePage();
    const amount = pixels || 500;
    await page.evaluate(
      ([dir, px]) => window.scrollBy(0, dir === "down" ? px : -px),
      [direction, amount],
    );
    return { success: true };
  },

  async browser_new_tab({ url } = {}) {
    const s = await ensureBrowser();
    const page = await s.context.newPage();
    s.pages.push(page);
    s.activeIndex = s.pages.length - 1;
    if (url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    return { index: s.activeIndex, url: page.url() };
  },

  async browser_close_tab() {
    const s = await ensureBrowser();
    if (s.pages.length <= 1) {
      throw new Error("Cannot close the last tab.");
    }
    await s.pages[s.activeIndex].close();
    s.pages.splice(s.activeIndex, 1);
    s.activeIndex = Math.min(s.activeIndex, s.pages.length - 1);
    return { success: true, tabs_remaining: s.pages.length };
  },

  async browser_tabs() {
    const s = await ensureBrowser();
    const tabs = await Promise.all(
      s.pages.map(async (p, i) => ({
        index: i,
        url: p.url(),
        title: await p.title().catch(() => ""),
        active: i === s.activeIndex,
      })),
    );
    return { tabs };
  },

  async browser_switch_tab({ index }) {
    const s = await ensureBrowser();
    if (index < 0 || index >= s.pages.length) {
      throw new Error(`Invalid tab index: ${index}. Open tabs: ${s.pages.length}`);
    }
    s.activeIndex = index;
    await s.pages[index].bringToFront();
    return { index, url: s.pages[index].url(), title: await s.pages[index].title() };
  },
};

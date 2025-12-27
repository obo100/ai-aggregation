import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Webview } from "@tauri-apps/api/webview";
import { Window } from "@tauri-apps/api/window";
import type { ToolConfig } from "../types";
import { buildInjectScript } from "./inject";

const WEBVIEW_PREFIX = "ai-tab-";
const MAIN_LABEL = "main";

export type WebviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function toolLabel(tool: ToolConfig): string {
  const base = tool.id || tool.name || "tool";
  return `${WEBVIEW_PREFIX}${normalizeLabel(base)}`;
}

function getEnabledTools(tools: ToolConfig[]): ToolConfig[] {
  return tools.filter((tool) => tool.enabled);
}

async function getMainWindow(): Promise<Window | null> {
  return Window.getByLabel(MAIN_LABEL);
}

async function applyBounds(webview: Webview, bounds: WebviewBounds): Promise<void> {
  await webview.setPosition(new LogicalPosition(bounds.x, bounds.y));
  await webview.setSize(new LogicalSize(bounds.width, bounds.height));
}

async function getOrCreateWebview(
  tool: ToolConfig,
  bounds: WebviewBounds
): Promise<Webview | null> {
  const label = toolLabel(tool);
  const existing = await Webview.getByLabel(label);
  if (existing) {
    return existing;
  }

  const main = await getMainWindow();
  if (!main) {
    return null;
  }

  const webview = new Webview(main, label, {
    url: tool.url,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });

  await webview.setAutoResize(false);
  return webview;
}

export async function ensureToolWebviews(
  tools: ToolConfig[],
  bounds: WebviewBounds
): Promise<void> {
  const enabled = getEnabledTools(tools);
  await Promise.all(enabled.map((tool) => getOrCreateWebview(tool, bounds)));

  const keepLabels = new Set(enabled.map((tool) => toolLabel(tool)));
  const allWebviews = await Webview.getAll();
  await Promise.all(
    allWebviews.map(async (webview) => {
      if (webview.label.startsWith(WEBVIEW_PREFIX) && !keepLabels.has(webview.label)) {
        await webview.close();
      }
    })
  );
}

export async function syncToolWebviews(
  tools: ToolConfig[],
  bounds: WebviewBounds
): Promise<void> {
  const enabled = getEnabledTools(tools);
  await Promise.all(
    enabled.map(async (tool) => {
      const webview = await Webview.getByLabel(toolLabel(tool));
      if (webview) {
        await applyBounds(webview, bounds);
      }
    })
  );
}

export async function showToolWebview(
  activeToolId: string,
  tools: ToolConfig[],
  bounds: WebviewBounds
): Promise<void> {
  const enabled = getEnabledTools(tools);
  await Promise.all(
    enabled.map(async (tool) => {
      const webview = await getOrCreateWebview(tool, bounds);
      if (!webview) {
        return;
      }
      await applyBounds(webview, bounds);
      if (tool.id === activeToolId) {
        await webview.show();
        await webview.setFocus();
      } else {
        await webview.hide();
      }
    })
  );
}

export async function hideAllToolWebviews(tools: ToolConfig[]): Promise<void> {
  const enabled = getEnabledTools(tools);
  await Promise.all(
    enabled.map(async (tool) => {
      const webview = await Webview.getByLabel(toolLabel(tool));
      if (webview) {
        await webview.hide();
      }
    })
  );
}

export async function sendPromptToTools(prompt: string, tools: ToolConfig[]): Promise<void> {
  const enabled = getEnabledTools(tools);
  await Promise.all(
    enabled.map(async (tool) => {
      const label = toolLabel(tool);
      const script = buildInjectScript(prompt, tool);
      try {
        await invoke("eval_webview", { label, script });
      } catch {
        // Ignore injection failures from CSP or missing webview.
      }
    })
  );
}

export async function openAndSendToTools(
  prompt: string,
  _tools: ToolConfig[]
): Promise<void> {
  const main = await getMainWindow();
  if (!main) {
    return;
  }
  try {
    await main.show();
    await main.setFocus();
  } catch {
    // Ignore window show failures.
  }
  await main.emit("ai-send", { prompt });
}

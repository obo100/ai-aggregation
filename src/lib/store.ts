import type { AppSettings, ToolConfig } from "../types";

const SETTINGS_KEY = "ai-aggregation-settings";

const DEFAULT_TOOLS: ToolConfig[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com",
    enabled: true,
    sendWithEnter: true,
  },
  {
    id: "qwen",
    name: "Qwen",
    url: "https://chat.qwen.ai/",
    enabled: true,
    sendWithEnter: true,
  },
  {
    id: "doubao",
    name: "Doubao",
    url: "https://www.doubao.com/chat/",
    enabled: true,
    sendWithEnter: true,
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "Alt+Q",
  tools: DEFAULT_TOOLS,
};

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const normalizedTools =
      parsed.tools && parsed.tools.length > 0
        ? parsed.tools.map((tool) => ({
            ...tool,
            sendWithEnter: tool.sendWithEnter !== false,
          }))
        : DEFAULT_SETTINGS.tools;
    return {
      hotkey: parsed.hotkey ?? DEFAULT_SETTINGS.hotkey,
      tools: normalizedTools,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("settings-changed", { detail: settings }));
}

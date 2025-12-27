import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";

const QUICK_LABEL = "quick";
const MAIN_LABEL = "main";
let lastAppliedHotkey = "";
let applyQueue: Promise<void> = Promise.resolve();

async function getQuickWindow(): Promise<WebviewWindow | null> {
  return WebviewWindow.getByLabel(QUICK_LABEL);
}

export async function toggleQuickWindow(): Promise<void> {
  try {
    const quick = await getQuickWindow();
    const visible = quick ? await quick.isVisible() : false;
    if (visible && quick) {
      await quick.hide();
      return;
    }

    await invoke("show_quick_window");
    const ensured = quick ?? (await getQuickWindow());
    if (ensured) {
      await ensured.emit("quick-focus");
    }
  } catch (error) {
    console.error("快捷窗口切换失败", error);
  }
}

export async function showMainWindow(): Promise<void> {
  const main = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (!main) {
    return;
  }
  await main.show();
  await main.setFocus();
}

export async function hideQuickWindow(): Promise<void> {
  const quick = await WebviewWindow.getByLabel(QUICK_LABEL);
  if (!quick) {
    return;
  }
  await quick.hide();
}

export async function applyHotkey(hotkey: string): Promise<void> {
  const normalized = hotkey.trim();
  if (["esc", "escape"].includes(normalized.toLowerCase())) {
    throw new Error("Esc is reserved");
  }
  const task = applyQueue.then(async () => {
    if (!normalized) {
      throw new Error("Hotkey is empty");
    }
    if (normalized === lastAppliedHotkey) {
      return;
    }
    try {
      if (lastAppliedHotkey) {
        await unregister(lastAppliedHotkey);
      }
    } catch (error) {
      console.warn("快捷键清理失败", error);
    }
    try {
      await register(normalized, (event) => {
        if (event.state === "Pressed") {
          toggleQuickWindow().catch(() => {});
        }
      });
      lastAppliedHotkey = normalized;
    } catch (error) {
      const alreadyRegistered = await isRegistered(normalized).catch(() => false);
      if (alreadyRegistered) {
        lastAppliedHotkey = normalized;
        return;
      }
      console.error("快捷键注册失败", error);
      throw error;
    }
  });

  applyQueue = task.catch(() => {});
  return task;
}

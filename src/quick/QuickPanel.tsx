import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Input, message } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openAndSendToTools } from "../lib/aiWindows";
import { loadSettings } from "../lib/store";
import { hideQuickWindow, showMainWindow } from "../lib/hotkey";

const COMMAND_HELP = "可用命令: /settings /clear /help";
const COMMAND_PLACEHOLDER = "命令模式: /settings 打开设置 /clear 清空 /help 帮助";

export function QuickPanel() {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const inputRef = useRef<TextAreaRef>(null);
  const appWindowRef = useRef(getCurrentWindow());
  const winRef = useRef(getCurrentWebviewWindow());
  const appWindow = appWindowRef.current;
  const win = winRef.current;

  const focusInput = () => {
    const target = inputRef.current?.resizableTextArea?.textArea;
    appWindow.setFocus().catch(() => {});
    target?.click();
    target?.focus();
    if (target && typeof target.setSelectionRange === "function") {
      const end = target.value.length;
      target.setSelectionRange(end, end);
    }
    inputRef.current?.focus();
    requestAnimationFrame(() => {
      appWindow.setFocus().catch(() => {});
      target?.click();
      target?.focus();
      inputRef.current?.focus();
    });
    setTimeout(() => {
      appWindow.setFocus().catch(() => {});
      target?.click();
      target?.focus();
      inputRef.current?.focus();
    }, 80);
    setTimeout(() => {
      appWindow.setFocus().catch(() => {});
      target?.click();
      target?.focus();
      inputRef.current?.focus();
    }, 200);
  };

  useEffect(() => {
    document.body.classList.add("quick-mode");

    let unlistenFocus: (() => void) | null = null;
    let unlistenQuickFocus: (() => void) | null = null;
    let unlistenGlobalFocus: (() => void) | null = null;
    let unlistenFocusChanged: (() => void) | null = null;
    let unlistenBlur: (() => void) | null = null;

    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        hideQuickWindow();
      }
    };

    window.addEventListener("keydown", onWindowKeyDown, true);

    win
      .listen("tauri://focus", () => {
        focusInput();
      })
      .then((stop) => {
        unlistenFocus = stop;
      });

    win
      .listen("quick-focus", () => {
        focusInput();
      })
      .then((stop) => {
        unlistenQuickFocus = stop;
      });

    listen("quick-focus", () => {
      focusInput();
    }).then((stop) => {
      unlistenGlobalFocus = stop;
    });

    appWindow
      .onFocusChanged(({ payload }) => {
        if (payload) {
          focusInput();
          return;
        }
        if (!valueRef.current.trim()) {
          hideQuickWindow();
        }
      })
      .then((stop) => {
        unlistenFocusChanged = stop;
      });

    win
      .listen("tauri://blur", () => {
        if (!valueRef.current.trim()) {
          hideQuickWindow();
        }
      })
      .then((stop) => {
        unlistenBlur = stop;
      });

    focusInput();
    return () => {
      document.body.classList.remove("quick-mode");
      window.removeEventListener("keydown", onWindowKeyDown, true);
      if (unlistenFocus) {
        unlistenFocus();
      }
      if (unlistenQuickFocus) {
        unlistenQuickFocus();
      }
      if (unlistenGlobalFocus) {
        unlistenGlobalFocus();
      }
      if (unlistenFocusChanged) {
        unlistenFocusChanged();
      }
      if (unlistenBlur) {
        unlistenBlur();
      }
    };
  }, []);

  const runCommand = async (input: string) => {
    const [command] = input.trim().split(/\s+/);
    switch (command) {
      case "/settings":
      case "/config":
        await showMainWindow();
        await hideQuickWindow();
        return;
      case "/clear":
        setValue("");
        return;
      case "/help":
      case "/?":
        message.info(COMMAND_HELP);
        return;
      default:
        message.warning(`未知命令: ${command}`);
    }
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      message.warning("请输入内容");
      return;
    }

    if (trimmed.startsWith("/")) {
      await runCommand(trimmed);
      return;
    }

    const settings = loadSettings();

    await hideQuickWindow();
    await Promise.all([openAndSendToTools(trimmed, settings.tools)]);

    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideQuickWindow();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit().catch(() => {
        message.error("发送失败，请重试");
      });
    }
  };

  const placeholder = value.trim().startsWith("/")
    ? COMMAND_PLACEHOLDER
    : "输入内容后按 Enter 发送，Shift+Enter 换行，ESC 退出";

  return (
    <div className="quick-shell">
      <div className="quick-card">
        <Input.TextArea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            valueRef.current = event.target.value;
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoSize={{ minRows: 5, maxRows: 12 }}
          autoFocus
          className="quick-input"
        />
      </div>
    </div>
  );
}

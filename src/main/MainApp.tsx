import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button, Form, Input, Modal, Space, Switch, Tabs, Typography, message } from "antd";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, ToolConfig } from "../types";
import { loadSettings, saveSettings } from "../lib/store";
import { applyHotkey } from "../lib/hotkey";
import {
  ensureToolWebviews,
  hideAllToolWebviews,
  sendPromptToTools,
  showToolWebview,
  syncToolWebviews,
  type WebviewBounds,
} from "../lib/aiWindows";

const { Title, Text } = Typography;
const SETTINGS_TAB = "settings";

function createToolId() {
  return `tool-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function MainApp() {
  const initialSettingsRef = useRef<AppSettings | null>(null);
  if (!initialSettingsRef.current) {
    initialSettingsRef.current = loadSettings();
  }
  const initialSettings = initialSettingsRef.current;

  const [settings, setSettings] = useState<AppSettings>(() => initialSettings);
  const [hotkeyValue, setHotkeyValue] = useState(initialSettings.hotkey);
  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const enabled = initialSettings.tools.filter((tool) => tool.enabled);
    return enabled[0]?.id ?? SETTINGS_TAB;
  });
  const [bounds, setBounds] = useState<WebviewBounds | null>(null);
  const pendingPromptRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [form] = Form.useForm<ToolConfig>();

  const tools = useMemo(() => settings.tools, [settings.tools]);
  const enabledTools = useMemo(() => tools.filter((tool) => tool.enabled), [tools]);

  useEffect(() => {
    const refresh = () => {
      const next = loadSettings();
      setSettings(next);
      setHotkeyValue(next.hotkey);
    };

    window.addEventListener("storage", refresh);
    window.addEventListener("settings-changed", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("settings-changed", refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    applyHotkey(settings.hotkey).catch(() => {
      message.error("快捷键注册失败，请检查格式或权限设置");
    });
  }, [settings.hotkey]);

  useEffect(() => {
    if (activeTab === SETTINGS_TAB && enabledTools.length > 0) {
      return;
    }
    if (activeTab !== SETTINGS_TAB && !enabledTools.some((tool) => tool.id === activeTab)) {
      setActiveTab(enabledTools[0]?.id ?? SETTINGS_TAB);
    }
  }, [activeTab, enabledTools]);

  const updateBounds = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const next = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    };
    setBounds(next);
  };

  useEffect(() => {
    updateBounds();
  }, [activeTab, enabledTools.length]);

  useEffect(() => {
    const current = getCurrentWindow();
    const onResize = () => updateBounds();
    const unlistenPromise = current.onResized(onResize);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      unlistenPromise.then((stop) => stop()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!bounds) {
      return;
    }
    ensureToolWebviews(enabledTools, bounds).catch(() => {});
    if (activeTab === SETTINGS_TAB) {
      hideAllToolWebviews(enabledTools).catch(() => {});
    } else {
      showToolWebview(activeTab, enabledTools, bounds).catch(() => {});
    }
  }, [activeTab, bounds, enabledTools]);

  useEffect(() => {
    if (!bounds) {
      return;
    }
    syncToolWebviews(enabledTools, bounds).catch(() => {});
  }, [bounds, enabledTools]);

  useEffect(() => {
    const current = getCurrentWindow();
    const unlistenPromise = current.listen<{ prompt?: string }>("ai-send", async (event) => {
      const prompt = event.payload?.prompt?.trim();
      if (!prompt) {
        return;
      }
      if (enabledTools.length === 0) {
        message.warning("没有启用的 AI 工具，请先在设置中开启");
        return;
      }

      const nextActive = enabledTools[0]?.id ?? SETTINGS_TAB;
      setActiveTab(nextActive);
      if (!bounds) {
        pendingPromptRef.current = prompt;
        return;
      }
      await ensureToolWebviews(enabledTools, bounds);
      await sendPromptToTools(prompt, enabledTools);
    });

    return () => {
      unlistenPromise.then((stop) => stop()).catch(() => {});
    };
  }, [bounds, enabledTools]);

  useEffect(() => {
    if (!bounds) {
      return;
    }
    const pending = pendingPromptRef.current;
    if (!pending) {
      return;
    }
    pendingPromptRef.current = null;
    ensureToolWebviews(enabledTools, bounds)
      .then(() => sendPromptToTools(pending, enabledTools))
      .catch(() => {});
  }, [bounds, enabledTools]);

  useEffect(() => {
    const current = getCurrentWindow();
    const unlistenPromise = current.listen("open-settings", () => {
      setActiveTab(SETTINGS_TAB);
    });

    return () => {
      unlistenPromise.then((stop) => stop()).catch(() => {});
    };
  }, []);

  const updateSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const openAddModal = () => {
    setEditingTool(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      url: "",
      enabled: true,
      sendWithEnter: true,
    } as ToolConfig);
    setModalOpen(true);
  };

  const openEditModal = (tool: ToolConfig) => {
    setEditingTool(tool);
    form.setFieldsValue(tool);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const handleSaveTool = async () => {
    const values = await form.validateFields();
    const normalized: ToolConfig = {
      ...values,
      id: editingTool?.id ?? createToolId(),
      enabled: values.enabled ?? true,
      sendWithEnter: values.sendWithEnter ?? true,
    };

    const nextTools = editingTool
      ? settings.tools.map((tool) => (tool.id === editingTool.id ? normalized : tool))
      : [...settings.tools, normalized];

    updateSettings({
      ...settings,
      tools: nextTools,
    });
    setActiveTab(normalized.id);

    message.success("已保存工具配置");
    closeModal();
  };

  const handleRemove = (tool: ToolConfig) => {
    const nextTools = settings.tools.filter((item) => item.id !== tool.id);
    updateSettings({
      ...settings,
      tools: nextTools,
    });
  };

  const handleToggle = (tool: ToolConfig, enabled: boolean) => {
    const nextTools = settings.tools.map((item) =>
      item.id === tool.id ? { ...item, enabled } : item
    );
    updateSettings({
      ...settings,
      tools: nextTools,
    });
  };

  const handleHotkeyApply = async () => {
    const next = hotkeyValue.trim();
    if (!next) {
      message.error("快捷键不能为空");
      return;
    }

    try {
      await applyHotkey(next);
      updateSettings({
        ...settings,
        hotkey: next,
      });
      message.success("快捷键已更新");
    } catch {
      message.error("快捷键注册失败，请检查格式或权限设置");
    }
  };

  const normalizeHotkeyKey = (key: string, code: string): string | null => {
    const modifiers = new Set(["Shift", "Control", "Alt", "Meta"]);
    if (modifiers.has(key)) {
      return null;
    }
    const aliases: Record<string, string> = {
      " ": "Space",
      Escape: "Esc",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
      PageUp: "PageUp",
      PageDown: "PageDown",
      Backspace: "Backspace",
      Delete: "Delete",
      Insert: "Insert",
      Home: "Home",
      End: "End",
      Tab: "Tab",
    };
    if (aliases[key]) {
      return aliases[key];
    }
    if (key.length === 1) {
      return key.toUpperCase();
    }
    if (/^F\\d{1,2}$/i.test(key)) {
      return key.toUpperCase();
    }
    if (code.startsWith("Key")) {
      return code.slice(3).toUpperCase();
    }
    if (code.startsWith("Digit")) {
      return code.slice(5);
    }
    return key;
  };

  const buildHotkey = (event: KeyboardEvent<HTMLInputElement>): string | null => {
    const key = normalizeHotkeyKey(event.key, event.code);
    if (!key) {
      return null;
    }
    const parts: string[] = [];
    if (event.ctrlKey) {
      parts.push("Ctrl");
    }
    if (event.altKey) {
      parts.push("Alt");
    }
    if (event.shiftKey) {
      parts.push("Shift");
    }
    if (event.metaKey) {
      parts.push("Super");
    }
    parts.push(key);
    return parts.join("+");
  };

  const handleHotkeyKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isCapturingHotkey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) {
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      setHotkeyValue("");
      return;
    }
    const next = buildHotkey(event);
    if (next) {
      setHotkeyValue(next);
    }
  };

  const tabItems = [
    ...enabledTools.map((tool) => ({
      key: tool.id,
      label: tool.name,
    })),
    {
      key: SETTINGS_TAB,
      label: "设置中心",
    },
  ];

  return (
    <div className="main-layout">
      <div className="main-tabs">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          className="main-tabs-bar"
        />
      </div>
      <div className="main-content">
        <div
          ref={stageRef}
          className={`webview-stage${activeTab === SETTINGS_TAB ? " is-hidden" : ""}`}
        />
        {activeTab === SETTINGS_TAB && (
          <div className="settings-view">
            <div className="section-card">
              <Title level={3}>设置中心</Title>
              <Text type="secondary">
                管理 AI 工具列表、快捷键和输入策略。输入选择器为空时会使用通用规则。
              </Text>
            </div>

            <div className="section-card">
              <Title level={4}>快捷键</Title>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Input
                  value={hotkeyValue}
                  onChange={(event) => setHotkeyValue(event.target.value)}
                  onKeyDown={handleHotkeyKeyDown}
                  onFocus={() => setIsCapturingHotkey(true)}
                  onBlur={() => setIsCapturingHotkey(false)}
                  placeholder={isCapturingHotkey ? "按下组合键以录制" : "例如 Alt+Q"}
                />
                <Space>
                  <Button type="primary" onClick={handleHotkeyApply}>
                    应用快捷键
                  </Button>
                  <Text type="secondary">修改后立即生效</Text>
                </Space>
              </Space>
            </div>

            <div className="section-card">
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Title level={4} style={{ margin: 0 }}>
                  AI 工具列表
                </Title>
                <Button type="primary" onClick={openAddModal}>
                  添加工具
                </Button>
              </Space>

              {tools.map((tool) => (
                <div className="tool-item" key={tool.id}>
                  <div className="tool-meta">
                    <div className="tool-title">{tool.name}</div>
                    <div className="tool-url">{tool.url}</div>
                    <div className="tool-url">
                      发送方式: {tool.sendWithEnter === false ? "按钮" : "回车"}
                    </div>
                    {(tool.inputSelector || tool.sendSelector) && (
                      <div className="tool-url">
                        输入选择器: {tool.inputSelector || "自动"} | 发送选择器:{" "}
                        {tool.sendSelector || "自动"}
                      </div>
                    )}
                  </div>
                  <Switch checked={tool.enabled} onChange={(value) => handleToggle(tool, value)} />
                  <Space>
                    <Button onClick={() => openEditModal(tool)}>编辑</Button>
                    <Button danger onClick={() => handleRemove(tool)}>
                      移除
                    </Button>
                  </Space>
                </div>
              ))}
            </div>

            <Modal
              open={modalOpen}
              onCancel={closeModal}
              onOk={handleSaveTool}
              title={editingTool ? "编辑工具" : "添加工具"}
              okText="保存"
            >
              <Form layout="vertical" form={form}>
                <Form.Item
                  label="名称"
                  name="name"
                  rules={[{ required: true, message: "请输入名称" }]}
                >
                  <Input placeholder="例如 ChatGPT" />
                </Form.Item>
                <Form.Item
                  label="URL"
                  name="url"
                  rules={[{ required: true, message: "请输入 URL" }]}
                >
                  <Input placeholder="https://" />
                </Form.Item>
                <Form.Item label="启用" name="enabled" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item
                  label="发送方式"
                  name="sendWithEnter"
                  valuePropName="checked"
                  tooltip="开启后用回车发送，关闭后使用发送按钮选择器"
                >
                  <Switch checkedChildren="回车" unCheckedChildren="按钮" />
                </Form.Item>
                <Form.Item label="输入选择器" name="inputSelector">
                  <Input placeholder="可选，CSS selector" />
                </Form.Item>
                <Form.Item label="发送按钮选择器" name="sendSelector">
                  <Input placeholder="可选，CSS selector" />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        )}
      </div>
    </div>
  );
}

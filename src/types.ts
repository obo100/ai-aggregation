export type ToolConfig = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  inputSelector?: string;
  sendSelector?: string;
  sendWithEnter?: boolean;
};

export type AppSettings = {
  hotkey: string;
  tools: ToolConfig[];
};

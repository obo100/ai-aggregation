# AI Aggregation

基于 Tauri 2 + React + Ant Design 的 AI 聚合工具。通过全局快捷键唤起置顶输入框，输入内容后在主窗口的多标签页里打开 AI 聊天并发送。

## 功能概览

- Alt+Q 置顶呼出快捷输入框，Enter 发送，Shift+Enter 换行，Esc 关闭。
- Enter 提交后打开主窗口，并在同一窗口内自动加载多个 AI 标签页。
- 自动把输入内容填充到各个 AI 输入框并发送。
- 设置中心支持：管理 AI 工具列表、配置输入/发送选择器、修改快捷键。
- 系统托盘：左键打开设置中心，右键菜单包含“设置中心/退出”。

## 默认工具

- https://chat.deepseek.com
- https://chat.qwen.ai/
- https://www.doubao.com/chat/

## 运行与开发

运行前请确保已安装 Rust（包含 Cargo）：

- 安装 rustup：https://rustup.rs/
- 验证：`rustc -V` / `cargo -V`

```bash
npm install
npm run tauri dev
```

## 打包

```bash
npm run tauri build
```

## 设置说明

- 快捷键格式示例：`Alt+Q`、`Ctrl+Shift+K`。
- 工具配置支持自定义 CSS 选择器：
  - 输入选择器：定位输入框或可编辑区域。
  - 发送选择器：定位发送按钮。

## 注意事项

- 远程站点可能存在登录、反自动化或 CSP 限制，注入脚本不保证 100% 成功。
- 如果发送失败，可在设置中填写更精确的 CSS 选择器。
- 默认主窗口启动时显示，提交后自动切换到第一个启用的 AI 标签页。

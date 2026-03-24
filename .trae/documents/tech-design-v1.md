## SEO/内容垃圾过滤器（v1.0）技术方案

### 总览
- MV3 扩展，核心由 Background Service Worker + Content Script + Extension Pages（Popup/SidePanel/Options）组成。
- 消息协议位于 src/shared，避免页面间耦合。

### 数据流
1. 用户触发（Popup/SidePanel/右键菜单/悬浮层按钮）
2. Background 确认当前 tabId，并指示 Content Script 提取正文
3. Background 对正文执行截断策略
4. Background 读取配置（provider、model、temperature、apiKey、baseUrl），发起 AI 请求
5. Background 解析流式响应并向前端透传 chunk
6. 前端实时渲染 Markdown，结束后允许复制/重试/反馈
7. 可选：将 TL;DR 插入到页面顶部

### 模块划分
- src/content：DOM 提取、页面内悬浮层与 TL;DR 条渲染、与 Background 通信。
- src/background：消息路由、右键菜单、注入与 tab 管理、AI 调用与流式解析、配置读写。
- src/options：配置页 UI（存取 chrome.storage.local）。
- src/popup：快速触发入口 UI。
- src/sidepanel：持续显示结果的 UI。
- src/shared：类型、协议、截断策略、Prompt 模板、工具函数。

### Provider 适配（v1.0）
- 目标：支持 DeepSeek、GPT-4o-mini、Claude Haiku、Gemini Flash 的配置项。
- 实现策略：
  - OpenAI-compatible（含 DeepSeek/OpenAI）：/v1/chat/completions，SSE 解析 data: JSON。
  - Anthropic：/v1/messages，SSE 解析 event 数据块。
  - Gemini：streamGenerateContent（或等价），按其流式协议解析。
- v2.0 多模态：仅保留类型与配置字段占位。

### 权限与合规
- 默认 permissions：storage、activeTab、scripting、sidePanel、contextMenus。
- 自动模式：按白名单请求 origins 权限（可撤销），未授权不自动运行。
- 不添加 host_permissions <all_urls>。

### 错误与重试
- Background 对错误进行分类并返回用户友好消息：未配置 Key、网络/鉴权失败、模型不可用、流式中断。
- 前端提供“重试/重新生成”。


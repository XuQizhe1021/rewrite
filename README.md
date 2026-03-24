# SEO/内容垃圾过滤器（Chrome/Edge，Manifest V3）

作者苦于日常阅读时被广告、无关介绍、SEO 堆词浪费时间，因此做了这个“内容净化与总结”插件：提取网页正文后交给你配置的 AI 生成结构化结果，并支持流式输出与多入口展示。

本仓库只实现 **v1.0**：正文提取、截断、后台代理 AI（流式透传）、侧边栏/悬浮层/Popup/右键菜单、Options 配置、最小权限与安全合规、基础单测与自检脚本。
v2.0 多模态/图片理解仅留接口与文档占位，不实现。

## 功能（v1.0）

- 内容提取：优先 Readability 提取正文/标题；失败回退到 body 文本（排除 nav/footer/aside/script/style）。
- 内容截断：目标 tokens≈3000–4000，关键词（结论/总结/结果/最后…）优先；tokenizer 不可用时保守降级。
- 后台代理 AI：Service Worker 统一读取配置与 API Key，前端不接触 Key。
- 流式响应：后台解析流式 chunk 并透传到前端实时渲染。
- 多入口：Popup、Side Panel、悬浮层、右键菜单；可选插入 TL;DR 顶部条（≤30字）。
- 配置：Options 页设置 provider/model/baseUrl/apiKey/temperature/默认模式与风格；自动模式域名白名单（逐域授权，可撤销）。

## 安装（开发者模式）

1. 安装依赖：

```bash
pnpm install
```

2. 构建产物：

```bash
pnpm run build
```

3. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），启用“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目的 `dist/` 目录。

## 开发调试

```bash
pnpm run dev
```

说明：`dev` 会 watch 并持续输出到 `dist/`。
修改后在扩展管理页点击“重新加载”即可生效。

## 构建发布（ZIP）

```bash
pnpm run build
pnpm run zip
```

输出位置：`artifacts/seo-content-cleaner-v1.zip`。

## 使用指南

### 1) 先配置 API

打开 Options（Popup 右上角“设置”或 `chrome://extensions` → 详情 → 扩展程序选项）：

- `服务商`：DeepSeek / OpenAI / Claude（Anthropic）/ Gemini
- `模型`：默认分别为 `deepseek-chat` / `gpt-4o-mini` / `claude-3-haiku-20240307` / `gemini-1.5-flash`
- `API Base URL`：默认填好，可按需替换（例如代理/兼容网关）
- `API Key`：仅保存到 `chrome.storage.local`

### 2) 手动触发（推荐）

- Popup：用于快速触发。点击“开始”后会立即进入“准备中/提取中/生成中”等状态，不再无响应。
- Popup：点击“打开侧边栏”会直接打开 Side Panel；如已存在最近任务，会在侧边栏继续同任务状态。
- Side Panel：在侧边栏内选择模式/风格 → 开始。
- 右键菜单：页面空白处右键 → 选择“总结要点/提取操作步骤/对比分析”，默认用悬浮层显示。

### 3) TL;DR 顶部条

在 Popup / Side Panel 勾选“插入 TL;DR 顶部条”，生成完成后会在页面顶部插入淡黄色 TL;DR 横条，可手动关闭。

### 4) 自动模式（域名白名单）

Options 中输入域名（如 `example.com`）→ “添加并授权”。

- 插件会按域名申请可选站点权限（可撤销），避免默认申请 `<all_urls>`。
- 白名单域名加载完成后会自动生成并插入 TL;DR。

## 本次修复说明（v1.0 增量）

### 已修复问题

- 修复 Popup“开始/打开侧边栏”偶发无反应：补齐 `UI_OPEN_SIDEPANEL` 链路、补充点击异常可见提示与日志。
- 修复 Side Panel 首次触发提取失败：后台在 `CONTENT_EXTRACT` 前强制确保 content script 已注入。
- 修复“准备中”卡死：Popup/Side Panel 增加状态机与超时保护（idle/loading/streaming/success/error/timeout）。
- 提升链路稳定性：UI Port 增加断连重连机制；`UI_HELLO` 支持按 tab 回放最近状态事件，减少窗口切换丢状态。
- 优化设置页视觉：重构分区（模型与API/输出模式/触发策略/外观行为）、统一控件样式、支持浅色/深色。
- 增强悬浮层交互：支持拖拽、边界约束、收起/展开、重置位置，位置按域名 `sessionStorage` 持久化。

### 已知限制

- 浏览器 Action Popup 天生为临时窗口，无法“固定常驻”；长流程建议在 Side Panel 执行。
- `chrome.sidePanel.open` 依赖浏览器版本与权限环境，失败时会降级到悬浮层并显示错误。
- 悬浮层位置目前按“当前标签页会话 + 域名”保存，关闭标签页后不会跨会话保留。

### 验证步骤

1. 在 Options 配置有效 API Key，保存后返回任意网页。
2. 点击扩展图标，在 Popup 点“开始”，确认 1 秒内从“等待触发”进入“准备中/提取正文…”。
3. 在 Popup 点“打开侧边栏”，确认 Side Panel 可打开，并能看到同一 tab 的最新任务状态。
4. 制造错误（如清空 API Key）后再次开始，确认输出区显示可读错误且可点击“重新生成”。
5. 使用右键菜单触发，确认悬浮层可拖动、可收起、可重置位置，且不再长期遮挡正文。
6. 运行 `pnpm run check`、`pnpm run lint`、`pnpm run test`，确认全部通过。

## 权限说明（最小必要）

- `storage`：保存配置与 API Key（仅本地）。
- `activeTab`：用户触发时读取当前页内容（不申请全站 host 权限）。
- `scripting`：按需注入 content script 以提取正文/渲染悬浮层/TL;DR。
- `sidePanel`：侧边栏展示结果。
- `contextMenus`：右键菜单入口。
- `permissions`：自动模式按域名申请/撤销可选站点权限。

## 安全与隐私

- 不在任何前端脚本/仓库中硬编码或打印 API Key。
- API Key 仅保存在 `chrome.storage.local`，由后台 Service Worker 读取并发起请求。
- 页面正文只会发送到你配置的 API 端点，不经过开发者服务器。
- 前端渲染 Markdown 时进行 HTML 清洗，降低 XSS 风险。

## 项目结构

```
public/
  manifest.json
  popup.html
  sidepanel.html
  options.html
  ui.css
  icon.svg
scripts/
  build.mjs
  dev.mjs
  zip.mjs
  selfcheck.mjs
src/
  background/
  content/
  options/
  popup/
  sidepanel/
  shared/
  ui/
```

## 质量保障

### 单元测试（纯函数）

```bash
pnpm test
```

覆盖：文本清洗、段落切分、关键词加权、截断策略、TL;DR 提取。

### 自检脚本

```bash
pnpm run selfcheck
```

检查：manifest 权限白名单、禁止 `<all_urls>` host 权限、dist 产物齐全。

### 代码质量

```bash
pnpm run lint
pnpm run check
pnpm run format
```

## 手工验收清单（v1.0）

| 场景 | 操作 | 期望 |
|---|---|---|
| 新闻页“一句话摘要”置顶 | Popup 勾选 TL;DR → 开始 | 页面顶部出现 TL;DR 条，可关闭 |
| 技术教程“提取操作步骤” | 右键菜单 → 提取操作步骤 | 输出包含“前置条件/步骤1/步骤2…” |
| 产品评测“对比分析表” | Side Panel → 对比分析 → 开始 | 输出 Markdown 表格 |
| 大文本截断生效 | 在长文章页触发总结 | 生成成功且未超时，响应流式增长 |
| 不泄露 Key | 任意触发总结 | 控制台/网络请求中无明文 Key 输出（仅请求头携带） |

## 设计与权衡

- 构建器选择：本项目使用 `esbuild` 输出稳定文件名，确保 MV3 content script 以单文件形式运行。
- 最小权限：默认不声明 `host_permissions`，仅在用户触发时用 `activeTab` 读取当前页面；自动模式采用逐域可选权限。
- v2.0 多模态：仅文档占位，不做图片提取/上传/视觉模型调用。

## v2.0 多模态（占位，不实现）

v2.0 计划引入图片筛选/提取与多模态模型调用，但 v1.0 不包含此能力。

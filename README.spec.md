## 灵感

作者苦于日常阅读时，被页面广告、文章作者在正文中的垃圾话浪费时间，因此有了本项目：

通过抓取网页内容投喂给AI，直接提取文章核心内容，如果文章是教程，就直接列出操作步骤和注意事项。

**亮点**：可以设置“TL;DR模式”，直接生成一段话置顶在页面上方

## API

既然是调用API Key，在开发插件时有几个点需要特别注意，否则容易被封号或导致API泄露：

1. **API Key 的存放**：
   - **绝对不要**把API Key硬编码在前端代码（content_scripts或popup.js）里。
   - **最佳实践**：创建一个**Service Worker (Background.js)** 作为代理。用户将API Key输入在插件的选项页面，存储在`chrome.storage.local`（相对安全）。前端发送请求时，先发给Background，由Background携带Key去请求AI服务商。这能防止恶意网站通过页面脚本抓取你的Key。
2. **上下文长度限制**：
   - 浏览器页面内容可能非常大（几万字）。在发送给AI前，必须做**截断**。要么只发送用户选中的文字，要么利用`Readability.js`提取正文后截取前3000-5000 tokens。
3. **流式响应**：
   - AI生成内容通常需要几秒钟。不要做成转圈等待，建议实现**流式输出**。在Popup或侧边栏中，像ChatGPT那样一个字一个字地蹦出来，用户体验会好很多。

## **项目规范化：**

为了便于后续的扩展和优化，项目开发需要有一个严格的代码风格规范，使用 Prettier 进行代码格式化，使用 ESLint 进行语法检查，所有代码都应该有清晰的注释和类型定义。前端拒绝any类型。

## “SEO/内容垃圾过滤器”插件：深入设计与实现（v1.0)

### 一、概述与目标
在信息爆炸的时代，用户经常被冗长的铺垫、重复的广告、以及为了SEO排名而填充的“废话”所困扰。本插件的目标是：
- **一键提取核心内容**：从任何新闻、博客、文档页面中剥离杂质，只保留干货。
- **智能总结**：根据用户偏好，生成 TL;DR（太长不看版）、要点列表、操作步骤或关键数据。
- **极简交互**：不打断浏览流程，在页面内直接呈现结果，可选择保存或复制。

### 二、用户场景与交互设计

| 场景             | 用户操作                      | 插件响应                                            |
| ---------------- | ----------------------------- | --------------------------------------------------- |
| 阅读一篇产品评测 | 点击插件图标 → 选择“总结要点” | 弹出侧边栏，显示3-5个核心优缺点、价格、竞品对比结论 |
| 查找技术解决方案 | 右键点击页面 → “提取操作步骤” | 将页面中的代码片段和指令汇总成清晰列表              |
| 浏览新闻         | 自动检测（可选）或手动激活    | 在文章顶部生成一个淡黄色横条，显示“一句话新闻摘要”  |
| 研究论文/报告    | 点击“提取关键数据”            | 单独列出统计数字、引用来源、方法论简述              |

**交互方式**：
- **Popup 弹窗**：轻量操作，适合快速生成。
- **Content Script 注入悬浮按钮**：在页面右上角或文章头部生成一个固定按钮。
- **右键菜单**：提供多种处理模式（总结、翻译、提取步骤等）。
- **侧边栏（Side Panel）**：Manifest V3 支持，适合长期显示结果并与页面内容联动。

### 三、核心功能模块

1. **内容提取模块**  
   - 使用 `Readability.js` 或自定义算法从 DOM 中提取正文文本、标题、元数据。
   - 去除广告、导航栏、评论区、脚本标签等。
   - 输出纯文本，并保留段落结构。

2. **内容截断模块**  
   - 将文本分割成合理块（如按段落），限制发送给 API 的总 token 数（例如 3000~4000 tokens）。
   - 若内容过长，优先保留开头、结尾、以及带有关键词（如“结论”、“总结”、“结果”）的段落。

3. **API 调用模块**  
   - 通过 Background Service Worker 统一管理 API Key 和请求。
   - 支持流式（stream）响应，实现逐字输出，提升体验。
   - 支持多模型切换（用户可配置）。

4. **结果渲染模块**  
   - 在侧边栏或悬浮层中展示 Markdown 格式的结果。
   - 提供复制、重新生成、反馈（好/差）按钮。
   - 可选自动插入到页面顶部（如果用户允许）。

5. **配置与偏好模块**  
   - 用户可设置默认总结风格（简洁、详细、极简）。
   - 选择模型、API Key、温度等参数。
   - 设置是否自动触发（如访问特定域名时）。

### 四、技术架构（Manifest V3）

```
┌─────────────────────────────────────────────────────┐
│                    Browser Action                   │
│   (popup.html + popup.js)                           │
│   - 触发总结                                         │
│   - 显示配置界面                                     │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│               Background Service Worker             │
│   - 监听消息，代理 API 请求                           │
│   - 存储 API Key 和配置（chrome.storage.local）     │
│   - 调用 AI 接口，处理流式响应                        │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                Content Script                       │
│   - 注入页面（可注入悬浮按钮）                        │
│   - 提取正文（Readability）                         │
│   - 与 background 通信，获取结果                     │
│   - 渲染结果到 side panel 或悬浮元素                 │
└─────────────────────────────────────────────────────┘
```

**权限说明**：
- `storage`：存储 API Key、用户设置。
- `activeTab`：仅在用户点击插件时获取当前标签页权限，无需 `host_permissions` 全部网站。
- `sidePanel`（可选）：使用侧边栏。
- `scripting`：注入 content script。

### 五、API 调用与提示词设计

#### 1. 提示词模板（Prompt Engineering）
根据用户选择的任务类型，动态构建 System Prompt 和 User Prompt。

**示例：通用总结模式**
```
System: 你是一个专业的阅读助手。用户会提供一篇网页正文，请忽略所有客套话、广告语、SEO废话和冗余背景介绍。直接提取核心内容。

User: 
[页面标题]：{title}
[正文]：
{content}

请按照以下格式输出：
1. 一句话总结（不超过30字）
2. 核心要点（3-5条，每条一句话）
3. 关键数据/数字（如有）
4. 结论或行动建议（如有）
```

**示例：操作步骤提取模式**
```
System: 用户提供的是教程或技术文档。请提取出清晰的操作步骤，忽略无关介绍。如果包含代码，请用代码块格式。

User: 
{content}

输出格式：
- 前置条件：
- 步骤1：
- 步骤2：
...
```

**示例：对比分析模式（用于评测类文章）**
```
System: 请提取文章中提到的产品/方案的优缺点对比，用表格形式呈现。

User: 
{content}

输出：
| 维度 | 产品A | 产品B |
|------|-------|-------|
| 优点 | ...   | ...   |
| 缺点 | ...   | ...   |
| 价格 | ...   | ...   |
```

#### 2. 内容截断策略
由于 API 有 token 限制，我们需要对正文进行预处理：
- 使用 `html-to-text` 或 `Readability` 获取纯文本。
- 计算 token 数（可使用 `gpt-tokenizer` 库）。
- 若超过限制（如 4000 tokens），则：
  - 保留文章标题、首段、包含“结论/总结/最后”关键词的段落。
  - 将剩余段落按重要性排序（根据关键词出现频率），选择最相关的部分。
  - 简单做法：截取前 2500 tokens 和后 1500 tokens。

#### 3. 流式响应处理
为了让用户体验更好，应该支持流式输出（stream: true）：
- Background 通过 fetch API 发送请求，监听 `response.body` 的 ReadableStream。
- 将每个 chunk 通过 `chrome.runtime.sendMessage` 转发给 content script。
- Content script 实时更新显示区域。

#### 4. 模型选择建议
- **DeepSeek-V3 / DeepSeek-R1**：性价比极高，中文能力强，适合国内用户。
- **Claude 3 Haiku**：速度快，适合总结类任务。
- **GPT-4o-mini**：成本低，质量不错。
- **Gemini 1.5 Flash**：支持超长上下文，适合长文章。

### 六、数据处理细节

#### 1. 正文提取
- 使用 Mozilla 的 `@mozilla/readability`（Node 版本）或浏览器环境下的 `Readability` 库。
- 优先获取 `<article>`、`<main>` 或 `class` 包含 `content/post/article` 的元素。
- 兜底方案：提取 `body` 文本，但排除 `<nav>`, `<footer>`, `<aside>`, `<script>`, `<style>`。

#### 2. 广告/杂质过滤
- 可额外使用 `adblock` 规则库（如 `easylist`）来识别广告元素并移除。
- 简单策略：识别 `id` 或 `class` 包含 `ad, sponsor, promo, banner` 的元素并隐藏/删除。

#### 3. 保持格式
- 在发送给 AI 前，保留段落结构（用 `\n\n` 分隔）。
- 若原文有列表（`<ul>`/`<li>`），转换为 Markdown 列表。

### 七、用户界面设计

#### 1. 侧边栏（推荐）
Manifest V3 支持 `side_panel` API，可以在浏览器右侧打开一个固定面板，与页面共存。
- 优点：不遮挡内容，可随时查看结果。
- 实现：在 `manifest.json` 中声明 `side_panel`，在 popup 或 content script 中调用 `chrome.sidePanel.open()`。

#### 2. 悬浮按钮
在页面右上角或右下角添加一个圆形按钮，点击后显示结果卡片。
- 优点：轻量，不占用额外空间。
- 实现：content script 注入 DOM 元素。

#### 3. 右键菜单
右键菜单提供快捷方式，选择后直接在通知或悬浮窗显示。

#### 4. 自动模式（可选）
- 用户可配置在特定网站（如新闻网站、技术博客）自动运行。
- 在页面加载完成后，自动提取并显示一个简易摘要条。

### 八、隐私与安全考虑

#### 1. API Key 管理
- 绝对禁止将 API Key 硬编码。
- 用户在 options 页面输入 Key，存入 `chrome.storage.local`（该存储空间相对安全，但仍有风险）。
- 建议：如果使用需要付费的 API，提醒用户保管好 Key，并告知可能产生费用。

#### 2. 权限最小化
- 使用 `activeTab` 权限，仅在用户点击时获取当前标签页的 DOM，无需申请所有网站的权限。
- 若需要自动模式，可要求用户手动添加特定网站权限。

#### 3. 内容隐私
- 所有页面内容仅发送到用户自己配置的 API 端点，不经过开发者服务器。
- 在插件描述中明确说明数据流向。

### 九、可能的扩展与高级功能

1. **自定义 Prompt 模板**：允许用户编辑自己的提示词，适应不同场景。
2. **历史记录**：保存最近的总结结果，方便回溯。
3. **多语言支持**：自动检测页面语言，用同语言或用户指定语言输出。
4. **离线模式**：利用本地小模型（如 Transformers.js）实现基本总结，作为 API 不可用时的备选。
5. **一键分享**：将生成的总结以图片或文本形式分享到社交平台。



### 十、实现步骤与代码示例要点

#### 1. 初始化项目
```json
// manifest.json
{
  "manifest_version": 3,
  "name": "Content Cleaner & Summarizer",
  "version": "1.0",
  "permissions": ["storage", "activeTab", "sidePanel", "scripting"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

#### 2. 正文提取（content.js）
```javascript
// 使用 Readability 提取正文
function extractContent() {
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();
  if (article) {
    return {
      title: article.title,
      content: article.textContent,
      length: article.textContent.length
    };
  }
  return null;
}
```

#### 3. 调用 API（background.js）
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    // 从 storage 获取 API Key 和配置
    chrome.storage.local.get(['apiKey', 'model'], async (result) => {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.apiKey}`
        },
        body: JSON.stringify({
          model: result.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是内容总结助手...' },
            { role: 'user', content: request.content }
          ],
          stream: true
        })
      });
      // 处理流式响应，发送给 content script
    });
    return true; // 保持消息通道开放
  }
});
```

#### 4. 渲染结果（sidepanel.html + sidepanel.js）
- 接收来自 background 的流式数据。
- 使用 Markdown 渲染库（如 `marked`）显示格式化文本。
- 提供复制、重新生成等按钮。

### 十一、总结

“SEO/内容垃圾过滤器”是一个兼具实用性和技术挑战的项目。通过精心设计的提示词、可靠的正文提取、以及安全的 API 调用，可以极大地提升用户阅读效率。开发时建议采用迭代方式：先实现最基本的总结功能，再逐步加入流式输出、多种模式、侧边栏等增强特性。

如果你准备开始编码，我可以提供更详细的代码片段（如完整的 background 流式处理逻辑、Readability 集成示例）作为进一步参考。

## “SEO/内容垃圾过滤器”插件：扩展图片理解能力(v2.0)

纯文本总结忽略了页面中至关重要的图片信息。很多文章的核心结论往往藏在图表、截图或配图里（如数据图表、产品对比图、流程示意图）。为了让“SEO/内容垃圾过滤器”真正全面，我们必须引入**多模态视觉理解能力**，让 AI 能够“看懂”图片，并将图片信息与文本结合输出。

下面在原有设计基础上，详细扩展**图片处理模块**。

---

### 一、图片处理的核心思路

#### 1. 图片的提取与筛选

不是所有图片都值得发送（广告、图标、头像、装饰性图片会浪费 token 和费用）。我们需要智能筛选。

**筛选策略：**

- **尺寸过滤**：只保留宽度 ≥ 200px 且高度 ≥ 200px 的图片（排除小图标）。
- **位置过滤**：优先提取 `<figure>`、`<div class="chart">`、`<img alt="...">` 等语义标签内的图片。
- **Alt 文本分析**：若 alt 文本包含“图表”、“数据”、“截图”、“对比”、“示意图”等关键词，则保留。
- **去重**：相同 URL 的图片只发送一次。
- **数量限制**：最多发送 5~8 张图片，避免费用过高。

**可选高级筛选**：
- 使用简单图像分类（如 TensorFlow.js 本地模型）判断是否为“图表”或“截图”。
- 让用户手动选择“包含重要图片”的页面区域（如选区截图）。

#### 2. 图片的获取方式

Content script 可以从 DOM 中获取 `<img>` 元素的 `src`。但需要注意：
- 部分图片使用懒加载，实际 `src` 可能在 `data-src` 中，需要处理。
- 跨域图片：可以直接将图片转为 base64（通过 canvas）发送给 API，避免跨域限制。
- 使用 `fetch` 获取图片 blob，然后转为 base64 或直接使用 URL（如果 API 支持图片 URL 且图片可公开访问）。

**推荐**：对于大多数多模态 API（如 GPT-4V、Claude 3、Gemini），都支持两种方式：
- 直接传入图片 URL（要求图片可公开访问）。
- 传入 base64 编码的图片数据。

为了兼容性，我们采用 **base64 方式**：获取图片 blob → 转为 base64 → 嵌入请求。

#### 3. 多模态 API 调用

目前主流支持图片输入的模型：
- **OpenAI GPT-4o / GPT-4 Turbo**：支持图片 URL 或 base64，费用较高。
- **Claude 3.5 Sonnet / Haiku**：支持图片，Claude 3 Haiku 性价比高。
- **Gemini 1.5 Flash / Pro**：原生支持多模态，价格低廉。
- **国内模型**：如智谱 GLM-4V、通义千问 VL、DeepSeek-VL（需确认接口）。

**选择建议**：
- 若用户主要处理英文内容，推荐 **Claude 3 Haiku**（速度快、图片理解能力强）。
- 若用户处理中文内容，推荐 **Gemini 1.5 Flash**（免费额度大）或 **智谱 GLM-4V**（国内访问稳定）。
- 成本敏感用户可关闭图片功能，仅用文本。

#### 4. 提示词设计（融合图片）

将图片和文本一起发送给 AI 时，提示词要明确告诉 AI 关注图片内容。

**示例 System Prompt**：
```
你是一个专业的内容提取助手。我会提供一篇网页的文本内容，以及页面中的若干张关键图片（可能是数据图表、截图、示意图）。请结合文本和图片信息，生成一份包含核心要点的总结。如果图片中有重要数据或结论，请明确引用。
```

**User Prompt 结构**（以 OpenAI API 为例）：
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请总结以下内容：[文本内容]"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,{base64_data}"
          }
        },
        // 可重复多个图片
      ]
    }
  ]
}
```

#### 5. 内容整合与输出

AI 返回的结果中，图片的描述会自然融入文本总结。我们不需要单独渲染图片，只需将 AI 生成的文本显示给用户即可。

---

### 二、修改后的技术架构

#### 新增权限

- **host_permissions**：如果我们需要获取图片的原始 blob（用于 base64），可能需要 `<all_urls>` 或特定域名的权限。但为了最小权限，可以使用 `activeTab` + `scripting` 动态注入脚本，并在用户点击时临时获取图片数据，无需声明所有网站权限。
- **webRequest**（可选）：如果涉及图片 URL 过滤，但不是必须。

#### 新增模块：图片提取与编码器

**在 content script 中实现**：

```javascript
async function extractImages() {
  const images = [];
  const imgElements = document.querySelectorAll('img');
  for (const img of imgElements) {
    // 筛选条件
    if (img.width < 200 || img.height < 200) continue;
    const src = img.src || img.getAttribute('data-src');
    if (!src) continue;
    // 去重
    if (images.some(i => i.url === src)) continue;
    // 可选：通过 alt 或父元素语义判断重要性
    const isImportant = (img.alt && /图表|数据|截图|对比|示意图|chart|graph|diagram/i.test(img.alt)) ||
                         img.closest('figure, .chart, .image-container');
    if (!isImportant && images.length >= 3) continue; // 限制数量
    
    try {
      const blob = await fetch(src).then(r => r.blob());
      const base64 = await blobToBase64(blob);
      images.push({ url: src, base64, importance: isImportant ? 'high' : 'normal' });
    } catch (e) {
      console.warn('Failed to fetch image', src, e);
    }
    if (images.length >= 8) break; // 总数限制
  }
  return images;
}
```

#### Background 处理多模态请求

```javascript
async function callMultiModalAPI(text, images, apiKey, model) {
  const messages = [
    { role: 'system', content: '你是一个内容提取助手...' },
    { role: 'user', content: buildMultimodalContent(text, images) }
  ];
  
  // 根据模型构建请求体
  const payload = {
    model: model,
    messages: messages,
    max_tokens: 2000,
    stream: true
  };
  
  // 如果是 OpenAI 兼容格式
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  
  // 处理流式响应...
}
```

#### 用户配置界面新增选项

- **启用图片理解**：开关（默认关闭，因为成本较高）。
- **最大图片数量**：1~10。
- **图片重要性过滤**：自动/手动。
- **模型选择**：区分纯文本模型与多模态模型。

---

### 三、成本控制与用户体验优化

#### 1. 费用透明

在插件描述和设置页面，明确提示：
- 启用图片理解会增加 API 调用成本（例如 GPT-4o 处理一张 1024x1024 图片约 0.003~0.005 美元）。
- 建议仅在需要时手动开启，或对特定网站开启。

#### 2. 本地缓存

- 对同一页面的图片 base64 进行缓存（会话内），避免重复获取。
- 对 AI 返回结果缓存（可选），避免重复请求。

#### 3. 图片预览

- 在侧边栏中显示将要发送的图片缩略图，让用户确认哪些图片需要发送（用户可以取消勾选）。
- 这样既节省费用，又增加用户控制感。

#### 4. 降级方案

- 如果用户未配置多模态 API Key，则自动降级为纯文本模式，并提示“当前模型不支持图片，仅总结文本”。

---

### 四、多模态模型推荐（基于实际需求）

| 模型                 | 价格（图片输入）                              | 特点                 | 适合场景               |
| -------------------- | --------------------------------------------- | -------------------- | ---------------------- |
| **GPT-4o-mini**      | 极低（0.15美元/百万token，图片按特定token计） | 性价比高，支持多模态 | 英文内容，预算有限     |
| **Claude 3 Haiku**   | 0.25美元/百万输入token（图片同价）            | 速度快，理解准确     | 技术文档、图表         |
| **Gemini 1.5 Flash** | 免费（有限额）                                | 免费额度大，中文好   | 个人开发测试、中文内容 |
| **智谱 GLM-4V**      | 0.02元/千token                                | 国内访问稳定         | 中文网页               |

---

### 五、总结

引入图片理解后，插件真正实现了“内容垃圾过滤器”的全面性：用户不仅能过滤文字废话，还能自动解析图表、截图中的核心信息，极大提升信息获取效率。实现时注意：

1. **智能筛选**：避免把无关图片传给 AI。
2. **权限谨慎**：用 `activeTab` 动态获取图片数据，避免过度授权。
3. **成本透明**：让用户自主控制图片功能，并提供预览。
4. **流式体验**：即使发送多张图片，也要保持流式响应，让用户即时看到结果。


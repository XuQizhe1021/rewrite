import type {
  BackgroundToContentMessage,
  BackgroundToUiMessage,
  UiToBackgroundMessage,
} from '../shared/messages'
import { buildPrompts } from '../shared/prompts'
import { loadConfig, saveConfig } from '../shared/storage'
import { extractTldr, truncateContent } from '../shared/text'
import type { PresentTarget, StartRequest, StreamEvent, UserConfig } from '../shared/types'
import { callProviderStream } from './providers'

const uiPorts = new Set<chrome.runtime.Port>()
const lastRequestByTab = new Map<number, StartRequest>()
const lastResultByTab = new Map<number, string>()

function broadcastToUi(msg: BackgroundToUiMessage, tabId?: number): void {
  for (const p of uiPorts) {
    if (tabId != null && p.sender?.tab?.id != null && p.sender.tab.id !== tabId) continue
    try {
      p.postMessage(msg)
    } catch {
      // ignore
    }
  }
}

async function ensureSidePanel(tabId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' })
}

async function openSidePanel(tabId: number): Promise<void> {
  await ensureSidePanel(tabId)
  await chrome.sidePanel.open({ tabId })
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_PING' } satisfies BackgroundToContentMessage)
    return
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
  }
}

async function sendToContent(tabId: number, msg: BackgroundToContentMessage): Promise<void> {
  await ensureContentScript(tabId)
  await chrome.tabs.sendMessage(tabId, msg)
}

function emit(tabId: number, event: StreamEvent): void {
  broadcastToUi({ type: 'UI_STREAM', event }, tabId)
}

async function runRequest(req: StartRequest): Promise<void> {
  lastRequestByTab.set(req.tabId, req)
  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'prepare' })

  const config = await loadConfig()
  if (!config.provider.apiKey || config.provider.apiKey.trim().length < 6) {
    emit(req.tabId, {
      type: 'error',
      requestId: req.requestId,
      message: '未配置 API Key，请先在设置页填写。',
    })
    return
  }

  if (req.present === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_SHOW_OVERLAY', title: '生成中…' })
  } else {
    await openSidePanel(req.tabId)
  }

  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'extract' })
  if (req.present === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_STATUS', message: '正在提取正文…' })
  }

  const extracted = (await chrome.tabs.sendMessage(req.tabId, {
    type: 'CONTENT_EXTRACT',
    selectionOnly: req.selectionOnly,
  } satisfies BackgroundToContentMessage)) as unknown as { title: string; url: string; content: string }

  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'truncate' })
  if (req.present === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_STATUS', message: '正在截断上下文…' })
  }

  const truncated = truncateContent({
    title: extracted.title,
    content: extracted.content,
    targetTokens: 3500,
    maxTokens: 4200,
  })

  const prompts = buildPrompts({
    mode: req.mode,
    style: req.style,
    title: extracted.title,
    content: truncated.text,
  })

  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'request' })
  if (req.present === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_STATUS', message: '正在请求模型…' })
  }

  let fullText = ''
  try {
    emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'stream' })
    for await (const delta of callProviderStream({
      provider: config.provider,
      temperature: config.temperature,
      system: prompts.system,
      user: prompts.user,
    })) {
      fullText += delta
      emit(req.tabId, { type: 'delta', requestId: req.requestId, delta })
      if (req.present === 'overlay') {
        await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_DELTA', delta })
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '请求失败'
    emit(req.tabId, { type: 'error', requestId: req.requestId, message })
    if (req.present === 'overlay') {
      await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_ERROR', message })
    }
    return
  }

  lastResultByTab.set(req.tabId, fullText)
  emit(req.tabId, { type: 'done', requestId: req.requestId, text: fullText })
  if (req.present === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_DONE', text: fullText })
  }

  if (req.insertTldr) {
    const tldr = extractTldr(fullText)
    if (tldr) await sendToContent(req.tabId, { type: 'CONTENT_INSERT_TLDR', text: tldr })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'seo-cleaner-summary',
      title: '总结要点',
      contexts: ['page', 'selection'],
    })
    chrome.contextMenus.create({
      id: 'seo-cleaner-steps',
      title: '提取操作步骤',
      contexts: ['page', 'selection'],
    })
    chrome.contextMenus.create({
      id: 'seo-cleaner-compare',
      title: '对比分析',
      contexts: ['page', 'selection'],
    })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id
  if (typeof tabId !== 'number') return

  const requestId = crypto.randomUUID()
  const mode =
    info.menuItemId === 'seo-cleaner-steps'
      ? 'steps'
      : info.menuItemId === 'seo-cleaner-compare'
        ? 'compare'
        : 'summary'

  await runRequest({
    requestId,
    tabId,
    mode,
    style: 'concise',
    present: 'overlay',
    selectionOnly: info.selectionText != null && info.selectionText.length > 0,
    insertTldr: false,
  })
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ui') return
  uiPorts.add(port)

  port.onDisconnect.addListener(() => {
    uiPorts.delete(port)
  })

  port.onMessage.addListener(async (raw) => {
    const msg = raw as UiToBackgroundMessage
    if (msg.type === 'UI_HELLO') {
      const config = await loadConfig()
      port.postMessage({ type: 'UI_CONFIG', config } satisfies BackgroundToUiMessage)
      return
    }

    if (msg.type === 'UI_OPEN_OPTIONS') {
      await chrome.runtime.openOptionsPage()
      return
    }

    if (msg.type === 'UI_GET_CONFIG') {
      const config = await loadConfig()
      port.postMessage({ type: 'UI_CONFIG', config } satisfies BackgroundToUiMessage)
      return
    }

    if (msg.type === 'UI_SET_CONFIG') {
      await saveConfig(msg.config as UserConfig)
      const config = await loadConfig()
      port.postMessage({ type: 'UI_CONFIG', config } satisfies BackgroundToUiMessage)
      return
    }

    if (msg.type === 'UI_START') {
      await runRequest(msg.payload)
      return
    }

    if (msg.type === 'UI_RETRY_LAST') {
      const last = lastRequestByTab.get(msg.tabId)
      if (!last) return
      const present: PresentTarget = msg.present ?? last.present
      await runRequest({ ...last, requestId: crypto.randomUUID(), present })
    }
  })
})

chrome.runtime.onMessage.addListener((raw, sender) => {
  const msg = raw as { type?: string }
  if (msg.type === 'CONTENT_OVERLAY_RETRY') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number') return
    const last = lastRequestByTab.get(tabId)
    if (!last) return
    runRequest({ ...last, requestId: crypto.randomUUID(), present: 'overlay' }).catch(() => {
      // ignore
    })
  }
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const url = tab.url
  if (!url) return

  const cfg = await loadConfig()
  if (!cfg.auto.enabled) return
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return
  }

  if (!cfg.auto.domains.includes(host)) return

  const originPattern = `*://${host}/*`
  const has = await chrome.permissions.contains({ origins: [originPattern] })
  if (!has) return

  await runRequest({
    requestId: crypto.randomUUID(),
    tabId,
    mode: cfg.defaultMode,
    style: 'minimal',
    present: 'overlay',
    selectionOnly: false,
    insertTldr: true,
  })
})


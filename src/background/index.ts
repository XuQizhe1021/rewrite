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
const latestEventByTab = new Map<number, StreamEvent>()

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
  latestEventByTab.set(tabId, event)
  broadcastToUi({ type: 'UI_STREAM', event }, tabId)
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([task, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
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

  let presentTarget: PresentTarget = req.present
  try {
    if (presentTarget === 'overlay') {
      await sendToContent(req.tabId, { type: 'CONTENT_SHOW_OVERLAY', title: '生成中…' })
    } else {
      await withTimeout(openSidePanel(req.tabId), 1000, '打开侧边栏超时，请稍后重试')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '打开侧边栏失败'
    console.error('打开呈现容器失败', error)
    emit(req.tabId, {
      type: 'error',
      requestId: req.requestId,
      message: `侧边栏不可用，已降级到悬浮层：${message}`,
    })
    presentTarget = 'overlay'
    await sendToContent(req.tabId, { type: 'CONTENT_SHOW_OVERLAY', title: '侧边栏不可用，已切换悬浮层' })
  }

  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'extract' })
  if (presentTarget === 'overlay') {
    await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_STATUS', message: '正在提取正文…' })
  }

  await ensureContentScript(req.tabId)
  let extracted: { title: string; url: string; content: string }
  try {
    extracted = (await withTimeout(
      chrome.tabs.sendMessage(req.tabId, {
        type: 'CONTENT_EXTRACT',
        selectionOnly: req.selectionOnly,
      } satisfies BackgroundToContentMessage),
      10000,
      '页面正文提取超时',
    )) as unknown as { title: string; url: string; content: string }
  } catch (error) {
    const message = error instanceof Error ? error.message : '页面正文提取失败'
    console.error('正文提取失败', error)
    emit(req.tabId, { type: 'error', requestId: req.requestId, message })
    if (presentTarget === 'overlay') {
      await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_ERROR', message })
    }
    return
  }

  emit(req.tabId, { type: 'status', requestId: req.requestId, stage: 'truncate' })
  if (presentTarget === 'overlay') {
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
  if (presentTarget === 'overlay') {
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
      if (presentTarget === 'overlay') {
        await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_DELTA', delta })
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '请求失败'
    console.error('模型请求失败', e)
    emit(req.tabId, { type: 'error', requestId: req.requestId, message })
    if (presentTarget === 'overlay') {
      await sendToContent(req.tabId, { type: 'CONTENT_OVERLAY_ERROR', message })
    }
    return
  }

  lastResultByTab.set(req.tabId, fullText)
  emit(req.tabId, { type: 'done', requestId: req.requestId, text: fullText })
  if (presentTarget === 'overlay') {
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
    try {
      const msg = raw as UiToBackgroundMessage
      if (msg.type === 'UI_HELLO') {
        const config = await loadConfig()
        port.postMessage({ type: 'UI_CONFIG', config } satisfies BackgroundToUiMessage)
        const tabId = msg.tabId ?? port.sender?.tab?.id
        if (typeof tabId === 'number') {
          const latest = latestEventByTab.get(tabId)
          if (latest) {
            port.postMessage({ type: 'UI_STREAM', event: latest } satisfies BackgroundToUiMessage)
          }
        }
        return
      }

      if (msg.type === 'UI_OPEN_OPTIONS') {
        await chrome.runtime.openOptionsPage()
        return
      }

      if (msg.type === 'UI_OPEN_SIDEPANEL') {
        try {
          await withTimeout(openSidePanel(msg.tabId), 1000, '打开侧边栏超时，请稍后重试')
        } catch (error) {
          const message = error instanceof Error ? error.message : '打开侧边栏失败'
          console.error('主动打开侧边栏失败', error)
          emit(msg.tabId, {
            type: 'error',
            requestId: crypto.randomUUID(),
            message,
          })
        }
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
        if (!last) {
          emit(msg.tabId, {
            type: 'error',
            requestId: crypto.randomUUID(),
            message: '没有可重试的任务，请先执行一次开始。',
          })
          return
        }
        const present: PresentTarget = msg.present ?? last.present
        await runRequest({ ...last, requestId: crypto.randomUUID(), present })
      }
    } catch (error) {
      console.error('处理 UI 消息失败', error)
      const senderTabId = port.sender?.tab?.id
      if (typeof senderTabId === 'number') {
        emit(senderTabId, {
          type: 'error',
          requestId: crypto.randomUUID(),
          message: '请求失败，请重试或重新打开侧边栏。',
        })
      }
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


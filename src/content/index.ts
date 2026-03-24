import { Readability } from '@mozilla/readability'
import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
} from '../shared/messages'
import { htmlToTextPreserveLists } from '../shared/domText'
import { normalizeWhitespace } from '../shared/text'
import { renderMarkdown } from '../ui/markdown'

const OVERLAY_ID = 'seo-cleaner-overlay-root'
const TLDR_ID = 'seo-cleaner-tldr'
const OVERLAY_MINIMIZED_KEY = 'seoCleanerOverlayMinimized'
const OVERLAY_POSITION_KEY = `seoCleanerOverlayPosition:${location.hostname || 'global'}`

let overlayText = ''
let overlayTitle = ''
let overlayStatus = ''
let overlayMinimized = false
let dragState:
  | {
      offsetX: number
      offsetY: number
      pointerId: number
    }
  | null = null

function loadOverlayPosition(): { left: number; top: number } | null {
  try {
    const raw = sessionStorage.getItem(OVERLAY_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { left?: number; top?: number }
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    return { left: parsed.left, top: parsed.top }
  } catch {
    return null
  }
}

function saveOverlayPosition(left: number, top: number): void {
  try {
    sessionStorage.setItem(OVERLAY_POSITION_KEY, JSON.stringify({ left, top }))
  } catch {
    // ignore
  }
}

function loadOverlayMinimized(): boolean {
  try {
    return sessionStorage.getItem(OVERLAY_MINIMIZED_KEY) === '1'
  } catch {
    return false
  }
}

function saveOverlayMinimized(minimized: boolean): void {
  try {
    sessionStorage.setItem(OVERLAY_MINIMIZED_KEY, minimized ? '1' : '0')
  } catch {
    // ignore
  }
}

function clampOverlayPosition(host: HTMLElement, left: number, top: number): { left: number; top: number } {
  const margin = 12
  const maxLeft = Math.max(margin, window.innerWidth - host.offsetWidth - margin)
  const maxTop = Math.max(margin, window.innerHeight - host.offsetHeight - margin)
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  }
}

function applyOverlayPosition(host: HTMLElement, left: number, top: number): void {
  const clamped = clampOverlayPosition(host, left, top)
  host.style.left = `${clamped.left}px`
  host.style.top = `${clamped.top}px`
  host.style.right = 'auto'
  host.style.bottom = 'auto'
}

function resetOverlayPosition(host: HTMLElement): void {
  host.style.left = 'auto'
  host.style.top = 'auto'
  host.style.right = '12px'
  host.style.bottom = '12px'
  try {
    sessionStorage.removeItem(OVERLAY_POSITION_KEY)
  } catch {
    // ignore
  }
}

function ensureOverlay(): { root: HTMLElement; body: HTMLElement; status: HTMLElement } {
  let host = document.getElementById(OVERLAY_ID) as HTMLElement | null
  if (!host) {
    host = document.createElement('div')
    host.id = OVERLAY_ID
    host.style.position = 'fixed'
    host.style.bottom = '12px'
    host.style.right = '12px'
    host.style.zIndex = '2147483647'
    host.style.width = '420px'
    host.style.maxHeight = '70vh'
    host.style.borderRadius = '14px'
    host.style.overflow = 'hidden'
    host.style.boxShadow = '0 10px 30px rgba(0,0,0,.18)'
    host.style.background = '#ffffff'
    host.style.border = '1px solid rgba(0,0,0,.08)'

    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.alignItems = 'center'
    header.style.justifyContent = 'space-between'
    header.style.gap = '8px'
    header.style.padding = '10px 12px'
    header.style.background = '#111827'
    header.style.color = '#ffffff'
    header.style.cursor = 'move'
    header.style.userSelect = 'none'

    const title = document.createElement('div')
    title.id = `${OVERLAY_ID}-title`
    title.style.fontSize = '12px'
    title.style.fontWeight = '700'
    title.textContent = 'SEO/内容垃圾过滤器'

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.gap = '6px'

    const mkBtn = (label: string, danger = false) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.style.fontSize = '12px'
      b.style.border = danger ? '1px solid rgba(248,113,113,.45)' : '1px solid rgba(255,255,255,.25)'
      b.style.background = danger ? 'rgba(185,28,28,.24)' : 'rgba(255,255,255,.06)'
      b.style.color = '#ffffff'
      b.style.borderRadius = '10px'
      b.style.padding = '6px 8px'
      b.style.cursor = 'pointer'
      return b
    }

    const copyBtn = mkBtn('复制')
    copyBtn.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    copyBtn.addEventListener('click', async () => {
      if (!overlayText) return
      try {
        await navigator.clipboard.writeText(overlayText)
        overlayStatus = '已复制'
        renderOverlay()
      } catch (error) {
        console.error('悬浮层复制失败', error)
        overlayStatus = '复制失败，请检查剪贴板权限'
        renderOverlay()
      }
    })

    const retryBtn = mkBtn('重试')
    retryBtn.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    retryBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CONTENT_OVERLAY_RETRY' } satisfies ContentToBackgroundMessage)
    })

    const miniBtn = mkBtn('收起')
    miniBtn.id = `${OVERLAY_ID}-mini`
    miniBtn.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    miniBtn.addEventListener('click', () => {
      overlayMinimized = !overlayMinimized
      saveOverlayMinimized(overlayMinimized)
      renderOverlay()
    })

    const resetBtn = mkBtn('重置位')
    resetBtn.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    resetBtn.addEventListener('click', () => {
      resetOverlayPosition(host!)
    })

    const closeBtn = mkBtn('关闭', true)
    closeBtn.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    closeBtn.addEventListener('click', () => {
      host?.remove()
    })

    actions.append(copyBtn, retryBtn, miniBtn, resetBtn, closeBtn)
    header.append(title, actions)

    // 拖拽逻辑：只允许在视口范围内移动，并在释放后记录位置
    header.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button')) return
      const rect = host!.getBoundingClientRect()
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
      }
      header.setPointerCapture(event.pointerId)
      event.preventDefault()
    })
    header.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return
      applyOverlayPosition(host!, event.clientX - dragState.offsetX, event.clientY - dragState.offsetY)
    })
    header.addEventListener('pointerup', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return
      const rect = host!.getBoundingClientRect()
      saveOverlayPosition(rect.left, rect.top)
      dragState = null
      header.releasePointerCapture(event.pointerId)
    })
    header.addEventListener('pointercancel', () => {
      dragState = null
    })

    const status = document.createElement('div')
    status.id = `${OVERLAY_ID}-status`
    status.style.padding = '8px 12px'
    status.style.fontSize = '12px'
    status.style.color = '#6b7280'
    status.style.borderBottom = '1px solid rgba(0,0,0,.06)'

    const body = document.createElement('div')
    body.id = `${OVERLAY_ID}-body`
    body.style.padding = '10px 12px'
    body.style.fontSize = '12px'
    body.style.lineHeight = '1.55'
    body.style.overflow = 'auto'
    body.style.maxHeight = 'calc(70vh - 84px)'
    body.style.background = '#fcfcfd'

    host.append(header, status, body)
    document.documentElement.appendChild(host)
    const persisted = loadOverlayPosition()
    if (persisted) {
      applyOverlayPosition(host, persisted.left, persisted.top)
    }
    overlayMinimized = loadOverlayMinimized()
  }

  const body = document.getElementById(`${OVERLAY_ID}-body`) as HTMLElement
  const status = document.getElementById(`${OVERLAY_ID}-status`) as HTMLElement
  return { root: host, body, status }
}

function renderOverlay(): void {
  const { root, body, status } = ensureOverlay()
  status.textContent = overlayStatus

  const titleEl = document.getElementById(`${OVERLAY_ID}-title`)
  if (titleEl) titleEl.textContent = overlayTitle || 'SEO/内容垃圾过滤器'
  const miniEl = document.getElementById(`${OVERLAY_ID}-mini`) as HTMLButtonElement | null
  if (miniEl) miniEl.textContent = overlayMinimized ? '展开' : '收起'

  body.innerHTML = renderMarkdown(overlayText)
  status.style.display = overlayMinimized ? 'none' : 'block'
  body.style.display = overlayMinimized ? 'none' : 'block'
  root.style.maxHeight = overlayMinimized ? '48px' : '70vh'
}

function cleanClone(doc: Document): void {
  const selectors = ['script', 'style', 'noscript', 'nav', 'footer', 'aside']
  for (const s of selectors) {
    doc.querySelectorAll(s).forEach((el) => el.remove())
  }

  doc
    .querySelectorAll('[id], [class]')
    .forEach((el) => {
      const v = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`
      if (/(\bad\b|sponsor|promo|banner|advert|comment|sidebar)/i.test(v)) {
        el.remove()
      }
    })
}

function extractByReadability(): { title: string; content: string } | null {
  const clone = document.cloneNode(true) as Document
  cleanClone(clone)

  const article = new Readability(clone).parse()
  if (!article || !article.textContent) return null

  const content = htmlToTextPreserveLists(article.content || '')
  const text = content.length > 0 ? content : article.textContent
  return {
    title: article.title || document.title || '',
    content: normalizeWhitespace(text),
  }
}

function extractFallback(): { title: string; content: string } {
  const clone = document.cloneNode(true) as Document
  cleanClone(clone)
  const bodyText = clone.body?.innerText ?? document.body?.innerText ?? ''
  return { title: document.title || '', content: normalizeWhitespace(bodyText) }
}

function extractSelection(): string {
  const sel = window.getSelection()
  const t = sel?.toString() ?? ''
  return normalizeWhitespace(t)
}

chrome.runtime.onMessage.addListener(
  (raw: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (resp?: unknown) => void) => {
    const msg = raw as BackgroundToContentMessage

    if (msg.type === 'CONTENT_PING') {
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_SHOW_OVERLAY') {
      overlayTitle = msg.title
      overlayText = ''
      overlayStatus = '准备中…'
      renderOverlay()
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_OVERLAY_STATUS') {
      overlayStatus = msg.message
      renderOverlay()
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_OVERLAY_DELTA') {
      overlayText += msg.delta
      overlayStatus = '生成中…'
      renderOverlay()
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_OVERLAY_DONE') {
      overlayText = msg.text
      overlayStatus = '完成'
      renderOverlay()
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_OVERLAY_ERROR') {
      overlayStatus = `错误：${msg.message}`
      renderOverlay()
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_INSERT_TLDR') {
      const existing = document.getElementById(TLDR_ID)
      if (existing) existing.remove()

      const bar = document.createElement('div')
      bar.id = TLDR_ID
      bar.style.position = 'sticky'
      bar.style.top = '0'
      bar.style.zIndex = '2147483646'
      bar.style.background = '#fef3c7'
      bar.style.borderBottom = '1px solid #f59e0b'
      bar.style.color = '#92400e'
      bar.style.padding = '10px 12px'
      bar.style.display = 'flex'
      bar.style.alignItems = 'center'
      bar.style.justifyContent = 'space-between'
      bar.style.gap = '12px'

      const text = document.createElement('div')
      text.style.fontSize = '13px'
      text.style.fontWeight = '600'
      text.textContent = `TL;DR：${msg.text}`

      const close = document.createElement('button')
      close.type = 'button'
      close.textContent = '关闭'
      close.style.border = '1px solid rgba(146,64,14,.35)'
      close.style.background = 'rgba(255,255,255,.6)'
      close.style.borderRadius = '10px'
      close.style.padding = '6px 10px'
      close.style.cursor = 'pointer'
      close.addEventListener('click', () => {
        bar.remove()
      })

      bar.append(text, close)
      document.body.prepend(bar)
      sendResponse({ ok: true })
      return
    }

    if (msg.type === 'CONTENT_EXTRACT') {
      const selection = msg.selectionOnly ? extractSelection() : ''
      if (msg.selectionOnly && selection.length > 0) {
        sendResponse({ title: document.title || '', url: location.href, content: selection })
        return
      }

      const article = extractByReadability()
      const fallback = article ?? extractFallback()
      sendResponse({ title: fallback.title, url: location.href, content: fallback.content })
      return
    }
  },
)


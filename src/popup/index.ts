import type { BackgroundToUiMessage } from '../shared/messages'
import type { PresentTarget, StartRequest, StreamEvent, SummaryStyle, TaskMode, UserConfig } from '../shared/types'
import { mustGetEl, setText } from '../ui/dom'
import { renderMarkdown } from '../ui/markdown'
import { connectUiPort, postUi } from '../ui/port'

const modeEl = mustGetEl<HTMLSelectElement>('mode')
const styleEl = mustGetEl<HTMLSelectElement>('style')
const presentEl = mustGetEl<HTMLSelectElement>('present')
const selectionOnlyEl = mustGetEl<HTMLInputElement>('selectionOnly')
const insertTldrEl = mustGetEl<HTMLInputElement>('insertTldr')
const runBtn = mustGetEl<HTMLButtonElement>('run')
const openOptionsBtn = mustGetEl<HTMLButtonElement>('openOptions')
const openSidepanelBtn = mustGetEl<HTMLButtonElement>('openSidepanel')
const statusEl = mustGetEl<HTMLDivElement>('status')
const outputEl = mustGetEl<HTMLDivElement>('output')
const copyBtn = mustGetEl<HTMLButtonElement>('copy')
const retryBtn = mustGetEl<HTMLButtonElement>('retry')

let currentTabId: number | null = null
let lastText = ''
let lastReq: Omit<StartRequest, 'requestId' | 'tabId'> | null = null

const port = connectUiPort((m) => {
  onBackgroundMessage(m)
})

postUi(port, { type: 'UI_HELLO' })

async function getTabId(): Promise<number> {
  if (currentTabId != null) return currentTabId
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tabs[0]?.id
  if (typeof tabId !== 'number') throw new Error('无法获取当前标签页')
  currentTabId = tabId
  return tabId
}

function setOutput(md: string): void {
  outputEl.innerHTML = renderMarkdown(md)
}

function setStatus(text: string): void {
  setText(statusEl, text)
}

function onStreamEvent(e: StreamEvent): void {
  if (e.type === 'status') {
    const map: Record<typeof e.stage, string> = {
      prepare: '准备中…',
      extract: '提取正文…',
      truncate: '截断上下文…',
      request: '请求模型…',
      stream: '生成中…',
    }
    setStatus(map[e.stage])
    return
  }

  if (e.type === 'delta') {
    lastText += e.delta
    setOutput(lastText)
    setStatus('生成中…')
    return
  }

  if (e.type === 'done') {
    lastText = e.text
    setOutput(lastText)
    setStatus('完成')
    return
  }

  setStatus(`错误：${e.message}`)
}

function onBackgroundMessage(m: BackgroundToUiMessage): void {
  if (m.type === 'UI_CONFIG') {
    applyConfig(m.config)
    return
  }

  if (m.type === 'UI_STREAM') {
    onStreamEvent(m.event)
  }
}

function applyConfig(cfg: UserConfig): void {
  modeEl.value = cfg.defaultMode
  styleEl.value = cfg.defaultStyle
  presentEl.value = cfg.defaultPresent
}

runBtn.addEventListener('click', async () => {
  lastText = ''
  setOutput('')
  setStatus('准备中…')

  const tabId = await getTabId()
  const request: StartRequest = {
    requestId: crypto.randomUUID(),
    tabId,
    mode: modeEl.value as TaskMode,
    style: styleEl.value as SummaryStyle,
    present: presentEl.value as PresentTarget,
    selectionOnly: selectionOnlyEl.checked,
    insertTldr: insertTldrEl.checked,
  }
  lastReq = {
    mode: request.mode,
    style: request.style,
    present: request.present,
    selectionOnly: request.selectionOnly,
    insertTldr: request.insertTldr,
  }
  postUi(port, { type: 'UI_START', payload: request })
})

retryBtn.addEventListener('click', async () => {
  const tabId = await getTabId()
  if (!lastReq) {
    postUi(port, { type: 'UI_RETRY_LAST', tabId })
    return
  }
  postUi(port, { type: 'UI_RETRY_LAST', tabId, present: lastReq.present })
})

copyBtn.addEventListener('click', async () => {
  if (!lastText) return
  await navigator.clipboard.writeText(lastText)
})

openOptionsBtn.addEventListener('click', () => {
  postUi(port, { type: 'UI_OPEN_OPTIONS' })
})

openSidepanelBtn.addEventListener('click', async () => {
  const tabId = await getTabId()
  postUi(port, {
    type: 'UI_START',
    payload: {
      requestId: crypto.randomUUID(),
      tabId,
      mode: modeEl.value as TaskMode,
      style: styleEl.value as SummaryStyle,
      present: 'sidepanel',
      selectionOnly: selectionOnlyEl.checked,
      insertTldr: insertTldrEl.checked,
    },
  })
})


import type { BackgroundToUiMessage } from '../shared/messages'
import type { StartRequest, StreamEvent, SummaryStyle, TaskMode, UserConfig } from '../shared/types'
import { mustGetEl, setText } from '../ui/dom'
import { renderMarkdown } from '../ui/markdown'
import { connectUiPort, postUi } from '../ui/port'

const modeEl = mustGetEl<HTMLSelectElement>('mode')
const styleEl = mustGetEl<HTMLSelectElement>('style')
const selectionOnlyEl = mustGetEl<HTMLInputElement>('selectionOnly')
const insertTldrEl = mustGetEl<HTMLInputElement>('insertTldr')
const runBtn = mustGetEl<HTMLButtonElement>('run')
const showOverlayBtn = mustGetEl<HTMLButtonElement>('showOverlay')
const openOptionsBtn = mustGetEl<HTMLButtonElement>('openOptions')
const statusEl = mustGetEl<HTMLDivElement>('status')
const outputEl = mustGetEl<HTMLDivElement>('output')
const copyBtn = mustGetEl<HTMLButtonElement>('copy')
const retryBtn = mustGetEl<HTMLButtonElement>('retry')
const goodBtn = mustGetEl<HTMLButtonElement>('good')
const badBtn = mustGetEl<HTMLButtonElement>('bad')

let tabId: number | null = null
let lastText = ''

const port = connectUiPort((m) => {
  onBackgroundMessage(m)
})

postUi(port, { type: 'UI_HELLO' })

async function getTabId(): Promise<number> {
  if (tabId != null) return tabId
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const id = tabs[0]?.id
  if (typeof id !== 'number') throw new Error('无法获取当前标签页')
  tabId = id
  return id
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

function applyConfig(cfg: UserConfig): void {
  modeEl.value = cfg.defaultMode
  styleEl.value = cfg.defaultStyle
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

runBtn.addEventListener('click', async () => {
  lastText = ''
  setOutput('')
  setStatus('准备中…')
  const id = await getTabId()
  const req: StartRequest = {
    requestId: crypto.randomUUID(),
    tabId: id,
    mode: modeEl.value as TaskMode,
    style: styleEl.value as SummaryStyle,
    present: 'sidepanel',
    selectionOnly: selectionOnlyEl.checked,
    insertTldr: insertTldrEl.checked,
  }
  postUi(port, { type: 'UI_START', payload: req })
})

showOverlayBtn.addEventListener('click', async () => {
  lastText = ''
  setOutput('')
  setStatus('准备中…')
  const id = await getTabId()
  const req: StartRequest = {
    requestId: crypto.randomUUID(),
    tabId: id,
    mode: modeEl.value as TaskMode,
    style: styleEl.value as SummaryStyle,
    present: 'overlay',
    selectionOnly: selectionOnlyEl.checked,
    insertTldr: insertTldrEl.checked,
  }
  postUi(port, { type: 'UI_START', payload: req })
})

retryBtn.addEventListener('click', async () => {
  const id = await getTabId()
  postUi(port, { type: 'UI_RETRY_LAST', tabId: id })
})

copyBtn.addEventListener('click', async () => {
  if (!lastText) return
  await navigator.clipboard.writeText(lastText)
})

goodBtn.addEventListener('click', () => {
  setStatus('已记录：满意')
})

badBtn.addEventListener('click', () => {
  setStatus('已记录：不满意')
})

openOptionsBtn.addEventListener('click', () => {
  postUi(port, { type: 'UI_OPEN_OPTIONS' })
})


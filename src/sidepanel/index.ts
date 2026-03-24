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
let activeRequestId: string | null = null
let uiState: 'idle' | 'loading' | 'streaming' | 'success' | 'error' | 'timeout' = 'idle'
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

const port = connectUiPort((m) => {
  onBackgroundMessage(m)
})

void getTabId()
  .then((id) => {
    postUi(port, { type: 'UI_HELLO', tabId: id })
  })
  .catch((error) => {
    console.error('初始化侧边栏失败', error)
    setStatus('错误：无法获取当前标签页')
  })

async function getTabId(): Promise<number> {
  if (tabId != null) return tabId
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const id = currentWindowTabs[0]?.id ?? lastFocusedTabs[0]?.id
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

function clearTimeoutGuard(): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer)
    timeoutTimer = null
  }
}

function setUiState(state: typeof uiState, text: string): void {
  uiState = state
  setStatus(text)
}

function startTimeoutGuard(): void {
  clearTimeoutGuard()
  timeoutTimer = setTimeout(() => {
    if (uiState === 'success' || uiState === 'error') return
    uiState = 'timeout'
    setStatus('请求超时，请点击“重新生成”')
  }, 30000)
}

function onStreamEvent(e: StreamEvent): void {
  if (activeRequestId && e.requestId !== activeRequestId) return
  if (e.type === 'status') {
    if (e.stage === 'prepare' || e.stage === 'extract' || e.stage === 'truncate' || e.stage === 'request') {
      uiState = 'loading'
    } else {
      uiState = 'streaming'
    }
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
    clearTimeoutGuard()
    startTimeoutGuard()
    uiState = 'streaming'
    lastText += e.delta
    setOutput(lastText)
    setStatus('生成中…')
    return
  }

  if (e.type === 'done') {
    clearTimeoutGuard()
    uiState = 'success'
    lastText = e.text
    setOutput(lastText)
    setStatus('完成')
    return
  }

  clearTimeoutGuard()
  uiState = 'error'
  setStatus(`错误：${e.message}（可重试）`)
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
  try {
    lastText = ''
    setOutput('')
    setUiState('loading', '准备中…')
    startTimeoutGuard()
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
    activeRequestId = req.requestId
    postUi(port, { type: 'UI_START', payload: req })
  } catch (error) {
    clearTimeoutGuard()
    console.error('侧边栏开始失败', error)
    setUiState('error', '错误：启动失败，请重试')
  }
})

showOverlayBtn.addEventListener('click', async () => {
  try {
    lastText = ''
    setOutput('')
    setUiState('loading', '准备中…')
    startTimeoutGuard()
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
    activeRequestId = req.requestId
    postUi(port, { type: 'UI_START', payload: req })
  } catch (error) {
    clearTimeoutGuard()
    console.error('切换悬浮层失败', error)
    setUiState('error', '错误：无法切换到悬浮层')
  }
})

retryBtn.addEventListener('click', async () => {
  try {
    setUiState('loading', '正在重试…')
    startTimeoutGuard()
    activeRequestId = null
    const id = await getTabId()
    postUi(port, { type: 'UI_RETRY_LAST', tabId: id })
  } catch (error) {
    clearTimeoutGuard()
    console.error('侧边栏重试失败', error)
    setUiState('error', '错误：重试失败')
  }
})

copyBtn.addEventListener('click', async () => {
  if (!lastText) return
  try {
    await navigator.clipboard.writeText(lastText)
    setStatus('已复制')
  } catch (error) {
    console.error('复制失败', error)
    setStatus('复制失败，请检查剪贴板权限')
  }
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


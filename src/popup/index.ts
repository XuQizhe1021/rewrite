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
let activeRequestId: string | null = null
let uiState: 'idle' | 'loading' | 'streaming' | 'success' | 'error' | 'timeout' = 'idle'
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

const port = connectUiPort((m) => {
  onBackgroundMessage(m)
})

void getTabId()
  .then((tabId) => {
    postUi(port, { type: 'UI_HELLO', tabId })
  })
  .catch((error) => {
    console.error('初始化标签页失败', error)
  })

async function getTabId(): Promise<number> {
  if (currentTabId != null) return currentTabId
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = currentWindowTabs[0]?.id ?? lastFocusedTabs[0]?.id
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
    setStatus('请求超时，请点击“重新生成”重试')
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
  setStatus(`错误：${e.message}（可点击“重新生成”）`)
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
  try {
    lastText = ''
    setOutput('')
    setUiState('loading', '准备中…')
    startTimeoutGuard()

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
    activeRequestId = request.requestId
    lastReq = {
      mode: request.mode,
      style: request.style,
      present: request.present,
      selectionOnly: request.selectionOnly,
      insertTldr: request.insertTldr,
    }
    postUi(port, { type: 'UI_START', payload: request })
  } catch (error) {
    clearTimeoutGuard()
    console.error('开始任务失败', error)
    setUiState('error', '错误：开始失败，请确认页面可访问后重试')
  }
})

retryBtn.addEventListener('click', async () => {
  try {
    setUiState('loading', '正在重试…')
    startTimeoutGuard()
    activeRequestId = null
    const tabId = await getTabId()
    if (!lastReq) {
      postUi(port, { type: 'UI_RETRY_LAST', tabId })
      return
    }
    postUi(port, { type: 'UI_RETRY_LAST', tabId, present: lastReq.present })
  } catch (error) {
    clearTimeoutGuard()
    console.error('重试失败', error)
    setUiState('error', '错误：重试失败，请刷新页面后再试')
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

openOptionsBtn.addEventListener('click', () => {
  postUi(port, { type: 'UI_OPEN_OPTIONS' })
})

openSidepanelBtn.addEventListener('click', async () => {
  try {
    const tabId = await getTabId()
    postUi(port, { type: 'UI_OPEN_SIDEPANEL', tabId })
    if (lastReq) {
      postUi(port, { type: 'UI_RETRY_LAST', tabId, present: 'sidepanel' })
    } else {
      setStatus('侧边栏已打开，可在侧边栏继续操作')
    }
  } catch (error) {
    console.error('打开侧边栏失败', error)
    setUiState('error', '错误：侧边栏打开失败，请确认浏览器支持 Side Panel')
  }
})


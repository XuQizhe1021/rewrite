export type TaskMode = 'summary' | 'steps' | 'compare'

export type SummaryStyle = 'concise' | 'detailed' | 'minimal'

export type PresentTarget = 'sidepanel' | 'overlay'

export type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'gemini'

export type StreamEventType = 'status' | 'delta' | 'done' | 'error'

export interface ExtractedPage {
  title: string
  url: string
  content: string
}

export interface TruncateResult {
  text: string
  estimatedTokens: number
  truncated: boolean
}

export interface ProviderConfig {
  providerId: ProviderId
  apiKey: string
  baseUrl: string
  model: string
}

export interface AutoModeConfig {
  enabled: boolean
  domains: string[]
}

export interface UserConfig {
  provider: ProviderConfig
  temperature: number
  defaultMode: TaskMode
  defaultStyle: SummaryStyle
  defaultPresent: PresentTarget
  auto: AutoModeConfig
}

export interface StartRequest {
  requestId: string
  tabId: number
  mode: TaskMode
  style: SummaryStyle
  present: PresentTarget
  selectionOnly: boolean
  insertTldr: boolean
}

export interface StreamStatusEvent {
  type: 'status'
  requestId: string
  stage: 'prepare' | 'extract' | 'truncate' | 'request' | 'stream'
  message?: string
}

export interface StreamDeltaEvent {
  type: 'delta'
  requestId: string
  delta: string
}

export interface StreamDoneEvent {
  type: 'done'
  requestId: string
  text: string
}

export interface StreamErrorEvent {
  type: 'error'
  requestId: string
  message: string
}

export type StreamEvent = StreamStatusEvent | StreamDeltaEvent | StreamDoneEvent | StreamErrorEvent


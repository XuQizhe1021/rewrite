import type { PresentTarget, StartRequest, StreamEvent, UserConfig } from './types'

export type UiToBackgroundMessage =
  | { type: 'UI_HELLO'; tabId?: number }
  | { type: 'UI_START'; payload: StartRequest }
  | { type: 'UI_RETRY_LAST'; tabId: number; present?: PresentTarget }
  | { type: 'UI_OPEN_SIDEPANEL'; tabId: number }
  | { type: 'UI_OPEN_OPTIONS' }
  | { type: 'UI_GET_CONFIG' }
  | { type: 'UI_SET_CONFIG'; config: UserConfig }

export type BackgroundToUiMessage =
  | { type: 'UI_CONFIG'; config: UserConfig }
  | { type: 'UI_STREAM'; event: StreamEvent }

export type ContentToBackgroundMessage =
  | { type: 'CONTENT_PONG' }
  | { type: 'CONTENT_OVERLAY_RETRY' }

export type BackgroundToContentMessage =
  | { type: 'CONTENT_PING' }
  | { type: 'CONTENT_EXTRACT'; selectionOnly: boolean }
  | { type: 'CONTENT_SHOW_OVERLAY'; title: string }
  | { type: 'CONTENT_OVERLAY_STATUS'; message: string }
  | { type: 'CONTENT_OVERLAY_DELTA'; delta: string }
  | { type: 'CONTENT_OVERLAY_DONE'; text: string }
  | { type: 'CONTENT_OVERLAY_ERROR'; message: string }
  | { type: 'CONTENT_INSERT_TLDR'; text: string }


import type { BackgroundToUiMessage, UiToBackgroundMessage } from '../shared/messages'

export function connectUiPort(onMessage: (m: BackgroundToUiMessage) => void): chrome.runtime.Port {
  const port = chrome.runtime.connect({ name: 'ui' })
  port.onMessage.addListener((m) => {
    onMessage(m as BackgroundToUiMessage)
  })
  return port
}

export function postUi(port: chrome.runtime.Port, msg: UiToBackgroundMessage): void {
  port.postMessage(msg)
}


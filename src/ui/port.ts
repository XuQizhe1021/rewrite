import type { BackgroundToUiMessage, UiToBackgroundMessage } from '../shared/messages'

const livePortState = new WeakMap<chrome.runtime.Port, { current: chrome.runtime.Port }>()

export function connectUiPort(onMessage: (m: BackgroundToUiMessage) => void): chrome.runtime.Port {
  const initialPort = chrome.runtime.connect({ name: 'ui' })
  const state = { current: initialPort }
  livePortState.set(initialPort, state)

  const bind = (target: chrome.runtime.Port) => {
    target.onMessage.addListener((m) => {
      onMessage(m as BackgroundToUiMessage)
    })
    target.onDisconnect.addListener(() => {
      try {
        state.current = chrome.runtime.connect({ name: 'ui' })
        livePortState.set(initialPort, state)
        bind(state.current)
      } catch (error) {
        console.error('UI 端口重连失败', error)
      }
    })
  }

  bind(initialPort)
  return initialPort
}

export function postUi(port: chrome.runtime.Port, msg: UiToBackgroundMessage): void {
  try {
    const state = livePortState.get(port)
    ;(state?.current ?? port).postMessage(msg)
  } catch (error) {
    console.error('发送 UI 消息失败', error, msg.type)
  }
}


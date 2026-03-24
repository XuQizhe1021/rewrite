import type { BackgroundToUiMessage } from '../shared/messages'
import { defaultConfig, defaultProvider } from '../shared/config'
import type { PresentTarget, ProviderId, SummaryStyle, TaskMode, UserConfig } from '../shared/types'
import { mustGetEl, setText } from '../ui/dom'
import { connectUiPort, postUi } from '../ui/port'

const providerEl = mustGetEl<HTMLSelectElement>('provider')
const modelEl = mustGetEl<HTMLInputElement>('model')
const baseUrlEl = mustGetEl<HTMLInputElement>('baseUrl')
const apiKeyEl = mustGetEl<HTMLInputElement>('apiKey')
const temperatureEl = mustGetEl<HTMLInputElement>('temperature')
const defaultStyleEl = mustGetEl<HTMLSelectElement>('defaultStyle')
const defaultModeEl = mustGetEl<HTMLSelectElement>('defaultMode')
const defaultPresentEl = mustGetEl<HTMLSelectElement>('defaultPresent')
const saveBtn = mustGetEl<HTMLButtonElement>('save')
const resetBtn = mustGetEl<HTMLButtonElement>('reset')
const saveStatusEl = mustGetEl<HTMLDivElement>('saveStatus')

const autoDomainEl = mustGetEl<HTMLInputElement>('autoDomain')
const addDomainBtn = mustGetEl<HTMLButtonElement>('addDomain')
const domainListEl = mustGetEl<HTMLDivElement>('domainList')

let config: UserConfig = defaultConfig()

const port = connectUiPort((m) => {
  onBackgroundMessage(m)
})

postUi(port, { type: 'UI_HELLO' })

function normalizeDomain(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const cleaned = s.replace(/^https?:\/\//, '').replace(/\/.+$/, '')
  if (!/^[a-z0-9.-]+$/.test(cleaned)) return null
  if (!cleaned.includes('.')) return null
  return cleaned
}

function renderDomains(): void {
  domainListEl.innerHTML = ''
  for (const d of config.auto.domains) {
    const item = document.createElement('div')
    item.className = 'ui-list-item'

    const left = document.createElement('div')
    left.innerHTML = `<code>${d}</code>`

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ui-btn'
    btn.textContent = '移除'
    btn.addEventListener('click', async () => {
      const originPattern = `*://${d}/*`
      await chrome.permissions.remove({ origins: [originPattern] })
      config = {
        ...config,
        auto: {
          ...config.auto,
          domains: config.auto.domains.filter((x) => x !== d),
        },
      }
      await persist()
      renderDomains()
    })

    item.append(left, btn)
    domainListEl.appendChild(item)
  }
}

function applyToForm(): void {
  providerEl.value = config.provider.providerId
  modelEl.value = config.provider.model
  baseUrlEl.value = config.provider.baseUrl
  apiKeyEl.value = config.provider.apiKey
  temperatureEl.value = String(config.temperature)
  defaultStyleEl.value = config.defaultStyle
  defaultModeEl.value = config.defaultMode
  defaultPresentEl.value = config.defaultPresent
  renderDomains()
}

function readFromForm(): UserConfig {
  const providerId = providerEl.value as ProviderId
  const provider = {
    providerId,
    model: modelEl.value.trim() || defaultProvider(providerId).model,
    baseUrl: baseUrlEl.value.trim() || defaultProvider(providerId).baseUrl,
    apiKey: apiKeyEl.value.trim(),
  }

  const temperature = Number(temperatureEl.value)

  return {
    ...config,
    provider,
    temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0, temperature)) : 0.2,
    defaultStyle: defaultStyleEl.value as SummaryStyle,
    defaultMode: defaultModeEl.value as TaskMode,
    defaultPresent: defaultPresentEl.value as PresentTarget,
  }
}

async function persist(): Promise<void> {
  postUi(port, { type: 'UI_SET_CONFIG', config })
}

function onBackgroundMessage(m: BackgroundToUiMessage): void {
  if (m.type === 'UI_CONFIG') {
    config = m.config
    applyToForm()
  }
}

saveBtn.addEventListener('click', async () => {
  config = readFromForm()
  await persist()
  setText(saveStatusEl, '已保存')
  setTimeout(() => setText(saveStatusEl, ''), 1200)
})

resetBtn.addEventListener('click', async () => {
  config = defaultConfig()
  await persist()
  applyToForm()
  setText(saveStatusEl, '已恢复默认')
  setTimeout(() => setText(saveStatusEl, ''), 1200)
})

providerEl.addEventListener('change', () => {
  const providerId = providerEl.value as ProviderId
  const defaults = defaultProvider(providerId)
  modelEl.value = defaults.model
  baseUrlEl.value = defaults.baseUrl
})

addDomainBtn.addEventListener('click', async () => {
  const d = normalizeDomain(autoDomainEl.value)
  if (!d) {
    setText(saveStatusEl, '域名格式不正确')
    return
  }
  if (config.auto.domains.includes(d)) {
    setText(saveStatusEl, '已存在')
    return
  }

  const originPattern = `*://${d}/*`
  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) {
    setText(saveStatusEl, '未授权，该域名不会自动运行')
    return
  }

  config = {
    ...config,
    auto: {
      ...config.auto,
      enabled: true,
      domains: [...config.auto.domains, d],
    },
  }
  await persist()
  autoDomainEl.value = ''
  renderDomains()
  setText(saveStatusEl, '已添加并授权')
  setTimeout(() => setText(saveStatusEl, ''), 1200)
})


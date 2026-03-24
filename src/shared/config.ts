import type { ProviderConfig, UserConfig } from './types'

export const STORAGE_KEY = 'seoCleanerConfig'

export function defaultProvider(providerId: ProviderConfig['providerId']): ProviderConfig {
  if (providerId === 'deepseek') {
    return {
      providerId,
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    }
  }

  if (providerId === 'openai') {
    return {
      providerId,
      apiKey: '',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
    }
  }

  if (providerId === 'anthropic') {
    return {
      providerId,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-haiku-20240307',
    }
  }

  return {
    providerId,
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-1.5-flash',
  }
}

export function defaultConfig(): UserConfig {
  return {
    provider: defaultProvider('deepseek'),
    temperature: 0.2,
    defaultMode: 'summary',
    defaultStyle: 'concise',
    defaultPresent: 'sidepanel',
    auto: {
      enabled: false,
      domains: [],
    },
  }
}

export function mergeConfig(partial: Partial<UserConfig> | undefined | null): UserConfig {
  const base = defaultConfig()
  if (!partial) return base

  return {
    ...base,
    ...partial,
    provider: {
      ...base.provider,
      ...(partial.provider ?? {}),
    },
    auto: {
      ...base.auto,
      ...(partial.auto ?? {}),
    },
  }
}


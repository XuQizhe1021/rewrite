import { STORAGE_KEY, mergeConfig } from './config'
import type { UserConfig } from './types'

export async function loadConfig(): Promise<UserConfig> {
  const result = await chrome.storage.local.get([STORAGE_KEY])
  return mergeConfig(result[STORAGE_KEY] as Partial<UserConfig> | undefined)
}

export async function saveConfig(config: UserConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config })
}


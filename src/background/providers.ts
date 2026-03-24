import type { ProviderConfig } from '../shared/types'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split(/\r?\n/)
    buf = parts.pop() ?? ''
    for (const line of parts) {
      yield line
    }
  }

  const rest = buf.trim()
  if (rest.length > 0) yield rest
}

async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  // 说明：SSE 的协议是按行传输，核心数据位于 data: 行。
  // 这里做“只提取 data:”的保守解析，忽略 event/id 等字段。
  for await (const line of readLines(stream)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice('data:'.length).trim()
    if (data.length === 0) continue
    yield data
  }
}

async function* streamOpenAiCompatible(args: {
  provider: ProviderConfig
  temperature: number
  system: string
  user: string
}): AsyncGenerator<string> {
  const baseUrl = normalizeBaseUrl(args.provider.baseUrl)
  const url = `${baseUrl}/v1/chat/completions`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.provider.apiKey}`,
    },
    body: JSON.stringify({
      model: args.provider.model,
      temperature: args.temperature,
      stream: true,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
    }),
  })

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`请求失败：HTTP ${resp.status} ${t}`)
  }
  if (!resp.body) throw new Error('响应体为空')

  for await (const data of readSseData(resp.body)) {
    if (data === '[DONE]') return
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      continue
    }

    const chunk = json as {
      choices?: Array<{
        delta?: {
          content?: unknown
        }
      }>
    }

    const delta = chunk.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) yield delta
  }
}

async function* streamAnthropic(args: {
  provider: ProviderConfig
  temperature: number
  system: string
  user: string
}): AsyncGenerator<string> {
  const baseUrl = normalizeBaseUrl(args.provider.baseUrl)
  const url = `${baseUrl}/v1/messages`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.provider.model,
      system: args.system,
      temperature: args.temperature,
      stream: true,
      max_tokens: 2048,
      messages: [{ role: 'user', content: args.user }],
    }),
  })

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`请求失败：HTTP ${resp.status} ${t}`)
  }
  if (!resp.body) throw new Error('响应体为空')

  for await (const data of readSseData(resp.body)) {
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      continue
    }

    const evt = json as {
      type?: unknown
      delta?: {
        text?: unknown
      }
    }

    if (evt.type === 'content_block_delta' && typeof evt.delta?.text === 'string') {
      const delta = evt.delta.text
      if (delta.length > 0) yield delta
    }

    if (evt.type === 'message_stop') return
  }
}

async function* streamGemini(args: {
  provider: ProviderConfig
  temperature: number
  system: string
  user: string
}): AsyncGenerator<string> {
  const baseUrl = normalizeBaseUrl(args.provider.baseUrl)
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(
    args.provider.model,
  )}:streamGenerateContent?key=${encodeURIComponent(args.provider.apiKey)}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: 'user', parts: [{ text: args.user }] }],
      generationConfig: { temperature: args.temperature },
    }),
  })

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`请求失败：HTTP ${resp.status} ${t}`)
  }
  if (!resp.body) throw new Error('响应体为空')

  for await (const line of readLines(resp.body)) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      continue
    }

    const chunk = json as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: unknown
          }>
        }
      }>
    }

    const parts = chunk.candidates?.[0]?.content?.parts
    const text = parts?.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
    if (typeof text === 'string' && text.length > 0) yield text
  }
}

export async function* callProviderStream(args: {
  provider: ProviderConfig
  temperature: number
  system: string
  user: string
}): AsyncGenerator<string> {
  if (args.provider.providerId === 'anthropic') {
    yield* streamAnthropic(args)
    return
  }
  if (args.provider.providerId === 'gemini') {
    yield* streamGemini(args)
    return
  }

  yield* streamOpenAiCompatible(args)
}


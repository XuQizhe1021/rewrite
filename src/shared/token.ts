import { encode } from 'gpt-tokenizer'

export function estimateTokens(text: string): number {
  try {
    return encode(text).length
  } catch {
    const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length
    const ascii = text.length - cjk
    const estimated = Math.ceil(cjk * 1.0 + ascii / 4)
    return Math.max(1, estimated)
  }
}


import { estimateTokens } from './token'
import type { TruncateResult } from './types'

const KEYWORD_RE = /(结论|总结|结果|最后|建议|要点)/

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitParagraphs(text: string): string[] {
  const normalized = normalizeWhitespace(text)
  const parts = normalized.split(/\n\n+/g).map((p) => p.trim())
  return parts.filter((p) => p.length > 0)
}

export function scoreParagraph(p: string): number {
  const keywordBonus = KEYWORD_RE.test(p) ? 3 : 0
  const numberBonus = /\d/.test(p) ? 1 : 0
  const lengthScore = Math.min(3, Math.floor(p.length / 200))
  return keywordBonus + numberBonus + lengthScore
}

export function truncateContent(args: {
  title: string
  content: string
  targetTokens: number
  maxTokens: number
}): TruncateResult {
  const title = normalizeWhitespace(args.title)
  const paragraphs = splitParagraphs(args.content)

  const header = title.length > 0 ? `标题：${title}\n\n` : ''
  const base = header + paragraphs.join('\n\n')
  const baseTokens = estimateTokens(base)
  if (baseTokens <= args.maxTokens) {
    return { text: base, estimatedTokens: baseTokens, truncated: false }
  }

  // 说明：截断策略遵循 README v1.0 约束：优先保留标题、首段、含“结论/总结/结果/最后”等关键词段落，
  // 然后按重要性补齐，并尽量保留原文顺序，目标 tokens≈3000–4000。
  const keep = new Set<number>()
  if (paragraphs.length > 0) keep.add(0)
  if (paragraphs.length > 1) keep.add(1)
  if (paragraphs.length > 0) keep.add(paragraphs.length - 1)

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (KEYWORD_RE.test(paragraphs[i])) keep.add(i)
  }

  const candidates = paragraphs
    .map((p, idx) => ({ idx, p, score: scoreParagraph(p) }))
    .filter((x) => !keep.has(x.idx))
    .sort((a, b) => b.score - a.score)

  const selectedIdx = new Set<number>()
  for (const idx of Array.from(keep).sort((a, b) => a - b)) {
    selectedIdx.add(idx)
  }

  const tryBuild = () => {
    const ordered = Array.from(selectedIdx)
      .sort((a, b) => a - b)
      .map((i) => paragraphs[i])
    return header + ordered.join('\n\n')
  }

  let current = tryBuild()
  let currentTokens = estimateTokens(current)

  for (const c of candidates) {
    if (currentTokens >= args.targetTokens) break
    selectedIdx.add(c.idx)
    current = tryBuild()
    currentTokens = estimateTokens(current)
    if (currentTokens > args.maxTokens) {
      selectedIdx.delete(c.idx)
      current = tryBuild()
      currentTokens = estimateTokens(current)
    }
  }

  if (currentTokens > args.maxTokens) {
    const roughCharLimit = Math.max(2000, Math.floor((args.maxTokens / baseTokens) * base.length))
    const clipped = (header + normalizeWhitespace(args.content)).slice(0, roughCharLimit)
    return {
      text: clipped,
      estimatedTokens: estimateTokens(clipped),
      truncated: true,
    }
  }

  return { text: current, estimatedTokens: currentTokens, truncated: true }
}

export function extractTldr(text: string): string | null {
  const normalized = normalizeWhitespace(text)
  const lines = normalized.split('\n').map((l) => l.trim())
  const firstNonEmpty = lines.find((l) => l.length > 0)
  if (!firstNonEmpty) return null

  const m = normalized.match(/一句话总结[^\n]*\n([^\n]+)/)
  const candidate = m?.[1]?.trim() ?? firstNonEmpty
  const cleaned = candidate.replace(/^[-*\d.\s]+/, '').trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, 60)
}


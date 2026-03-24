import { describe, expect, it } from 'vitest'
import { extractTldr, normalizeWhitespace, scoreParagraph, splitParagraphs, truncateContent } from '../text'

describe('text utils', () => {
  it('normalizeWhitespace removes extra spaces and blank lines', () => {
    expect(normalizeWhitespace('a\n\n\n b\t\t c')).toBe('a\n\n b c')
  })

  it('splitParagraphs keeps non-empty paragraphs', () => {
    expect(splitParagraphs('a\n\n\n\n b\n\n')).toEqual(['a', 'b'])
  })

  it('scoreParagraph boosts keywords', () => {
    expect(scoreParagraph('这是结论')).toBeGreaterThan(scoreParagraph('普通段落'))
  })

  it('truncateContent keeps title and some paragraphs', () => {
    const content = Array.from({ length: 60 }, (_, i) => `段落${i} 内容内容内容内容内容内容内容内容内容`).join(
      '\n\n',
    )
    const r = truncateContent({ title: '标题', content, targetTokens: 200, maxTokens: 240 })
    expect(r.text.includes('标题：标题')).toBe(true)
    expect(r.truncated).toBe(true)
    expect(r.estimatedTokens).toBeLessThanOrEqual(240)
  })

  it('extractTldr picks a short first line', () => {
    const r = extractTldr('1. 一句话总结\n这是一句话\n2. 核心要点')
    expect(r).toBe('这是一句话')
  })
})


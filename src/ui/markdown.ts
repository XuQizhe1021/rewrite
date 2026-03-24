import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false })
  return DOMPurify.sanitize(raw)
}


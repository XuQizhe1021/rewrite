export function htmlToTextPreserveLists(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const out: string[] = []
  const pushBlock = (t: string) => {
    const s = t.replace(/\s+/g, ' ').trim()
    if (s.length === 0) return
    out.push(s)
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return
    if (!(node instanceof HTMLElement)) return

    const tag = node.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return

    if (tag === 'pre') {
      const code = node.innerText.trim()
      if (code.length > 0) out.push('```\n' + code + '\n```')
      return
    }

    if (tag === 'li') {
      const t = node.innerText.trim()
      if (t.length > 0) out.push(`- ${t}`)
      return
    }

    if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'blockquote') {
      pushBlock(node.innerText)
      return
    }

    const children = Array.from(node.childNodes)
    for (const ch of children) walk(ch)
  }

  walk(doc.body)
  return out.join('\n\n').trim()
}


export function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element: #${id}`)
  return el as T
}

export function setText(el: HTMLElement, text: string): void {
  el.textContent = text
}


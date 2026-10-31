import type { Photo } from '@aq/schema'
import { HTMLElement, parse } from 'node-html-parser'
import type { Lang } from './i18n'
import { photoMark } from './cite'

/** A picture placed inside article text: a photo, its credit, and optionally what it shows (linked). */
export type Figure = { photo: Photo; label?: string; href?: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export function figureHtml(lang: Lang, { photo: p, label, href }: Figure): string {
  const img = `<img src="${esc(p.url)}" width="${p.width}" height="${p.height}" alt="${esc(label ?? p.caption ?? '')}" loading="lazy" decoding="async">`
  const what = label ? (href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)) : ''
  return `<figure class="inl">${href ? `<a href="${esc(href)}" tabindex="-1">${img}</a>` : img}<figcaption>${what}${photoMark(lang, p)}</figcaption></figure>`
}

/**
 * Puts figures into article html between top-level blocks: each `anchored` figure right after the block holding the
 * first link to its href (e.g. a species photo where the species is first named), then `spread` figures evenly over
 * the blocks still without one. Never two figures back to back; leftovers are dropped.
 */
export function placeFigures(lang: Lang, html: string, anchored: Figure[], spread: Figure[]): string {
  const root = parse(html)
  const blocks = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)
  if (!blocks.length) return html
  const after = new Map<number, Figure>()
  const top = (el: HTMLElement) => { let n: HTMLElement = el; while (n.parentNode && n.parentNode !== root) n = n.parentNode as HTMLElement; return blocks.indexOf(n) }
  const free = (i: number) => i >= 0 && !after.has(i) && !after.has(i - 1) && !after.has(i + 1)
  for (const f of anchored) {
    const a = f.href ? root.querySelector(`a[href="${f.href}"]`) : null
    const i = a ? top(a) : -1
    if (free(i)) after.set(i, f)
  }
  const open = blocks.map((_, i) => i).filter(i => i < blocks.length - 1 && free(i))
  spread.forEach((f, k) => {
    const want = Math.floor(((k + 1) * blocks.length) / (spread.length + 1))
    const i = open.filter(free).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0]
    if (i !== undefined) after.set(i, f)
  })
  for (const [i, f] of after) blocks[i]!.insertAdjacentHTML('afterend', figureHtml(lang, f))
  return root.toString()
}

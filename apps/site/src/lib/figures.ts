import type { Photo } from '@aq/schema'
import { HTMLElement, parse } from 'node-html-parser'
import type { Lang } from './i18n'
import { photoMark } from './cite'

/** A picture placed inside article text: a photo, its credit, and optionally what it shows (linked). */
export type Figure = { photo: Photo; label?: string; href?: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** `small`: one of a grid of small pictures, so the photo's 480 px copy where it has one. */
export function figureHtml(lang: Lang, { photo: p, label, href }: Figure, small = false): string {
  const img = `<img src="${esc((small && p.thumb) || p.url)}" width="${p.width}" height="${p.height}" alt="${esc(label ?? p.caption ?? '')}" loading="lazy" decoding="async">`
  const what = label ? (href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)) : ''
  return `<figure class="inl">${href ? `<a href="${esc(href)}" tabindex="-1">${img}</a>` : img}<figcaption>${what}${photoMark(lang, p)}</figcaption></figure>`
}

/**
 * Pictures for one section of a guide, under the heading they name: one or two (drawings) stacked at their own size,
 * three or more (a photo for each class) a grid of small ones.
 */
export type HeadedFigure = Figure & { heading: string }
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const group = (lang: Lang, fs: Figure[]) => {
  const grid = fs.length >= 3
  return `<div class="figs${grid ? ' grid' : ''}">${fs.map(f => figureHtml(lang, f, grid)).join('')}</div>`
}

/**
 * Puts figures into article html between top-level blocks: each `headed` figure under the h3 it names (after the
 * heading's first paragraph, list or table, those of one heading together), each `anchored` figure right after the block holding the
 * first link to its href (e.g. a species photo where the species is first named), then `spread` figures evenly over
 * the blocks still without one. Never two figures back to back; spread leftovers are dropped. A headed figure whose
 * heading the text lacks (another language's headings) goes in a group at the end, never lost.
 */
export function placeFigures(lang: Lang, html: string, anchored: Figure[], spread: Figure[], headed: HeadedFigure[] = []): string {
  const root = parse(html)
  const blocks = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)
  if (!blocks.length) return html
  const after = new Map<number, string>()
  const top = (el: HTMLElement) => { let n: HTMLElement = el; while (n.parentNode && n.parentNode !== root) n = n.parentNode as HTMLElement; return blocks.indexOf(n) }
  const free = (i: number) => i >= 0 && !after.has(i) && !after.has(i - 1) && !after.has(i + 1)
  const byHeading = new Map<string, Figure[]>()
  for (const f of headed) byHeading.set(norm(f.heading), [...(byHeading.get(norm(f.heading)) ?? []), f])
  blocks.forEach((b, i) => {
    const fs = b.tagName === 'H3' ? byHeading.get(norm(b.textContent)) : undefined
    if (!fs) return
    byHeading.delete(norm(b.textContent))
    after.set(['P', 'UL', 'OL', 'TABLE'].includes(blocks[i + 1]?.tagName ?? '') ? i + 1 : i, group(lang, fs))
  })
  for (const f of anchored) {
    const a = f.href ? root.querySelector(`a[href="${f.href}"]`) : null
    const i = a ? top(a) : -1
    if (free(i)) after.set(i, figureHtml(lang, f))
  }
  const open = blocks.map((_, i) => i).filter(i => i < blocks.length - 1 && free(i))
  spread.forEach((f, k) => {
    const want = Math.floor(((k + 1) * blocks.length) / (spread.length + 1))
    const i = open.filter(free).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0]
    if (i !== undefined) after.set(i, figureHtml(lang, f))
  })
  for (const [i, h] of after) blocks[i]!.insertAdjacentHTML('afterend', h)
  const unplaced = [...byHeading.values()].flat()
  if (unplaced.length) blocks.at(-1)!.insertAdjacentHTML('afterend', group(lang, unplaced))
  return root.toString()
}

import { parse } from 'node-html-parser'
import { slugify } from '@aq/schema/slug'

/** `n`: the heading's own number ("3. Cá neon"), which the list shows as its number. */
export type TocEntry = { id: string; text: string; n?: number }

/** Gives each h3 of a guide body an id (unique, from its text) and returns them in order for a table of contents. */
export function withToc(html: string): { html: string; toc: TocEntry[] } {
  const root = parse(html)
  const toc: TocEntry[] = []
  const used = new Set<string>()
  for (const h of root.querySelectorAll('h3')) {
    const text = h.textContent.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const base = slugify(text).slice(0, 60) || 'muc'
    let id = base
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`
    used.add(id)
    h.setAttribute('id', id)
    const m = /^(?:(\d+)[.)]|#\s?(\d+)[.):]?)\s/.exec(text)
    const n = Number(m?.[1] ?? m?.[2] ?? 0)
    toc.push({ id, text: text.replace(/^(?:\d+[.)]|#\s?\d+[.):]?)\s+/, ''), ...(n ? { n } : {}) }) // the list numbers entries itself ("1.", "#1")
  }
  return { html: toc.length ? root.toString() : html, toc }
}

/**
 * Minutes to read at ~230 words a minute (Vietnamese counted by syllable), at least 1. Thai is written without spaces
 * between words: its letters are counted instead, at ~1,000 a minute (about 230 Thai words of ~4.5 letters).
 */
export function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ')
  const thai = (text.match(/[\u0E00-\u0E7F]/g) ?? []).length
  const words = text.replace(/[\u0E00-\u0E7F]+/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 230 + thai / 1000))
}

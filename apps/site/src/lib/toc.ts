import { HTMLElement, parse } from 'node-html-parser'
import { headingRoles } from '@aq/schema'
import { slugify } from '@aq/schema/slug'

/**
 * `n`: the heading's own number ("3. Cá neon"), which the list shows as its number. `group`: a heading over sub-sections;
 * `sub`: the numbered run it holds ("Ưu điểm" over "1. Nhẹ", "2. Rẻ").
 */
export type TocEntry = { id: string; text: string; n?: number; group?: true; sub?: TocEntry[] }

/**
 * Gives each h3 of a guide body an id (unique, from its text) and returns them in order for a table of contents. A heading
 * over sub-sections (@aq/schema headingRoles) becomes an h2, a level above them, so it doesn't read as a heading with
 * nothing under it; its numbered run nests under it in the contents. `source`: the stored text, whose headings these are,
 * read before figures went in between.
 */
export function withToc(html: string, source = html): { html: string; toc: TocEntry[] } {
  const root = parse(html)
  const toc: TocEntry[] = []
  const used = new Set<string>()
  const top = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement && n.rawTagName === 'h3' && !!n.text.trim())
  const own = headingRoles(parse(source))
  const roles = new Map((own.length === top.length ? own : headingRoles(root)).map((r, i) => [top[i], r]))
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
    const entry: TocEntry = { id, text: text.replace(/^(?:\d+[.)]|#\s?\d+[.):]?)\s+/, ''), ...(n ? { n } : {}) } // the list numbers entries itself ("1.", "#1")
    const role = roles.get(h)
    if (role?.role === 'group') { h.tagName = 'h2'; entry.group = true }
    const group = toc.at(-1)
    if (role?.sub && group?.group) (group.sub ??= []).push(entry)
    else toc.push(entry)
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

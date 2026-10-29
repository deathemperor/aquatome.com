import { parse } from 'node-html-parser'
import { slugify } from '@aq/schema/slug'

export type TocEntry = { id: string; text: string }

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
    toc.push({ id, text })
  }
  return { html: toc.length ? root.toString() : html, toc }
}

/** Minutes to read at ~230 words a minute (Vietnamese counted by syllable), at least 1. */
export const readingMinutes = (html: string) => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 230))

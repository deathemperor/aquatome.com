import type { PageDoc } from '@aq/schema/app-page'

/**
 * What a guide is about beyond its title, for the chat's search (search.ts): each section's heading, and each question
 * of its FAQ with the heading id of the section that holds it (where read_page opens it; null: no heading to open it
 * at). A title names a guide's main subject only: a reader's question is often answered in a section or the FAQ of a
 * guide titled for something else. Built with the pages as /app/chat/<lang>.json, which the Worker reads from its
 * assets; the app doesn't read it.
 */
export type Topic = [section: string | null, text: string]
export type Topics = { v: 1; pages: Record<string, Topic[]> }

export function topicsOf(docs: PageDoc[]): Topics {
  const pages: Record<string, Topic[]> = {}
  for (const doc of docs) {
    let at: string | null = null
    const out: Topic[] = []
    for (const b of doc.blocks) {
      if (b.t === 'h') {
        at = b.id ?? null
        if (b.id) out.push([b.id, b.text])
      } else if (b.t === 'faq') for (const it of b.items) out.push([at, it.q])
    }
    if (out.length) pages[doc.path] = out
  }
  return { v: 1, pages }
}

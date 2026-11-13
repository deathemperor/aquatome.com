import type { PageDoc } from '@aq/schema/app-page'

/**
 * What a guide is about beyond its title, for the chat's search (search.ts): each section's heading, and each question
 * of its FAQ with the heading id of the section that holds it (where read_page opens it; null: no heading to open it
 * at). A title names a guide's main subject only: a reader's question is often answered in a section or the FAQ of a
 * guide titled for something else. Built with the pages as /app/chat/<lang>.json, which the Worker reads from its
 * assets; the app doesn't read it.
 */
export type Topic = [section: string | null, text: string]
/** `held`: the guides held out of the chat while they're checked again (`heldOf`), by path; their topics aren't listed, and the chat's handbook leaves them out (handbook.ts). */
export type Topics = { v: 1; pages: Record<string, Topic[]>; held?: string[] }

/**
 * The guides held out of the chat, by path: a video guide marked `quality.chat: false` until the stricter review passes
 * it (packages/engine/src/video-hold.ts). The chat never finds, reads or shows one (handbook.ts).
 */
export const heldOf = (guides: readonly { t: { slug: string; quality?: { chat?: false } } }[], at: (viPath: string) => string): string[] =>
  guides.filter(g => g.t.quality?.chat === false).map(g => at(`/vi/huong-dan/${g.t.slug}/`))

export function topicsOf(docs: PageDoc[], held: readonly string[] = []): Topics {
  const pages: Record<string, Topic[]> = {}
  const skip = new Set(held)
  for (const doc of docs) {
    if (skip.has(doc.path)) continue
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
  return { v: 1, pages, ...(held.length ? { held: [...held].sort() } : {}) }
}

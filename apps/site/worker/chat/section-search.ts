import type { Found, SectionSearch } from './handover'

/** The model that embedded the index (packages/engine/scripts/chat-search-index.ts): the reader's words need the same one. */
export const SEARCH_MODEL = '@cf/baai/bge-m3'
/** A search slower than this is none: the chat reads for itself, as it does without one. */
export const SEARCH_MS = 2000
/** As much of a long post as is searched with: the length of a section in the index. */
const SEARCH_CHARS = 2000
const NEAREST = 5

/** The handbook's sections nearest the reader's words: Workers AI embeds them, Vectorize finds the sections, one namespace a language. */
export function sectionSearch(ai: Ai, index: Vectorize, ms = SEARCH_MS): SectionSearch {
  return async (text, lang) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('search timed out')), ms) })
    const nearest = async (): Promise<Found[]> => {
      const { data } = await ai.run(SEARCH_MODEL, { text: [text.slice(0, SEARCH_CHARS)] }) as { data: number[][] }
      const { matches } = await index.query(data[0]!, { topK: NEAREST, namespace: lang, returnMetadata: 'all' })
      return matches.flatMap(m => (typeof m.metadata?.path === 'string' ? [{ path: m.metadata.path, heading: typeof m.metadata.heading === 'string' ? m.metadata.heading : null }] : []))
    }
    return Promise.race([nearest(), late]).finally(() => clearTimeout(timer))
  }
}

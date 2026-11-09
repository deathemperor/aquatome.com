/**
 * What the chat hands Claude before its first call, from a search for the reader's words: the sections found, as if
 * Claude had read them, and the reader's saved tanks. As text in the first message, never as tool calls Claude didn't
 * make. A search finds sections about the reader's words, not their case, so what goes is narrowed (`fits`) and said to
 * be a search's (`HANDED_NOTE`).
 */
import type { Start } from './agent'
import type { Handbook, Lang } from './handbook'
import { fold } from './search'
import { chatTools, handedTanks, type Tank } from './tools'

/** Said after the sections handed over: they came from a search, so some may not fit. */
export const HANDED_NOTE = 'These sections came from a search of the handbook for the reader\'s words, before you read anything. Some may be about another fish, tank or problem than theirs: use only what fits their case, and read more where they leave a gap.'

/** A question this long or longer is a whole post: the short ones readers type run to about 100 characters. */
export const WHOLE_POST = 150
/**
 * Whether sections go with the question: with a saved tank, or for a whole post. A short question with neither stays on
 * the chat's own reading: handed sections made Claude stop reading, and those answers lost (two judged passes, 2026-11-09).
 */
export const handsOver = (question: string, tanks: readonly unknown[]) => tanks.length > 0 || question.trim().length >= WHOLE_POST
/** The languages sections are handed over in. Thai lost its judged passes, for a reason not found: it keeps the chat's own reading (2026-11-09). */
export const SEARCHED: readonly Lang[] = ['vi', 'id', 'ms']

/** A section found: a page, and the id of a heading on it, or null for its opening. */
export type Found = { path: string; heading: string | null }
/** The sections nearest some words, in a language's handbook. */
export type SectionSearch = (text: string, lang: Lang) => Promise<Found[]>
/** The text that goes in the first message, and the sections in it. */
export type Handover = { text: string; sections: Found[] }

const words = (s: string) => ` ${fold(s).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()} `
/** A name as readers shorten it: without the word for fish before it ("cá neon" is "neon", "ปลานีออน" "นีออน"). */
const short = (name: string) => name.replace(/^\s*(?:cá|ikan|ปลา)\s*/iu, '')

/**
 * The species the reader named, by id: in their words (a page's name, scientific name or other name, whole, or without
 * the word for fish before it), in their saved tanks, or where the chat started (the page, fish ID's guesses). A breed
 * brings its species.
 */
export function namedSpecies(question: string, start: Start, tanks: Tank[], hb: Handbook): Set<string> {
  const ids = new Set<string>()
  const add = (id: string | undefined) => {
    const it = id ? hb.byId(id) : undefined
    if (!it?.id) return
    ids.add(it.id)
    if (it.of) ids.add(it.of)
  }
  add(start.about)
  for (const r of start.identified?.results ?? []) add(r.id)
  for (const t of tanks) for (const s of t.species) add(s.id)
  // Thai has no spaces between words: a name is found anywhere in the question.
  const q = hb.lang === 'th' ? fold(question) : words(question)
  const said = (name: string) => (hb.lang === 'th' ? q.includes(fold(name).trim()) : q.includes(words(name)))
  for (const it of hb.items) if (it.id && (it.kind === 'fish' || it.kind === 'plant') && [it.name, it.sub, ...(it.aka ?? [])].flatMap(n => (n ? [n, short(n)] : [])).some(n => n.trim().length >= 3 && said(n))) add(it.id)
  return ids
}

/** A section to hand over: any but a fish's or plant's page whose species the reader didn't name (the leopard pleco's page for a "cá dọn bể"). */
export function fits(path: string, named: Set<string>, hb: Handbook): boolean {
  const it = hb.byPath(path)
  return !(it?.id && (it.kind === 'fish' || it.kind === 'plant')) || named.has(it.id)
}

type Case = { question: string; start: Start; tanks: Tank[]; hb: Handbook }

/** The tanks and the sections that fit, as text; none when there's neither. A section the handbook no longer has isn't handed over. */
async function handedText(found: Found[], o: Case): Promise<Handover | undefined> {
  const named = namedSpecies(o.question, o.start, o.tanks, o.hb)
  const read = chatTools({ handbook: o.hb, tanks: async () => o.tanks, checks: [] }).find(t => t.name === 'read_page')!
  const got: { input: Found; out: string }[] = []
  for (const input of found) {
    if (!fits(input.path, named, o.hb)) continue
    const out = await read.run(input, { photosLeft: 0 }).catch(() => undefined)
    if (typeof out === 'string') got.push({ input, out })
  }
  const parts = [
    ...(o.tanks.length ? [`The reader's saved tanks, as read_tanks gives them:\n${handedTanks(o.tanks, o.hb)}`] : []),
    ...(got.length ? [`${HANDED_NOTE} As read_page gives them:\n\n${got.map(g => `read_page ${JSON.stringify(g.input)}:\n${g.out}`).join('\n\n')}`] : []),
  ]
  return parts.length ? { text: parts.join('\n\n'), sections: got.map(g => g.input) } : undefined
}

/** What goes with a first question: the page the chat was opened from and the sections the search finds. A search that fails leaves the tanks. */
export async function handoverFor(o: Case & { lang: Lang; search: SectionSearch }): Promise<Handover | undefined> {
  if (!SEARCHED.includes(o.lang) || !handsOver(o.question, o.tanks)) return undefined
  const about = o.start.about ? o.hb.byId(o.start.about) : undefined
  const words = about ? `${about.name}${about.sub ? ` (${about.sub})` : ''}: ${o.question}` : o.question
  const found = await o.search(words, o.lang).catch(e => { console.error('chat search:', e); return [] as Found[] })
  return handedText([...(about ? [{ path: about.path, heading: null }] : []), ...found.filter(f => f.path !== about?.path || f.heading)], o)
}

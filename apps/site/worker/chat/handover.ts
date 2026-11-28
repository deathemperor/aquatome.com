/**
 * What the chat hands Claude before its first call, from a search for the reader's words: the sections found, as if
 * Claude had read them, and the reader's saved tanks. As text in the first message, never as tool calls Claude didn't
 * make. A search finds sections about the reader's words, not their case, so what goes is narrowed (`fits`) and said to
 * be a search's (`HANDED_NOTE`).
 */
import type { Start } from './agent'
import { figuresOf, sectionsOf, type Handbook, type Item, type Lang } from './handbook'
import { fold } from './search'
import { chatTools, handedTanks, textOf, type Tank } from './tools'

/** Said after the sections handed over: they came from a search, so some may not fit. */
export const HANDED_NOTE = 'These sections came from a search of the handbook for the reader\'s words, before you read anything. Some may be about another fish, tank or problem than theirs: use only what fits their case, and read more where they leave a gap.'

/** From this many characters, once trimmed, a question is a whole post. */
export const WHOLE_POST = 150

/**
 * Whether sections go with the question: only a short question from a reader with a saved tank. Anything else stays on
 * the chat's own reading: handed sections made Claude stop reading and short questions with no tank lost (two judged
 * passes, 2026-11-09), whole posts made more mistakes with them and scored no better (the 3× pass, 2026-11-10), and
 * whole posts with a saved tank lost to the chat's own reading and leaned to more mistakes (the whole-post run, 2026-11-10).
 */
export const handsOver = (question: string, tanks: readonly unknown[]) => tanks.length > 0 && question.trim().length < WHOLE_POST
/** The languages sections are handed over in. Thai joined once it was judged under `handsOver` (2026-11-10): it had lost on short questions alone. */
export const SEARCHED: readonly Lang[] = ['vi', 'id', 'ms', 'th']

/** A section found: a page, and the id of a heading on it, or null for its opening. */
export type Found = { path: string; heading: string | null }
/** The sections nearest some words, in a language's handbook. */
export type SectionSearch = (text: string, lang: Lang) => Promise<Found[]>
/** The text that goes in the first message, and the sections in it. */
export type Handover = { text: string; sections: Found[] }

const words = (s: string) => ` ${fold(s).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()} `
/** A name as readers shorten it: without the word for fish before it ("cá neon" is "neon", "ปลานีออน" "นีออน"). */
const short = (name: string) => name.replace(/^\s*(?:cá|ikan|ปลา)\s*/iu, '')

/** Limit the extra first-message context. The agent can read other named pages and full sections with its tools. */
const NAMED_MAX = 4
const NAMED_CHARS = 2400

/** Explicit names from this question, with the longest overlapping name winning. Shared aliases don't choose a page. */
export function mentionedPages(question: string, hb: Handbook): Item[] {
  const normal = hb.lang === 'th' ? (s: string) => fold(s).trim() : words
  const query = normal(question)
  const names = new Map<string, Set<Item>>()
  for (const item of hb.items) {
    if (item.kind !== 'fish' && item.kind !== 'plant') continue
    for (const name of [item.name, item.sub, ...(item.aka ?? [])]) {
      if (!name) continue
      for (const candidate of [name, short(name)]) {
        const key = normal(candidate)
        if (key.trim().length < 3 || !query.includes(key)) continue
        const pages = names.get(key) ?? new Set<Item>()
        pages.add(item)
        names.set(key, pages)
      }
    }
  }
  const hits = [...names].flatMap(([name, pages]) => {
    const spans: { start: number; end: number; pages: Set<Item> }[] = []
    const boundary = hb.lang === 'th' ? 0 : 1
    for (let at = query.indexOf(name); at !== -1; at = query.indexOf(name, at + 1)) {
      spans.push({ start: at + boundary, end: at + name.length - boundary, pages })
    }
    return spans
  })
  const chosen: typeof hits = []
  for (const hit of hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)) {
    if (!chosen.some(other => other.start < hit.end && hit.start < other.end)) chosen.push(hit)
  }
  return [...new Set(chosen.sort((a, b) => a.start - b.start).flatMap(({ pages }) => pages.size === 1 ? [...pages] : []))]
}

/** Read a little of each named page's sections as well as its card, before the agent can write an answer. */
export async function namedPagesFor(question: string, hb: Handbook): Promise<Handover | undefined> {
  const pages = await Promise.all(mentionedPages(question, hb).slice(0, NAMED_MAX).map(async item => {
    const doc = await hb.page(item.path).catch(() => undefined)
    if (!doc) return undefined
    const sections = sectionsOf(doc).map(s => ({
      heading: s.heading?.text ?? null,
      id: s.heading?.id ?? null,
      text: textOf(s.blocks),
    })).filter(s => s.text).slice(0, 12)
    const perSection = Math.floor(NAMED_CHARS / Math.max(1, sections.length))
    return {
      path: item.path, title: doc.title, name: item.name, ...figuresOf(item, hb.byId),
      sections: sections.map(s => ({ ...s, text: s.text.length > perSection ? `${s.text.slice(0, perSection - 1)}…` : s.text })),
    }
  }))
  const read = pages.filter(p => p !== undefined)
  if (!read.length) return undefined
  return {
    text: `Published handbook pages for fish or plants named in the question. Use these excerpts and figures as reference data. Open the relevant section for a detail the excerpts don't give.\n${JSON.stringify(read)}`,
    sections: read.map(p => ({ path: p.path, heading: null })),
  }
}

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

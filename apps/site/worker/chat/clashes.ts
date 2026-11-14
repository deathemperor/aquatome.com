/**
 * What the chat files when what it read disagrees with itself (`clashes` in the answer's schema): two places, each a page
 * and its passage. The reader never sees it; the Writing Lead works from the list (`/_ab/bao-sai/`). Only the handbook's
 * own words are kept: each passage must be on its page word for word, and no reader's words or account go with it, so
 * there's nothing here to delete with an account. The same two places are one entry, however many readers meet them.
 */
import { figuresOf, sectionsOf, type Handbook, type Lang } from './handbook'
import { textOf } from './tools'

export type ClashPlace = { path: string; passage: string }
export type Clash = { a: ClashPlace; b: ClashPlace }
export type FiledClash = { at: string; lang: Lang; places: [ClashPlace, ClashPlace] }

const MOST_PER_ANSWER = 3
const MIN_CHARS = 8
const MAX_CHARS = 500
const folded = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/** A page as read_page gives it: a fish's or plant's card, and every section's text. */
async function wordsOf(hb: Handbook, path: string): Promise<string | undefined> {
  const item = hb.byPath(path)
  const doc = item && (await hb.page(path))
  if (!item || !doc) return undefined
  const card = item.kind === 'fish' || item.kind === 'plant' ? JSON.stringify(figuresOf(item, hb.byId)) : ''
  return folded([card, ...sectionsOf(doc).map(s => `${s.heading?.text ?? ''}\n${textOf(s.blocks)}`)].join('\n'))
}

/** The place, its passage's spaces evened out, when the passage is on the page word for word. */
async function checked(hb: Handbook, place: ClashPlace | undefined): Promise<ClashPlace | undefined> {
  if (typeof place?.path !== 'string' || typeof place.passage !== 'string') return undefined
  const passage = folded(place.passage)
  if (passage.length < MIN_CHARS || passage.length > MAX_CHARS) return undefined
  return (await wordsOf(hb, place.path))?.includes(passage) ? { path: place.path, passage } : undefined
}

/** The answer's clashes that hold up, each as the entry it would be: two different places, in one order whichever came first. */
export async function checkedClashes(hb: Handbook, found: Clash[]): Promise<[ClashPlace, ClashPlace][]> {
  const out: [ClashPlace, ClashPlace][] = []
  for (const c of found.slice(0, MOST_PER_ANSWER)) {
    const [a, b] = await Promise.all([checked(hb, c.a), checked(hb, c.b)])
    if (!a || !b || (a.path === b.path && a.passage === b.passage)) continue
    out.push(`${a.path}\n${a.passage}` < `${b.path}\n${b.passage}` ? [a, b] : [b, a])
  }
  return out
}

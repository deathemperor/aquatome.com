import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WrittenLang } from '@aq/schema'
import type { Llm } from './claude'
import { LANG_NAME } from './pages'
import { snapshotName } from './snapshot'

/**
 * A guide's title says what the page is about, and no two guides in a language share one (the owner, 2026-11-11, on the
 * app's list of guides: "Duplicated"). 2Hr Aquarist's tank pages were titled with the aquascaper's name alone, so four
 * tanks by one person were four rows reading "Dou Mok"; two videos from one channel had one title.
 */

/** Letters Vietnamese has and a name in the Latin alphabet doesn't. */
const VI_LETTER = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i
const THAI = /[฀-๿]/
/** Indonesian and Malay words a guide's title has and a name doesn't: their titles are often in title case. */
const ID_MS_WORDS = new Set(['dan', 'untuk', 'di', 'ke', 'dari', 'yang', 'dengan', 'cara', 'ikan', 'akuarium', 'tangki', 'tanaman', 'tumbuhan', 'panduan', 'merawat', 'memelihara', 'air', 'udang', 'pakan', 'makanan', 'penyakit', 'membuat', 'pada', 'atau', 'tentang', 'jenis', 'pemula', 'bagi', 'dalam', 'tanpa', 'gaya', 'karya', 'oleh'])

export const titleWords = (title: string) => title.split(/[\s\-–—|:,()&/+]+/).filter(w => w && !/^\d+$/.test(w))

/**
 * A title with no word of its language: a person's or a studio's name alone ("Dou Mok", "Fernando Ferreira 3", "ADG").
 * Vietnamese: no Vietnamese letter in four words or fewer. Thai: no Thai letter. Indonesian and Malay: four words or fewer,
 * each capitalised, none of them a common word of the language.
 */
export function onlyAName(title: string, lang: WrittenLang): boolean {
  const words = titleWords(title)
  if (!words.length) return false
  if (lang === 'th') return !THAI.test(title)
  if (words.length > 4) return false
  if (lang === 'vi') return !VI_LETTER.test(title)
  return words.every(w => /^[\p{Lu}\d]/u.test(w)) && !words.some(w => ID_MS_WORDS.has(w.toLowerCase()))
}

/** Two titles are the same when they read the same: case and spacing aside. */
export const titleKey = (title: string) => title.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

export type TitledGuide = { lang: WrittenLang; id: string; title: string }
/** Each guide whose title another guide in its language has, or that is only a name, with why. */
export type Clash<T> = { guide: T; why: 'shared' | 'name'; with: T[] }
export function titleClashes<T extends TitledGuide>(guides: T[]): Clash<T>[] {
  const byKey = new Map<string, T[]>()
  for (const g of guides) {
    const k = `${g.lang}\t${titleKey(g.title)}`
    byKey.set(k, [...byKey.get(k) ?? [], g])
  }
  return guides.flatMap((g): Clash<T>[] => {
    const same = byKey.get(`${g.lang}\t${titleKey(g.title)}`)!.filter(o => o !== g)
    if (onlyAName(g.title, g.lang)) return [{ guide: g, why: 'name', with: same }]
    return same.length ? [{ guide: g, why: 'shared', with: same }] : []
  })
}

/** The source's own title for a guide: a video's, or the heading kept with the source page's copy (sources/<source>/). */
export async function sourceTitle(root: string, e: { source?: string; sourceUrl?: string; video?: { title?: string } }): Promise<string | undefined> {
  if (e.video?.title) return e.video.title
  if (!e.source || !e.sourceUrl) return undefined
  const md = await readFile(join(root, 'sources', e.source, `${snapshotName(e.sourceUrl)}.md`), 'utf8').catch(() => '')
  return md.match(/^title: (.+)$/m)?.[1]?.trim()
}

const text = (html: string, n: number) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const TITLE = { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } }
const SCORE = { type: 'object', additionalProperties: false, required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } }

/**
 * A guide's title written again because it is only a name or another guide has it: what the page is about, from its own
 * text, with a person's or studio's name kept as the credit. Checked: not a name alone, none of `taken`, then a second
 * call scores it. The caller keeps it at QUALITY_THRESHOLD or more. Never the page's address.
 */
export async function retitleGuide(llm: Llm, g: { title: string; body: string; lang: WrittenLang; why: 'shared' | 'name'; source?: string; others: { title: string; body: string }[]; taken: Set<string> }, model?: string): Promise<{ title: string; score: number; notes: string[] }> {
  const L = LANG_NAME[g.lang]
  const m = model ? { model } : {}
  const others = g.others.map((o, i) => `--- OTHER GUIDE ${i + 1} ---\nTITLE: ${o.title}\n${text(o.body, 1200)}`).join('\n\n')
  const r = await llm<{ title: string }>({
    system: 'You write titles for an aquarium handbook. Reply only with JSON.', ...m, schema: TITLE,
    prompt: `A guide in an aquarium handbook, in ${L}. Its title has to change: ${g.why === 'name' ? 'it is only a name, which tells a reader nothing about the page' : 'another guide in the handbook has the same title, so a list of guides shows the same row twice'}.
Write a new title in ${L} that says what this page is about, the way ${L}-speaking fishkeepers would put it, in at most about 12 words.
- A page that shows one person's or one studio's finished aquarium (an aquascape to look at, not a how-to): say what the tank is, by its style and one or two things that stand out in it (wood, stone, a plant, the fish, its size), joined as a phrase ("và", "cùng", "trên"), not a comma list, then a spaced en dash and the person or studio as its credit ("Bể Iwagumi đá xám, thảm cỏ ngắn – Dou Mok"). The name is never the whole title. A style keeps the name hobbyists use for it (Iwagumi, Nature, Dutch, Diorama, biotope), not a loose translation.
- A page another guide shares its title with: keep what the page is about, and add what this page has that the other doesn't (the fish it is for, what it is for, the method), from this page's own text. A page for several fish doesn't name only one: name them, or none.
- Plain words, as a fishkeeper would say them; not a pile of adjectives.
- Only what this page's text says: no style, size, plant or fish it doesn't name. Names of people, studios and places exactly as written.
- It must differ from every title listed below.

CURRENT TITLE: ${g.title}
${g.source ? `THE SOURCE'S OWN TITLE: ${g.source}\n` : ''}
THE PAGE'S TEXT:
${text(g.body, 3000)}
${others ? `\n${others}\n` : ''}`,
  })
  const next = (r.title ?? '').replace(/\s+/g, ' ').trim()
  const fault = !next ? 'empty' : next === g.title ? 'unchanged' : onlyAName(next, g.lang) ? 'still only a name' : g.taken.has(titleKey(next)) ? 'another guide has it' : ''
  if (fault) return { title: next, score: 0, notes: [fault] }
  const v = await llm<{ score: number; notes: string[] }>({
    system: 'You are a strict editor checking a new title. Reply only with JSON.', ...m, schema: SCORE,
    prompt: `An aquarium handbook guide in ${L}. Its OLD title ${g.why === 'name' ? 'was only a name' : 'was shared with another guide'}; NEW is the replacement.
Score 0–1: 1.0 = NEW says what the page is about, claims nothing its text doesn't say, reads naturally to ${L}-speaking fishkeepers, tells this page apart from the others listed, and keeps a person's or studio's name as a credit rather than the whole title; below 0.75 = it adds a style, size, plant or fish the text doesn't name, reads like a translation, or could title another page as well.
notes: up to 5 short problems (in English), quoting the words. Empty if none.

OLD: ${g.title}
NEW: ${next}
${g.source ? `THE SOURCE'S OWN TITLE: ${g.source}\n` : ''}
THE PAGE'S TEXT:
${text(g.body, 3000)}
${others ? `\n${others}\n` : ''}`,
  })
  return { title: next, score: Math.min(1, Math.max(0, Number(v.score) || 0)), notes: (v.notes ?? []).slice(0, 5) }
}

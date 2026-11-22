import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { Llm } from './claude'
import { HEDGE_VI, hedgesAsk, hedgesLost, HEDGES_SCHEMA, type HedgePair } from './hedges'
import { inline } from './mend'
import { piece, PieceAdmissionError } from './pieces'
import { pattern, PHRASES, TIC_AT, ticKinds, type Phrase } from './phrases'
import { plain, sentences, splice, type Piece } from './sentences'

/**
 * The wording mend (`pnpm engine mend-words`): listed words (phrases.ts) taken off Vietnamese pages one sentence at a
 * time, for the owner's "AI written posts use words human rarely use" (the Writing Lead's plan of 16 Nov 2026, the chief
 * of staff's trial). Every other sentence stays as it was, and so does every sentence the lane can't mend safely.
 * - The swap: a model only picks, for each listed text in a sentence, one of its entry's words (`swap`) or none. Code
 *   puts the pick in the text's place, so the rest of the sentence stays word for word by construction; a pick that
 *   isn't on the list is none. A text in a clause with a negation ("không phải lựa chọn lý tưởng") isn't offered, nor
 *   one a key gives no words (a longer key where the words would read wrong: "dành phần lớn thời gian").
 * - The recast: a sentence the swap left (no word fits, or its change was refused) is written again by a model, freely,
 *   with no listed word, but only a plain one: no hedge, no figure or number word, no word of how many or how sure
 *   (COUNTED), no tag or entity, no listed word outside the lane, one sentence. Its new text is held to the same: one
 *   that brings any of them in is refused. The others are left for the editors.
 * - How sure and how many never change: the entries in SURE are swapped like for like, never cut, and never recast.
 *   "Đa số" and "hầu hết" are no swap for "phần lớn": the repeat check counts the three as one word (phrases.ts TICS).
 * - Each change a reviewer reads, before and after, and each is kept or refused on its own: one refused sentence
 *   doesn't refuse its part (the fit rewrite's mend kept 19 of 47 parts on 15 Nov for that).
 * - A page gains at most CAP of any one word the swap puts in ("thường", "nhưng"), which the repeat check doesn't
 *   count, and no listed word; and a change that puts back a word of a kind the page repeats (phrases.ts TICS, counted
 *   over the whole page, fixed parts too), or leaves a stacked "nên", is refused.
 * - Titles, headings, table headers, a guide's references, FAQ questions and parts a person fixed are left. Held pages
 *   are left, and the glossary.
 * - Each page is taken up once for each mark (a text with its entry's words, or the recast's version), so a page comes
 *   back only when the list or its words change (as `rewrite-vi --phrases` marks it, #1717).
 * It writes only under `out`, a folder outside the repository: the pages it changed, its marks and a report for each
 * run, never content/ or engine-state/, until the editors' blind read of a trial (the chief of staff, 22 Nov 2026).
 * Like every hand run, its model calls go in the day's cost log too (ceiling.ts).
 */

const KINDS = ['species', 'plants', 'guides', 'breeds'] as const
/** Entries whose words say how sure or how many: swapped like for like, never cut, recast only when they read as a hedge. */
export const SURE: ReadonlySet<string> = new Set(['phần lớn', 'nhìn chung', 'gần như không', 'nhiều khả năng'])
/** Entries whose words aren't offered at a sentence's start, where they would leave a fragment ("Là do cá thiếu oxy."). */
const MID_ONLY: ReadonlySet<string> = new Set(['lý do là'])
/** What a page may gain of any one word the lane puts in. */
export const CAP = 3
/** The recast's version, in each recast mark: a new prompt brings its pages back. */
export const RECAST_V = 1
/** A negation earlier in the text's clause (since its last comma, colon or semicolon). */
const NEGATED = /(?<![\p{L}\p{N}])(?:không|chưa|chẳng|chả|đừng)(?![\p{L}\p{N}])[^,;:]*$/iu

export const LANE: readonly Phrase[] = (PHRASES.vi ?? []).filter(p => p.swap)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const keyRe = (k: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(k).replace(/ /g, '\\s+')}${/[\p{L}\p{N}]$/u.test(k) ? '(?![\\p{L}\\p{N}])' : ''}`, 'giu')

/** A listed text in a sentence: where it stands in the sentence's HTML, and the words that may stand in its place. */
export type Hit = { say: string; key?: string; from: string; start: number; end: number; options: readonly string[]; negated: boolean }

/** A hit's mark: what takes a page up once. */
export const markOf = (h: Hit) => (h.key && h.options.length ? `${h.say}: ${h.key} → ${h.options.map(o => o || '(bỏ)').join(' | ')}` : `${h.say}: ${h.from.toLowerCase()} → ${unrecast(h.say) ? '(none)' : `recast ${RECAST_V}`}`)
/** An entry the recast may not take: it says how sure or how many. */
export const unrecast = (say: string) => SURE.has(say)
/**
 * What a recast may neither meet nor bring in: a hedge (hedges.ts), a figure, a number word, a word of how many or how
 * sure that no hedge check reads ("một số", "gần như", "dường như", "tất cả", "luôn"), a tag or an entity.
 */
const COUNTED = /(?<![\p{L}\p{N}])(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|tá|nửa|đôi|vài|mấy|một số|nhiều|ít|gần như|hầu như|hiếm khi|ít khi|có vẻ|dường như|tất cả|mọi|luôn|luôn luôn|không bao giờ|chắc chắn|chắc|khoảng|chừng|tầm|ít nhất|tối đa|tối thiểu|hơn|nhất)(?![\p{L}\p{N}])/iu
export const counted = (html: string) => { const t = plain(html); return HEDGE_VI.test(t) || COUNTED.test(t) || /\d/.test(t) || /[<&]/.test(html) }
/** A sentence with a full stop inside it: the splitter may have joined two. */
const twoSentences = (html: string) => /[.!?…]["'»”’)]*\s+\S/u.test(plain(html).trim())

/** Each listed text of the lane's entries in a sentence's HTML, outside its tags, in order: a table's longest key first. */
export function hitsIn(html: string, lane: readonly Phrase[] = LANE): Hit[] {
  const out: Hit[] = []
  const segs: { text: string; at: number }[] = []
  let at = 0
  for (const t of html.split(/(<[^>]*>)/)) { if (t && !t.startsWith('<')) segs.push({ text: t, at }); at += t.length }
  const taken = (s: number, e: number) => out.some(h => s < h.end && h.start < e)
  const before = (seg: { text: string; at: number }, i: number) => plain(html.slice(0, seg.at)) + seg.text.slice(0, i)
  for (const p of lane) {
    const keys = Object.keys(p.swap ?? {}).sort((a, b) => b.length - a.length)
    for (const seg of segs) {
      for (const k of keys) for (const m of seg.text.matchAll(keyRe(k))) {
        const s = seg.at + m.index!, e = s + m[0].length
        if (taken(s, e)) continue
        const head = before(seg, m.index!)
        const negated = NEGATED.test(head)
        out.push({ say: p.say, key: k, from: m[0], start: s, end: e, options: negated || (MID_ONLY.has(p.say) && !head.trim()) ? [] : p.swap![k]!, negated })
      }
      for (const m of seg.text.matchAll(new RegExp(pattern(p, 'vi'), 'giu'))) {
        const s = seg.at + m.index!, e = s + m[0].length
        if (!taken(s, e)) out.push({ say: p.say, from: m[0], start: s, end: e, options: [], negated: NEGATED.test(before(seg, m.index!)) })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** The first letter outside a tag, from `i`, made a capital. */
const capitalFrom = (html: string, i: number) => {
  let inTag = false
  for (let k = i; k < html.length; k++) {
    const c = html[k]!
    if (c === '<') inTag = true
    else if (c === '>') inTag = false
    else if (inTag) continue
    else if (c === '&') { const m = /^&(?:#\d+|#x[\da-f]+|\w+);/i.exec(html.slice(k)); if (m) k += m[0].length - 1 }
    else if (/\p{L}/u.test(c)) return html.slice(0, k) + c.toUpperCase() + html.slice(k + 1)
  }
  return html
}
const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/**
 * The sentence with each picked hit's text replaced by its pick, and nothing else changed: a pick at the sentence's
 * start (or after a full stop inside it), or in place of a capital, starts with a capital; a text taken out there leaves
 * the next word a capital, and one taken out elsewhere leaves one space. Picks go in from the right, and each touches
 * only its own text and a <strong> or <em> it empties, so the ones left of it keep their place.
 */
export function applied(html: string, picks: readonly { hit: Hit; to: string }[]): string {
  let s = html
  for (const { hit, to } of [...picks].sort((a, b) => b.hit.start - a.hit.start)) {
    let head = s.slice(0, hit.start), tail = s.slice(hit.end)
    const first = /(?:^|[.!?…]["'»”’)]*)\s*$/u.test(plain(head))
    if (to) { s = head + (first || /^\p{Lu}/u.test(hit.from) ? capital(to) : to) + tail; continue }
    const open = /<(strong|em|b|i)>\s*$/.exec(head)
    const close = open && new RegExp(`^\\s*</${open[1]}>`).exec(tail)
    if (open && close) { head = head.slice(0, open.index); tail = tail.slice(close[0].length) }
    if (first) { s = capitalFrom(head + tail.replace(/^\s+/, ''), head.length); continue }
    s = head.replace(/\s+$/, '') + (/^\s*[,.;:!?…)]/.test(tail) ? '' : ' ') + tail.replace(/^\s+/, '')
  }
  return s
}

/** A page part the lane reads: HTML (a section, the body) or a plain line (a summary point, an FAQ answer). */
export type Part = { field: string; text: string }
type Vi = { held?: unknown; bodyFixed?: boolean; faqFixed?: boolean; sections?: Record<string, string>; body?: string; summary?: string[]; faq?: { q: string; a: string }[] }

/** The parts a person fixed (pages.ts fixedParts), failing closed: a record that is there but can't be read stops the run. */
async function fixedIn(dir: string): Promise<Set<string>> {
  const raw = await readFile(join(dir, 'entity.json'), 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return '{}'
    throw new Error(`${dir}: its record can't be read (${e.code ?? e.message}), so its fixed parts aren't known`)
  })
  const e = JSON.parse(raw) as { sections?: { key: string; source: string; fixed?: boolean }[] }
  return new Set((e.sections ?? []).filter(x => x.fixed).map(x => `sections.${x.key}:${x.source}`))
}

/** The parts of a page the lane may change: no references, no part a person fixed, no FAQ question. */
export async function partsOf(dir: string, vi: Vi): Promise<Part[]> {
  const fixed = await fixedIn(dir)
  if (vi.bodyFixed) return vi.faqFixed ? [] : (vi.faq ?? []).map((f, i) => ({ field: `faq.${i}.a`, text: f.a }))
  return [
    ...Object.entries(vi.sections ?? {}).filter(([k]) => !k.startsWith('references') && !fixed.has(`sections.${k}`)).map(([k, text]) => ({ field: `sections.${k}`, text })),
    ...(vi.body ? [{ field: 'body', text: vi.body }] : []),
    ...(vi.summary ?? []).map((text, i) => ({ field: `summary.${i}`, text })),
    ...(vi.faqFixed ? [] : (vi.faq ?? []).map((f, i) => ({ field: `faq.${i}.a`, text: f.a }))),
  ]
}

/** Which sentences (from 0) of a part sit in a heading or a table's header, or under a references heading, to its end. */
const headings = (pieces: Piece[]) => {
  const out = new Set<number>()
  let n = 0, inHead = false, refs = false
  for (const p of pieces) {
    if (p.sentence) {
      if (inHead && /tham khảo|nguồn/iu.test(plain(p.html))) refs = true
      if (inHead || refs) out.add(n)
      n++
      continue
    }
    for (const t of p.html.match(/<\/?(?:h[1-6]|th)\b/gi) ?? []) inHead = !t.startsWith('</')
  }
  return out
}

/** A sentence the lane reads: its page part, its place among the part's sentences, its hits and its neighbours. */
export type Flagged = { field: string; n: number; html: string; hits: Hit[]; before?: string; after?: string }
export function flagged(parts: readonly Part[], lane: readonly Phrase[] = LANE): Flagged[] {
  return parts.flatMap(part => {
    const pieces = sentences(part.text)
    const texts = pieces.filter(p => p.sentence).map(p => p.html)
    const heads = headings(pieces)
    return texts.flatMap((html, n) => {
      const hits = heads.has(n) ? [] : hitsIn(html, lane)
      return hits.length ? [{ field: part.field, n, html, hits, ...(texts[n - 1] ? { before: texts[n - 1] } : {}), ...(texts[n + 1] ? { after: texts[n + 1] } : {}) }] : []
    })
  })
}

const PICK = `You edit Vietnamese for an aquarium handbook read by hobbyists in Vietnam. Each numbered sentence below has listed words (in «»), words Vietnamese keepers rarely write, each with the words that may stand in their place, numbered. For each listed text, pick the number of the words that fit there best: the sentence must read as a keeper would write it, and say exactly what it said, as sure and as many as before. Pick 0 when none of them fits. You change nothing else: the program puts your pick in place.`
const PICK_SCHEMA = { type: 'object', required: ['picks'], properties: { picks: { type: 'array', items: { type: 'object', required: ['s', 'h', 'pick'], properties: { s: { type: 'number' }, h: { type: 'number' }, pick: { type: 'number' } } } } } }
const REVIEW = `You check edits to sentences of a Vietnamese aquarium handbook, read by hobbyists in Vietnam. For each numbered pair, BEFORE is the sentence as it was and AFTER as it was edited, to take out words keepers rarely write. ok is true only when AFTER says everything BEFORE said and nothing more: every fact, figure, name, example and caution, advice as strong, and exactly as sure and as many (a "most" isn't an "all", a "may" isn't an "is"); and AFTER reads as natural Vietnamese a keeper would write, as well as BEFORE or better. Otherwise ok is false, with why in one line.`
const REVIEW_SCHEMA = { type: 'object', required: ['verdicts', 'hedges'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['s', 'ok'], properties: { s: { type: 'number' }, ok: { type: 'boolean' }, why: { type: 'string' } } } }, hedges: HEDGES_SCHEMA } }
const RECAST = `You edit Vietnamese for an aquarium handbook read by hobbyists in Vietnam. Each numbered sentence below has listed words (in «»), words Vietnamese keepers rarely write, each with a hint of what keepers write instead. Write each sentence again as a keeper would write it, without the listed words: the same facts, names, examples and cautions, advice as strong, nothing added, and no number or word of how many, how often or how sure that it didn't have. Only that sentence: the ones around it are shown to read it in place, and stay as they are.`
const RECAST_SCHEMA = { type: 'object', required: ['sentences'], properties: { sentences: { type: 'array', items: { type: 'object', required: ['s', 'vi'], properties: { s: { type: 'number' }, vi: { type: 'string' } } } } } }

const shown = (f: Flagged) => {
  let s = f.html
  for (const h of [...f.hits].sort((a, b) => b.start - a.start)) s = `${s.slice(0, h.start)}«${s.slice(h.start, h.end)}»${s.slice(h.end)}`
  return plain(s)
}
const context = (f: Flagged) => [f.before && `  (trước: ${plain(f.before)})`, f.after && `  (sau: ${plain(f.after)})`].filter(Boolean).join('\n')

/** How many times each word the lane may put in stands in a text. */
const LANE_WORDS = [...new Set(LANE.flatMap(p => Object.values(p.swap ?? {}).flat()).filter(Boolean))]
const uses = (text: string, w: string) => [...plain(text).matchAll(keyRe(w))].length
/** The listed words a text has, as phrases.ts counts them for a page, each as often as it stands. */
const listed = (s: string) => (PHRASES.vi ?? []).flatMap(p => [...plain(s).matchAll(new RegExp(pattern(p, 'vi'), 'giu'))].map(() => p.say)).sort()
const within = (a: string[], b: string[]) => { const left = [...b]; return a.every(x => { const i = left.indexOf(x); if (i < 0) return false; left.splice(i, 1); return true }) }

/** Why the recast may not take a sentence the swap left, or nothing when it may. */
const recastWhy = (f: Flagged): string | undefined => {
  const outside = listed(f.html).filter(x => !LANE.some(p => p.say === x))
  return f.hits.some(h => unrecast(h.say)) ? 'it says how sure or how many, and no word fit in place'
    : counted(f.html) ? 'it has a hedge, a figure, a word of how many or how sure, or a tag: only a swap may change it'
    : outside.length ? `it has a listed word only its source can fix: ${outside.join(', ')}`
    : twoSentences(f.html) ? 'it may be two sentences'
    : undefined
}

export type Step = 'swap' | 'recast'
/** A sentence's outcome, for the report and the editors' blind read. */
export type Outcome = { page: string; field: string; n: number; says: string[]; step: Step; before: string; after?: string; kept: boolean; why?: string }
export type WordingReport = { at: string; dry?: true; pages: string[]; failed: string[]; stopped?: string; outcomes: Outcome[]; left: { page: string; field: string; n: number; says: string[]; why: string }[]; byEntry: Record<string, { sentences: number; offered: number; mendable: number; swapped: number; recast: number; refused: number; left: number }> }
type State = Record<string, { at: string; marks: string[] }>

/** One page's listed sentences mended: its changes by part (field → sentence → new HTML), and each sentence's outcome. */
export async function mendPage(llm: Llm, page: string, parts: readonly Part[], o: { models?: { pick?: string; review?: string; recast?: string }; rest?: string } = {}): Promise<{ changes: Map<string, Map<number, string>>; outcomes: Outcome[]; left: WordingReport['left'] }> {
  const all = flagged(parts)
  const outcomes: Outcome[] = [], left: WordingReport['left'] = []
  const changes = new Map<string, Map<number, string>>()
  const added = new Map<string, number>()
  const says = (f: Flagged) => [...new Set(f.hits.map(h => h.say))]
  /** Each tic kind's uses over the whole page (its other parts too), with one more change in. */
  const ticsWith = (f: Flagged, now: string) => {
    const trial = new Map([...changes].map(([k, v]) => [k, new Map(v)]))
    trial.set(f.field, (trial.get(f.field) ?? new Map()).set(f.n, now))
    return ticKinds(`${plain(pageWith(parts, trial))}\n${plain(o.rest ?? '')}`, 'vi')
  }
  /**
   * Code's checks on one changed sentence, against the page as changed so far: it has fewer listed words and none it
   * didn't have (a recast none of the ones it was sent for); the page gains no more than CAP of a word; and it puts
   * back no word of a kind the page repeats for each it took out (phrases.ts TICS), nor keeps a stacked "nên".
   */
  const guard = (f: Flagged, now: string, step: Step, out: readonly string[]): string | undefined => {
    const was = listed(f.html), is = listed(now)
    if (!within(is, was) || is.length >= was.length) return `it keeps or adds a listed word: ${is.join(', ') || '(none)'}`
    if (step === 'recast' && is.some(x => says(f).includes(x))) return `it keeps a listed word it was written again for: ${is.join(', ')}`
    for (const w of LANE_WORDS) { const n = uses(now, w) - uses(f.html, w); if (n > 0 && (added.get(w) ?? 0) + n > CAP) return `the page would gain more than ${CAP} of "${w}"` }
    const page = ticsWith(f, now), s0 = ticKinds(plain(f.html), 'vi'), s1 = ticKinds(plain(now), 'vi'), took = ticKinds(out.join(' '), 'vi')
    const stacked = page.length - 1
    for (const [k, n] of page.entries()) {
      if (k === stacked ? s1[k]! > 0 : s1[k]! > s0[k]! - took[k]! && n >= TIC_AT) return 'it puts back a word the page already repeats'
    }
    return undefined
  }
  const take = (f: Flagged, now: string) => {
    for (const w of LANE_WORDS) { const n = uses(now, w) - uses(f.html, w); if (n > 0) added.set(w, (added.get(w) ?? 0) + n) }
    changes.set(f.field, (changes.get(f.field) ?? new Map()).set(f.n, now))
  }

  // The swap: picks, by code, then a reviewer's read of each change.
  const offered = all.filter(f => f.hits.some(h => h.options.length))
  const done = new Set<Flagged>()
  if (offered.length) {
    const prompt = [PICK, ...offered.map((f, s) => [`[${s + 1}] ${shown(f)}`, context(f), ...f.hits.map((h, i) => h.options.length ? `  (${s + 1}.${i + 1}) «${h.from}»: ${h.options.map((x, k) => `${k + 1} = «${x || '(bỏ đi)'}»`).join(', ')}` : '').filter(Boolean)].filter(Boolean).join('\n'))].join('\n\n')
    const r = await llm<{ picks: { s: number; h: number; pick: number }[] }>({ system: 'You edit Vietnamese for an aquarium handbook. Reply only with JSON.', prompt, schema: PICK_SCHEMA, ...(o.models?.pick ? { model: o.models.pick } : { model: 'sonnet' }) })
    const tries: { f: Flagged; now: string }[] = []
    offered.forEach((f, s) => {
      const picks = f.hits.flatMap((hit, i) => {
        const pick = Number(r.picks?.find(x => Number(x.s) === s + 1 && Number(x.h) === i + 1)?.pick ?? 0)
        return hit.options.length && Number.isInteger(pick) && pick >= 1 && pick <= hit.options.length ? [{ hit, to: hit.options[pick - 1]! }] : []
      })
      if (!picks.length) return
      const now = applied(f.html, picks)
      const why = guard(f, now, 'swap', picks.map(p => p.hit.from))
      if (why) { outcomes.push({ page, field: f.field, n: f.n, says: says(f), step: 'swap', before: f.html, after: now, kept: false, why }); return }
      tries.push({ f, now })
    })
    if (tries.length) {
      const v = await review(llm, tries, o.models?.review)
      for (const [i, { f, now }] of tries.entries()) {
        const why = v[i]
        // The cap again: a sentence kept before it may have used its room.
        const no = why ?? guard(f, now, 'swap', f.hits.filter(h => h.options.length).map(h => h.from))
        if (!no) { take(f, now); done.add(f) }
        outcomes.push({ page, field: f.field, n: f.n, says: says(f), step: 'swap', before: f.html, after: now, kept: !no, ...(no ? { why: no } : {}) })
      }
    }
  }
  // The recast: what the swap left, if it is a plain sentence (COUNTED); the rest is left for the editors.
  const recast: Flagged[] = []
  for (const f of all) {
    if (done.has(f)) continue
    const why = recastWhy(f)
    if (why) { left.push({ page, field: f.field, n: f.n, says: says(f), why }); continue }
    recast.push(f)
  }
  if (recast.length) {
    const hints = (f: Flagged) => [...new Set(f.hits.map(h => h.say))].map(s => `  «${s}» → ${(PHRASES.vi ?? []).find(p => p.say === s)?.instead ?? ''}`).join('\n')
    const prompt = [RECAST, ...recast.map((f, s) => [`[${s + 1}] ${shown(f)}`, context(f), hints(f)].filter(Boolean).join('\n'))].join('\n\n')
    const w = await llm<{ sentences: { s: number; vi: string }[] }>({ system: 'You edit Vietnamese for an aquarium handbook. Reply only with JSON.', prompt, schema: RECAST_SCHEMA, model: o.models?.recast ?? 'opus' })
    const tries: { f: Flagged; now: string }[] = []
    recast.forEach((f, s) => {
      const given = (w.sentences?.find(x => Number(x.s) === s + 1)?.vi ?? '').normalize('NFC')
      const now = inline(given)
      const no = (why: string) => outcomes.push({ page, field: f.field, n: f.n, says: says(f), step: 'recast', before: f.html, ...(now ? { after: now } : {}), kept: false, why })
      if (!now) return no('the writer gave no sentence')
      if (now === f.html) return no('the writer gave it back as it was')
      if (counted(given) || counted(now)) return no('it brought in a hedge, a figure, a word of how many or how sure, or a tag')
      if (twoSentences(now)) return no('it became two sentences')
      const why = guard(f, now, 'recast', f.hits.map(h => h.from))
      if (why) return no(why)
      tries.push({ f, now })
    })
    if (tries.length) {
      const v = await review(llm, tries, o.models?.review)
      for (const [i, { f, now }] of tries.entries()) {
        const why = v[i] ?? guard(f, now, 'recast', f.hits.map(h => h.from))
        if (!why) take(f, now)
        outcomes.push({ page, field: f.field, n: f.n, says: says(f), step: 'recast', before: f.html, after: now, kept: !why, ...(why ? { why } : {}) })
      }
    }
  }
  return { changes, outcomes, left }
}

/** The reviewer's read of each change: why it's refused, or nothing when it's kept. */
async function review(llm: Llm, tries: readonly { f: Flagged; now: string }[], model?: string): Promise<(string | undefined)[]> {
  const body = tries.map(({ f, now }, i) => `### ${i + 1}\nBEFORE: ${plain(f.html)}\nAFTER: ${plain(now)}`).join('\n\n')
  const r = await llm<{ verdicts: { s: number; ok: boolean; why?: string }[]; hedges: HedgePair[] }>({ system: 'You are a strict Vietnamese editor checking an edit. Reply only with JSON.', prompt: `${REVIEW}\n\n${hedgesAsk('BEFORE', 'AFTER')}\n\n${body}`, schema: REVIEW_SCHEMA, model: model ?? 'opus' })
  return tries.map(({ f, now }, i) => {
    const v = r.verdicts?.find(x => Number(x.s) === i + 1)
    if (!v || v.ok !== true) return `its reviewer refused it: ${v?.why?.trim() || 'no verdict'}`
    const lost = hedgesLost(r.hedges ?? [], plain(f.html), plain(now))
    return lost.length ? `said more surely than before: "${lost[0]!.to}" (was: "${lost[0]!.from}")` : undefined
  })
}

/** A page's text with its changes in, part by part. */
const pageWith = (parts: readonly Part[], changes: ReadonlyMap<string, ReadonlyMap<number, string>>) => parts.map(p => (changes.has(p.field) ? splice(sentences(p.text), changes.get(p.field)!) : p.text)).join('\n')

/** A page's file with its changed parts in. */
export function withChanges(vi: Vi, parts: readonly Part[], changes: ReadonlyMap<string, ReadonlyMap<number, string>>): Vi {
  const out = JSON.parse(JSON.stringify(vi)) as Vi
  for (const p of parts) {
    const c = changes.get(p.field)
    if (!c?.size) continue
    const now = splice(sentences(p.text), c)
    const [head, key = ''] = p.field.split(/\.(.*)/s).filter(Boolean)
    if (head === 'sections') out.sections![p.field.slice('sections.'.length)] = now
    else if (head === 'body') out.body = now
    else if (head === 'summary') out.summary![Number(key)] = now
    else if (head === 'faq') out.faq![Number(key.split('.')[0])]!.a = now
  }
  return out
}

type Candidate = { key: string; dir: string; vi: Vi; parts: Part[]; marks: string[]; sentences: Flagged[]; rest?: string }
/** A page's text outside the parts the lane may change (fixed parts, FAQ questions): its repeats count too. */
const restOf = (vi: Vi, parts: readonly Part[]) => {
  const mine = new Set(parts.map(p => p.text))
  return [...Object.values(vi.sections ?? {}), vi.body ?? '', ...(vi.summary ?? []), ...(vi.faq ?? []).flatMap(f => [f.q, f.a])].filter(t => t && !mine.has(t)).join('\n')
}

/** Every page the lane may take up, with its listed sentences and their marks. */
export async function candidates(contentRoot: string): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (const kind of KINDS) {
    const ids = await readdir(join(contentRoot, kind)).catch(() => [] as string[])
    for (const id of ids.sort()) {
      const dir = join(contentRoot, kind, id)
      const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as Vi | null
      if (!vi || vi.held) continue
      const parts = await partsOf(dir, vi)
      const fl = flagged(parts)
      if (fl.length) out.push({ key: `${kind}/${id}`, dir, vi, parts, sentences: fl, marks: [...new Set(fl.flatMap(f => f.hits.map(markOf)))], rest: restOf(vi, parts) })
    }
  }
  return out
}

/**
 * The pages a run takes up: those named, in their order, or else the due ones (a mark not yet in the state), picked so
 * each entry has at least `perEntry` sentences the lane may mend, rarest entry first, then in page order, up to `limit`. The kinds take
 * turns (a fish page, a plant, a guide, a breed), so a trial reads each kind's writing.
 */
export function pick(cands: readonly Candidate[], state: State, o: { limit: number; perEntry?: number; pages?: readonly string[] }): Candidate[] {
  if (o.pages?.length) return [...new Set(o.pages)].flatMap(k => cands.filter(c => c.key === k)).slice(0, o.limit)
  const byKind = KINDS.map(k => cands.filter(c => c.key.startsWith(`${k}/`) && c.marks.some(m => !state[c.key]?.marks.includes(m))))
  const due = Array.from({ length: Math.max(0, ...byKind.map(l => l.length)) }, (_, i) => byKind.flatMap(l => (l[i] ? [l[i]!] : []))).flat()
  // A sentence counts for an entry only if the lane may mend it: a word offered in place, or a recast if the swap leaves it.
  const count = (c: Candidate, say: string) => c.sentences.filter(f => f.hits.some(h => h.say === say) && (f.hits.some(h => h.say === say && h.options.length) || !recastWhy(f))).length
  const total = new Map(LANE.map(p => [p.say, due.reduce((n, c) => n + count(c, p.say), 0)]))
  const chosen: Candidate[] = []
  for (const p of [...LANE].sort((a, b) => total.get(a.say)! - total.get(b.say)!)) {
    let have = chosen.reduce((n, c) => n + count(c, p.say), 0)
    for (const c of due) {
      if (chosen.length >= o.limit || have >= (o.perEntry ?? 0)) break
      if (chosen.includes(c) || !count(c, p.say)) continue
      chosen.push(c); have += count(c, p.say)
    }
  }
  for (const c of due) { if (chosen.length >= o.limit) break; if (!chosen.includes(c)) chosen.push(c) }
  return chosen
}

/**
 * Each entry's sentences, and what each became, once: its sentence's last outcome, or left when the lane left it. A
 * kept change counts for an entry only if the sentence lost one of its words; one that kept them all leaves it.
 */
const sumEntry = (r: WordingReport, cands: readonly Candidate[]) => {
  for (const p of LANE) r.byEntry[p.say] = { sentences: 0, offered: 0, mendable: 0, swapped: 0, recast: 0, refused: 0, left: 0 }
  for (const c of cands) for (const f of c.sentences) for (const s of new Set(f.hits.map(h => h.say))) {
    const e = r.byEntry[s]!
    e.sentences++
    // What the lane may do with it before any model: a word offered in place, or a recast if the swap leaves it.
    const offered = f.hits.some(h => h.say === s && h.options.length)
    if (offered) e.offered++
    if (offered || !recastWhy(f)) e.mendable++
  }
  const end = new Map<string, { says: string[]; as: 'swapped' | 'recast' | 'refused' | 'left'; before?: string; after?: string }>()
  for (const x of r.outcomes) end.set(`${x.page} ${x.field} ${x.n}`, { says: x.says, as: x.kept ? (x.step === 'swap' ? 'swapped' : 'recast') : 'refused', before: x.before, after: x.after })
  for (const x of r.left) end.set(`${x.page} ${x.field} ${x.n}`, { says: x.says, as: 'left' })
  const n = (s: string | undefined, say: string) => listed(s ?? '').filter(x => x === say).length
  for (const x of end.values()) for (const s of x.says) {
    const kept = x.as === 'swapped' || x.as === 'recast'
    r.byEntry[s]![kept && n(x.after, s) >= n(x.before, s) ? 'left' : x.as]++
  }
}

/** A run's report file: one for each run, by its start, so a second day's run leaves the first's. */
export const reportName = (r: Pick<WordingReport, 'at' | 'dry'>) => `${r.dry ? 'dry-run' : 'report'}-${r.at.replace(/[:.]/g, '-')}.json`
const inside = (dir: string, root: string) => dir === root || dir.startsWith(root + sep)
/** A path's real place, through links, though its last folders may not exist yet. */
async function real(path: string): Promise<string> {
  const abs = resolve(path)
  try { return await realpath(abs) }
  catch { const up = dirname(abs); return up === abs ? abs : join(await real(up), basename(abs)) }
}

/** The run: pages picked, each mended, and everything written under `out` alone. */
export async function wordingMend(root: string, d: { llm: Llm; now: () => Date }, o: { out: string; limit: number; perEntry?: number; pages?: readonly string[]; dry?: boolean; models?: { pick?: string; review?: string; recast?: string } }): Promise<WordingReport> {
  if (!o.out) throw new Error('the wording mend writes only under --out <dir> until the editors have read a trial')
  if (!Number.isInteger(o.limit) || o.limit < 1) throw new Error(`--limit must be a whole number of pages, at least 1: ${o.limit}`)
  if (o.perEntry !== undefined && (!Number.isInteger(o.perEntry) || o.perEntry < 0)) throw new Error(`--per must be a whole number: ${o.perEntry}`)
  const out = await real(o.out), repo = await real(root)
  if (inside(out, repo) || inside(repo, out)) throw new Error(`--out ${o.out} is in the repository or holds it: the trial writes only outside it`)
  /** A file written under out alone: no folder on its way, nor the file, leads out of it. */
  const put = async (file: string, text?: string, flag?: string) => {
    if (!inside(await real(dirname(file)), out) || (await lstat(file).catch(() => undefined))?.isSymbolicLink()) throw new Error(`${file} leads outside ${o.out}: nothing written`)
    if (text === undefined) return rm(file, { force: true })
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text, flag ? { flag } : {})
  }
  const stateFile = join(out, '_wording-mend.json')
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as State
  const chosen = pick(await candidates(join(root, 'content')), state, o)
  const report: WordingReport = { at: d.now().toISOString(), ...(o.dry ? { dry: true as const } : {}), pages: chosen.map(c => c.key), failed: [], outcomes: [], left: [], byEntry: {} }
  if (!o.dry) {
    for (const c of chosen) {
      try {
        const r = await piece(c.key, () => mendPage(d.llm, c.key, c.parts, { ...(o.models ? { models: o.models } : {}), rest: c.rest ?? '' }), { now: d.now })
        report.outcomes.push(...r.outcomes); report.left.push(...r.left)
        // The page as this run left it: a draft from an earlier run that this one changed nothing in goes.
        const changed = [...r.changes.values()].some(m => m.size)
        await put(join(out, 'content', c.key, 'vi.json'), changed ? `${JSON.stringify(withChanges(c.vi, c.parts, r.changes), null, 2)}\n` : undefined)
        state[c.key] = { at: d.now().toISOString(), marks: [...new Set([...(state[c.key]?.marks ?? []), ...c.marks])] }
        await put(stateFile, `${JSON.stringify(state, null, 1)}\n`)
      } catch (err) {
        const said = err instanceof Error ? err.message : String(err)
        // A page the day's line doesn't admit isn't started, and nothing of it is written or marked (pieces.ts).
        if (err instanceof PieceAdmissionError) report.stopped = said
        else { report.failed.push(`${c.key}: ${said}`.slice(0, 300)); report.stopped = `${c.key} failed, so the run stopped` }
        break
      }
    }
  }
  sumEntry(report, chosen)
  await put(join(out, reportName(report)), `${JSON.stringify(report, null, 1)}\n`, 'wx')
  return report
}

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GLOSSARY_HELD, linkTerms, toneKey, type LinkTarget } from '@aq/schema'

/**
 * The standing check on the glossary's link phrases, its half with no model (the chief of staff, 21 Nov 2026, after "lớp
 * nền", "giun đỏ", "lãnh thổ", "oxy già" and "đốm trắng" linked what they don't mean). Every place the site's linker links
 * a term by its name, an other name or a link phrase on a live page, with the words on either side, flagged where the
 * words around it may make it something else:
 * - name: a capitalised word stands right after it ("Lãnh thổ Bắc Úc");
 * - longer: the word after it makes a phrase the site writes often (LONGER times on LONGER_PAGES pages or more) that is
 *   none of the term's own names ("oxy già").
 * It deletes nothing and links nothing: the chief of staff reads the flags and rules, and a phrase held is on the list the
 * site's linker reads (glossary-held.ts in the schema). A cheap model read of the flagged sentences is the check's other half.
 */
export const LONGER = 10
export const LONGER_PAGES = 5
// Words that follow any noun and make no name with it (and sizes: "đông lạnh cỡ nhỏ").
const STOP = new Set(('và của cho trong là có để khi thì ở với từ được không cũng sẽ đã rất hơn này đó các những một nhiều ít bị ra vào lên '
  + 'xuống như hay hoặc nhưng mà nên vì do theo trên dưới sau trước giữa quá đến tới lại nữa luôn thường càng đều vẫn còn chỉ '
  + 'hết cả mỗi tại sẽ đang khá thêm bằng gì nào ấy kia đây thế vậy rồi lúc nếu dù tuy giúp gây làm cần phải nhé cỡ nhỏ lớn mới').split(' '))
const KINDS = ['species', 'plants', 'breeds', 'guides'] as const
const MARK = (id: string) => `#glossary-link-check:${id}`

export type Term = { id: string; name: string; altNames: string[]; linkNames?: string[]; text?: string }
export type Page = { kind: string; id: string; html: string }
export type Flagged = { page: string; phrase: string; flag: 'name' | 'longer'; next: string; around: string }
/** One linked place, flagged or not: what the cheap read samples (glossary-link-read.ts). */
export type Place = { page: string; around: string; flagged: boolean }
export type PhraseReport = { term: string; phrase: string; links: number; longer: [string, number, number][]; ownCaps: boolean; flagged: Flagged[]; places: Place[] }

// A block's end is a stop: words in two paragraphs, items or headings don't make one phrase.
const plain = (html: string) => html.replace(/<\/?(?:p|li|ul|ol|h[1-6]|br|div|tr|td|th|table|blockquote|dt|dd|section)\b[^>]*>/gi, ' ¶ ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
const words = (s: string) => s.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The flags over the given terms and pages, phrase by phrase, most flagged first. `held`: "<term id>\n<phrase>" pairs the linker skips. */
export function checkLinks(terms: Term[], pages: Page[], held: Set<string> = new Set()): PhraseReport[] {
  const own = new Map(terms.map(t => [t.id, [t.name, ...t.altNames, ...(t.linkNames ?? [])].filter(n => !held.has(`${t.id}\n${toneKey(n)}`))]))
  const targets: LinkTarget[] = terms.map(t => ({ key: t.id, href: MARK(t.id), names: own.get(t.id)! }))
  const texts = pages.map(p => plain(p.html))
  // How often the site writes each phrase followed by each word, and on how many pages.
  const after = new Map<string, Map<string, Set<number>>>()
  const count = new Map<string, Map<string, number>>()
  for (const t of terms) for (const n of own.get(t.id)!) {
    const k = `${t.id}\n${n}`, re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(n)}\\s+([\\p{L}\\p{M}]+)`, 'giu')
    const pagesOf = new Map<string, Set<number>>(), times = new Map<string, number>()
    texts.forEach((x, i) => { for (const m of x.matchAll(re)) { const w = m[1]!.toLowerCase(); (pagesOf.get(w) ?? pagesOf.set(w, new Set()).get(w)!).add(i); times.set(w, (times.get(w) ?? 0) + 1) } })
    after.set(k, pagesOf); count.set(k, times)
  }
  // Only a short other name or link phrase (one or two words) can mean something else inside a longer phrase: the term's own
  // name is what it is, and three words are specific enough.
  // A pair the entry itself writes is the term's own use.
  const longerOf = (t: Term, n: string) => {
    if (toneKey(n) === toneKey(t.name) || n.split(/\s+/).length > 2) return []
    const k = `${t.id}\n${n}`, names = own.get(t.id)!.map(toneKey), mine = toneKey(plain(t.text ?? ''))
    return [...(count.get(k) ?? [])].filter(([w, c]) => c >= LONGER && after.get(k)!.get(w)!.size >= LONGER_PAGES && !STOP.has(w)
      && !names.some(x => x.startsWith(toneKey(`${n} ${w}`))) && !mine.includes(toneKey(`${n} ${w}`)))
      .map(([w, c]) => [w, c, after.get(k)!.get(w)!.size] as [string, number, number]).sort((a, b) => b[1] - a[1])
  }
  const reports = new Map<string, PhraseReport>()
  const report = (t: Term, n: string) => {
    const k = `${t.id}\n${toneKey(n)}`
    // The entry itself writes it before a name ("lưu vực sông Amazon"): a name after it is the term's own use. The phrase is
    // matched in any case and the word after it tested apart: under the case-blind flag, \p{Lu} matches any letter.
    const ownCaps = [...plain(t.text ?? '').matchAll(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(n)} ([\\p{L}\\p{M}]+)`, 'giu'))].some(m => /^\p{Lu}\p{Ll}/u.test(m[1]!))
    return reports.get(k) ?? reports.set(k, { term: t.id, phrase: n, links: 0, longer: longerOf(t, own.get(t.id)!.find(x => toneKey(x) === toneKey(n)) ?? n), ownCaps, flagged: [], places: [] }).get(k)!
  }
  const byId = new Map(terms.map(t => [t.id, t]))
  pages.forEach(p => {
    const { html } = linkTerms(p.html, targets, 'gl')
    const text = plain(html.replace(/<a href="#glossary-link-check:([^"]+)"[^>]*>([^<]*)<\/a>/g, (_, id: string, m: string) => `\u0001${id}\u0002${m}\u0003`))
    for (const x of text.matchAll(/\u0001([^\u0002]+)\u0002([^\u0003]*)\u0003/g)) {
      const t = byId.get(x[1]!)!, m = x[2]!, r = report(t, m)
      r.links++
      const clean = (s: string) => s.replace(/\u0001[^\u0002]*\u0002/g, '').replace(/\u0003/g, '')
      const before = clean(text.slice(0, x.index)), rest = clean(text.slice(x.index! + x[0].length))
      // The words touching it, with only a space between: a stop or a comma ends what it can be part of.
      const next = /^ ([\p{L}\p{M}\p{N}]+)/u.exec(rest)?.[1] ?? ''
      // A name after it, not before: a fish's name before a term is mostly its subject ("Corydoras ăn tạp").
      const flag = /^\p{Lu}\p{Ll}/u.test(next) && !r.ownCaps ? 'name' : r.longer.some(([w]) => w === next.toLowerCase()) ? 'longer' : undefined
      const around = `${before.slice(-70).trimStart()}[${m}]${rest.slice(0, 50).trimEnd()}`
      if (flag) r.flagged.push({ page: `${p.kind}/${p.id}`, phrase: m, flag, next, around })
      r.places.push({ page: `${p.kind}/${p.id}`, around, flagged: !!flag })
    }
  })
  return [...reports.values()].sort((a, b) => b.flagged.length - a.flagged.length || b.links - a.links)
}

async function readJson<T>(f: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(f, 'utf8')) as T } catch { return undefined }
}

/** The check over main's content: every glossary term against every live species, plant, breed and guide page. */
export async function glossaryLinkCheck(root: string, held: Set<string> = new Set()): Promise<{ reports: PhraseReport[]; links: number; flagged: number }> {
  const dir = join(root, 'content/glossary')
  const terms: Term[] = []
  for (const id of (await readdir(dir)).sort()) {
    const v = await readJson<Term & { body?: string; definition?: string }>(join(dir, id, 'vi.json'))
    if (v) terms.push({ id, name: v.name, altNames: v.altNames ?? [], linkNames: v.linkNames, text: `${v.definition ?? ''}\n${v.body ?? ''}` })
  }
  const pages: Page[] = []
  for (const kind of KINDS) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const v = await readJson<{ sections?: Record<string, unknown>; body?: string; quality?: { indexable?: boolean } }>(join(root, 'content', kind, id, 'vi.json'))
      if (!v || v.quality?.indexable === false) continue
      const parts = [...Object.values(v.sections ?? {}).filter((x): x is string => typeof x === 'string'), v.body ?? '']
      pages.push({ kind, id, html: parts.map(x => `<p>${x}</p>`).join('') })
    }
  }
  const reports = checkLinks(terms, pages, held)
  return { reports, links: reports.reduce((n, r) => n + r.links, 0), flagged: reports.reduce((n, r) => n + r.flagged.length, 0) }
}

/** The file the chief of staff reads: the count, then each flagged phrase with its frequent longer phrases and its sentences. */
export function linkCheckText(r: { reports: PhraseReport[]; links: number; flagged: number }, date: string): string {
  const out = [`# The glossary's link phrases, ${date}`, '', `${r.flagged} of ${r.links} linked places flagged, over ${r.reports.length} phrases (no model).`, '']
  for (const p of r.reports.filter(x => x.flagged.length)) {
    out.push(`## ${p.term}: "${p.phrase}", ${p.flagged.length} of ${p.links} flagged`)
    if (p.longer.length) out.push(`Written often after it, and never in its own entry: ${p.longer.slice(0, 8).map(([w, c, n]) => `"${p.phrase} ${w}" ${c} times on ${n} pages`).join('; ')}.`)
    // Grouped by the flag and the word beside it, most first, three places each: the chief reads a group, not every place.
    const groups = new Map<string, Flagged[]>()
    for (const f of p.flagged) { const k = `${f.flag} ${f.next}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(f) }
    for (const [k, fs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      out.push(`- ${k.replace(' ', ': beside "')}", ${fs.length} place${fs.length > 1 ? 's' : ''}`)
      for (const f of fs.slice(0, 3)) out.push(`  - ${f.page} | …${f.around}…`)
    }
    out.push('')
  }
  return `${out.join('\n')}\n`
}

export async function writeLinkCheck(root: string, outDir: string, date: string): Promise<{ links: number; flagged: number; file: string }> {
  const r = await glossaryLinkCheck(root, new Set(GLOSSARY_HELD.map(h => `${h.term}\n${toneKey(h.phrase)}`)))
  const file = join(outDir, 'glossary-link-check.md')
  await writeFile(file, linkCheckText(r, date))
  return { links: r.links, flagged: r.flagged, file }
}

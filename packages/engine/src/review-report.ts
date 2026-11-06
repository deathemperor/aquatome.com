import { QUALITY_THRESHOLD } from '@aq/schema'
import { REVIEW_KINDS, reviewKey, type PageTrace, type ReviewKind } from './review-log'

/** What each kind of review checks, for the report's headings. */
const KIND_LABEL: Record<ReviewKind, string> = {
  'video-guide': 'Vietnamese guides written from YouTube videos, against the transcript',
  translation: 'source pages translated into Vietnamese, against the English',
  'vi-rewrite': 'older Vietnamese rewritten in the site\'s style',
  'reader-rewrite': 'parts the reader step rewrote with its findings',
  title: 'titles rewritten to promise only what the text has',
  breed: 'breed pages, against their research',
  topic: 'AquaTome\'s own guides, against their research',
  product: 'product pages, against their research',
  'product-reviews': 'product pages\' review summaries (the code\'s checks: 1 pass, 0 fail)',
  summary: 'species\' quick summaries (the numbers and claims check: 1 pass, 0 fail)',
  localize: 'species and plant pages in Indonesian and Thai, against the English',
  glossary: 'glossary terms in Indonesian and Thai (reviewed in batches)',
  places: 'place names in Indonesian and Thai (reviewed in batches)',
  equipment: 'equipment buying guides in Indonesian and Thai, against the Vietnamese',
}

/**
 * Kinds of fault, by the words reviewers use for them (their notes are English). A note counts in every group it names;
 * `other` holds the notes no group matches, so a new group can be read off it.
 */
export const FAULTS: { key: string; label: string; re: RegExp }[] = [
  { key: 'language', label: 'Text left in another language', re: /left in (English|Vietnamese)|untranslated|not translated|Vietnamese (text )?is left|(English|Vietnamese) (word|term|phrase|text)s? (is |are )?(left|kept|remains?)/i },
  { key: 'copied', label: 'Copied from the transcript or source', re: /\b(copied|copies|copying|verbatim|word[- ]for[- ]word|barely (changed|reworded)|lifted|close paraphrase)\b/i },
  { key: 'names-source', label: 'Names or points to the video, channel, creator or source', re: /\b(mentions?|names?|refers? to|cites?|credits?|points? to|talk(s|ing)? about|sounds? like) (the |its )?(video|channel|creator|author|host|presenter|youtuber|source site)|trong video|theo video|tác giả|người làm video|video này|names its source|bể mẫu|first-person/i },
  { key: 'off-topic', label: 'Off the title\'s topic', re: /\b(off[- ]topic|detour|digress\w*|unrelated|not about)\b/i },
  { key: 'unsupported', label: 'Says what the source doesn\'t (invented, added)', re: /not (in|from) the (transcript|facts?|source|english|text|video|findings)|not what the (video|transcript|source|english|facts?) says?|\b(unsupported|not supported|partly supported|beyond the facts|invent\w*|fabricat\w*|hallucinat\w*|adds?|added|addition|not (stated|mentioned|said|given)|never (says|names|mentions|gives)|no (source|basis)|in none of its findings|cites no)\b/i },
  { key: 'overstated', label: 'States as certain what the source hedges, or what garbled captions only hint at', re: /\b(overstat\w*|exaggerat\w*|speculat\w*|hedg\w*|soften\w*|tone (it |them )?down|as (a )?(firm )?fact|firm (claim|number|figure|fact|specifics|order|rule)|garbled|noisy|unclear|cautious)\b/i },
  { key: 'omitted', label: 'Leaves out what the source says', re: /\b(omit\w*|omission|dropped|drops|missing|left out|leaves out|skips|skipped|lost|(does not|doesn't|only half) covers?)\b/i },
  { key: 'figures', label: 'A number, unit, dose or price', re: /\b(numbers?|figures?|units?|conversion|convert\w*|temperatures?|ppm|doses?|dosage|dosing|litres?|liters?|gallons?|inch(es)?|percent|prices?)\b|°/i },
  { key: 'meaning', label: 'Meaning changed or wrong', re: /\b(mistranslat\w*|wrong\w*|incorrect\w*|inaccura\w*|errors?|contradict\w*|misrepresent\w*|misread\w*|meaning|distort\w*|revers\w*|opposite|confus\w*)\b/i },
  { key: 'terms', label: 'Hobby terms and names', re: /\b(terms?|terminology|jargon|hobby word|common name|trade name|name for)\b/i },
  { key: 'repetition', label: 'Repeats itself (intro, summary, steps and FAQ)', re: /\b(repeat\w*|repetit\w*|duplicat\w*|redundan\w*|same points?)\b/i },
  { key: 'wording', label: 'Wording: unnatural, literal, stiff or chatty', re: /\b(awkward\w*|unnatural\w*|stiff\w*|clumsy|literal\w*|translationese|calque\w*|phras\w*|reads? like|wordy|verbose|fluen\w*|grammar\w*|typo\w*|spelling|chatty|filler|natural (Vietnamese|wording|Indonesian|Thai)|smooth\w*)\b/i },
]
/** The groups a note names, or `other`. */
export const faultsOf = (note: string) => { const ks = FAULTS.filter(f => f.re.test(note)).map(f => f.key); return ks.length ? ks : ['other'] }
const LABEL = (k: string) => FAULTS.find(f => f.key === k)?.label ?? 'Other'

/** The newest kept review of each page part, by kind. */
function latest(traces: PageTrace[]): Map<ReviewKind, Map<string, PageTrace>> {
  const out = new Map<ReviewKind, Map<string, PageTrace>>()
  for (const t of traces) {
    if (!t.kept) continue
    const m = out.get(t.kind) ?? new Map<string, PageTrace>()
    out.set(t.kind, m)
    const key = reviewKey(t)
    const had = m.get(key)
    if (!had || t.at > had.at) m.set(key, t)
  }
  return out
}

const quote = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, ' ')

/**
 * docs/review/reviews.md: per kind of review, how many pages it last left under the bar and the faults its notes name
 * most, grouped, each with a few notes quoted and the pages they come from. What prompt fixes start from.
 */
export function reviewReport(traces: PageTrace[], o: { examples?: number } = {}): string {
  const examples = o.examples ?? 3
  const byKind = latest(traces)
  const rows: string[] = []
  const parts: string[] = []
  for (const kind of REVIEW_KINDS) {
    const kept = [...(byKind.get(kind)?.values() ?? [])]
    if (!kept.length) continue
    // A page reviewed in parts (a species' text from each source) is under the bar when one part is.
    const pages = new Map<string, PageTrace[]>()
    for (const t of kept) pages.set(`${t.lang}/${t.id}`, [...(pages.get(`${t.lang}/${t.id}`) ?? []), t])
    const under = [...pages.entries()].filter(([, ts]) => ts.some(t => t.score < QUALITY_THRESHOLD))
    const byLang = new Map<string, number>()
    for (const [p] of under) byLang.set(p.split('/')[0]!, (byLang.get(p.split('/')[0]!) ?? 0) + 1)
    const langs = [...byLang].sort(([a], [b]) => a.localeCompare(b)).map(([l, n]) => `${l} ${n}`).join(', ')
    rows.push(`| ${kind} | ${pages.size} | ${under.length}${langs ? ` (${langs})` : ''} | ${under.filter(([, ts]) => ts.some(t => t.notes.length)).length} |`)
    parts.push(`## ${kind}: ${KIND_LABEL[kind]}`, '', `${under.length} of ${pages.size} pages under the bar.`, '')
    if (!under.length) continue
    // Each note of the parts under the bar, in its group; groups by how many pages they touch.
    const groups = new Map<string, { note: string; t: PageTrace }[]>()
    for (const [, ts] of under) for (const t of ts.filter(x => x.score < QUALITY_THRESHOLD)) for (const note of t.notes) {
      for (const g of faultsOf(note)) groups.set(g, [...(groups.get(g) ?? []), { note, t }])
    }
    if (!groups.size) { parts.push('Their reviews left no notes.', ''); continue }
    const pagesIn = (xs: { t: PageTrace }[]) => new Set(xs.map(x => `${x.t.lang}/${x.t.id}`)).size
    const ranked = [...groups].sort(([ka, a], [kb, b]) => pagesIn(b) - pagesIn(a) || b.length - a.length || ka.localeCompare(kb))
    parts.push('| Fault | Pages | Notes |', '| --- | --- | --- |', ...ranked.map(([k, xs]) => `| ${LABEL(k)} | ${pagesIn(xs)} | ${xs.length} |`), '')
    const quoted = new Set<string>()
    for (const [k, xs] of ranked) {
      // One note a page, the lowest-scored pages' first, a note already quoted above last.
      const seen = new Set<string>()
      const picked = [...xs].sort((a, b) => Number(quoted.has(a.note)) - Number(quoted.has(b.note)) || a.t.score - b.t.score || a.t.id.localeCompare(b.t.id)).filter(x => !seen.has(x.t.id) && seen.add(x.t.id)).slice(0, examples)
      for (const x of picked) quoted.add(x.note)
      parts.push(`### ${LABEL(k)}`, '', ...picked.map(x => `- ${quote(x.note)} — ${x.t.lang}/${x.t.id}${x.t.part ? ` (${x.t.part})` : ''}, ${x.t.score.toFixed(2)}`), '')
    }
  }
  return [
    '# Review notes',
    '',
    'Generated by `pnpm engine reviews` every engine cycle, from what each quality review kept (`engine-state/reviews/`).',
    `A page is under the bar (${QUALITY_THRESHOLD}) when its last kept review scored below it; a page reviewed in parts, when one`,
    'part did. Faults are those reviews\' notes, grouped by their words (`FAULTS` in `packages/engine/src/review-report.ts`):',
    'a note naming several faults counts in each, and Other holds the rest. A page\'s notes: `engine-state/reviews/<kind>.json`,',
    'under `<lang>/<path>`.',
    '',
    '| Kind | Pages reviewed | Under the bar | With notes |',
    '| --- | --- | --- | --- |',
    ...(rows.length ? rows : ['| none yet | 0 | 0 | 0 |']),
    '',
    ...parts,
  ].join('\n')
}

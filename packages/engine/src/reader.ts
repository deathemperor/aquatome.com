import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HTMLElement, parse } from 'node-html-parser'
import { metricPage, QUALITY_THRESHOLD, type Lang } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { blocks } from './content-rules'
import { METRIC_KINDS } from './metric'
import type { Page } from './pages'
import { reviewRewrite, reviewTranslation } from './quality'
import { snapshotName } from './snapshot'
import { rewriteVi, VI_WRITE } from './vi-rewrite'

/**
 * A reader's eye: each cycle the model reads a few published pages the way a careful reader would, against a rubric
 * (prompts/reader.md): misleading structure, contradictions, wrong numbers and units, garbled language, captions that
 * don't fit, claims the page's own sources don't support. Pages not read yet go first, then those changed since; a page
 * is read again only when its text changes (engine-state/_reader.json). Vietnamese wording it flags is rewritten through
 * the rewrite step's own writer and reviewer (vi-rewrite.ts, quality.ts), kept only when the reviewer passes it; the rest
 * is listed in docs/review/reader.md, with a note where a rule (content-rules.ts) could catch that kind of problem.
 */
const RUBRIC = readFileSync(new URL('./prompts/reader.md', import.meta.url), 'utf8')
/** How the site writes Vietnamese: what "natural" means on a Vietnamese page. */
const VI_STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
export const FINDING_KINDS = ['structure', 'contradiction', 'numbers', 'language', 'caption', 'unsupported', 'other'] as const
const SEVERITIES = ['high', 'medium', 'low'] as const
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['kind', 'severity', 'part', 'quote', 'problem'],
        properties: {
          kind: { type: 'string', enum: [...FINDING_KINDS] }, severity: { type: 'string', enum: [...SEVERITIES] },
          part: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, rule: { type: 'string' },
        },
      },
    },
  },
}
export type ReaderFinding = { kind: (typeof FINDING_KINDS)[number]; severity: (typeof SEVERITIES)[number]; part: string; quote: string; problem: string; fix?: string; rule?: string }
export type ReaderEntry = {
  at: string
  /** The text the page had when it was read (readerText). */
  hash: string
  /** Findings still open; `field`: where the part is kept in the page's file. */
  findings: (ReaderFinding & { field?: string })[]
  /** Rewrites the reader asked for: kept (the reviewer passed them) or not. */
  rewrites?: { at: string; field: string; score: number; kept: boolean; problems: string[] }[]
}
export type ReaderState = Record<string, ReaderEntry>

const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese', id: 'Indonesian', th: 'Thai' }
const LANG_ORDER: Lang[] = ['vi', 'id', 'th']
const KIND_ORDER = ['guides', 'species', 'plants', 'breeds', 'products', 'glossary', 'equipment']
/** The page text sent at most (a long guide is cut), and the sources'. */
const PAGE_CHARS = 16_000
const SOURCE_CHARS = 12_000

export const pageKey = (p: Page) => `${p.lang}/${p.kind}/${p.id}`
const range = (v: number | { min: number; max: number }) => (typeof v === 'number' ? `${v}` : `${v.min}–${v.max}`)
const render = (html: string) => blocks(html).map(b => (b.tag === 'h3' ? `## ${b.text}` : b.tag === 'li' ? `- ${b.text}` : b.tag === 'td' || b.tag === 'th' ? `| ${b.text}` : b.text)).join('\n')
/** "sections.diet:seriouslyfish" → "diet, from seriouslyfish". */
const label = (field: string) => field.replace(/^sections\.([^:]+):(.+)$/, '$1, from $2')
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
/** The page's own text without the sources' reference lists. */
const readable = (p: Page) => p.fields.filter(f => !f.field.startsWith('sections.references'))

/** The page as the reader gets it, in numbered parts (`parts`: id → where it is kept), and a hash of that text. */
export function readerText(p: Page): { text: string; parts: Record<string, string>; hash: string } {
  const parts: Record<string, string> = {}
  const out = [`TITLE: ${p.title}`, `ADDRESS: ${p.path}`]
  if (p.card.length) { parts.CARD = 'card'; out.push(`[CARD] ${p.card.map(c => `${c.field} ${range(c.value)} (${c.source})`).join('; ')}`) }
  readable(p).forEach((f, i) => { parts[`P${i + 1}`] = f.field; out.push('', `[P${i + 1} ${label(f.field)}]`, render(f.html)) })
  if (p.lines.length) out.push('')
  p.lines.forEach((l, i) => { parts[`L${i + 1}`] = l.field; out.push(`[L${i + 1} ${l.field}] ${l.text}`) })
  const captions = [...new Set(p.captions.map(c => c.caption))].slice(0, 12)
  if (captions.length) out.push('')
  captions.forEach((c, i) => { parts[`C${i + 1}`] = 'caption'; out.push(`[C${i + 1}] ${c}`) })
  const text = out.join('\n')
  return { text, parts, hash: createHash('sha1').update(text).digest('hex').slice(0, 16) }
}

/** What the page was written from, when the engine keeps it: a species or plant's English sections, a guide's source page. */
export async function sourcesText(root: string, p: Page): Promise<string> {
  if (p.en) {
    const ids = readable(p).map((f, i) => [f.field, `P${i + 1}`] as const)
    return ids.flatMap(([field, id]) => (p.en![field] ? [`[${id} ${label(field)}]`, render(p.en![field]!)] : [])).join('\n').slice(0, SOURCE_CHARS)
  }
  if (!p.origin || ['youtube', 'aquatome'].includes(p.origin.source)) return ''
  const raw = await readFile(join(root, 'sources', p.origin.source, `${snapshotName(p.origin.url)}.md`), 'utf8').catch(() => '')
  return raw.replace(/^---[\s\S]*?---\s*/, '').slice(0, SOURCE_CHARS)
}

/** Pages to read: not read yet, then changed since they were read, the longest ago first; Vietnamese, then guides, first. */
export function duePages(pages: Page[], state: ReaderState): Page[] {
  const order = (p: Page) => [state[pageKey(p)]?.at ?? '', LANG_ORDER.indexOf(p.lang), KIND_ORDER.indexOf(p.kind), p.path] as const
  return pages.filter(p => state[pageKey(p)]?.hash !== readerText(p).hash)
    .sort((a, b) => { const [x, y] = [order(a), order(b)]; return x[0].localeCompare(y[0]) || x[1] - y[1] || x[2] - y[2] || x[3].localeCompare(y[3]) })
}

/** A finding that takes itself back ("…, so it is not an error"). */
const RETRACTED = /\b(not an error|not a problem|no error|so it is fine|which is fine|is fine;|low confidence|consistent with the source|matches the source)\b/i

/** The model's findings that hold: a known kind, a part the page has, a quote that is on the page, and not taken back. */
export function keepFindings(found: ReaderFinding[], text: string, parts: Record<string, string>): ReaderEntry['findings'] {
  const page = norm(text)
  return found
    .filter(f => (FINDING_KINDS as readonly string[]).includes(f.kind) && (SEVERITIES as readonly string[]).includes(f.severity) && f.problem?.trim() && !RETRACTED.test(f.problem))
    .filter(f => parts[f.part] !== undefined || f.part === '')
    .filter(f => !f.quote?.trim() || page.includes(norm(f.quote)))
    .map(f => ({
      kind: f.kind, severity: f.severity, part: f.part, quote: f.quote?.trim() ?? '', problem: f.problem.trim(),
      ...(f.fix?.trim() ? { fix: f.fix.trim() } : {}), ...(f.rule?.trim() ? { rule: f.rule.trim() } : {}), ...(parts[f.part] ? { field: parts[f.part] } : {}),
    }))
}

/** A finding the engine can act on: Vietnamese text it keeps as HTML, wording (any page) or a fact checked against English. */
export function canRewrite(p: Page, f: ReaderEntry['findings'][number]): boolean {
  if (p.lang !== 'vi' || f.severity === 'low' || !f.field || !/^(sections\.(?!references).+|body|definition)$/.test(f.field)) return false
  if (!['species', 'plants', 'guides', 'breeds', 'products', 'glossary'].includes(p.kind)) return false
  return f.kind === 'language' || (!!p.en?.[f.field] && ['numbers', 'contradiction', 'unsupported'].includes(f.kind))
}

const notesOf = (fs: ReaderFinding[]) => fs.map(f => `${f.problem}${f.quote ? ` ("${f.quote}")` : ''}${f.fix ? ` Nên viết: "${f.fix}"` : ''}`)

/**
 * One part of a Vietnamese page rewritten with the reader's findings as notes, as the rewrite step does: a section with
 * its English source as a whole, checked against that English; text with none (guides) only in the blocks the findings
 * quote, checked against the old wording. Returns the part's new HTML and the review's score; undefined when the quotes
 * can't be placed.
 */
export async function rewritePart(llm: Llm, html: string, fs: ReaderFinding[], o: { en?: string; source?: string }): Promise<{ html: string; score: number; notes: string[] } | undefined> {
  const opts = { ...VI_WRITE, notes: notesOf(fs), ...(o.source ? { source: o.source } : {}) }
  if (o.en) {
    const next = (await rewriteVi(llm, [{ id: 'part', en: o.en, vi: html }], opts)).get('part')!
    const r = await reviewTranslation(llm, [{ en: o.en, vi: next }])
    return { html: next, score: r.score, notes: r.notes }
  }
  const root = parse(html)
  const els = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)
  const at = [...new Set(fs.map(f => (f.quote ? els.findIndex(e => norm(e.text).includes(norm(f.quote))) : -1)))]
  if (!at.length || at.includes(-1)) return undefined
  const parts = at.map(i => ({ id: `b${i}`, vi: els[i]!.toString() }))
  const next = await rewriteVi(llm, parts, opts)
  const r = await reviewRewrite(llm, parts.map(x => ({ before: x.vi, after: next.get(x.id)! })))
  for (const i of at) els[i]!.replaceWith(next.get(`b${i}`)!)
  return { html: root.toString(), score: r.score, notes: r.notes }
}

const fieldOf = (t: { sections?: Record<string, string>; body?: string; definition?: string }, field: string) =>
  field === 'body' ? t.body : field === 'definition' ? t.definition : t.sections?.[field.replace(/^sections\./, '')]

export type ReaderDeps = { llm: Llm; now: () => Date; model?: string }
/**
 * Reads up to `limit` pages (or the `only` ones, whatever their state), keeps their findings, and rewrites up to
 * `rewrites` parts of Vietnamese pages. Stops on a model failure (usage limit) with what it has saved.
 */
export async function readPages(root: string, pages: Page[], d: ReaderDeps, o: { limit: number; rewrites: number; only?: string[] }) {
  const stateFile = join(root, 'engine-state', '_reader.json')
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as ReaderState
  const save = () => writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  const names = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, { name: string }>
  const due = o.only ? pages.filter(p => o.only!.includes(pageKey(p))) : duePages(pages, state)
  const report = { read: [] as string[], findings: 0, rewritten: [] as string[], notKept: [] as string[], failed: [] as string[], stopped: '' }
  let rewrites = o.rewrites
  for (const p of due.slice(0, o.limit)) {
    const key = pageKey(p)
    const { text, parts, hash } = readerText(p)
    const sources = await sourcesText(root, p)
    const prompt = [
      RUBRIC.replaceAll('{{LANG}}', LANG_NAME[p.lang]), '',
      ...(p.lang === 'vi' ? ['--- HOW THE SITE WRITES VIETNAMESE ---', VI_STYLE, ''] : []),
      ...(sources ? ['--- SOURCES ---', sources, ''] : []),
      '--- PAGE ---', text.length > PAGE_CHARS ? `${text.slice(0, PAGE_CHARS)}\n… (the rest of the page is cut here)` : text,
    ].join('\n')
    let found: ReaderFinding[]
    try {
      found = (await d.llm<{ findings: ReaderFinding[] }>({ system: 'You are a careful reader checking an aquarium handbook page. Reply only with JSON.', prompt, schema: SCHEMA, ...(d.model ? { model: d.model } : {}) })).findings ?? []
    } catch (e) {
      if (e instanceof LlmError) { report.stopped = `${key}: ${e.message}`; break }
      report.failed.push(`${key}: ${(e as Error).message.slice(0, 200)}`)
      continue
    }
    const entry: ReaderEntry = { at: d.now().toISOString().slice(0, 10), hash, findings: keepFindings(found, text, parts), ...(state[key]?.rewrites ? { rewrites: state[key]!.rewrites } : {}) }
    state[key] = entry
    report.read.push(`${key} (${entry.findings.length})`)
    report.findings += entry.findings.length
    // Rewrites, part by part, while the cycle's allowance lasts.
    const byField = new Map<string, ReaderEntry['findings']>()
    for (const f of entry.findings.filter(f => canRewrite(p, f))) byField.set(f.field!, [...(byField.get(f.field!) ?? []), f])
    let now = p // the page as it is after this cycle's rewrites
    for (const [field, fs] of byField) {
      if (rewrites <= 0) break
      rewrites--
      const file = join(root, 'content', p.kind, p.id, 'vi.json')
      try {
        const t = JSON.parse(await readFile(file, 'utf8')) as { sections?: Record<string, string>; body?: string; definition?: string }
        const html = fieldOf(t, field)
        if (!html) continue
        const source = field.startsWith('sections.') ? field.split(':')[1] : p.origin?.source
        const r = await rewritePart(d.llm, html, fs, { en: p.en?.[field], source: source && names[source]?.name })
        if (!r) continue
        const kept = r.score >= QUALITY_THRESHOLD
        entry.rewrites = [...(entry.rewrites ?? []), { at: entry.at, field, score: r.score, kept, problems: fs.map(f => f.problem) }]
        if (!kept) { report.notKept.push(`${key} ${field} (${r.score.toFixed(2)}: ${r.notes.slice(0, 2).join('; ')})`); continue }
        if (field === 'body') t.body = r.html
        else if (field === 'definition') t.definition = r.html
        else t.sections![field.replace(/^sections\./, '')] = r.html
        // Fish, plant and breed pages are written in metric only, as by every other writer (metric.ts).
        const out = METRIC_KINDS.includes(p.kind) ? metricPage(t, 'vi') : t
        await writeFile(file, `${JSON.stringify(out, null, 2)}\n`)
        // What it fixed leaves the open list, and the page counts as read as it is now.
        entry.findings = entry.findings.filter(f => !fs.includes(f))
        now = { ...now, fields: now.fields.map(f => (f.field === field ? { ...f, html: fieldOf(out, field)! } : f)) }
        entry.hash = readerText(now).hash
        report.rewritten.push(`${key} ${field} (${r.score.toFixed(2)})`)
      } catch (e) {
        if (e instanceof LlmError) { report.stopped = `${key} ${field}: ${e.message}`; break }
        report.failed.push(`${key} ${field}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
    await save()
    if (report.stopped) break
  }
  await save()
  return { report, state }
}

const SITE = 'https://aquatome.com'
const md = (s: string) => s.replace(/([[\]|*_`<>\\])/g, '\\$1')
const KIND_TITLE: Record<ReaderFinding['kind'], string> = {
  structure: 'Structure that misleads', contradiction: 'The page contradicts itself', numbers: 'Wrong or mismatched numbers and units',
  language: 'Garbled or unnatural language', caption: 'Captions that don\'t fit', unsupported: 'Claims the sources don\'t support', other: 'Other',
}

/** docs/review/reader.md: the open findings on pages as they are now, by kind; those a rule could catch; the rewrites made. */
export function readerReport(pages: Page[], state: ReaderState): string {
  const current = pages.filter(p => state[pageKey(p)]?.hash === readerText(p).hash)
  const link = (p: Page) => `[${p.lang} · ${md(p.title)}](${SITE}${p.path})`
  const open = current.flatMap(p => state[pageKey(p)]!.findings.map(f => ({ p, f })))
  const sev = (s: string) => SEVERITIES.indexOf(s as ReaderFinding['severity'])
  const line = ({ p, f }: (typeof open)[number]) => `- ${link(p)} — ${f.severity}${f.field ? `, ${md(label(f.field))}` : ''}${f.quote ? ` — "${md(f.quote)}"` : ''}: ${md(f.problem)}${f.fix ? ` Suggested: "${md(f.fix)}"` : ''}`
  const byKind = FINDING_KINDS.map(k => {
    const xs = open.filter(x => x.f.kind === k).sort((a, b) => sev(a.f.severity) - sev(b.f.severity) || a.p.path.localeCompare(b.p.path))
    return xs.length ? `### ${KIND_TITLE[k]} (${xs.length})\n\n${xs.map(line).join('\n')}\n` : ''
  }).filter(Boolean)
  const rules = open.filter(x => x.f.rule)
  const byKey = new Map(pages.map(p => [pageKey(p), p]))
  const rewrites = Object.entries(state).flatMap(([k, e]) => (e.rewrites ?? []).map(r => ({ k, r }))).sort((a, b) => b.r.at.localeCompare(a.r.at) || a.k.localeCompare(b.k)).slice(0, 40)
  const per = (lang: Lang) => `${current.filter(p => p.lang === lang).length} of ${pages.filter(p => p.lang === lang).length}`
  return `# Reader's eye

Generated by \`pnpm engine reader\` every engine cycle (rewrite part; \`packages/engine/src/reader.ts\`, docs/governance.md).
The model reads a few pages a cycle as a careful reader would, against a rubric (\`src/prompts/reader.md\`): pages not read
yet first, then those whose text changed. Vietnamese wording it flags is rewritten and kept only when the reviewer passes
it; the rest is listed here. A page is read again only when its text changes.

Read as they are now: Vietnamese ${per('vi')}, Indonesian ${per('id')}, Thai ${per('th')}. Open findings: ${open.length} on
${new Set(open.map(x => x.p.path)).size} pages.

## Could become a rule (${rules.length})

Kinds of problem a check with no model could find on every page (add it to \`content-rules.ts\`).

${rules.map(({ p, f }) => `- ${md(f.rule!)} — ${link(p)}${f.quote ? `: "${md(f.quote)}"` : ''}`).join('\n') || '- none'}

## Open findings, by kind

${byKind.join('\n') || '- none\n'}
## Rewrites (latest ${rewrites.length})

${rewrites.map(({ k, r }) => { const p = byKey.get(k); return `- ${r.at} ${p ? link(p) : k} — ${md(label(r.field))}: ${r.kept ? 'kept' : 'not kept'} (review ${r.score.toFixed(2)}): ${md(r.problems.join('; '))}` }).join('\n') || '- none'}
`
}

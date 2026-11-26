import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GLOSSARY_HELD, toneKey } from '@aq/schema'
import { failureKind } from './call-failure'
import { type Llm, modelRan } from './claude'
import { glossaryLinkCheck, type Place, type PhraseReport } from './glossary-link-check'

/**
 * The link check's other half, a cheap read (the chief of staff, Sun 22 Nov 2026): for each phrase the site's linker links
 * to a glossary term, a sample of its linked places (SAMPLE, the flagged ones first) is read by a model, one call a
 * phrase, for whether the phrase there means the term. The page the chief of staff reads gives each phrase's share read as
 * another meaning, with three examples. The model decides nothing: it holds no phrase and links nothing, and a phrase goes
 * on the held list (glossary-held.ts in the schema) only by hand, on the chief of staff's word. It runs by hand
 * (`pnpm engine glossary-link-read`), never in the cycle, under its own line in the daily ceilings.
 */
export const SAMPLE = 30
export const READ_MODEL = 'sonnet'
export const EXAMPLES = 3

export type Says = 'term' | 'other' | 'unsure'
export type Term = { id: string; name: string; definition: string }
/** One phrase's read: how many of its places were read, how many as another meaning or unsure, and up to three of the others. */
export type PhraseRead = { term: string; phrase: string; links: number; flagged: number; sampled: number; sampledFlagged: number; read: number; other: number; unsure: number; examples: (Place & { means: string })[]; failed?: string }

// The same places every run, and for the chief: flagged first, then in the order of a hash of the phrase and the place.
const order = (phrase: string, p: Place) => createHash('sha256').update(`${toneKey(phrase)}\n${p.page}\n${p.around}`).digest('hex')

/** Up to `n` of a phrase's linked places: the flagged ones first, each group in its fixed order. */
export function sample(r: Pick<PhraseReport, 'phrase' | 'places'>, n = SAMPLE): Place[] {
  return r.places.map(p => ({ p, k: order(r.phrase, p) }))
    .sort((a, b) => Number(b.p.flagged) - Number(a.p.flagged) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .slice(0, n).map(x => x.p)
}

const SYSTEM = 'You judge whether a linked word on a Vietnamese fishkeeping page means a glossary term. Reply only with JSON.'

export function readPrompt(t: Term, phrase: string, places: Place[]): string {
  return [
    `THE TERM: ${t.name}. Its meaning: ${t.definition}`,
    `THE PHRASE: "${phrase}". The site links it to this term in each place below, where it stands in [brackets].`,
    'For each place, say what the phrase means there, from the words shown:',
    '- "term": the term as its meaning says;',
    '- "other": something else: the words there name another thing, or are used in another sense;',
    '- "unsure": the words shown don\'t tell.',
    'A word or a name next to the phrase doesn\'t by itself make it "other": a phrase that names a particular case of the term still means the term. Say "other" only when, there, it stops meaning the term.',
    'For "other", say in a few English words what it means there; leave "means" empty otherwise. Judge each place by itself.',
    '',
    'PLACES:',
    ...places.map((p, i) => `${i + 1}. …${p.around}…`),
  ].join('\n')
}

export const READ_SCHEMA = {
  type: 'object',
  properties: {
    reads: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, says: { type: 'string', enum: ['term', 'other', 'unsure'] }, means: { type: 'string' } },
        required: ['n', 'says', 'means'],
      },
    },
  },
  required: ['reads'],
}

/** One phrase read: its sample in one call. A place the answer leaves out, or numbers twice, is counted as not read. */
export async function readPhrase(llm: Llm, t: Term, r: PhraseReport, model = READ_MODEL): Promise<PhraseRead> {
  const places = sample(r)
  const base = { term: r.term, phrase: r.phrase, links: r.links, flagged: r.flagged.length, sampled: places.length, sampledFlagged: places.filter(p => p.flagged).length }
  let reads: { n: number; says: Says; means: string }[]
  const SHAPE = 'the answer is not a list of reads'
  try {
    const a = await llm<{ reads?: unknown }>({ system: SYSTEM, prompt: readPrompt(t, r.phrase, places), schema: READ_SCHEMA, model })
    // An answer not of the schema's shape leaves the phrase unread, as a failed call does, and the run goes on.
    const ok = (x: unknown): x is { n: number; says: Says; means: string } => typeof x === 'object' && x !== null && Number.isInteger((x as { n?: unknown }).n)
      && ['term', 'other', 'unsure'].includes((x as { says?: unknown }).says as string) && typeof (x as { means?: unknown }).means === 'string'
    if (!Array.isArray(a?.reads) || !a.reads.every(ok)) throw new Error(SHAPE)
    reads = a.reads
  } catch (e) {
    // A fixed word for what failed, never the command's own text, which can carry a path on this Mac (call-failure.ts).
    const m = (e as Error).message
    return { ...base, read: 0, other: 0, unsure: 0, examples: [], failed: m === SHAPE ? m : failureKind(m) }
  }
  const seen = new Map<number, number>()
  for (const x of reads) seen.set(x.n, (seen.get(x.n) ?? 0) + 1)
  // An "other" with no words on what it means there isn't counted: it would raise the share with nothing to show for it.
  const said = reads.filter(x => x.n >= 1 && x.n <= places.length && seen.get(x.n) === 1 && (x.says !== 'other' || x.means.trim()))
  const others = said.filter(x => x.says === 'other').sort((a, b) => a.n - b.n)
  return {
    ...base, read: said.length, other: others.length, unsure: said.filter(x => x.says === 'unsure').length,
    examples: others.slice(0, EXAMPLES).map(x => ({ ...places[x.n - 1]!, means: x.means.trim() })),
  }
}

async function readTerm(root: string, id: string): Promise<Term> {
  const v = JSON.parse(await readFile(join(root, 'content/glossary', id, 'vi.json'), 'utf8')) as { name: string; definition?: string }
  return { id, name: v.name, definition: v.definition ?? '' }
}

/** Every phrase that links, or the `limit` most flagged, read in that order. */
export async function linkRead(root: string, llm: Llm, o: { limit?: number; model?: string } = {}): Promise<PhraseRead[]> {
  if (o.limit !== undefined && !(Number.isInteger(o.limit) && o.limit >= 1)) throw new Error(`a limit is a whole number of phrases, 1 or more: ${o.limit}`)
  const { reports } = await glossaryLinkCheck(root, new Set(GLOSSARY_HELD.map(h => `${h.term}\n${toneKey(h.phrase)}`)))
  const out: PhraseRead[] = []
  const terms = new Map<string, Term>()
  for (const r of reports.filter(x => x.links).slice(0, o.limit ?? Infinity)) {
    const t = terms.get(r.term) ?? terms.set(r.term, await readTerm(root, r.term)).get(r.term)!
    out.push(await readPhrase(llm, t, r, o.model))
  }
  return out
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–')

/** The page the chief of staff reads: the phrases most read as another meaning first, each with its share and examples. */
export function linkReadText(reads: PhraseRead[], date: string, model: string): string {
  const read = reads.reduce((n, r) => n + r.read, 0), other = reads.reduce((n, r) => n + r.other, 0)
  const out = [
    `# The glossary's link phrases, read by a model, ${date}`, '',
    `${reads.length} phrases, ${read} linked places answered, ${other} read as another meaning; model ${model}. Each phrase's share is of a sample: up to ${SAMPLE} of its places, the flagged ones first, so a phrase with many flagged places shows the flagged ones' share, not all its places'.`,
    'The model holds nothing: a phrase is held (glossary-held.ts) only by hand, on the chief of staff\'s word.', '',
  ]
  const failed = reads.filter(r => r.failed)
  if (failed.length) out.push(`Not read (${failed.length}): ${failed.map(r => `"${r.phrase}" (${r.failed})`).join('; ')}.`, '')
  const share = (r: PhraseRead) => (r.read ? r.other / r.read : 0)
  for (const r of reads.filter(x => !x.failed).sort((a, b) => share(b) - share(a) || b.other - a.other || b.links - a.links)) {
    out.push(`## ${r.term}: "${r.phrase}", ${r.other} of ${r.read} answered read as another meaning (${pct(r.other, r.read)} of those answered)`)
    out.push(`${r.links} linked places, ${r.flagged} flagged; sampled ${r.sampled}, ${r.sampledFlagged} of them flagged; ${r.read} answered${r.unsure ? `, ${r.unsure} unsure` : ''}.`)
    for (const x of r.examples) out.push(`- ${x.page}${x.means ? ` (${x.means})` : ''} | …${x.around}…`)
    out.push('')
  }
  return `${out.join('\n')}\n`
}

export async function writeLinkRead(root: string, outDir: string, llm: Llm, date: string, o: { limit?: number; model?: string } = {}): Promise<{ reads: PhraseRead[]; file: string }> {
  const reads = await linkRead(root, llm, o)
  const file = join(outDir, 'glossary-link-read.md')
  await writeFile(file, linkReadText(reads, date, modelRan(o.model ?? READ_MODEL)))
  return { reads, file }
}

/**
 * Does every species and plant page use the name Vietnamese hobbyists and shops use? Two passes:
 * 1. Opus, no web, 25 pages a call: ok / wrong / unusual, with a suggested name.
 * 2. Every wrong or unusual at high or medium confidence is checked on the Vietnamese web (shops, forums; not
 *    marketplaces): the name sellers use, with the pages that show it.
 * Output: /tmp/aqaudit-names/proposals.json and report.md (never touches content/; `--apply` writes the confirmed renames:
 * name, slug, nameFixed, and the old address in redirectFrom).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/audit-names.ts [--apply]
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify } from '@aq/schema'
import { claudeCli, claudeResearch } from '../src/claude'
import { pickSlug } from '../src/merge'
import { cachedIn, pool, retry } from './eval-lib'

const OUT = '/tmp/aqaudit-names'
const CONTENT = join(import.meta.dirname, '../../../content')
type Page = { kind: 'species' | 'plants'; id: string; sci: string; family?: string; name: string; alt: string[]; slug: string }
type Screen = { id: string; verdict: 'ok' | 'wrong' | 'unusual'; confidence: 'high' | 'medium' | 'low'; suggest: string; note: string }
type Check = { name: string; keep: boolean; currentMeans: string; confidence: 'high' | 'medium' | 'low'; evidence: { url: string; quote: string }[]; note: string }

await mkdir(OUT, { recursive: true })
const cached = cachedIn(OUT)
const pages: Page[] = []
for (const kind of ['species', 'plants'] as const) {
  for (const id of (await readdir(join(CONTENT, kind))).sort()) {
    const e = JSON.parse(await readFile(join(CONTENT, kind, id, 'entity.json'), 'utf8')) as { scientificName: string; family?: string }
    const vi = JSON.parse(await readFile(join(CONTENT, kind, id, 'vi.json'), 'utf8')) as { name: string; altNames?: string[]; slug: string }
    pages.push({ kind, id, sci: e.scientificName, family: e.family, name: vi.name, alt: vi.altNames ?? [], slug: vi.slug })
  }
}

const SCREEN = {
  type: 'object', required: ['pages'],
  properties: { pages: { type: 'array', items: { type: 'object', required: ['id', 'verdict', 'confidence', 'suggest', 'note'], properties: {
    id: { type: 'string' }, verdict: { enum: ['ok', 'wrong', 'unusual'] }, confidence: { enum: ['high', 'medium', 'low'] }, suggest: { type: 'string' }, note: { type: 'string' },
  } } } },
}
const screenPrompt = (batch: Page[]) => `For each aquarium page below, is the page name what Vietnamese hobbyists and shops call this species?
Flag a name as "wrong" when Vietnamese hobbyists use it for a different fish or plant (for example cá hồng nhung is the serpae tetra, cá chuột means corydoras, cá rồng means arowana, cá hồng két is the blood parrot, la hán is the flowerhorn), or when it describes the species wrongly. Flag "unusual" for literal translations nobody uses, English left in the name, or typos. A plain "Cá <scientific name>" or a widely used trade name is fine when there is no established Vietnamese name.
suggest: the name to use (the current one when ok). note: one short sentence, in English.

${batch.map(p => `${p.id} | ${p.sci} | ${p.family ?? '-'} | page name: ${p.name} | other names: ${p.alt.slice(0, 4).join('; ') || '-'}`).join('\n')}`

const batches: Page[][] = []
for (let i = 0; i < pages.length; i += 25) batches.push(pages.slice(i, i + 25))
const screened = (await pool(batches.map((b, i) => () => cached(`screen-${i}-${slugify(b[0]!.id)}.json`, () => retry(() =>
  claudeCli<{ pages: Screen[] }>({ system: 'You run a Vietnamese aquarium shop and moderate a Vietnamese aquarium forum. Reply only with JSON.', prompt: screenPrompt(b), schema: SCREEN, model: 'opus' }))))))
  .flatMap(r => r.pages)
const flagged = screened.filter(s => s.verdict !== 'ok' && s.confidence !== 'low' && pages.some(p => p.id === s.id))

const CHECK = {
  type: 'object', required: ['name', 'keep', 'currentMeans', 'confidence', 'evidence', 'note'],
  properties: {
    name: { type: 'string' }, keep: { type: 'boolean' }, currentMeans: { type: 'string' }, confidence: { enum: ['high', 'medium', 'low'] }, note: { type: 'string' },
    evidence: { type: 'array', items: { type: 'object', required: ['url', 'quote'], properties: { url: { type: 'string' }, quote: { type: 'string' } } } },
  },
}
const checked = await pool(flagged.map(s => () => {
  const p = pages.find(x => x.id === s.id)!
  return cached(`check-${p.id}.json`, () => retry(() => claudeResearch<Check>({
    system: 'You check Vietnamese names of aquarium fish and plants against what Vietnamese sellers and hobbyists actually write. Reply only with JSON.',
    prompt: `Species: ${p.sci}${p.family ? ` (${p.family})` : ''}. Our page calls it "${p.name}". A reviewer suggested "${s.suggest}" (${s.note}).
Search Vietnamese aquarium shop sites, hobby forums, blogs and Facebook group posts (not Shopee, Lazada or Tiki) for the scientific name and both names. Which Vietnamese name do sellers and hobbyists use for THIS species? Does "${p.name}" mean a different fish or plant in Vietnam?
name: the page name to use, written like "Cá ..." for fish (keep our name if it is right). keep: true when our name is fine. currentMeans: what our name refers to in Vietnam, or "" if nothing else. evidence: up to 3 Vietnamese pages that use the name you chose for this species, each with a short quote. confidence: how sure, given the evidence.`,
    schema: CHECK, model: 'opus',
  })))
}), 3)

const proposals = flagged.map((s, i) => ({ ...pages.find(p => p.id === s.id)!, screen: s, check: checked[i]! }))
const confirmed = proposals.filter(x => !x.check.keep && x.check.name.trim() && x.check.name.trim() !== x.name && x.check.confidence !== 'low' && x.check.evidence.length > 0)
await writeFile(join(OUT, 'proposals.json'), `${JSON.stringify({ screened: screened.length, flagged: flagged.length, confirmed: confirmed.map(c => ({ id: c.id, from: c.name, to: c.check.name.trim() })), proposals }, null, 1)}\n`)
const row = (x: (typeof proposals)[number]) => `| ${x.id} | ${x.name} | ${x.check.keep ? 'keep' : x.check.name} | ${x.check.confidence} | ${x.check.currentMeans || '-'} | ${x.check.evidence.map(e => `[↗](${e.url})`).join(' ') || '-'} | ${x.check.note.replace(/\|/g, '/')} |`
await writeFile(join(OUT, 'report.md'), `# Vietnamese name audit (${new Date().toISOString().slice(0, 10)})

${pages.length} pages screened by Opus; ${flagged.length} flagged at high/medium confidence and checked on the Vietnamese web; ${confirmed.length} renamed (web evidence, not low confidence).

| page | name | web says | confidence | our name means | evidence | note |
|---|---|---|---|---|---|---|
${proposals.map(row).join('\n')}
`)
console.log(`screened ${screened.length}, flagged ${flagged.length}, confirmed ${confirmed.length}`)

if (process.argv.includes('--apply')) {
  const taken = new Set(pages.map(p => p.slug))
  for (const c of confirmed) {
    const file = join(CONTENT, c.kind, c.id, 'vi.json')
    const vi = JSON.parse(await readFile(file, 'utf8')) as { name: string; slug: string; nameFixed?: boolean; redirectFrom?: { slug: string; name: string }[] }
    const name = c.check.name.trim()
    taken.delete(vi.slug)
    const slug = pickSlug(name.split(' (')[0]!, c.sci, taken)
    taken.add(slug)
    const redirectFrom = slug === vi.slug ? vi.redirectFrom : [...(vi.redirectFrom ?? []), { slug: vi.slug, name: vi.name }]
    await writeFile(file, `${JSON.stringify({ ...vi, name, slug, nameFixed: true, ...(redirectFrom ? { redirectFrom } : {}) }, null, 1)}\n`)
    console.log(`${c.id}: ${vi.name} → ${name} (/${slug}/)`)
  }
}

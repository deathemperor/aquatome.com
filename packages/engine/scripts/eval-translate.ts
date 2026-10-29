/**
 * Which way of translating pages reads most like a Vietnamese hobbyist wrote them? A sample of species, plant, guide and
 * glossary pages: the Vietnamese on the site now (A) against fresh translations from the English with the style guide on
 * Sonnet (B) and Opus (C), and Opus fixing the current Vietnamese against the English (D). Blind pairwise judge (Opus,
 * both orders) on naturalness; accuracy from the usual translation reviewer. Output: /tmp/aqeval-tr/report.md.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/eval-translate.ts
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claudeCli } from '../src/claude'
import { reviewRewrite, reviewTranslation } from '../src/quality'
import { rewriteVi, type Part, type RewriteOpts } from '../src/vi-rewrite'
import { cachedIn, mean, pairs, pool, retry, tally, verdictSchema, type Verdict } from './eval-lib'

const OUT = '/tmp/aqeval-tr'
const CONTENT = join(import.meta.dirname, '../../../content')
const VARIANTS: Record<string, RewriteOpts | null> = { A: null, B: { mode: 'fresh', model: 'sonnet' }, C: { mode: 'fresh', model: 'opus' }, D: { mode: 'fix', model: 'opus' } }
const BUDGET = 6000 // English characters per sample page: enough to judge the voice, cheap enough to run
const JUDGE = `You are a native Vietnamese editor for a Vietnamese aquarium-hobby site. Two Vietnamese versions (X and Y) of the same page are below.
Judge ONLY how natural and human the Vietnamese reads: would a Vietnamese hobbyist believe a fellow hobbyist wrote it, or does it read like machine writing or translation?
Ignore formatting and small differences in coverage.

Tells of machine or translated Vietnamese: note-style clauses without subjects joined by semicolons; "liên quan" for causes; calques of English ("nên đừng…", "điều này giúp…", "đóng vai trò", "một cách + adj", "việc + verb" as subject, needless "được" passives, "được xem là", "tuyệt đối không được"); stock phrases ("yếu tố then chốt", "không chỉ… mà còn"); every sentence the same length and shape; hobby terms Vietnamese players don't use.

Return: better ("X", "Y" or "tie"), naturalX and naturalY (1–10), worstX and worstY (the 3 least natural sentences of each, quoted exactly), why (one sentence).`

const json = async (f: string) => JSON.parse(await readFile(f, 'utf8'))
const text = (html: string) => html.replace(/<\/(p|li|h3|tr)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n{2,}/g, '\n').trim()
const within = <T extends { en?: string }>(xs: T[]) => { let n = 0; return xs.filter(x => (n += x.en?.length ?? 0) - (x.en?.length ?? 0) < BUDGET) }

/** Sample pages: species from each big source, a plant, guides from three sources, a glossary term. */
async function sample(): Promise<{ id: string; parts: Part[] }[]> {
  const out: { id: string; parts: Part[] }[] = []
  const sectioned = async (dir: string, slug: string) => {
    const e = await json(join(CONTENT, dir, slug, 'entity.json')); const vi = await json(join(CONTENT, dir, slug, 'vi.json'))
    return within((e.sections as { key: string; source: string; html: string }[]).filter(s => s.key !== 'references').map(s => ({ id: `${s.key}:${s.source}`, en: s.html, vi: vi.sections[`${s.key}:${s.source}`] as string })).filter(p => p.vi))
  }
  for (const src of ['seriouslyfish', 'bwaquatics', 'glaser']) {
    for (const slug of (await readdir(join(CONTENT, 'species'))).sort()) {
      const e = await json(join(CONTENT, 'species', slug, 'entity.json'))
      if (e.sections.length >= 3 && e.sections.every((s: { source: string }) => s.source === src)) { out.push({ id: `species/${slug}`, parts: await sectioned('species', slug) }); break }
    }
  }
  const plant = (await readdir(join(CONTENT, 'plants'))).sort()[0]!
  out.push({ id: `plants/${plant}`, parts: await sectioned('plants', plant) })
  // Guides keep no English (only the Vietnamese is stored), so they get the Vietnamese-only rewrite.
  for (const src of ['aquariumcoop', 'sprucepets']) {
    for (const slug of (await readdir(join(CONTENT, 'guides'))).sort()) {
      const e = await json(join(CONTENT, 'guides', slug, 'entity.json'))
      const body = e.source === src ? (await json(join(CONTENT, 'guides', slug, 'vi.json'))).body as string : ''
      if (body.length < 3000 || body.length > BUDGET * 1.3) continue
      out.push({ id: `guides/${slug}`, parts: [{ id: 'body', vi: body }] }); break
    }
  }
  for (const slug of ['chu-trinh-nito', 'amoniac']) {
    const vi = await json(join(CONTENT, 'glossary', slug, 'vi.json')).catch(() => null)
    if (vi?.definition) { out.push({ id: `glossary/${slug}`, parts: [{ id: 'definition', vi: vi.definition }] }); break }
  }
  return out
}

await mkdir(OUT, { recursive: true })
const cached = cachedIn(OUT)
const pages = await sample()
console.log(`sample: ${pages.map(p => `${p.id} (${p.parts.length})`).join(', ')}`)
const names = Object.keys(VARIANTS)
const versions = new Map<string, Part[]>()
const accuracy = new Map<string, number>()
const key = (id: string) => id.replace(/\//g, '_')
await pool(pages.flatMap(p => names.map(n => async () => {
  const o = VARIANTS[n]
  const vi = o ? await cached(`gen-${key(p.id)}-${n}.json`, async () => Object.fromEntries(await retry(() => rewriteVi(claudeCli, p.parts, o)))) : Object.fromEntries(p.parts.map(x => [x.id, x.vi]))
  const v = p.parts.map(x => ({ ...x, vi: vi[x.id]! }))
  versions.set(`${p.id}/${n}`, v)
  // Against the English when there is one, else against the Vietnamese it rewrote (A is the baseline there).
  const withEn = v.filter(x => x.en)
  if (withEn.length) accuracy.set(`${p.id}/${n}`, (await cached(`acc-${key(p.id)}-${n}.json`, () => retry(() => reviewTranslation(claudeCli, withEn.map(x => ({ en: x.en!, vi: x.vi })))))).score)
  else if (o) accuracy.set(`${p.id}/${n}`, (await cached(`same-${key(p.id)}-${n}.json`, () => retry(() => reviewRewrite(claudeCli, v.map((x, i) => ({ before: p.parts[i]!.vi, after: x.vi })))))).score)
  console.log(`ready ${p.id} ${n}`)
})))

const rows: { x: string; y: string; v: Verdict }[] = []
await pool(pages.flatMap(p => pairs(names).map(([x, y]) => async () => {
  const show = (n: string) => versions.get(`${p.id}/${n}`)!.map(s => text(s.vi)).join('\n\n')
  const v = await cached(`judge-${key(p.id)}-${x}-${y}.json`, () => retry(() => claudeCli<Verdict>({
    system: 'You judge Vietnamese prose. Reply only with JSON.', model: 'opus', schema: verdictSchema(true),
    prompt: `${JUDGE}\n\n=== X ===\n${show(x)}\n\n=== Y ===\n${show(y)}`,
  })))
  rows.push({ x, y, v })
  console.log(`judged ${p.id} ${x} vs ${y}: ${v.better}`)
})))

const stat = tally(names, rows)
const hasEn = (p: { parts: Part[] }) => p.parts.some(x => x.en)
const acc = (n: string, en: boolean) => mean(pages.filter(p => hasEn(p) === en).flatMap(p => accuracy.get(`${p.id}/${n}`) ?? []))
const lines = [
  '# Translation eval', '', `Pages: ${pages.map(p => p.id).join(', ')}. Judge: opus, pairwise, both orders.`, '',
  '| variant | setup | wins | losses | ties | naturalness (1–10) | accuracy vs English | meaning kept (no English) |', '|---|---|---|---|---|---|---|---|',
  ...names.map(n => `| ${n} | ${VARIANTS[n] ? JSON.stringify(VARIANTS[n]) : 'on the site now'} | ${stat[n]!.wins} | ${stat[n]!.losses} | ${stat[n]!.ties} | ${mean(stat[n]!.natural)} | ${acc(n, true)} | ${VARIANTS[n] ? acc(n, false) : '(baseline)'} |`),
  '', ...names.flatMap(n => [`## ${n}: sentences the judge flagged`, ...[...new Set(stat[n]!.worst)].slice(0, 10).map(s => `- ${s}`), '']),
]
await writeFile(join(OUT, 'report.md'), lines.join('\n'))
console.log(lines.slice(0, 10).join('\n'))

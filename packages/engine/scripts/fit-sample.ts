/**
 * The checker's accuracy (src/fit.ts): a random sample of served pages, stratified so each kind of page is in it, written
 * out as files outside the repository for independent readers, and read here by a model against the same checklist.
 *
 *   tsx scripts/fit-sample.ts pick                  → <dir>/sample.json, <dir>/pages/<n>.txt, <dir>/rules.json
 *   CLAUDE_CODE_OAUTH_TOKENS=… tsx scripts/fit-sample.ts read <model> [--jobs N]   → <dir>/read-<model>.json
 *
 * The seed is fixed, so the sample can be checked. A reader's answers are its own file: none sees another's.
 */
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeCli } from '../src/claude'
import { fitKey, fitOrder, fitPrompt, fitRules, fitText, readFit, type FitState } from '../src/fit'
import { loadPages, type Page } from '../src/pages'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string' }, jobs: { type: 'string' }, seed: { type: 'string' } } })
const DIR = values.dir ?? join(homedir(), '.cache/aquatome/fit/sample')
const CONTENT = join(import.meta.dirname, '../../../content')
const SEED = values.seed ?? 'fit-2026-11-08'

const stratum = (p: Page) => {
  if (p.kind === 'guides') return `${p.lang}/guides/${p.lang !== 'vi' ? 'all' : p.origin?.source === 'youtube' ? 'video' : p.origin?.source === 'aquatome' ? 'topic' : 'translated'}`
  if (p.kind === 'plants' || p.kind === 'breeds') return `${p.lang}/plants+breeds`
  return p.kind === 'species' ? `${p.lang}/species` : undefined
}
const SIZES: Record<string, number> = {
  'vi/guides/translated': 30, 'vi/guides/video': 30, 'vi/guides/topic': 10, 'vi/species': 30, 'vi/plants+breeds': 10,
  'id/guides/all': 12, 'id/species': 15, 'id/plants+breeds': 3, 'th/guides/all': 12, 'th/species': 15, 'th/plants+breeds': 3,
}

const pages = await loadPages(CONTENT)
const [cmd, model] = positionals
if (cmd === 'pick') {
  await mkdir(join(DIR, 'pages'), { recursive: true })
  const strata = new Map<string, Page[]>()
  for (const p of pages) { const s = stratum(p); if (s) strata.set(s, [...(strata.get(s) ?? []), p]) }
  const sample = Object.entries(SIZES).flatMap(([s, n]) => fitOrder(strata.get(s) ?? [], SEED).slice(0, n).map(p => ({ key: fitKey(p), stratum: s, of: strata.get(s)!.length, lang: p.lang, hash: fitText(p).hash })))
  const shuffled = sample.map(x => [createHash('sha1').update(`${SEED}:${x.key}`).digest('hex'), x] as const).sort((a, b) => a[0].localeCompare(b[0])).map(([, x], n) => ({ n: n + 1, ...x }))
  const byKey = new Map(pages.map(p => [fitKey(p), p]))
  for (const x of shuffled) await writeFile(join(DIR, 'pages', `${x.n}.txt`), `COUNTRY AND LANGUAGE: ${x.lang}\n\n${fitText(byKey.get(x.key)!).text}\n`)
  for (const lang of new Set(shuffled.map(x => x.lang))) await writeFile(join(DIR, `checklist-${lang}.md`), fitPrompt(lang))
  await writeFile(join(DIR, 'sample.json'), `${JSON.stringify(shuffled, null, 1)}\n`)
  await writeFile(join(DIR, 'rules.json'), `${JSON.stringify(Object.fromEntries(shuffled.map(x => [x.n, fitRules(byKey.get(x.key)!)])), null, 1)}\n`)
  console.log(`${shuffled.length} pages in ${DIR}`)
} else if (cmd === 'read' && model) {
  const sample: { n: number; key: string }[] = JSON.parse(await readFile(join(DIR, 'sample.json'), 'utf8'))
  const file = join(DIR, `read-${model}.json`)
  const state: FitState = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'))
  const byKey = new Map(pages.map(p => [fitKey(p), p]))
  process.env.ENGINE_COST_LOG = join(DIR, `cost-${model}.jsonl`)
  const due = sample.filter(x => !state[x.key])
  let next = 0, failed = 0
  await Promise.all(Array.from({ length: Number(values.jobs ?? 3) }, async () => {
    while (next < due.length) {
      const x = due[next++]!
      try {
        state[x.key] = await readFit(claudeCli, byKey.get(x.key)!, model, new Date())
        await writeFile(file, `${JSON.stringify(state, null, 1)}\n`)
      } catch (e) { failed++; await appendFile(join(DIR, `errors-${model}.log`), `${x.key}: ${(e as Error).message.slice(0, 300)}\n`) }
    }
  }))
  console.log(`${model}: ${Object.keys(state).length} of ${sample.length} read, ${failed} failed`)
} else throw new Error('usage: fit-sample.ts pick | read <model> [--jobs N]')

/**
 * Guides as the writer (src/for-reader.ts) writes them, into a scratch content root, with nothing edited by hand: one run
 * each, and content/ is left alone. The fixed-text lock is bypassed here; it holds in the cycle.
 *
 *   CLAUDE_CODE_OAUTH_TOKENS=… tsx scripts/guide-sample.ts --out <dir> <guide id>…
 *
 * <dir>/<id>.json has what came out, its facts, the market table the writer saw and its checks; <dir>/cost.jsonl the calls.
 */
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeCli } from '../src/claude'
import { rewriteForReader } from '../src/for-reader'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, 'write-model': { type: 'string' } } })
if (!values.out || !positionals.length) throw new Error('usage: guide-sample.ts --out <dir> <guide id>…')
const REPO = resolve(import.meta.dirname, '../../..')
const out = resolve(values.out)
if (out.startsWith(REPO)) throw new Error(`--out must be outside the repository: ${out}`)
await mkdir(join(out, 'content/guides'), { recursive: true })
await rm(join(out, 'sources'), { force: true })
await symlink(join(REPO, 'sources'), join(out, 'sources'))
process.env.ENGINE_COST_LOG = join(out, 'cost.jsonl')
for (const id of positionals) {
  await rm(join(out, 'content/guides', id), { recursive: true, force: true })
  await cp(join(REPO, 'content/guides', id), join(out, 'content/guides', id), { recursive: true })
  const started = Date.now()
  const r = await rewriteForReader(out, id, { llm: claudeCli }, { force: true, ...(values['write-model'] ? { writeModel: values['write-model'] } : {}) })
  await writeFile(join(out, `${id}.json`), `${JSON.stringify(r, null, 1)}\n`)
  console.log(`${id}: ${'skipped' in r ? `skipped: ${r.skipped}` : `kept ${r.kept}, score ${r.score}, tries ${r.tries}, notes ${r.notes.length}, findings ${r.findings.length}`} (${Math.round((Date.now() - started) / 1000)} s)`)
}

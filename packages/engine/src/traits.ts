import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loadAll, TraitsSchema, type Traits } from '@aq/schema'
import type { Llm } from './claude'
import { profile } from './summaries'

const TEMPLATE = readFileSync(new URL('./prompts/traits.md', import.meta.url), 'utf8')
const Output = TraitsSchema.pick({ temperament: true, finNipper: true, schoolMin: true })
const SCHEMA = (() => {
  const s = z.toJSONSchema(Output, { target: 'draft-07' }) as Record<string, unknown>
  delete s.$schema
  return s
})()
const dir = (contentRoot: string) => join(contentRoot, 'traits')

export async function readTraits(contentRoot: string): Promise<Traits[]> {
  const files = await readdir(dir(contentRoot)).catch(() => [] as string[])
  return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => TraitsSchema.parse(JSON.parse(await readFile(join(dir(contentRoot), f), 'utf8')))))
}

/** Extract traits for published species that have none or whose page changed; at most `limit` per call. */
export async function extractTraits(contentRoot: string, llm: Llm, opts: { limit: number; now: () => Date; publicBuild?: boolean }): Promise<{ done: string[]; failed: string[] }> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild: opts.publicBuild ?? true })
  const have = new Map((await readTraits(contentRoot)).map(t => [t.id, t]))
  const todo = c.species.filter(s => have.get(s.id)?.speciesUpdatedAt !== s.updatedAt).slice(0, opts.limit)
  await mkdir(dir(contentRoot), { recursive: true })
  const done: string[] = []
  const failed: string[] = []
  for (const s of todo) {
    const out = Output.safeParse(await llm({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${profile(s)}`, schema: SCHEMA }).catch(() => null))
    if (!out.success) { failed.push(s.id); continue }
    const t: Traits = { id: s.id, ...out.data, speciesUpdatedAt: s.updatedAt, generatedAt: opts.now().toISOString() }
    await writeFile(join(dir(contentRoot), `${s.id}.json`), `${JSON.stringify(t, null, 2)}\n`)
    done.push(s.id)
  }
  return { done, failed }
}

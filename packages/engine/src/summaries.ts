import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loadAll, SummarySchema, type Localized, type SpeciesEntity, type Summary } from '@aq/schema'
import type { Llm } from './claude'

const TEMPLATE = readFileSync(new URL('./prompts/summary.md', import.meta.url), 'utf8')
const Output = z.object({ summary: z.string().min(20), mistakes: z.array(z.string().min(10)).max(3) })
const SCHEMA = (() => {
  const s = z.toJSONSchema(Output, { target: 'draft-07' }) as Record<string, unknown>
  delete s.$schema
  return s
})()

const dir = (contentRoot: string) => join(contentRoot, 'summaries')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export async function readSummaries(contentRoot: string): Promise<Summary[]> {
  const files = await readdir(dir(contentRoot)).catch(() => [] as string[])
  return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => SummarySchema.parse(JSON.parse(await readFile(join(dir(contentRoot), f), 'utf8')))))
}
const save = async (contentRoot: string, s: Summary) => {
  await mkdir(dir(contentRoot), { recursive: true })
  await writeFile(join(dir(contentRoot), `${s.id}.json`), `${JSON.stringify(s, null, 2)}\n`)
}

function profile(s: Localized<SpeciesEntity>): string {
  const sections = Object.entries(s.t.sections).map(([k, html]) => `## ${k.split(':')[0]}\n${text(html)}`).join('\n\n')
  return `# ${s.t.name} (${s.scientificName})\n\n${sections}`.slice(0, 24_000)
}

/** Draft summaries for the best indexable species that have none (or whose page changed since). Returns the drafted ids. */
export async function draftSummaries(contentRoot: string, llm: Llm, opts: { top: number; now: () => Date; publicBuild?: boolean }): Promise<string[]> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild: opts.publicBuild ?? true })
  const have = new Map((await readSummaries(contentRoot)).map(s => [s.id, s]))
  const todo = c.species
    .filter(s => s.t.quality.indexable && have.get(s.id)?.speciesUpdatedAt !== s.updatedAt)
    .sort((a, b) => b.t.quality.score - a.t.quality.score)
    .slice(0, opts.top)
  const drafted: string[] = []
  for (const s of todo) {
    const out = Output.safeParse(await llm({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${profile(s)}`, schema: SCHEMA }).catch(() => null))
    if (!out.success) { console.warn(`summary skipped: ${s.id}`); continue }
    await save(contentRoot, { id: s.id, review: 'pending', ...out.data, speciesUpdatedAt: s.updatedAt, generatedAt: opts.now().toISOString() })
    drafted.push(s.id)
  }
  return drafted
}

/** Markdown for the owner: every pending summary with its species name, to approve or correct in chat. */
export async function reviewDoc(contentRoot: string, publicBuild = true): Promise<string> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild })
  const name = new Map(c.species.map(s => [s.id, `${s.t.name} (${s.scientificName})`]))
  const pending = (await readSummaries(contentRoot)).filter(s => s.review === 'pending').sort((a, b) => a.id.localeCompare(b.id))
  return [`# Tóm tắt chờ duyệt (${pending.length})`, '', 'Duyệt: `pnpm engine summaries approve <id,id|all>`. Sửa: chỉnh `content/summaries/<id>.json` rồi duyệt.', '',
    ...pending.flatMap(s => [`## ${name.get(s.id) ?? s.id}`, `id: \`${s.id}\``, '', s.summary, '', ...s.mistakes.map(m => `- ${m}`), ''])].join('\n')
}

export async function approveSummaries(contentRoot: string, ids: string[] | 'all'): Promise<string[]> {
  const done: string[] = []
  for (const s of await readSummaries(contentRoot)) {
    if (s.review === 'pending' && (ids === 'all' || ids.includes(s.id))) { await save(contentRoot, { ...s, review: 'approved' }); done.push(s.id) }
  }
  return done
}

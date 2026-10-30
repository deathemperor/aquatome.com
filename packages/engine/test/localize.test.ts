import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { localizeSpecies } from '../src/localize'

/** The fixture site, its sources allowed to be translated except `deny`. */
async function site(deny: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'loc-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(root, 'content'), { recursive: true })
  const file = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(file, 'utf8')) as Record<string, object>
  for (const k of Object.keys(sources)) sources[k] = { ...sources[k], permission: { date: '2026-10-31', file: 'test', scope: deny.includes(k) ? ['text'] : ['text', 'translation'] } }
  await writeFile(file, JSON.stringify(sources))
  return root
}
const now = () => new Date('2026-10-31T00:00:00Z')

test('every English part translated; local name; Thai addressed by scientific name; low score retried once', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { scientificName: string; sections: { key: string; source: string; html: string }[] }
  const calls: string[] = []
  let reviews = 0
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    calls.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: ++reviews === 1 ? 0.6 : 0.9, notes: ['fix "x"'] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'ปลาทดสอบ', altNames: ['Test fish', 'ปลาทดสอบ'], nameConfidence: 'medium', parts: ids.map(i => ({ id: i, text: `<p>แปล ${i}</p>` })) } as T
  }
  const r = await localizeSpecies(root, llm, 'th', [id], { now })
  expect(r.done).toHaveLength(1)
  expect(calls.filter(c => c.includes('Thai') && c.includes('--- PARTS ---'))).toHaveLength(2) // first try + retry
  expect(calls[2]).toContain('fix "x"')
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8'))
  expect(t.slug).toBe(e.scientificName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
  expect(t.name).toBe('ปลาทดสอบ')
  expect(t.altNames).toEqual(['Test fish'])
  expect(Object.keys(t.sections).sort()).toEqual(e.sections.filter(s => s.html.trim()).map(s => `${s.key}:${s.source}`).sort())
  expect(t.quality).toMatchObject({ score: 0.9, indexable: true })
  // English changed since (state says it was made from an older one): made again.
  const stateFile = join(root, 'engine-state/localize-th.json')
  const st = JSON.parse(await readFile(stateFile, 'utf8'))
  await writeFile(stateFile, JSON.stringify({ ...st, [id]: { ...st[id], from: '2000-01-01' } }))
  expect((await localizeSpecies(root, llm, 'th', [id], { now })).done).toHaveLength(1)
  // Done once: skipped next time; a redo keeps the address.
  expect((await localizeSpecies(root, llm, 'th', [id], { now })).skipped).toEqual([id])
  await writeFile(join(root, 'content/species', id, 'th.json'), JSON.stringify({ ...t, slug: 'kept-address' }))
  await localizeSpecies(root, llm, 'th', [id], { now, redo: true })
  expect(JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8')).slug).toBe('kept-address')
})

test('a part the model leaves out fails that page; nothing written', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const llm = async <T,>() => ({ name: 'Ikan Uji', altNames: [], nameConfidence: 'low', parts: [] }) as T
  const r = await localizeSpecies(root, llm, 'id', [id], { now })
  expect(r.failed[0]).toMatch(/left out part/)
  await expect(readFile(join(root, 'content/species', id, 'id.json'), 'utf8')).rejects.toThrow()
})

test('text from a source that does not allow translation is never sent or written', async () => {
  const root = await site(['seriouslyfish'])
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Ikan Uji', altNames: [], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: '<p>x</p>' })) } as T
  }
  await localizeSpecies(root, llm, 'id', [id], { now })
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'id.json'), 'utf8').catch(() => '{"sections":{}}'))
  expect(Object.keys(t.sections).some(k => k.endsWith(':seriouslyfish'))).toBe(false)
  expect(e.sections.some(s => s.source === 'seriouslyfish')).toBe(true) // the fixture page does have such text
})

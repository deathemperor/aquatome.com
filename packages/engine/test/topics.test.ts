import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { makeTopic, type TopicFacts } from '../src/topics'

const facts: TopicFacts = {
  found: true,
  facts: [
    { section: 'signs', fact: 'One or both eyes bulge out', source: 0 },
    { section: 'treatment', fact: 'Epsom salt 1 tablespoon per 5 gallons', source: 1 },
    { section: 'causes', fact: 'Poor water quality', source: 2 }, // its source is not a web page: dropped with it
  ],
  species: ['Carassius auratus', 'Betta splendens (Siamese fighting fish)', 'Nothing here'],
  sources: [{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS', kind: 'university' }, { url: 'https://example.org/epsom', title: 'Epsom', kind: 'article' }, { url: 'a book', title: 'Book', kind: 'other' }],
}

async function site() {
  const r = await mkdtemp(join(tmpdir(), 'aq-topic-'))
  for (const [id, sci] of [['carassius-auratus', 'Carassius auratus'], ['betta-splendens', 'Betta splendens']] as const) {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: sci }))
  }
  await mkdir(join(r, 'content/guides/other'), { recursive: true })
  await writeFile(join(r, 'content/guides/other/vi.json'), JSON.stringify({ slug: 'ca-bi-loi-mat' })) // the address is taken
  return r
}

test('makeTopic: cited facts → Vietnamese guide checked against them, rewritten once on notes; refs, mentions, own source', async () => {
  const root = await site()
  const prompts: string[] = []
  let checks = 0
  const research: Llm = async () => facts as never
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return (++checks === 1 ? { score: 0.7, notes: ['"3 ngày" is not in the facts'] } : { score: 0.92, notes: [] }) as never
    return { name: 'Cá bị lồi mắt: nguyên nhân và cách chữa', summary: ['Mắt cá lồi ra.'], body: '<h3>Dấu hiệu</h3><p>Mắt lồi.</p><script>x</script>', faq: [{ q: 'Có lây không?', a: 'Không rõ.' }, { q: ' ', a: 'x' }] } as never
  }
  const r = await makeTopic(root, { research, llm }, { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' }, { now: () => new Date('2026-10-31T00:00:00Z') })
  expect(r).toMatchObject({ id: 'aquatome-ca-bi-loi-mat-popeye', score: 0.92, refs: 2 })
  // The writer saw only cited facts, renumbered; the rewrite carried the checker's note.
  expect(prompts[0]).toContain('Epsom salt 1 tablespoon per 5 gallons')
  expect(prompts[0]).not.toContain('Poor water quality')
  expect(prompts[2]).toContain('"3 ngày" is not in the facts')
  const e = JSON.parse(await readFile(join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/entity.json'), 'utf8'))
  expect(e).toMatchObject({ kind: 'disease', source: 'aquatome', html: '', photos: [], mentions: ['carassius-auratus', 'betta-splendens'], updatedAt: '2026-10-31' })
  expect(e.refs).toEqual([{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }, { url: 'https://example.org/epsom', title: 'Epsom' }])
  const vi = JSON.parse(await readFile(join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/vi.json'), 'utf8'))
  expect(vi.slug).toBe('ca-bi-loi-mat-huong-dan')
  expect(vi.body).not.toContain('<script')
  expect(vi.faq).toHaveLength(1)
  expect(vi.quality).toEqual({ score: 0.92, indexable: true })
  expect(e.sourceUrl).toBe('https://aquatome.com/vi/huong-dan/ca-bi-loi-mat-huong-dan/')
})

test('nothing reliable found: nothing written', async () => {
  const root = await site()
  const r = await makeTopic(root, { research: async () => ({ ...facts, found: false }) as never, llm: async () => { throw new Error('no') } }, { topic: 'x', kind: 'care' })
  expect(r).toMatchObject({ skipped: expect.stringContaining('nothing reliable') })
})

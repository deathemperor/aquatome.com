import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { localizeTopic, makeTopic, type TopicFacts } from '../src/topics'

const facts: TopicFacts = {
  found: true,
  facts: [
    { section: 'signs', fact: 'One or both eyes bulge out', source: 0 },
    { section: 'treatment', fact: 'Epsom salt 1 tablespoon per 5 gallons', source: 1 },
    { section: 'causes', fact: 'Poor water quality', source: 2 }, // its source is not a web page: dropped with it
    { section: 'what', fact: 'Popeye is a symptom, not a disease', source: 3 }, // a page listed twice: cites its first listing
  ],
  species: ['Carassius auratus', 'Betta splendens (Siamese fighting fish)', 'Nothing here'],
  sources: [{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS', kind: 'university' }, { url: 'https://example.org/epsom', title: 'Epsom', kind: 'article' }, { url: 'a book', title: 'Book', kind: 'other' }, { url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS (search summary)', kind: 'university' }],
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
  expect(prompts[0]).toMatch(/"Popeye is a symptom, not a disease",\s*"source": 0/)
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

test('localizeTopic: from the same facts, minus Vietnam-only ones; cites only the sources those facts use; Thai slug in English', async () => {
  const root = await site()
  const withVn: TopicFacts = { ...facts, facts: [...facts.facts, { section: 'vietnam', fact: 'Vietnamese shops sell it as "thuốc lồi mắt"', source: 1 }] }
  const llm0: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.9, notes: [] } : { name: 'Cá bị lồi mắt', summary: ['x'], body: '<p>x</p>', faq: [] }) as never
  const r0 = await makeTopic(root, { research: async () => withVn as never, llm: llm0 }, { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' })
  // Only the Vietnam fact cited the second source here: drop the Epsom fact to see that source go.
  const file = join(root, 'engine-state/topics', `${r0.id}.json`)
  const saved = JSON.parse(await readFile(file, 'utf8')) as TopicFacts
  await writeFile(file, JSON.stringify({ ...saved, facts: saved.facts.filter(f => !f.fact.startsWith('Epsom')) }))
  const prompts: string[] = []
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return { score: 0.88, notes: [] } as never
    return { name: 'ตาโปนในปลา: สาเหตุและการรักษา', slug: 'fish-popeye-causes-treatment', summary: ['ตาปลาโปน'], body: '<h3>อาการ</h3><p>ตาโปน</p>', faq: [] } as never
  }
  const r = await localizeTopic(root, llm, r0.id, 'th')
  expect(r).toMatchObject({ slug: 'fish-popeye-causes-treatment', score: 0.88 })
  expect(prompts[0]).toContain('Thai')
  expect(prompts[0]).not.toContain('thuốc lồi mắt')
  const th = JSON.parse(await readFile(join(root, 'content/guides', r0.id, 'th.json'), 'utf8'))
  expect(th.refs).toEqual([{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }])
  expect(th.quality).toEqual({ score: 0.88, indexable: true })
  expect(await localizeTopic(root, llm, r0.id, 'th')).toMatchObject({ skipped: 'done' })
})

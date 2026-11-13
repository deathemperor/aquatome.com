import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { makeGlossaryEntry, sfGlossaryUrl } from '../src/glossary-entry'
import type { TopicFacts } from '../src/topics'

// The owner, 10 Nov 2026, of the Lũa term: "lũa sa tùng là gì, I had very hard time to get to know them". The fuller
// entry is written from cited facts only, checked against them, and replaces the old one only at the bar.
const facts: TopicFacts = {
  found: true,
  facts: [
    { section: 'what', fact: 'Driftwood releases tannins that lower pH slightly and tint the water brown', source: 0 },
    { section: 'steps', fact: 'Soak new driftwood for one to two weeks, changing the water, before it goes in a tank', source: 1 },
    { section: 'other', fact: 'Bogwood is wood preserved in a peat bog', source: 2 },
    { section: 'other', fact: 'Vietnamese keepers write "gỗ lũa" and "cây lũa"; NH3 is not about wood', source: 1 },
  ],
  species: [],
  sources: [
    { url: 'https://edis.ifas.ufl.edu/wood', title: 'Wood in aquaria', kind: 'university' },
    { url: 'https://example.org/soak', title: 'Soaking driftwood', kind: 'keeper' },
    { url: sfGlossaryUrl('bogwood'), title: 'Bogwood', kind: 'reference' },
  ],
}

async function site() {
  const r = await mkdtemp(join(tmpdir(), 'aq-glossary-entry-'))
  const term = async (id: string, en: string, vi: object) => {
    await mkdir(join(r, 'content/glossary', id), { recursive: true })
    await writeFile(join(r, 'content/glossary', id, 'entity.json'), JSON.stringify({ id, en }))
    await writeFile(join(r, 'content/glossary', id, 'vi.json'), JSON.stringify({ slug: id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true }, ...vi }))
  }
  await term('lua', 'Driftwood', { name: 'Lũa', altNames: ['lũa gỗ'], definition: 'Gỗ ngâm nước lâu không mục.' })
  await term('ph', 'pH', { name: 'pH', definition: 'Thang đo độ chua – kiềm của nước.' })
  await term('tanin', 'Tannins', { name: 'Tanin', altNames: ['nước trà'], definition: 'Chất từ lá và gỗ làm nước ngả vàng.' })
  return r
}

const written = { definition: 'Gỗ đã ngâm lâu trong nước, dùng trang trí bể.', altNames: ['gỗ lũa', 'Lũa', 'nước trà', 'driftwood', 'cây lũa', 'gỗ trôi dạt'], body: '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p><script>x</script>', related: ['tanin', 'ph', 'lua', 'nope'] }

test('a term\'s fuller entry: cited facts only, checked and rewritten once on notes; names the site can link, related terms, sources', async () => {
  const root = await site()
  const prompts: string[] = []
  let checks = 0
  let researched = ''
  const research: Llm = async ({ prompt }) => { researched = prompt; return facts as never }
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return (++checks <= 3 ? { score: 0.7, notes: ['"1–2 tuần" needs its source'] } : { score: 0.96, notes: [] }) as never
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research, llm }, 'lua', { kind: 'aquascaping', sf: 'bogwood' })
  expect(r).toMatchObject({ id: 'lua', score: 0.96, refs: 3, related: ['tanin', 'ph'] })
  // Seriously Fish's entry is read first and cited; the writer sees the facts and the other terms, never this one's.
  expect(researched).toContain('https://www.seriouslyfish.com/glossary/bogwood')
  // Kind by kind, by the names shops here write and the English ones, never from a marketplace; the writer lists each
  // kind under those names (the owner, 13 Nov: driftwood "with all kinds and names named per language").
  expect(researched).toContain('the name Vietnamese shops write for it and its English name')
  expect(researched).toContain('never on marketplaces (Shopee, Lazada, Tiki) or social networks')
  expect(prompts[0]).toContain('<strong>tên các cửa hàng Việt Nam ghi</strong> và tên tiếng Anh')
  expect(prompts[0]).toContain('Soak new driftwood for one to two weeks')
  expect(prompts[0]).toContain('tanin: Tanin: Chất từ lá và gỗ')
  expect(prompts[0]).not.toContain('lua: Lũa:')
  expect(checks).toBe(4)
  expect(prompts.at(-2)).toContain('"1–2 tuần" needs its source')
  const e = JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))
  expect(e).toEqual({ id: 'lua', en: 'Driftwood', refs: facts.sources.map(({ url, title }) => ({ url, title })), related: ['tanin', 'ph'] })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  // Its own name, another term's name, a single everyday word and a name no source wrote (a translation) are not other
  // names; several words a source wrote are.
  expect(vi.altNames).toEqual(['lũa gỗ', 'gỗ lũa', 'cây lũa'])
  expect(vi).toMatchObject({ slug: 'lua', name: 'Lũa', definition: written.definition, body: '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p>', quality: { score: 0.96, indexable: true } })
  // The research is kept for a rewrite without searching again.
  expect(JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8'))).toEqual(facts)
})

test('an entry under the bar leaves the term as it was', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.5, notes: ['made up'] } : written) as never
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ id: 'lua', skipped: 'under the bar: 0.5' })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))).toEqual({ id: 'lua', en: 'Driftwood' })
})

test('a rewrite keeps the photos put on the term', async () => {
  const root = await site()
  const photo = { url: 'https://media.aquatome.com/x/a.webp', width: 1200, height: 533, licence: 'dùng với sự cho phép', author: 'A shop', sourceUrl: 'https://example.org/tank', source: '2hraquarist' }
  await writeFile(join(root, 'content/glossary/lua/entity.json'), JSON.stringify({ id: 'lua', en: 'Driftwood', photos: [photo] }))
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.97, notes: [] } : written) as never
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8')).photos).toEqual([photo])
})

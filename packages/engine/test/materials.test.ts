import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialSchema, TranslationSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { formNotes, keptFacts, makeMaterial, MATERIALS, type MaterialFacts } from '../src/materials'

const facts: MaterialFacts = {
  found: true,
  facts: [
    { section: 'about', fact: 'Sold in Vietnam as lũa kim sa tùng, thin branching roots', source: 0 },
    { section: 'water', fact: 'Turns the water yellow for the first weeks', source: 1 },
    { section: 'prepare', fact: 'Soak it for one to two weeks, changing the water', source: 2 }, // a marketplace: dropped with its source
    { section: 'buy', fact: 'Ask for the size of the piece', source: 3 }, // Facebook: dropped
    { section: 'prepare', fact: 'Boil small pieces to make them sink faster', source: 4 },
    { section: 'suits', fact: 'Suits shrimp tanks', source: 5 }, // not a web page
    { section: 'about', fact: 'A shop lists it twice', source: 6 }, // the first listing's number
  ],
  sources: [
    { url: 'https://zenaquarius.com/lua-kim-sa-tung', title: 'Lũa kim sa tùng', kind: 'shop' },
    { url: 'https://example.org/driftwood', title: 'Driftwood', kind: 'article' },
    { url: 'https://shopee.vn/lua-123', title: 'Lũa', kind: 'shop' },
    { url: 'https://www.facebook.com/groups/x/posts/1', title: 'Hỏi lũa', kind: 'forum' },
    { url: 'https://diendan.example.vn/t/1', title: 'Luộc lũa', kind: 'forum' },
    { url: 'a book', title: 'Book', kind: 'other' },
    { url: 'https://zenaquarius.com/lua-kim-sa-tung', title: 'Lũa kim sa tùng (again)', kind: 'shop' },
  ],
}

test('keptFacts: only web pages, never a marketplace or Facebook, each once, numbered from 1 as cited', () => {
  const k = keptFacts(facts)
  expect(k.sources.map(s => s.url)).toEqual(['https://zenaquarius.com/lua-kim-sa-tung', 'https://example.org/driftwood', 'https://diendan.example.vn/t/1'])
  expect(k.facts.map(f => [f.section, f.source])).toEqual([['about', 1], ['water', 2], ['prepare', 3], ['about', 1]])
})

test('formNotes: what the loader and the card refuse, a part with no source, a heading or link, a price', () => {
  const ok = { summary: ['Lũa sa tùng là lũa rễ mảnh, nhiều nhánh.', 'Ngâm kỹ trước khi dùng.'], sections: { about: '<p>Rễ mảnh [1].</p>' }, faq: [] }
  expect(formNotes(ok, 2)).toEqual([])
  const bad = {
    summary: [`${'Lũa '.repeat(23)}x`],
    sections: { about: '<h3>Là gì</h3><p>Rễ [3].</p>', water: '<p>Nước vàng.</p>', buy: '<p>Khoảng 150k một khúc <a href="/x">ở đây</a> [1].</p>', other: '<p>x</p>' },
    faq: [],
  } as never
  expect(formNotes(bad, 2)).toEqual([
    'summary: write 2–3 lines, not 1',
    `summary: the first line has 93 characters, more than 90: "${'Lũa '.repeat(23)}x"`,
    'sections: "other" is not one of about, water, prepare, suits, mistakes, buy',
    'about: [3] is not a source (1–2)',
    'about: has a heading or a link',
    'water: cites no source',
    'buy: has a heading or a link',
    'a price ("150k"): the page gives none',
  ])
  expect(formNotes({ ...ok, sections: { water: '<p>Nước vàng [1].</p>' } }, 2)).toEqual(['sections: "about" is missing'])
})

async function site() {
  const root = await mkdtemp(join(tmpdir(), 'aq-material-'))
  await mkdir(join(root, 'content/materials/lua-sa-tung'), { recursive: true })
  const photo = { url: 'https://media.aquatome.com/x.webp', width: 1600, height: 900, licence: 'Unsplash', author: 'A', sourceUrl: 'https://unsplash.com/photos/x' }
  await writeFile(join(root, 'content/materials/lua-sa-tung/entity.json'), JSON.stringify({ id: 'lua-sa-tung', kind: 'wood', names: [], photos: [photo], sources: [], updatedAt: '2026-11-13' }))
  return { root, photo }
}

const satung = MATERIALS.find(m => m.id === 'lua-sa-tung')!

test('makeMaterial: the page written from its cited facts, written again on the form\'s notes; names, address and photos are not the writer\'s', async () => {
  const { root, photo } = await site()
  const prompts: string[] = []
  let writes = 0
  const research: Llm = async () => facts as never
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return { score: 0.97, notes: [] } as never
    return (++writes === 1
      ? { summary: [`${'Lũa '.repeat(23)}x`, 'Ngâm trước khi dùng.'], sections: { about: '<p>Rễ mảnh [1][5].</p>' }, faq: [] }
      : { summary: ['Lũa sa tùng là lũa rễ mảnh, nhiều nhánh.', 'Nước ngả vàng vài tuần đầu.'], sections: { about: '<p>Rễ mảnh, nhiều nhánh [1].</p>', water: '<p>Nước ngả vàng [2].</p><script>x</script>', prepare: '<ol><li>Luộc khúc nhỏ cho nhanh chìm [3].</li></ol>' }, faq: [{ q: 'Có cần ngâm không?', a: 'Có [2].' }, { q: ' ', a: 'x' }] }) as never
  }
  const r = await makeMaterial(root, { research, llm }, satung, { now: () => new Date('2026-11-15T01:00:00Z') })
  expect(r).toMatchObject({ id: 'lua-sa-tung', score: 0.97, sources: 3, drafts: 2 })
  // The writer had the given names and the sources' kinds numbered from 1, never a dropped source's fact; it was told what lũa
  // this is, and the second draft carried the form's notes. The first draft, failing its form, was never read.
  const [first, second, ...more] = prompts
  expect(more).toHaveLength(1)
  expect(more[0]).toMatch(/^Below are FACTS/)
  expect(first).toContain('"altNames": [\n  "Lũa kim sa tùng",\n  "Kim sa tùng"\n ]')
  expect(first).toContain('câu đầu nói Lũa sa tùng là loại lũa gì')
  expect(first).not.toContain('one to two weeks')
  expect(first).not.toContain('Ask for the size')
  expect(second).toContain('- about: [5] is not a source (1–3)')
  expect(second).toContain('- summary: the first line has 93 characters')

  const e = MaterialSchema.parse(JSON.parse(await readFile(join(root, 'content/materials/lua-sa-tung/entity.json'), 'utf8')))
  expect(e).toEqual({
    id: 'lua-sa-tung', kind: 'wood', parent: 'lua', names: [], photos: [photo], updatedAt: '2026-11-15',
    sources: [
      { url: 'https://zenaquarius.com/lua-kim-sa-tung', title: 'Lũa kim sa tùng', kind: 'shop', at: '2026-11-15' },
      { url: 'https://example.org/driftwood', title: 'Driftwood', kind: 'article', at: '2026-11-15' },
      { url: 'https://diendan.example.vn/t/1', title: 'Luộc lũa', kind: 'forum', at: '2026-11-15' },
    ],
  })
  const vi = TranslationSchema.parse(JSON.parse(await readFile(join(root, 'content/materials/lua-sa-tung/vi.json'), 'utf8')))
  expect(vi).toMatchObject({ slug: 'lua-sa-tung', name: 'Lũa sa tùng', altNames: ['Lũa kim sa tùng', 'Kim sa tùng'], summary: ['Lũa sa tùng là lũa rễ mảnh, nhiều nhánh.', 'Nước ngả vàng vài tuần đầu.'], faq: [{ q: 'Có cần ngâm không?', a: 'Có.' }], quality: { score: 0.97, indexable: true } })
  expect(Object.keys(vi.sections)).toEqual(['about', 'water', 'prepare'])
  expect(vi.sections.water).not.toContain('script')
  // The research is kept: a rewrite reads it and searches nothing.
  const kept = JSON.parse(await readFile(join(root, 'engine-state/materials/lua-sa-tung.json'), 'utf8'))
  expect(kept.at).toBe('2026-11-15')
  const none: Llm = async () => { throw new Error('no research on a rewrite') }
  await expect(makeMaterial(root, { research: none, llm }, satung, { reuse: true, now: () => new Date('2026-11-16T01:00:00Z') })).resolves.toMatchObject({ id: 'lua-sa-tung' })
  const again = JSON.parse(await readFile(join(root, 'content/materials/lua-sa-tung/entity.json'), 'utf8'))
  expect(again.sources[0].at).toBe('2026-11-15') // the day the source was read, not the day of the rewrite
})

test('makeMaterial: a page whose every draft fails its form is not saved', async () => {
  const { root } = await site()
  const research: Llm = async () => facts as never
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.97, notes: [] } : { summary: ['Một dòng.'], sections: { about: '<p>Rễ [1].</p>' }, faq: [] }) as never
  await expect(makeMaterial(root, { research, llm }, satung)).rejects.toThrow('lua-sa-tung: no draft has the page\'s form: summary: write 2–3 lines, not 1')
  const e = JSON.parse(await readFile(join(root, 'content/materials/lua-sa-tung/entity.json'), 'utf8'))
  expect(e.updatedAt).toBe('2026-11-13')
  await expect(readFile(join(root, 'content/materials/lua-sa-tung/vi.json'), 'utf8')).rejects.toThrow()
})

test('makeMaterial --redo with no research kept says so, and calls nothing', async () => {
  const { root } = await site()
  const none: Llm = async () => { throw new Error('called') }
  await expect(makeMaterial(root, { research: none, llm: none }, satung, { reuse: true })).rejects.toThrow('lua-sa-tung: no research kept')
})

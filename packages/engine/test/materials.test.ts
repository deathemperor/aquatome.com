import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialSchema, TranslationSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { asSaved, formNotes, keptFacts, makeMaterial, MATERIALS, type MaterialFacts } from '../src/materials'

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
  // Marketplaces' short links, Tokopedia, and an address that isn't one, go too (Astra's read).
  const short = ['https://shope.ee/abc', 'https://shp.ee/abc', 'https://vn.shp.ee/x', 'https://lzd.co/abc', 'https://ti.ki/abc', 'https://www.tokopedia.com/x', 'https://tokopedia.link/x', 'https://fb.watch/x', 'https://m.facebook.com/x', 'https:// bad', 'https://example.org/ok']
  const k2 = keptFacts({ found: true, facts: short.map((_, i) => ({ section: 'about' as const, fact: `f${i}`, source: i })), sources: short.map(url => ({ url, title: 't', kind: 'shop' as const })) })
  expect(k2.sources.map(s => s.url)).toEqual(['https://example.org/ok'])
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

test('a draft is checked as it will be saved: a mark alone, an encoded mark, a comment, markup in plain text, inches and gallons (Astra\'s read)', () => {
  const w = asSaved({
    summary: ['<strong>Lũa</strong> làm bố cục cho bể &amp; giữ nước mềm [1].', '[1]'],
    sections: { about: '<p>Rễ [1]. Nước vàng &#91;9&#93;.</p>', water: '<!-- [1] -->', prepare: '<p> </p>' },
    faq: [{ q: 'Có cần ngâm <em>không</em>?', a: 'Có [1].' }],
  })
  expect(w.summary).toEqual(['Lũa làm bố cục cho bể & giữ nước mềm.'])
  expect(w.faq).toEqual([{ q: 'Có cần ngâm không?', a: 'Có.' }])
  expect(Object.keys(w.sections)).toEqual(['about'])
  expect(formNotes(w, 1)).toEqual(['summary: write 2–3 lines, not 1', 'about: [9] is not a source (1–1)'])
  // A figure in inches or gallons is checked as the page will show it, in metric.
  const long = asSaved({ summary: [`Lũa dài ${'x'.repeat(60)} hợp bể 20 gallon long thôi.`, 'Hai.'], sections: { about: '<p>A [1].</p>' }, faq: [] })
  expect(long.summary[0]).not.toContain('gallon')
  expect(formNotes(long, 1)[0]).toMatch(/^summary: the first line has \d+ characters, more than 90/)
})

test('a price, in what a reader sees, and not a quantity (Astra\'s read)', () => {
  const page = (about: string) => ({ summary: ['Một.', 'Hai.'], sections: { about: `<p>${about} [1].</p>` }, faq: [] })
  for (const p of ['Giá 150.000 ₫ một khúc', 'Giá <strong>150.000</strong> đồng', 'Khoảng 200 nghìn đồng', 'Tầm 150k', 'Giá từ 90 một khúc', '1,5 triệu đ'])
    expect(formNotes(asSaved(page(p)), 1).filter(n => n.startsWith('a price')), p).toHaveLength(1)
  for (const q of ['Đá hình thành cách đây 2 triệu năm', 'Đèn 6500 K', 'Ngâm 10 đến 14 ngày', 'Khúc nặng 5 kg', 'Giá thể 2 lớp', 'Giá trị pH 6,5'])
    expect(formNotes(asSaved(page(q)), 1), q).toEqual([])
})

async function site() {
  const root = await mkdtemp(join(tmpdir(), 'aq-material-'))
  await mkdir(join(root, 'content/materials/lua-sa-tung'), { recursive: true })
  await mkdir(join(root, 'content/materials/lua'), { recursive: true })
  await writeFile(join(root, 'content/materials/lua/entity.json'), JSON.stringify({ id: 'lua', kind: 'wood', names: ['Driftwood'], photos: [], sources: [], updatedAt: '2026-11-13' }))
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

test('a page whose parent has no page yet is refused before anything is asked (Astra\'s read)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-material-'))
  const none: Llm = async () => { throw new Error('called') }
  await expect(makeMaterial(root, { research: none, llm: none }, satung)).rejects.toThrow('lua-sa-tung: its parent "lua" has no page yet: write it first')
})

const good = { summary: ['Lũa sa tùng là lũa rễ mảnh.', 'Nước ngả vàng.'], sections: { about: '<p>Rễ mảnh [1].</p>' }, faq: [] }

test('at an equal read, the rewrite that cleared its notes is kept (Astra\'s read)', async () => {
  const { root } = await site()
  let writes = 0
  let reads = 0
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS')
    ? (++reads === 1 ? { score: 0.97, notes: ['"rễ mảnh" is not in the facts'] } : { score: 0.97, notes: [] })
    : { ...good, sections: { about: `<p>${++writes === 1 ? 'Rễ mảnh' : 'Rễ nhiều nhánh'} [1].</p>` } }) as never
  await makeMaterial(root, { research: async () => facts as never, llm }, satung)
  const vi = JSON.parse(await readFile(join(root, 'content/materials/lua-sa-tung/vi.json'), 'utf8'))
  expect(vi.sections.about).toBe('<p>Rễ nhiều nhánh [1].</p>')
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/material.json'), 'utf8'))['vi/materials/lua-sa-tung']
  expect(log.map((x: { attempt: string; kept: boolean }) => [x.attempt, x.kept])).toEqual([['rewrite', true], ['first', false]]) // newest first
})

test('a rewrite that fails keeps the reviews already made, none kept, and nothing saved (Astra\'s read)', async () => {
  const { root } = await site()
  let writes = 0
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('Below are FACTS')) return { score: 0.5, notes: ['"x" is not in the facts'] } as never
    if (++writes === 2) throw new Error('usage limit')
    return good as never
  }
  await expect(makeMaterial(root, { research: async () => facts as never, llm }, satung)).rejects.toThrow('usage limit')
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/material.json'), 'utf8'))['vi/materials/lua-sa-tung']
  expect(log).toHaveLength(1)
  expect(log[0].kept).toBeFalsy()
  await expect(readFile(join(root, 'content/materials/lua-sa-tung/vi.json'), 'utf8')).rejects.toThrow()
})

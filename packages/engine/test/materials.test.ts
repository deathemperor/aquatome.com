import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialSchema, TranslationSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import { nameStep } from '../src/ceiling'
import type { Llm } from '../src/claude'
import { asSaved, checkMaterial, formNotes, keptFacts, makeMaterial, MATERIALS, researchPrompt, type MaterialFacts } from '../src/materials'

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

test('a price by the marks that can\'t be a quantity, and never a quantity; any other sum is the reader\'s (Astra\'s reads)', async () => {
  const page = (about: string) => ({ summary: ['Một.', 'Hai.'], sections: { about: `<p>${about} [1].</p>` }, faq: [] })
  for (const p of ['Giá 150.000 ₫ một khúc', 'Giá <strong>150.000</strong> đồng', 'Khoảng 200 nghìn đồng', 'Tầm 150k', '1,5 triệu đ', 'Lũa 150K/khúc',
    'Giá bán: 150.000', 'Giá: 99', 'Ngâm 7 ngày, khúc này 90 đ', 'Một khúc lũa 150.000đ màu nâu sẫm', 'Một khúc lũa 150.000₫ màu nâu sẫm',
    'Một khúc lũa 150.000 VND màu nâu sẫm', 'Khúc to giá 1.200.000', 'Một khúc lũa 150.000 đồng màu nâu sẫm', 'Một khúc lũa 150000 đồng màu nâu sẫm',
    'Khúc to 2 triệu đến 3 triệu đồng', 'Một khúc lũa thường có giá vài trăm nghìn đồng', 'Lũa nhỏ chỉ vài chục nghìn đồng', 'Lũa có giá vài trăm nghìn',
    'Lũa khủng giá từ 5 triệu trở lên', 'Khúc lớn nửa triệu đồng', 'Giá bán: vài trăm nghìn tùy kích thước', 'Giá dao động 100 đến 500 nghìn tùy khúc',
    // Astra's seventh read: a selling word, its colon, then "khoảng" or "từ".
    'Giá bán: khoảng 200 nghìn tùy kích thước', 'Giá bán: từ vài trăm nghìn',
    // Money again before a word of time.
    'Một khúc 150.000 đồng thời điểm này', 'Khúc to 2 triệu đồng thời điểm cuối năm',
    // Astra's eighth read: no space after the colon.
    'Giá bán:khoảng 200 nghìn', 'Giá:từ vài trăm nghìn'])
    expect(formNotes(asSaved(page(p)), 1).filter(n => n.startsWith('a price')), p).toHaveLength(1)
  for (const q of ['Đá hình thành cách đây 2 triệu năm', 'Đèn 6500 K', 'Đèn 6500K', 'Ngâm 10 đến 14 ngày', 'Khúc nặng 5 kg', 'Giá thể 2 lớp', 'Giá trị pH 6,5',
    'Ngâm đến ngày 7, đồng thời thay nước hằng ngày', 'Giữ pH ở 6,5, đồng thời theo dõi KH', 'Đánh giá 2 khúc lũa qua độ cứng và mùi',
    'Ngâm 7 ngày đồng thời thay nước', 'Hai khúc 30 cm đồng màu', 'Bể 60 lít có 2 khúc', 'Nhiệt độ 25 độ',
    'Phơi lũa trên giá 2 tầng cho ráo nước', 'Có hơn 2 nghìn loài cá sống quanh rễ cây',
    'Đá hình thành cách đây 2 triệu đến 3 triệu năm', 'Đá hình thành cách đây 2–3 triệu năm', 'Một gam đất nền có thể chứa 1 tỷ vi sinh vật',
    'Từ năm 2020 đồng thời có thêm lũa rễ', 'Mỗi gam nền có thể chứa 1 tỷ vi sinh có lợi', 'Đá này hình thành cách đây 2 triệu rưỡi năm',
    'Lũa đã nằm dưới bùn hàng nghìn năm', 'Mất vài trăm năm để gỗ thành lũa', 'Giá thể chứa hàng triệu vi sinh',
    // Astra's sixth read
    'Phơi lũa trên giá khoảng 2 ngày cho ráo nước', 'Số vi khuẩn trong một gam nền có thể lên tới vài triệu, tùy loại nền',
    // Astra's seventh read: a count, then "đồng thời" ("at the same time").
    'Số lượng vi sinh tăng lên vài triệu đồng thời nhu cầu oxy cũng tăng', 'Vi sinh tăng thêm 2 triệu đồng thời ăn bớt oxy',
    'Số vi sinh tăng lên 100.000 đồng thời nhu cầu oxy cũng tăng',
    // A sum by no closed mark: what follows a "nghìn" can be a count as well as a price, so it's the grounded reader's to note.
    'Mỗi khúc 200 nghìn', 'Mỗi khúc 1,5 triệu', 'Mua theo ký, khoảng 120 nghìn/kg', 'Khúc to 2 triệu rưỡi', 'Giá từ 90 một khúc',
    'Mỗi khúc 200 nghìn tùy kích thước', 'Lũa khoảng 100–200 nghìn tùy dáng', 'Một túi nền tốn 150 nghìn cho bể nhỏ', 'Mỗi khúc 200 nghìn (đã xử lý)'])
    expect(formNotes(asSaved(page(q)), 1), q).toEqual([])
  // The reader is told: any sum of money on the page is a wrong claim.
  let asked = ''
  const llm: Llm = async <T,>(a: { prompt: string }) => { asked = a.prompt; return { score: 0.97, notes: [] } as T }
  await checkMaterial(llm, {}, page('Mỗi khúc 200 nghìn tùy kích thước'))
  expect(asked).toContain('The page gives no price: any sum of money in it, in digits or in words, is a wrong claim')
})

test('plain text keeps a comparison and a space between blocks (Astra\'s second read)', () => {
  const w = asSaved({
    summary: ['Chỉ dùng khi pH &lt; 7; tránh khi pH &gt; 8 [1].', 'Ngâm khi pH < 7 và > 8 thì thay nước.'],
    sections: { about: '<p>A [1].</p>' },
    faq: [{ q: 'Ngâm bao lâu?', a: '<p>Một tuần [1].</p><p>Hai tuần nếu khúc to.</p>Dòng<br>hai' }],
  })
  expect(w.summary).toEqual(['Chỉ dùng khi pH < 7; tránh khi pH > 8.', 'Ngâm khi pH < 7 và > 8 thì thay nước.'])
  expect(w.faq).toEqual([{ q: 'Ngâm bao lâu?', a: 'Một tuần. Hai tuần nếu khúc to. Dòng hai' }])
  // Astra's third read: a quoted value with "<" or ">" in it is part of its tag.
  const q = asSaved({ summary: ['Ngâm <em title="pH &lt; 7">lũa</em> trước khi dùng.', "Rửa <span title='a > b'>kỹ</span>, <b>pH < 7</b> và > 8."], sections: { about: '<p>A [1].</p>' }, faq: [] })
  expect(q.summary).toEqual(['Ngâm lũa trước khi dùng.', 'Rửa kỹ, pH < 7 và > 8.'])
  // Astra's fourth read: an encoded quote inside a value, and a tag written encoded.
  const e = asSaved({ summary: ['Ngâm <em title="còn gọi là &quot;lũa rễ&quot;">lũa</em> trước khi dùng.', '&lt;strong&gt;Lũa&lt;/strong&gt; rễ nhỏ.'], sections: { about: '<p>A [1].</p>' }, faq: [] })
  expect(e.summary).toEqual(['Ngâm lũa trước khi dùng.', 'Lũa rễ nhỏ.'])
  // Astra's fifth read: a named entity is undone, as the page shows the text as written.
  const n = asSaved({ summary: ['Luộc ở 100&deg;C.', 'Hai.'], sections: { about: '<p>A [1].</p>' }, faq: [{ q: 'Ngâm bao lâu?', a: '<p>Ngâm lũa 1&ndash;2 tuần.</p>' }] })
  expect(n.summary[0]).toBe('Luộc ở 100°C.')
  expect(n.faq).toEqual([{ q: 'Ngâm bao lâu?', a: 'Ngâm lũa 1–2 tuần.' }])
  // Astra's sixth read: a comparison with no spaces is no tag, and a tag written encoded twice, its value's quotes too, goes.
  const s6 = asSaved({ summary: ['Giữ 6<pH<7 và KH>2 khi dùng nền này.', 'Ngâm &lt;em title=&quot;còn gọi là &amp;quot;lũa rễ&amp;quot;&quot;&gt;lũa&lt;/em&gt; trước khi dùng.'], sections: { about: '<p>A [1].</p>' }, faq: [] })
  expect(s6.summary).toEqual(['Giữ 6<pH<7 và KH>2 khi dùng nền này.', 'Ngâm lũa trước khi dùng.'])
  // Astra's seventh read: "<" then a word that names no HTML element is a comparison, written or encoded.
  const s7 = asSaved({ summary: ['Chỉ dùng khi 6<pH và KH>2.', 'Chỉ dùng khi 6&lt;pH và KH&gt;2.'], sections: { about: '<p>A [1].</p>' }, faq: [{ q: 'Khi nào?', a: '<p>Khi 6<pH và KH>2 [1].</p><pre>Ngâm</pre> trước.' }] })
  expect(s7.summary).toEqual(['Chỉ dùng khi 6<pH và KH>2.', 'Chỉ dùng khi 6<pH và KH>2.'])
  expect(s7.faq).toEqual([{ q: 'Khi nào?', a: 'Khi 6<pH và KH>2. Ngâm trước.' }])
  // And in a part, which the sanitizer would read as a tag: kept as text, escaped.
  const p7 = asSaved({ summary: ['Một.', 'Hai.'], sections: { about: '<p>Chỉ dùng khi 6<pH và KH>2 [1].</p><p>Giữ 6<pH<7 [1].</p>' }, faq: [] })
  expect(p7.sections.about).toBe('<p>Chỉ dùng khi 6&lt;pH và KH&gt;2 [1].</p><p>Giữ 6&lt;pH&lt;7 [1].</p>')
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

// The Site Lead, 14 Nov 2026: the buying part is "Mua ở đâu, chọn thế nào", where keepers buy it and what to check first.
test('each page\'s research asks where keepers buy it and what to check when buying', () => {
  for (const m of MATERIALS) expect(researchPrompt(m), m.id).toContain('where Vietnamese keepers buy it and what to check when buying it')
})

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

// The chief of staff, 14 Nov 2026: the second page runs the same day only if what's left of the step's day covers a page.
test('a page starts only when what\'s left of the day covers one as the last cost: nothing asked, nothing written (Astra\'s seventh read)', async () => {
  const { root } = await site()
  const entity = await readFile(join(root, 'content/materials/lua-sa-tung/entity.json'), 'utf8')
  const log = join(root, 'cost.jsonl')
  const now = () => new Date('2026-11-15T03:00:00.000Z')
  await writeFile(log, `${JSON.stringify({ at: '2026-11-15T01:00:00.000Z', step: 'material', piece: 'lua 2026-11-15T01:00:00.000Z', pieceUsd: 10000, finished: true })}\n`)
  let calls = 0
  const none: Llm = async () => { calls++; throw new Error('called') }
  process.env.ENGINE_COST_LOG = log
  nameStep('material')
  try {
    await expect(makeMaterial(root, { research: none, llm: none }, satung, { now })).rejects.toThrow(/lua-sa-tung not started/)
  } finally {
    process.env.ENGINE_COST_LOG = 'off'
    nameStep(undefined)
  }
  expect(calls).toBe(0)
  expect(await readFile(join(root, 'content/materials/lua-sa-tung/entity.json'), 'utf8')).toBe(entity)
  await expect(readFile(join(root, 'engine-state/materials/lua-sa-tung.json'), 'utf8')).rejects.toThrow()
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

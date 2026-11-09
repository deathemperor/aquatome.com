import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { localizeTopic, makeTopic, SOURCE_KINDS, usableFact, type TopicFacts } from '../src/topics'

const facts: TopicFacts = {
  found: true,
  facts: [
    { section: 'signs', fact: 'One or both eyes bulge out', source: 0 },
    { section: 'treatment', fact: 'Epsom salt 1 tablespoon per 5 gallons', source: 1 },
    { section: 'causes', fact: 'Poor water quality', source: 2 }, // its source is not a web page: dropped with it
    { section: 'what', fact: 'Popeye is a symptom, not a disease', source: 3 }, // a page listed twice: cites its first listing
  ],
  species: ['Carassius auratus', 'Betta splendens (Siamese fighting fish)', 'Nothing here'],
  sources: [{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS', kind: 'university' }, { url: 'https://example.org/epsom', title: 'Epsom', kind: 'keeper' }, { url: 'a book', title: 'Book', kind: 'other' }, { url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS (search summary)', kind: 'university' }],
}

async function site() {
  const r = await mkdtemp(join(tmpdir(), 'aq-topic-'))
  for (const [id, sci] of [['carassius-auratus', 'Carassius auratus'], ['betta-splendens', 'Betta splendens']] as const) {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: sci }))
  }
  await mkdir(join(r, 'content/breeds/blue-diamond-discus'), { recursive: true })
  await writeFile(join(r, 'content/breeds/blue-diamond-discus/vi.json'), JSON.stringify({ name: 'Cá dĩa lam phấn (Blue Diamond discus)', altNames: [] }))
  await mkdir(join(r, 'content/breeds/oranda'), { recursive: true })
  await writeFile(join(r, 'content/breeds/oranda/vi.json'), JSON.stringify({ name: 'Cá vàng Oranda (Oranda)', altNames: [] }))
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
    // The first write's read is near the bar, so it is read three times; the rewrite's is well clear of it.
    if (prompt.startsWith('Below are FACTS')) return (++checks <= 3 ? { score: 0.7, notes: ['"3 ngày" is not in the facts'] } : { score: 0.97, notes: [] }) as never
    return { name: 'Cá bị lồi mắt: nguyên nhân và cách chữa', summary: ['Mắt cá lồi ra.'], body: '<h3>Dấu hiệu</h3><p>Mắt lồi, cả ở Blue Diamond.</p><p>Muối Epsom 1 thìa cho mỗi 5 gallon.</p><script>x</script>', faq: [{ q: 'Có lây không?', a: 'Không rõ.' }, { q: ' ', a: 'x' }] } as never
  }
  const r = await makeTopic(root, { research, llm }, { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' }, { now: () => new Date('2026-10-31T00:00:00Z') })
  expect(r).toMatchObject({ id: 'aquatome-ca-bi-loi-mat-popeye', score: 0.97, refs: 2 })
  // The writer saw only cited facts, renumbered; the rewrite carried the checker's note.
  expect(prompts[0]).toContain('Epsom salt 1 tablespoon per 5 gallons')
  expect(prompts[0]).not.toContain('Poor water quality')
  expect(prompts[0]).toMatch(/"Popeye is a symptom, not a disease",\s*"source": 0/)
  // Each source's kind, numbered as the facts cite them, and how the page names each kind.
  expect(prompts[0]).toMatch(/"sources": \[\s*\{\s*"source": 0,\s*"kind": "university"\s*\},\s*\{\s*"source": 1,\s*"kind": "keeper"\s*\}\s*\]/)
  expect(prompts[0]).toContain('- society: "một hội người nuôi cá"')
  expect(checks).toBe(4)
  expect(prompts[4]).toContain('"3 ngày" is not in the facts')
  const e = JSON.parse(await readFile(join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/entity.json'), 'utf8'))
  expect(e).toMatchObject({ kind: 'disease', source: 'aquatome', html: '', photos: [], mentions: ['carassius-auratus', 'betta-splendens', 'blue-diamond-discus'], updatedAt: '2026-10-31' })
  expect(e.refs).toEqual([{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }, { url: 'https://example.org/epsom', title: 'Epsom' }])
  const vi = JSON.parse(await readFile(join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/vi.json'), 'utf8'))
  expect(vi.slug).toBe('ca-bi-loi-mat-huong-dan')
  expect(vi.body).not.toContain('<script')
  expect(vi.body).toContain('<p>Muối Epsom 1 thìa cho mỗi 19 lít.</p>') // the facts' gallons, written in litres
  expect(vi.faq).toHaveLength(1)
  expect(vi.quality).toEqual({ score: 0.97, indexable: true })
  expect(e.sourceUrl).toBe('https://aquatome.com/vi/huong-dan/ca-bi-loi-mat-huong-dan/')

  // A rewrite from the kept research keeps the photos a later step put on the guide.
  const file = join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/entity.json')
  const drawing = { url: 'https://media.aquatome.com/aquatome/guides-a.webp', width: 1540, height: 940, licence: 'dùng với sự cho phép', author: 'AquaTome', sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', source: 'aquatome', section: { vi: 'Dấu hiệu' } }
  await writeFile(file, JSON.stringify({ ...e, photos: [drawing] }))
  await makeTopic(root, { research: async () => { throw new Error('not asked') }, llm }, { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' }, { reuse: true })
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([drawing])
})

test('a rewrite from the kept research keeps a body fixed by hand', async () => {
  const root = await site()
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.92, notes: [] } : { name: 'Cá bị lồi mắt', summary: ['Mắt cá lồi ra.'], body: '<p>viết lại</p>', faq: [] }) as never
  const topic = { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' } as const
  await makeTopic(root, { research: async () => facts as never, llm }, topic, { now: () => new Date('2026-10-31T00:00:00Z') })
  const file = join(root, 'content/guides/aquatome-ca-bi-loi-mat-popeye/vi.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), body: '<p>người sửa</p>', bodyFixed: true }))
  await makeTopic(root, { research: async () => { throw new Error('not asked') }, llm }, topic, { reuse: true })
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ body: '<p>người sửa</p>', bodyFixed: true })
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
    return { name: 'ตาโปนในปลา: สาเหตุและการรักษา', slug: 'fish-popeye-causes-treatment', summary: ['ตาปลาโปน'], body: '<h3>อาการ</h3><p>ตาโปน</p><p>อุณหภูมิ 78–80 °F</p>', faq: [] } as never
  }
  const r = await localizeTopic(root, llm, r0.id, 'th')
  expect(r).toMatchObject({ slug: 'fish-popeye-causes-treatment', score: 0.88 })
  expect(prompts[0]).toContain('Thai')
  expect(prompts[0]).toContain('shop: a fishkeeping guide, never the shop by name')
  expect(prompts[0]).not.toContain('{{')
  expect(prompts[0]).not.toContain('thuốc lồi mắt')
  const th = JSON.parse(await readFile(join(root, 'content/guides', r0.id, 'th.json'), 'utf8'))
  expect(th.refs).toEqual([{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }])
  expect(th.quality).toEqual({ score: 0.88, indexable: true })
  expect(th.body).toContain('<p>อุณหภูมิ 26–27 °C</p>')
  expect(await localizeTopic(root, llm, r0.id, 'th')).toMatchObject({ skipped: 'done' })
})

test('localizeTopic in Malay: addressed by its name, and a name another guide has takes its word for "guide"', async () => {
  const root = await site()
  const llm0: Llm = async ({ prompt }) => (prompt.startsWith('Below are FACTS') ? { score: 0.9, notes: [] } : { name: 'Cá bị lồi mắt', summary: ['x'], body: '<p>x</p>', faq: [] }) as never
  const r0 = await makeTopic(root, { research: async () => facts as never, llm: llm0 }, { topic: 'Cá bị lồi mắt (popeye)', kind: 'disease' })
  await writeFile(join(root, 'content/guides/other/ms.json'), JSON.stringify({ slug: 'mata-tersembul', name: 'Mata tersembul' }))
  const prompts: string[] = []
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return { score: 0.9, notes: [] } as never
    return { name: 'Mata tersembul: punca', slug: 'ignored', summary: ['Mata ikan tersembul.'], body: '<p>Suhu 68 °F, 1 gelen.</p>', faq: [] } as never
  }
  const r = await localizeTopic(root, llm, r0.id, 'ms')
  expect(r).toMatchObject({ slug: 'mata-tersembul-panduan' })
  expect(prompts[0]).toContain('Malay')
  expect(prompts[0]).toContain('Malaysia')
  expect(JSON.parse(await readFile(join(root, 'content/guides', r0.id, 'ms.json'), 'utf8')).body).toBe('<p>Suhu 20 °C, 3.8 liter.</p>')
})

test('a farm\'s or forum\'s figure is a dose when it names a treatment, or is a measure, a level not the water\'s own or a rate; another page of the same forum is no second source', () => {
  const sources: TopicFacts['sources'] = [
    { url: 'https://farm.example/ca', title: 'Nuôi cá', kind: 'farm' },
    { url: 'https://forum.example/t/1', title: 'Thread', kind: 'forum' },
    { url: 'https://forum.example/t/1?page=2', title: 'Thread, page 2', kind: 'forum' },
  ]
  const usable = (fact: string, source = 0, also?: number[]) => usableFact({ found: true, species: [], sources, facts: [] }, { section: 'treatment', fact, source, ...(also ? { also } : {}) })
  for (const [fact, source] of [
    ['Formalin at 25 ppm; add aeration because it lowers oxygen', 1],
    ['Copper sulfate at 1 ppm only when KH is above 5', 1],
    ['A 3% saline solution', 0],
    ['Salt bath at 3 percent', 0],
    ['20–30‰ salt water', 0],
    ['Tắm nước muối 20‰', 0],
    ['1 capful per 40 litres', 1],
    // A treatment the rules have no name for, by its level, measure or rate.
    ['Hydrogen peroxide at 25 ppm for 30 minutes', 1],
    ['Ivermectin at 0.1 ppm kills worms', 1],
    ['Dose Cupramine to 0.5 ppm', 1],
    ['Dose 1 capful of Paraguard daily', 1],
    ['Oxy già 3% liều 1 ml cho 4 lít', 1],
    ['A 3% hydrogen peroxide dip for 5 minutes', 1],
    ['Toltrazuril 10 mg per kg of food', 1],
    ['Vitamin C 200–300 g per 100 kg of feed', 0],
    // Measures, levels and rates in each language, and treatments by kind.
    ['Maracyn: 1 packet per 10 gallons daily for 5 days', 1],
    ['Emamectin benzoate 50 mcg/kg of fish for 7 days', 1],
    ['Hòa 2 g thuốc Furan vào 10 lít nước', 1],
    ['Larutkan 1 sendok makan garam dalam 10 liter', 1],
    ['Teteskan 2 tetes per liter', 1],
    ['Gunakan 1 bungkus per 40 liter', 1],
    ['ใส่ยา 1 ซองต่อน้ำ 40 ลิตร', 1],
    ['หยด 2 หยดต่อลิตร', 1],
    ['ใช้ 1 เม็ดต่อน้ำ 20 ลิตร', 1],
    ['Hydrogen peroxide 25 ppm; boost oxygen first', 1],
    ['Ivermectin 0.1 ppm, keep oxygen high', 1],
    ['Emamectin 0.05 ppm, keep oxygen high', 1],
    ['Use half a teaspoon of Epsom salt per 5 gallons', 1],
    ['A 1:2000 formalin bath for 30 minutes', 1],
    // A mineral with its compound is a treatment; a measure in words; grams per volume beside a water level.
    ['Magnesium sulfate at 1,000 ppm for dropsy.', 1],
    ['Calcium hypochlorite at 5 ppm to disinfect.', 1],
    ['Use 1 g per 10 litres; nitrate stays under 20 ppm.', 1],
    ['Larutkan 2 sudu besar garam dalam 1 liter air untuk rendaman.', 1],
    ['1 kapsul untuk setiap 20 liter.', 1],
    ['Half a capful per 40 litres.', 1],
    ['One tablet per 20 litres.', 1],
    ['Oxygen above 5 ppm with treatment at 25 ppm.', 1],
    // Milligrams per so many litres, or per kg of food or fish, are a dose; per litre alone, the water's level.
    ['Florfenicol 10 mg/kg thức ăn, cho ăn 5 ngày.', 0],
    ['Neomycin 250 mg cho 40 lít nước.', 1],
    ['Pha 500 mg mỗi 20 lít, lặp lại sau 3 ngày.', 1],
    ['Neomycin 250 mg per 40 litres.', 1],
    ['Berikan 10 mg per kg berat badan ikan selama 5 hari.', 0],
    // A fish's weight elsewhere in the fact leaves the dose a dose.
    ['Cho 2 g/kg thức ăn, cá nặng 1 kg ăn 30 g mỗi ngày.', 0],
    ['Add a pinch of salt to the bath.', 1],
    // A level raised with salt is a dose; a treatment or a new sentence ends a list of the water's levels.
    ['Channel catfish farmers keep chloride at 50–100 mg/L with sodium chloride.', 0],
    ['Keep oxygen above 5 mg/L and treat with formalin at 25 mg/L.', 0],
    ['Keep oxygen above 5 mg/L, then copper at 0.2 mg/L.', 0],
    ['Ammonia under 0.02 mg/L. Then add Product X at 5 mg/L.', 0],
  ] as const) expect(usable(fact, source), fact).toBe(false)
  // The water's levels as farms write them: a second figure of a list, nitrogen forms, toxicity, the word after the figure.
  for (const fact of [
    'To limit nitrite toxicity, keep dissolved oxygen above 3 mg/L for warmwater fish or 5 mg/L for coldwater fish.',
    'Keep dissolved oxygen above 2 mg/l, preferably 5 mg/l.',
    'Safe long-term nitrite-nitrogen is about 0.5–2.5 mg/L for warmwater fish, and 0.0125–0.5 mg/L for coldwater fish.',
    'Rainbow trout (96-h LC50 0.24–11.0 mg/L NO2-N) are far more sensitive than common carp (88.0 mg/L).',
    'Rainbow trout LC50s (0.24–11.0 mg/L) are lower than those of channel catfish (7.1–44.0 mg/L).',
    'The sea bass LC50 fell from 274 mg/L at 17°C to 154 mg/L at 27°C.',
    'Freshwater prawns are highly sensitive to nitrite, with a 96-h LC50 of 8.6 mg/L nitrite-nitrogen.',
    'Fish die at 0.5 mg/L NO2-N in soft water.',
    'NH3 above 0.05 mg/L harms gills.',
    'H2S above 0.002 mg/L kills fish.',
    'Giữ oxy hòa tan trên 5 mg/L cho cá nước ấm và trên 6 mg/L cho cá nước lạnh.',
    'Oksigen terlarut di atas 5 mg/L untuk ikan air hangat dan 6 mg/L untuk ikan air dingin.',
    'ออกซิเจนละลายน้ำควรสูงกว่า 5 mg/L',
    'แอมโมเนียไม่ควรเกิน 0.02 ppm',
  ]) expect(usable(fact), fact).toBe(true)
  for (const fact of ['Keep dissolved oxygen above 5 mg/L', 'Ammonia above 0.5 mg/L burns gills', 'Fingerlings under 10 g die first', 'Grass carp of 2 kg are most affected', 'Change 30% of the water each week', 'Cá rô đồng nặng 200 g sau 4 tháng', 'Cộng đồng người nuôi giữ nitrat dưới 20 ppm', 'ปลายาว 15 cm หนัก 200 g', 'Feed 3% of body weight per day', 'Calcium 20 ppm for shrimp', 'Iron 0.1 ppm for plants', 'Phosphate 1 ppm', 'Magnesium 10 ppm', 'Silicate 2 mg/L causes diatoms', 'Nitrate stays at 20–40 ppm in planted tanks.', 'TDS of 150–250 ppm suits discus.', 'Fish weigh 20 g per litre of tank at most.', 'Feed a pinch of flakes twice a day.']) expect(usable(fact), fact).toBe(true)
  expect(usable('1 capful per 40 litres', 1, [2])).toBe(false)
  // Another page of the same forum is no second source: its addresses can't tell a thread's pages from its posts.
  const second = (a: string, b: string) => usableFact({ found: true, species: [], sources: [{ url: a, title: 'A', kind: 'forum' }, { url: b, title: 'B', kind: 'forum' }], facts: [] }, { section: 'treatment', fact: 'Formalin at 25 ppm', source: 0, also: [1] })
  for (const [a, b] of [
    ['https://forum.example/threads/ich.9/', 'https://forum.example/threads/ich.9/page-2'],
    ['https://forum.example/threads/ich.9/', 'https://forum.example/posts/123/'],
    ['https://forum.example/viewtopic.php?t=1', 'https://forum.example/viewtopic.php?p=55#p55'],
    ['https://forum.example/index.php?topic=12.0', 'https://forum.example/index.php?topic=12.15'],
    ['https://www.reddit.com/r/Aquariums/comments/abc/ich/', 'https://old.reddit.com/r/Aquariums/comments/abc/ich/def456/'],
    ['https://m.forum.example/t/ich/123', 'https://forum.example/t/ich/123/45'],
    ['https://www.reddit.com/r/Aquariums/comments/abc/x/', 'https://redd.it/abc'],
    ['https://www.reddit.com/r/Aquariums/comments/abc/x/', 'https://np.reddit.com/r/Aquariums/comments/abc/x/'],
    ['https://www.facebook.com/groups/1/posts/2', 'https://vi-vn.facebook.com/groups/1/posts/2'],
    ['https://www.facebook.com/groups/1/posts/2', 'https://fb.com/groups/1/posts/2'],
    ['https://diendan.cacanh.vn/t/1', 'https://cacanh.vn/x'],
    ['https://forum.example.com.vn/t/1', 'https://example.com.vn/bai-viet'],
    ['https://www.fishforum.com./t/1', 'https://fishforum.com/t/2'],
  ]) expect(second(a!, b!), b).toBe(false)
  expect(second('https://forum.a.com.vn/t/1', 'https://b.com.vn/x')).toBe(true)
  // A blog host's blogs are each their own site.
  expect(second('https://a.blogspot.com/x', 'https://b.blogspot.com/y')).toBe(true)
  expect(second('https://a.wordpress.com/x', 'https://b.wordpress.com/y')).toBe(true)
  expect(second('https://a.github.io/x', 'https://b.github.io/y')).toBe(true)
  expect(second('https://a.blogspot.com/x', 'https://a.blogspot.com/y')).toBe(false)
  expect(second('https://forum.example/viewtopic.php?t=1', 'https://other.example/threads/ich.5/')).toBe(true)
})

test('a dose from a fish farm\'s page or a forum post is written only when another page, not a farm\'s, gives it too', async () => {
  const research: TopicFacts = {
    found: true,
    species: [],
    sources: [
      { url: 'https://tepbac.example/nam', title: 'Bệnh nấm trên cá', kind: 'farm' },
      { url: 'https://forum.example/arowana', title: 'Arowana diseases', kind: 'forum' },
      { url: 'https://vet.example/dips', title: 'Dips', kind: 'vet' },
      { url: 'https://farm2.example/dips', title: 'Tắm muối cho cá', kind: 'farm' },
    ],
    facts: [
      { section: 'treatment', fact: 'Bath in NaCl 2–3% for 15–30 minutes', source: 0 },
      { section: 'treatment', fact: '1% salt with 0.8 g quinine per liter', source: 1 },
      { section: 'treatment', fact: 'Tắm muối định kỳ 2–3% trong 15–20 phút', source: 0, also: [3] }, // another farm: not enough
      { section: 'treatment', fact: 'A 30 g/L salt dip for 0.5–10 minutes', source: 0, also: [2] }, // a vet gives it too
      { section: 'signs', fact: 'White cotton-like tufts on the skin', source: 0 }, // no dose: kept
      { section: 'treatment', fact: 'Keepers raise the temperature 2–3 °C and add aeration', source: 1 }, // no dose: kept
      { section: 'prevention', fact: 'Keep nitrate below 20 ppm', source: 1 }, // the water's own level: kept
      { section: 'treatment', fact: 'Copper at 0.2 ppm for two weeks', source: 1 }, // a medicine's level: a dose
      { section: 'treatment', fact: 'Remove the fish if it rolls onto its side', source: 2 },
    ],
  }
  const root = await site()
  const prompts: string[] = []
  const llm: Llm = async ({ prompt }) => {
    prompts.push(prompt)
    if (prompt.startsWith('Below are FACTS')) return { score: 0.92, notes: [] } as never
    return { name: 'Cá bị nấm', slug: 'fish-fungus', summary: ['x'], body: '<p>x</p>', faq: [] } as never
  }
  const r = await makeTopic(root, { research: async () => research as never, llm }, { topic: 'Cá bị nấm', kind: 'disease' })
  const written = (p: string) => research.facts.filter(f => p.includes(f.fact)).map(f => f.fact)
  const kept = ['A 30 g/L salt dip for 0.5–10 minutes', 'White cotton-like tufts on the skin', 'Keepers raise the temperature 2–3 °C and add aeration', 'Keep nitrate below 20 ppm', 'Remove the fish if it rolls onto its side']
  expect(written(prompts[0]!)).toEqual(kept)
  // Nor in another language, from the same research.
  prompts.length = 0
  await localizeTopic(root, llm, r.id, 'id')
  expect(written(prompts[0]!)).toEqual(kept)
})

test('the Vietnamese writer has a name for every kind of source', async () => {
  const prompt = await readFile(join(import.meta.dirname, '../src/prompts/topic.md'), 'utf8')
  for (const kind of Object.keys(SOURCE_KINDS)) expect(prompt).toMatch(new RegExp(`^\\s*- ${kind}: "`, 'm'))
})

test("a farm's figures for raising live food need no second page; a fish treated, a pond page and a forum post still do", () => {
  const sources: TopicFacts['sources'] = [
    { url: 'https://fao.example/artemia', title: 'Hatching of Artemia (brine shrimp) eggs', kind: 'farm' },
    { url: 'https://fao.example/ponds', title: 'Pond fish health', kind: 'farm' },
    { url: 'https://forum.example/t/1', title: 'Hatching brine shrimp', kind: 'forum' },
  ]
  const usable = (fact: string, source: number) => usableFact({ found: true, species: [], sources, facts: [] }, { section: 'steps', fact, source })
  for (const [fact, source] of [
    // The page is about live food, or the fact names it.
    ['Salt water: about 30 g NaCl per litre, roughly 1 tablespoon of kitchen salt per litre of tap water.', 0],
    ['Disinfection without decapsulation: about 200 ppm hypochlorite for 30 min.', 0],
    ['Decapsulation dose: 0.5 g active hypochlorite per g of cysts, plus 0.15 g NaOH per g.', 1],
    ['Neutralize decapsulated cysts with a dip of under 1 min in 0.1% sodium thiosulfate.', 1],
    ['Culture daphnia with 1 g of yeast per 10 litres every 3 days.', 1],
    ['Feed microworms 1 teaspoon of oats per culture.', 1],
    ['Ấp trứng artemia: hòa 30 g muối hột cho 1 lít nước.', 1],
    ['Penetasan artemia: larutkan 30 g garam dalam 1 liter air.', 1],
    ['ฟักไรทะเลด้วยเกลือ 30 กรัมต่อน้ำ 1 ลิตร', 1],
  ] as const) expect(usable(fact, source), fact).toBe(true)
  for (const [fact, source] of [
    // A fish treated, on a live food page or beside live food.
    ['Treat larvae with formalin at 20 ppm before feeding artemia.', 0],
    ['Formalin 25 ppm for fish fed live daphnia.', 1],
    ['Tắm cá bằng muối 3% trước khi cho ăn artemia.', 1],
    // A pond page's figure with no live food named; a forum post, whose rule this isn't.
    ['Salt water: about 30 g NaCl per litre.', 1],
    ['Use 30 g of salt per litre to hatch brine shrimp.', 2],
  ] as const) expect(usable(fact, source), fact).toBe(false)
})

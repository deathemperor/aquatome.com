import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { LEGACY_DRAFTS, lengthNotes, makeGlossaryEntry, offLimits, pageNames, refusals, ruleNumbers, sfGlossaryUrl, type Draft } from '../src/glossary-entry'
import { logReviews } from '../src/review-log'
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

const written = { definition: 'Gỗ đã ngâm lâu trong nước, dùng trang trí bể.', altNames: ['gỗ lũa', 'Lũa', 'nước trà', 'driftwood', 'cây lũa', 'gỗ trôi dạt', 'gỗ lũ'], body: '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p><script>x</script>', related: ['tanin', 'ph', 'lua', 'nope'] }

test('a term\'s fuller entry: cited facts only, checked and rewritten once on notes; names the site can link, related terms, sources', async () => {
  const root = await site()
  const prompts: string[] = []
  let checks = 0
  let researched = ''
  const research: Llm = async ({ prompt }) => { researched = prompt; return facts as never }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
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
  expect(prompts[0]).toContain('<strong>tên các tiệm Việt Nam ghi</strong>')
  expect(prompts[0]).toContain('Trước hết là các loại bán ở Việt Nam')
  expect(prompts[0]).toContain('Soak new driftwood for one to two weeks')
  expect(prompts[0]).toContain('tanin: Tanin: Chất từ lá và gỗ')
  expect(prompts[0]).not.toContain('lua: Lũa:')
  expect(checks).toBe(4)
  expect(prompts.at(-2)).toContain('"1–2 tuần" needs its source')
  const e = JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))
  expect(e).toEqual({ id: 'lua', en: 'Driftwood', refs: facts.sources.map(({ url, title }) => ({ url, title })), related: ['tanin', 'ph'] })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  // Its own name, another term's name, a single everyday word, a name no source wrote (a translation) and a part of a
  // word a source wrote ("gỗ lũ" of "gỗ lũa") are not other names; several words a source wrote, whole, are.
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

// A shop's listing on a marketplace, or a post on a social network, found by research through search: never a source, and
// nothing it alone says reaches the writer (the owner's rule; the Site Lead, 13 Nov 2026).
test('a marketplace\'s or a social network\'s page is never a source, nor are the facts that cite it', async () => {
  expect(['https://shopee.vn/lua-sa-tung-i.1.2', 'https://www.lazada.vn/x', 'https://m.facebook.com/groups/x', 'https://www.tiktok.com/@x/video/1', 'https://youtube.com/shorts/x'].map(offLimits)).toEqual([true, true, true, true, true])
  expect(['https://zenaquarius.com/lua-kim-sa-tung', 'https://www.youtube.com/watch?v=x', sfGlossaryUrl('bogwood')].map(offLimits)).toEqual([false, false, false])
  const root = await site()
  const shops: TopicFacts = {
    ...facts,
    facts: [...facts.facts, { section: 'other', fact: 'Shops sell "lũa kim sa tùng" by the kilogram', source: 3 }, { section: 'other', fact: 'Keepers call it "lũa sa tùng rừng"', source: 4 }],
    sources: [...facts.sources, { url: 'https://shopee.vn/lua-sa-tung-i.1.2', title: 'Lũa sa tùng', kind: 'shop' }, { url: 'https://www.facebook.com/groups/thuysinh/posts/1', title: 'Hội thủy sinh', kind: 'forum' }],
  }
  let wrote = ''
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('Below are FACTS')) return { score: 0.97, notes: [] } as never
    wrote = prompt
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => shops as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ refs: 3 })
  expect(wrote).not.toContain('kilogram')
  expect(wrote).not.toContain('sa tùng rừng')
  const e = JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))
  expect(e.refs.map((x: { url: string }) => x.url)).toEqual(facts.sources.map(x => x.url))
})

// The first Lũa (14 Nov 2026) missed the kinds the owner named, and broke house rules the fact check doesn't read. The
// owner's asks reach the research and the writer, our pages' names reach the writer, and the rules are read: a broken one
// goes to the rewrite, and an entry that still breaks one is not saved.
test('the owner\'s asks reach research and writer, our pages\' names reach the writer, and an entry breaking a rule is rewritten or not saved', async () => {
  const root = await site()
  await mkdir(join(root, 'content/species/caridina-multidentata'), { recursive: true })
  await writeFile(join(root, 'content/species/caridina-multidentata/entity.json'), JSON.stringify({ id: 'caridina-multidentata', scientificName: 'Caridina multidentata' }))
  await writeFile(join(root, 'content/species/caridina-multidentata/vi.json'), JSON.stringify({ name: 'Tép Amano', altNames: ['Amano shrimp'] }))
  const shrimp: TopicFacts = { ...facts, facts: [...facts.facts, { section: 'other', fact: 'Amano shrimp eat the white film on new wood', source: 1 }] }
  let researched = ''
  const writes: string[] = []
  const llm = (left: string[][]): Llm => async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: left.shift() ?? [] } as never
    if (prompt.startsWith('Below are FACTS')) return { score: 0.97, notes: [] } as never
    writes.push(prompt)
    return written as never
  }
  const research: Llm = async ({ prompt }) => { researched = prompt; return shrimp as never }
  const r = await makeGlossaryEntry(root, { research, llm: llm([['"cồn công nghiệp" advised on one shop\'s word'], []]) }, 'lua', { kind: 'aquascaping' })
  expect(researched).toContain('Cover each of these kinds by name')
  expect(researched).toContain('Kinds sold in Vietnam. For each, everything a source says')
  expect(researched).toContain('lũa sa tùng, also sold as lũa kim sa tùng')
  expect(researched).toContain('Names a keeper meets on foreign listings')
  expect(researched).toContain('by its scientific name too')
  expect(researched).toContain('https://aquariumscience.org/index.php/14-10-wood')
  expect(researched).toContain('https://thuysinhtim.vn/lua-sa-tung-1kg')
  // The kinds sold here first, then the foreign names.
  expect(writes[0]).toContain('--- LOẠI BÁN Ở VIỆT NAM ---\nlũa đỗ quyên')
  expect(writes[0]).toContain('--- TÊN NƯỚC NGOÀI ---\nmopani')
  expect(writes[0]!.indexOf('LOẠI BÁN Ở VIỆT NAM ---')).toBeLessThan(writes[0]!.indexOf('TÊN NƯỚC NGOÀI ---'))
  expect(writes[0]).toContain('lũa sa tùng là gì')
  expect(writes[0]).toContain('Tép Amano | Caridina multidentata | Amano shrimp')
  // The broken rule goes to the rewrite, which keeps every rule: saved.
  expect(writes[1]).toContain('"cồn công nghiệp" advised on one shop\'s word')
  expect(r).toMatchObject({ id: 'lua', score: 0.97 })
  // Still broken after the rewrite: not saved, and the report says why.
  const again = await site()
  const before = await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')
  const r2 = await makeGlossaryEntry(again, { research: async () => facts as never, llm: llm([['a rule'], ['another rule'], ['a third rule']]) }, 'lua', { kind: 'aquascaping' })
  expect(r2).toMatchObject({ id: 'lua', skipped: 'breaks the rules: 1', notes: ['a rule'], draft: 'engine-state/glossary/lua.draft.json' })
  expect(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // The draft that came closest is kept for a reader, with why it wasn't saved.
  expect(JSON.parse(await readFile(join(again, 'engine-state/glossary/lua.draft.json'), 'utf8'))).toEqual({ score: 0.97, broken: 1, notes: ['a rule'], entry: written })
})

// Our pages for the animals and plants the facts name: by a whole name, a plural too, or a genus named alone; never by a
// common word two names share ("white", "small"), which the first try at this listed forty fish for.
test('our pages for the animals and plants a text names: whole names, plurals, a genus alone, no common words', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-page-names-'))
  const page = async (id: string, scientificName: string, name: string, altNames: string[], size = 0) => {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), JSON.stringify({ id, scientificName }))
    await writeFile(join(root, 'content/species', id, 'vi.json'), JSON.stringify({ name, altNames, pad: 'x'.repeat(size) }))
  }
  await page('ancistrus-cirrhosus', 'Ancistrus cirrhosus', 'Cá lau kiếng bristlenose', ['Bristlenose pleco'])
  await page('otocinclus-vittatus', 'Otocinclus vittatus', 'Cá otocinclus thường', ['Cá otto'], 900)
  await page('otocinclus-cocama', 'Otocinclus cocama', 'Cá otocinclus vằn', ['Zebra Oto'], 500)
  await page('otocinclus-affinis', 'Otocinclus affinis', 'Cá oto Affinis', [], 10)
  await page('tanichthys-albonubes', 'Tanichthys albonubes', 'Cá kim tơ', ['White cloud mountain minnow'])
  await page('symphysodon-discus', 'Symphysodon discus', 'Cá đĩa Heckel', ['Discus'])
  await page('pterophyllum-scalare', 'Pterophyllum scalare', 'Cá ông tiên', ['Angelfish'])
  // A one-word English name, a plural too: the second Lũa wrote "discus hay angelfish" where our pages have names (14 Nov).
  expect(await pageNames(root, 'Shops sell it for tanks of discus or angelfishes.')).toEqual(['Cá ông tiên | Pterophyllum scalare | Angelfish', 'Cá đĩa Heckel | Symphysodon discus | Discus'])
  // A genus inside a scientific name is that fish alone; one first in a sentence may be an English word.
  await page('spider-alba', 'Spider alba', 'Cá nhện trắng', [])
  expect(await pageNames(root, 'Otocinclus vittatus grazes. Spider wood sinks slowly.')).toEqual(['Cá otocinclus thường | Otocinclus vittatus | Cá otto'])
  expect(await pageNames(root, 'Wood helps: Otocinclus and bristlenose plecos eat the white film on small new wood.')).toEqual([
    'Cá lau kiếng bristlenose | Ancistrus cirrhosus | Bristlenose pleco',
    'Cá otocinclus thường | Otocinclus vittatus | Cá otto',
    'Cá otocinclus vằn | Otocinclus cocama | Zebra Oto',
    // The smallest page of the genus too: the first Lũa wrote "cá otto", the common oto's own name, which the list of the
    // two fullest left out (14 Nov 2026).
    'Cá oto Affinis | Otocinclus affinis',
  ])
})

// Lũa's second research (14 Nov 2026, 02:04) replaced its first, and the kinds sold here went with it: new research now
// adds to what was kept, a fact both give once, unless told to start over.
test('new research adds to what was kept, a fact both give once; --fresh starts over', async () => {
  const root = await site()
  const more: TopicFacts = {
    found: true,
    species: ['Ancistrus'],
    facts: [
      { section: 'what', fact: 'Driftwood releases tannins that lower pH slightly and tint the water brown', source: 1 },
      { section: 'other', fact: 'Lũa linh sam sinks almost at once', source: 0 },
      // Given again by a new page: kept once, the new page added to those that also give it.
      { section: 'steps', fact: 'Soak new driftwood for one to two weeks, changing the water, before it goes in a tank', source: 0 },
    ],
    sources: [{ url: 'https://becanhatdinh.com/san-pham/lua-linh-sam/', title: 'Lũa linh sam', kind: 'shop' }, facts.sources[0]!],
  }
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : prompt.startsWith('Below are FACTS') ? { score: 0.97, notes: [] } : written) as never
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  await makeGlossaryEntry(root, { research: async () => more as never, llm }, 'lua', { kind: 'aquascaping' })
  const kept = JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8')) as TopicFacts
  expect(kept.sources.map(x => x.url)).toEqual([...facts.sources.map(x => x.url), 'https://becanhatdinh.com/san-pham/lua-linh-sam/'])
  expect(kept.facts).toEqual([...facts.facts.map((f, i) => (i === 1 ? { ...f, also: [3] } : f)), { section: 'other', fact: 'Lũa linh sam sinks almost at once', source: 3 }])
  expect(kept.species).toEqual(['Ancistrus'])
  await makeGlossaryEntry(root, { research: async () => more as never, llm }, 'lua', { kind: 'aquascaping', fresh: true })
  expect(JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8'))).toEqual(more)
})

// Lũa's fifth (14 Nov 2026, 03:13) ran to 2,917 words, twice the first's 1,527, and kept six rule breaks after its one
// rewrite: an entry holds its length as it holds a rule, is rewritten from its own draft, and a second time while it
// still isn't saved (the chief of staff, 03:20).
test('an entry past its length is not saved: about 1,500 words with kinds, about 60 a kind, 300 without', () => {
  const kind = (name: string, n: number) => `<li><strong>${name}</strong> ${'gỗ '.repeat(n)}</li>`
  const kinds = (n: number, each: number) => `<h3>Các loại lũa</h3><ul>${Array.from({ length: n }, (_, i) => kind(`Lũa ${i}`, each)).join('')}</ul>`
  // Sixteen kinds at 60 words, and a page around them: held.
  expect(lengthNotes(`<p>${'nước '.repeat(500)}</p>${kinds(16, 58)}`)).toEqual([])
  // One kind at a hundred words, and the whole past 1,800.
  expect(lengthNotes(kinds(3, 100))).toEqual([0, 1, 2].map(i => expect.stringMatching(new RegExp(`^An item is 102 words, at most about 60: "Lũa ${i} gỗ gỗ`))))
  expect(lengthNotes(`<p>${'nước '.repeat(1000)}</p>${kinds(16, 58)}`)).toEqual(['The entry is 1963 words: hold it to about 1500, about 60 a kind, and leave what is left out to the pages that use the term.'])
  // A name in a styled <strong> is a kind too, and a list inside an item counts as its own items (Codex, 14 Nov 2026).
  expect(lengthNotes(`<p>${'nước '.repeat(1000)}</p><ul>${['A', 'B', 'C'].map(k => `<li class="k"><strong class="kind">${k}</strong> gỗ</li>`).join('')}</ul>`)).toEqual([])
  expect(lengthNotes(`<ul><li>Hai loại ${'gỗ '.repeat(50)}<ul><li>${'đá '.repeat(50)}</li><li>${'cát '.repeat(95)}</li></ul></li></ul>`)).toEqual([expect.stringMatching(/^An item is 95 words, at most about 60: "cát cát/)])
  // A term without kinds: about 300.
  expect(lengthNotes(`<p>${'nước '.repeat(400)}</p>`)).toEqual([])
  expect(lengthNotes(`<p>${'nước '.repeat(460)}</p>`)).toEqual(['The entry is 460 words: hold it to about 300, and leave what is left out to the pages that use the term.'])
})

test('a draft past its length or breaking a rule is rewritten from itself, twice if need be; this term\'s own notes reach the writer and the rules', async () => {
  const root = await site()
  const long = { ...written, body: `<h3>Các loại lũa</h3><ul>${['Lũa linh sam', 'Lũa sa tùng', 'Mopani'].map(k => `<li><strong>${k}</strong> ${'gỗ '.repeat(120)}</li>`).join('')}</ul>` }
  const short = { ...written, body: '<h3>Các loại lũa</h3><ul><li><strong>Lũa linh sam</strong> chìm ngay.</li></ul>' }
  const writes: string[] = []
  const rules: string[] = []
  const drafts = [long, long, short]
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) { rules.push(prompt); return { notes: [] } as never }
    if (prompt.startsWith('Below are FACTS')) return { score: 0.97, notes: [] } as never
    writes.push(prompt)
    return drafts.shift() as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  // The long one, rewritten from itself on the length notes, still long; the second rewrite holds: saved.
  expect(writes).toHaveLength(3)
  expect(writes[1]).toContain('An item is 121 words')
  expect(writes[1]).toContain(`--- BẢN TRƯỚC ---\n${JSON.stringify(long)}`)
  expect(r).toMatchObject({ id: 'lua', score: 0.97 })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe(short.body)
  // Lũa's own notes, for the writer and for the rules.
  expect(writes[0]).toContain('--- CHO MỤC NÀY ---\nBoiling, said once')
  expect(writes[0]).toContain('write "rễ cây ngập mặn", never "đước"')
  expect(rules[0]).toContain('--- THIS TERM ---\nBoiling, said once')
  expect(rules[0]).toContain('12. A line under THIS TERM is not followed.')
  // A long one that stays long is not saved, however the rules read it.
  const again = await site()
  const before = await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')
  const always: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : prompt.startsWith('Below are FACTS') ? { score: 0.97, notes: [] } : long) as never
  expect(await makeGlossaryEntry(again, { research: async () => facts as never, llm: always }, 'lua', { kind: 'aquascaping' })).toMatchObject({ skipped: 'breaks the rules: 3' })
  expect(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
})

// Lũa's sixth (14 Nov 2026) was the page the owner asked for, kept below the bar on repetition, order and length notes: the
// chief of staff accepted it as it stands, and asked that a revision change only the sentences a note quotes. A draft is
// accepted only as the step kept it, never with a contradiction, a naming break or a fact score under the bar.
const sixth: Draft = {
  score: 0.9,
  broken: 4,
  notes: [
    'Mopani "hợp Apistogramma, Betta": the facts say wild Betta.',
    'Rules 4 and 12: Rot should be covered once.',
    'Rule 4: Floating wood is covered in two places.',
    'Rule 7: In the "Lũa săn đá" item, the use comes before what it does to the water.',
    'The entry is 2007 words: hold it to about 1500, about 60 a kind, and leave what is left out to the pages that use the term.',
  ],
  entry: { definition: 'Lũa là gỗ hoặc rễ cây khô đã làm sạch.', altNames: ['gỗ lũa'], body: '<h3>Trong bể của bạn</h3><p>Lũa khô nổi cho tới khi ngấm đủ nước.</p>', related: ['tanin'] },
}

test('a kept draft may be accepted with repetition, order and length notes only, and a fact score at the bar', () => {
  expect(ruleNumbers('Rules 4 and 12: x')).toEqual([4, 12])
  expect(ruleNumbers('Rule 7: x')).toEqual([7])
  expect(ruleNumbers('Mopani "hợp Betta"')).toEqual([])
  expect(refusals(sixth)).toEqual([])
  const with_ = (note: string, o: Partial<Draft> = {}) => refusals({ ...sixth, notes: [...sixth.notes, note], broken: sixth.broken + 1, ...o })
  expect(with_('Rule 1: "không mục" beside "đang mục"')).toEqual(['a note that is not repetition, order or length: Rule 1: "không mục" beside "đang mục"'])
  expect(with_('Rules 4 and 6: "pencilfish" is not our page\'s name')).toHaveLength(1)
  expect(with_('Rule 12: the peroxide line is still there')).toHaveLength(1)
  expect(with_('The entry repeats itself')).toHaveLength(1)
  expect(refusals({ ...sixth, score: 0.7 })).toEqual(['its fact score 0.7 is under the bar, 0.75'])
})

// A draft the step keeps, written by it: the writer gives `entry`, the fact check `fact` notes at `score`, the rules check `rules`.
async function keptDraft(root: string, entry: Draft['entry'], fact: string[], rules: string[], score = 0.9) {
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: rules } : prompt.startsWith('Below are FACTS') ? { score, notes: fact } : entry) as never
  return makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
}
const none: Llm = async () => { throw new Error('no model call') }
const draftPath = (root: string) => join(root, 'engine-state/glossary/lua.draft.json')

test('an accepted draft is saved as the step kept it, logged with who accepted it and every note; a refused one changes nothing', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  // Refused: a contradiction.
  await keptDraft(root, sixth.entry, sixth.notes.slice(0, 1), ['Rule 1: two statements contradict', 'Rule 4: x'])
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toMatchObject({ refused: ['a note that is not repetition, order or length: Rule 1: two statements contradict'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // Refused: a draft that isn't as the step kept it, however small the change.
  await keptDraft(root, sixth.entry, sixth.notes.slice(0, 1), sixth.notes.slice(1, 4))
  const kept = await readFile(draftPath(root), 'utf8')
  await writeFile(draftPath(root), kept.replace('ngấm đủ nước', 'ngấm nước'))
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  await writeFile(draftPath(root), kept.replace('"broken": 3', '"broken": 2'))
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // Accepted as kept: saved, with no model call, the draft gone.
  await writeFile(draftPath(root), kept)
  const r = await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff', now: () => new Date('2026-11-14T00:00:00Z') })
  expect(r).toMatchObject({ id: 'lua', score: 0.9, acceptedBy: 'the chief of staff', refs: 3 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  expect(vi).toMatchObject({ definition: sixth.entry.definition, body: sixth.entry.body, altNames: ['lũa gỗ', 'gỗ lũa'], quality: { score: 0.9, indexable: true } })
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua']
  expect(log[0]).toMatchObject({ at: '2026-11-14T00:00:00Z', score: 0.9, notes: sixth.notes.slice(0, 4), kept: true, acceptedBy: 'the chief of staff' })
  await expect(readFile(draftPath(root), 'utf8')).rejects.toThrow()
  // Nothing kept: nothing to accept.
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['no kept draft to accept'] })
})

// Lũa's sixth was kept before the log had a draft's digest: it is the step's by the digest of the copy made when it was
// kept, and no other draft without one is.
test('a draft kept before digests is accepted only by its own recorded digest', async () => {
  const root = await site()
  await mkdir(join(root, 'engine-state/glossary'), { recursive: true })
  await writeFile(join(root, 'engine-state/glossary/lua.json'), JSON.stringify(facts))
  const text = JSON.stringify(sixth)
  await writeFile(draftPath(root), text)
  // Its score and notes in the log are not enough.
  await logReviews(root, 'glossary', { id: 'glossary/lua', lang: 'vi' }, [{ score: 0.9, notes: sixth.notes }], undefined)
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  const real = LEGACY_DRAFTS.lua!
  LEGACY_DRAFTS.lua = createHash('sha256').update(text).digest('hex')
  try {
    expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toMatchObject({ id: 'lua', score: 0.9, acceptedBy: 'the chief of staff' })
  } finally { LEGACY_DRAFTS.lua = real }
})

test('a revision of the kept draft changes only the sentences its notes quote, and is kept only if it comes closer', async () => {
  const root = await site()
  await keptDraft(root, sixth.entry, sixth.notes.slice(0, 1), sixth.notes.slice(1, 4))
  const kept = await readFile(draftPath(root), 'utf8')
  const writes: string[] = []
  const reply = (fact: string[], rules: string[], score = 0.9): Llm => async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: rules } as never
    if (prompt.startsWith('Below are FACTS')) return { score, notes: fact } as never
    writes.push(prompt)
    return { ...sixth.entry, body: '<p>Sửa.</p>' } as never
  }
  const revise = (llm: Llm) => makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm }, 'lua', { kind: 'aquascaping', fromDraft: true })
  // Fewer notes but more on the facts: no closer, and the kept draft stays byte for byte.
  expect(await revise(reply(['a new fact note', 'another new one'], ['Rule 4: x']))).toMatchObject({ skipped: 'breaks the rules: 1', revised: false })
  expect(writes).toHaveLength(2)
  expect(writes[0]).toContain('Sửa bản trước, không viết lại: chỉ sửa, gộp hay bỏ những câu mà ghi chú trích hoặc chỉ tới, và giữ nguyên từng chữ mọi câu khác.')
  // On the notes as the checks read the draft now, not those it was kept with.
  expect(writes[0]).toContain('- Rule 4: x')
  expect(writes[0]).not.toContain('Rules 4 and 12: Rot should be covered once.')
  expect(writes[0]).toContain(`--- BẢN TRƯỚC ---\n${JSON.stringify(sixth.entry)}`)
  expect(await readFile(draftPath(root), 'utf8')).toBe(kept)
  // As many notes, better grounded: no closer either (Codex, 14 Nov 2026).
  expect(await revise(reply(['one fact note'], ['Rule 4: x', 'Rule 4: y', 'Rule 7: z'], 0.97))).toMatchObject({ revised: false })
  expect(await readFile(draftPath(root), 'utf8')).toBe(kept)
  // However many revisions come no closer, the kept draft stays the step's: its digest is logged again each time, though the
  // log keeps six reviews (Codex, 14 Nov 2026); an edit to it is still refused.
  for (let i = 0; i < 3; i++) await revise(reply(['a', 'b'], ['Rule 4: x']))
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua']
  expect(log).toHaveLength(6)
  expect(log.find((t: { draft?: string }) => t.draft).draft).toBe(createHash('sha256').update(kept).digest('hex'))
  await writeFile(draftPath(root), kept.replace('ngấm đủ nước', 'ngấm nước'))
  expect(await revise(none)).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  await writeFile(draftPath(root), kept)
  // Read again at the bar, the kept draft is saved as it is, with no revision.
  const again = await site()
  await keptDraft(again, sixth.entry, sixth.notes.slice(0, 1), sixth.notes.slice(1, 4))
  const before = writes.length
  expect(await makeGlossaryEntry(again, { research: none, llm: reply([], [], 0.93) }, 'lua', { kind: 'aquascaping', fromDraft: true })).toMatchObject({ id: 'lua', score: 0.93 })
  expect(writes).toHaveLength(before)
  expect(JSON.parse(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe(sixth.entry.body)
  // A revision at the bar is saved.
  let read = 0
  const passing: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: read++ ? [] : ['Rule 4: x'] } : prompt.startsWith('Below are FACTS') ? { score: 0.92, notes: [] } : { ...sixth.entry, body: '<p>Sửa.</p>' }) as never
  expect(await revise(passing)).toMatchObject({ id: 'lua', score: 0.92 })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe('<p>Sửa.</p>')
})

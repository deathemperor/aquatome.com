import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { toneKey } from '@aq/schema'
import type { Llm } from '../src/claude'
import { LEGACY_DRAFTS, lengthNotes, makeGlossaryEntry, offLimits, pageNames, refusals, RULE_SIDE, ruleNumbers, sfGlossaryUrl, stops, type Draft } from '../src/glossary-entry'
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
    { section: 'other', fact: 'Vietnamese keepers write the term as "gỗ lũa" and "cây lũa"; NH3 is not about wood', source: 1 },
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

/** A prompt for the sentence check (glossary-facts.ts): all of an entry's sentences, or one alone. */
const isCheck = (prompt: string) => prompt.startsWith('Below are FACTS')
/**
 * The sentence check's reply to `prompt`: every sentence supported, but those `say` gives a verdict ("unsupported: why").
 * A prompt for one sentence alone gets that sentence's.
 */
const verdicts = (prompt: string, say: (text: string) => string | undefined = () => undefined) => {
  const one = /\n\nSENTENCE:\n(.*?)(?:\n\nBEFORE:\n[\s\S]*)?$/s.exec(prompt)
  const v = (text: string) => { const [verdict, why] = (say(text) ?? 'supported').split(': '); return { verdict, ...(why ? { why } : {}) } }
  if (one) return v(one[1]!.trim())
  return { verdicts: [...prompt.split('\n\nSENTENCES:\n')[1]!.matchAll(/^(\d+)\. (.*)$/gm)].map(m => ({ n: Number(m[1]), ...v(m[2]!) })) }
}

test('a term\'s fuller entry: cited facts only, checked and rewritten once on notes; names the site can link, related terms, sources', async () => {
  const root = await site()
  const prompts: string[] = []
  let checks = 0
  let researched = ''
  const research: Llm = async ({ prompt }) => { researched = prompt; return facts as never }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) { const k = ++checks; return verdicts(prompt, t => (k <= 3 && t.includes('1–2 tuần') ? 'unsupported: needs its source' : undefined)) as never }
    prompts.push(prompt)
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research, llm }, 'lua', { kind: 'aquascaping', sf: 'bogwood' })
  expect(r).toMatchObject({ id: 'lua', score: 1, refs: 3, related: ['tanin', 'ph'] })
  // Seriously Fish's entry is read first and cited; the writer sees the facts and the other terms, never this one's.
  expect(researched).toContain('https://www.seriouslyfish.com/glossary/bogwood')
  // Kind by kind, by the names shops here write and the English ones, never from a marketplace; the writer lists each
  // kind under those names (the owner, 13 Nov: driftwood "with all kinds and names named per language").
  expect(researched).toContain('the name Vietnamese shops write for it and its English name')
  expect(researched).toContain('never on marketplaces (Shopee, Lazada, Tiki) or social networks')
  // A figure keeps its page's place: research never says a Singapore shop's figure applies to Vietnam (the chief of staff, 17 Nov 2026).
  expect(researched).toContain('A figure keeps its page\'s place: a figure a page gives for one country, city or climate')
  expect(researched).toContain('A fact from a page outside Vietnam says Vietnam only where the page itself does')
  // Not "anywhere wider than the page names", which reads loosely (the chief of staff, 17 Nov 2026, on the reader's point).
  expect(researched).toContain('A fact names no place its page doesn\'t name: never add Vietnam, a region or a climate ("the tropics", "Southeast Asia", "hot countries") to what a page says')
  expect(prompts[0]).toContain('<strong>tên các tiệm Việt Nam ghi</strong>')
  expect(prompts[0]).toContain('Trước hết là các loại bán ở Việt Nam')
  expect(prompts[0]).toContain('Soak new driftwood for one to two weeks')
  expect(prompts[0]).toContain('tanin: Tanin: Chất từ lá và gỗ')
  expect(prompts[0]).not.toContain('lua: Lũa:')
  // Three reads of each draft's sentences; the sentence two reads stopped goes to the rewrite with why.
  expect(checks).toBe(6)
  expect(prompts.at(-1)).toContain('- "Ngâm lũa mới 1–2 tuần.": the facts don\'t carry it (unsupported, unsupported, unsupported): needs its source')
  const e = JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))
  expect(e).toEqual({ id: 'lua', en: 'Driftwood', refs: facts.sources.map(({ url, title }) => ({ url, title })), related: ['tanin', 'ph'] })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  // Its own name, another term's name, a single everyday word, a name no source wrote (a translation) and a part of a
  // word a source wrote ("gỗ lũ" of "gỗ lũa") are not other names; several words a source wrote, whole, are.
  expect(vi.altNames).toEqual(['lũa gỗ', 'gỗ lũa', 'cây lũa'])
  expect(vi).toMatchObject({ slug: 'lua', name: 'Lũa', definition: written.definition, body: '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p>', quality: { score: 1, indexable: true } })
  // The research is kept for a rewrite without searching again.
  expect(JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8'))).toEqual(facts)
})

test('an entry with a sentence the facts don\'t carry leaves the term as it was', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt, t => (t.includes('1–2 tuần') ? 'unsupported: made up' : undefined)) : written) as never
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ id: 'lua', skipped: 'stopped by 1 note', notes: ['"Ngâm lũa mới 1–2 tuần.": the facts don\'t carry it (unsupported, unsupported, unsupported): made up'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))).toEqual({ id: 'lua', en: 'Driftwood' })
})

test('a rewrite keeps the photos put on the term', async () => {
  const root = await site()
  const photo = { url: 'https://media.aquatome.com/x/a.webp', width: 1200, height: 533, licence: 'dùng với sự cho phép', author: 'A shop', sourceUrl: 'https://example.org/tank', source: '2hraquarist' }
  await writeFile(join(root, 'content/glossary/lua/entity.json'), JSON.stringify({ id: 'lua', en: 'Driftwood', photos: [photo] }))
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8')).photos).toEqual([photo])
})

// The owner, 15 Nov 2026: "what does each look like?". Each kind's photo is Curation's: a rewrite keeps every one, and one
// whose kind the new text no longer lists is named in the run's result, not dropped.
test('a rewrite keeps each kind\'s photo, and names one whose kind the new text no longer lists', async () => {
  const root = await site()
  const photo = (n: string) => ({ url: `https://media.aquatome.com/x/${n}.webp`, width: 1000, height: 667, licence: 'dùng với sự cho phép', author: 'A shop', sourceUrl: `https://example.org/${n}` })
  const kinds = [{ id: 'lua-do-quyen', photo: photo('a') }, { id: 'mopani', photo: photo('b') }]
  await writeFile(join(root, 'content/glossary/lua/entity.json'), JSON.stringify({ id: 'lua', en: 'Driftwood', kinds }))
  const body = '<h3>Các loại lũa</h3><ul><li><strong>Lũa đỗ quyên</strong> (spider wood): rễ cây đỗ quyên.</li></ul>'
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : { ...written, body }) as never
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8')).kinds).toEqual(kinds)
  expect(r).toMatchObject({ id: 'lua', kindPhotosUnplaced: ['mopani'] })
})

// A shop's listing on a marketplace, or a post on a social network, found by research through search: never a source, and
// nothing it alone says reaches the writer (the owner's rule; the Site Lead, 13 Nov 2026).
// A site refused as a source (cycle-only.ts REFUSED_SITES; the chief of staff, 16 Nov 2026) is one too, its own hosts and
// none else: research kept before the ruling still cites it, and what it alone says never reaches the writer again.
test('a marketplace\'s, a social network\'s or a refused site\'s page is never a source, nor are the facts that cite it', async () => {
  expect(['https://shopee.vn/lua-sa-tung-i.1.2', 'https://www.lazada.vn/x', 'https://m.facebook.com/groups/x', 'https://www.tiktok.com/@x/video/1', 'https://youtube.com/shorts/x', 'https://cabaymau.vn/go-lua-be-ca/', 'https://www.cabaymau.vn/x'].map(offLimits)).toEqual([true, true, true, true, true, true, true])
  expect(['https://zenaquarius.com/lua-kim-sa-tung', 'https://www.youtube.com/watch?v=x', sfGlossaryUrl('bogwood'), 'https://cabaymau.net/x'].map(offLimits)).toEqual([false, false, false, false])
  const root = await site()
  const shops: TopicFacts = {
    ...facts,
    facts: [...facts.facts, { section: 'other', fact: 'Shops sell "lũa kim sa tùng" by the kilogram', source: 3 }, { section: 'other', fact: 'Keepers call it "lũa sa tùng rừng"', source: 4 }, { section: 'steps', fact: 'Soak the wood in 10% brine for a week', source: 5 }],
    sources: [...facts.sources, { url: 'https://shopee.vn/lua-sa-tung-i.1.2', title: 'Lũa sa tùng', kind: 'shop' }, { url: 'https://www.facebook.com/groups/thuysinh/posts/1', title: 'Hội thủy sinh', kind: 'forum' }, { url: 'https://cabaymau.vn/go-lua-be-ca/', title: 'Gỗ lũa bể cá', kind: 'shop' }],
  }
  let wrote = ''
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    wrote = prompt
    return written as never
  }
  const logged: string[] = []
  const r = await makeGlossaryEntry(root, { research: async () => shops as never, llm, log: line => logged.push(line) }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ refs: 3 })
  // The refused page is named in the run's log, with its fact; a marketplace's isn't a refused site.
  expect(logged).toEqual(['lua: https://cabaymau.vn/go-lua-be-ca/ is refused as a source: its link and the 1 fact citing it don\'t reach the writer'])
  expect(wrote).not.toContain('kilogram')
  expect(wrote).not.toContain('sa tùng rừng')
  expect(wrote).not.toContain('brine')
  const e = JSON.parse(await readFile(join(root, 'content/glossary/lua/entity.json'), 'utf8'))
  expect(e.refs.map((x: { url: string }) => x.url)).toEqual(facts.sources.map(x => x.url))
  // The research kept holds no refused site's page, nor what it alone says; a marketplace's and a social network's pages
  // stay in it, as before (the chief of staff, 17 Nov 2026: Thursday's change, refused-sources.ts).
  const kept = JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8')) as TopicFacts
  expect(kept.sources.map(x => x.url)).toEqual(shops.sources.slice(0, 5).map(x => x.url))
  expect(kept.facts.map(f => f.fact)).toEqual(shops.facts.slice(0, -1).map(f => f.fact))
})

// A body cut by hand, what rested on a refused site alone taken off the live page (bodyFixed; the chief of staff, 16 Nov
// 2026), holds the cycle's reader rewrites off until the step writes the term again: then the text is the step's, written
// without the refused site, and the mark goes with the save, so no cut stays marked after it.
test('a body marked fixed by hand is the step\'s again once it saves: the mark goes', async () => {
  const root = await site()
  const file = join(root, 'content/glossary/lua/vi.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), body: '<p>Cắt tay.</p>', bodyFixed: true }))
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never
  expect(await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })).toMatchObject({ refs: 3 })
  const vi = JSON.parse(await readFile(file, 'utf8'))
  expect(vi.body).toContain('Ngâm lũa mới 1–2 tuần.')
  expect(vi).not.toHaveProperty('bodyFixed')
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
    if (isCheck(prompt)) return verdicts(prompt) as never
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
  expect(r).toMatchObject({ id: 'lua', score: 1 })
  // Still broken after the rewrite: not saved, and the report says why.
  const again = await site()
  const before = await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')
  const r2 = await makeGlossaryEntry(again, { research: async () => facts as never, llm: llm([['a rule'], ['another rule'], ['a third rule']]) }, 'lua', { kind: 'aquascaping' })
  expect(r2).toMatchObject({ id: 'lua', skipped: 'stopped by 1 note', notes: ['a rule'], draft: 'engine-state/glossary/lua.draft.json' })
  expect(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // The draft that came closest is kept for a reader, with why it wasn't saved.
  expect(JSON.parse(await readFile(join(again, 'engine-state/glossary/lua.draft.json'), 'utf8'))).toEqual({ score: 1, broken: 1, notes: ['a rule'], entry: written })
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
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  await makeGlossaryEntry(root, { research: async () => more as never, llm }, 'lua', { kind: 'aquascaping' })
  const kept = JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8')) as TopicFacts
  expect(kept.sources.map(x => x.url)).toEqual([...facts.sources.map(x => x.url), 'https://becanhatdinh.com/san-pham/lua-linh-sam/'])
  expect(kept.facts).toEqual([...facts.facts.map((f, i) => (i === 1 ? { ...f, also: [3] } : f)), { section: 'other', fact: 'Lũa linh sam sinks almost at once', source: 3 }])
  expect(kept.species).toEqual(['Ancistrus'])
  await makeGlossaryEntry(root, { research: async () => more as never, llm }, 'lua', { kind: 'aquascaping', fresh: true })
  expect(JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8'))).toEqual(more)
})

// The chief of staff, 15 Nov 2026: what Artemia is, and the Vĩnh Châu eggs keepers here buy, each a fact before a revise
// writes it. A top-up researches only what the term's notes ask, adds it to the kept research, and writes nothing.
test('--top-up researches only what the notes ask, adds it to the kept research and writes nothing', async () => {
  const root = await site()
  const files = ['content/glossary/lua/entity.json', 'content/glossary/lua/vi.json']
  const before = await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))
  const never: Llm = async () => { throw new Error('nothing is written in a top-up') }
  expect(await makeGlossaryEntry(root, { research: never, llm: never }, 'lua', { kind: 'aquascaping', topUp: true })).toEqual({ id: 'lua', refused: ['no kept research to top up'] })
  await mkdir(join(root, 'engine-state/glossary'), { recursive: true })
  await writeFile(join(root, 'engine-state/glossary/lua.json'), JSON.stringify(facts))
  await writeFile(join(root, 'engine-state/glossary/tanin.json'), JSON.stringify(facts))
  expect(await makeGlossaryEntry(root, { research: never, llm: never }, 'tanin', { kind: 'setup', topUp: true })).toEqual({ id: 'tanin', refused: ['nothing to top up: the notes file gives this term no also or read'] })
  for (const with_ of [{ fresh: true }, { reuse: true }, { revise: true }, { fromDraft: true }, { accept: 'the chief of staff' }])
    expect(await makeGlossaryEntry(root, { research: never, llm: never }, 'lua', { kind: 'aquascaping', topUp: true, ...with_ })).toMatchObject({ refused: [expect.stringMatching(/^--top-up only researches/)] })
  const more: TopicFacts = {
    found: true,
    facts: [
      { section: 'what', fact: 'Lũa sa tùng is the root of a pine', source: 0 },
      { section: 'steps', fact: 'Soak new driftwood for one to two weeks, changing the water, before it goes in a tank', source: 1 },
    ],
    species: [],
    sources: [{ url: 'https://example.org/sa-tung', title: 'Lũa sa tùng', kind: 'shop' }, facts.sources[1]!],
  }
  let asked = ''
  const r = await makeGlossaryEntry(root, { research: async ({ prompt }) => { asked = prompt; return more as never }, llm: never }, 'lua', { kind: 'aquascaping', topUp: true })
  expect(r).toEqual({ id: 'lua', toppedUp: ['Lũa sa tùng is the root of a pine (https://example.org/sa-tung)'] })
  // The ask is the notes' own, not the whole topic again.
  const ASKS = JSON.parse(await readFile(new URL('../src/glossary-asks.json', import.meta.url), 'utf8')) as Record<string, { also?: string[]; read?: string[] }>
  expect(asked).toContain(`Find only these, each from a page that says it; where no page you may use says one, add nothing for it: ${ASKS.lua!.also!.join('; ')}.`)
  expect(asked).toContain(`Read these pages and keep what they say: ${ASKS.lua!.read!.join(', ')}.`)
  expect(asked).not.toContain('what it does in a tank')
  // A top-up's research keeps a figure's place too.
  expect(asked).toContain('A fact from a page outside Vietnam says Vietnam only where the page itself does')
  // Not "anywhere wider than the page names", which reads loosely (the chief of staff, 17 Nov 2026, on the reader's point).
  expect(asked).toContain('A fact names no place its page doesn\'t name: never add Vietnam, a region or a climate ("the tropics", "Southeast Asia", "hot countries") to what a page says')
  const kept = JSON.parse(await readFile(join(root, 'engine-state/glossary/lua.json'), 'utf8')) as TopicFacts
  expect(kept.facts).toEqual([...facts.facts, { section: 'what', fact: 'Lũa sa tùng is the root of a pine', source: 3 }])
  expect(await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))).toEqual(before)
})

// Lũa's fifth (14 Nov 2026, 03:13) ran to 2,917 words, twice the first's 1,527. A term with kinds holds to about 900
// words and 60 for each kind its notes file names: past it, a note for one trim pass; more than 15 percent past, a stop (the
// chief of staff, 14 Nov 2026). A term without kinds holds to about 400, the same way. The kinds are counted from the notes
// file, not read off the draft: pH's first fuller draft (14 Nov) ran to 916 words because four bold labels passed for kinds.
const kind = (name: string, n: number) => `<li><strong>${name}</strong> ${'gỗ '.repeat(n)}</li>`
const kinds = (n: number, each: number) => `<h3>Các loại lũa</h3><ul>${Array.from({ length: n }, (_, i) => kind(`Lũa ${i}`, each)).join('')}</ul>`
test('an entry\'s length: 900 and 60 a named kind, or 400; one trim note past it, a stop past 15 percent more; kinds come from the notes file', () => {
  // Sixteen kinds named, each at 60 words, and a page around them: held (target 1,860).
  expect(lengthNotes(`<p>${'nước '.repeat(500)}</p>${kinds(16, 58)}`, 16)).toEqual({ notes: [], stop: false })
  // A kind at a hundred words: advice.
  expect(lengthNotes(kinds(3, 100), 3)).toEqual({ notes: [0, 1, 2].map(i => expect.stringMatching(new RegExp(`^An item is 102 words, at most about 60: "Lũa ${i} gỗ gỗ`))), stop: false })
  // Past 1,860: a note; past 2,139: a stop.
  expect(lengthNotes(`<p>${'nước '.repeat(1000)}</p>${kinds(16, 58)}`, 16)).toEqual({ notes: ['The entry is 1963 words: hold it to about 1860, about 60 a kind, and leave what is left out to the pages that use the term.'], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(1300)}</p>${kinds(16, 58)}`, 16)).toEqual({ notes: ['The entry is 2263 words: hold it to about 1860, about 60 a kind, and leave what is left out to the pages that use the term.'], stop: true })
  // A list inside an item counts as its own items (Codex, 14 Nov 2026).
  expect(lengthNotes(`<ul><li>Hai loại ${'gỗ '.repeat(50)}<ul><li>${'đá '.repeat(50)}</li><li>${'cát '.repeat(95)}</li></ul></li></ul>`, 3).notes).toEqual([expect.stringMatching(/^An item is 95 words, at most about 60: "cát cát/)])
  // A term with kinds and its own length in the notes file is held to its own (the owner, 15 Nov 2026: "what does each
  // look like?"; a kind's picture carries its look, so its item needs a line or two): 600 words of 500 is a note, past
  // 575 a stop, where the kinds' rule would let 1,860 pass.
  expect(lengthNotes(`<p>${'nước '.repeat(600)}</p>`, 16, 500)).toEqual({ notes: ['The entry is 600 words: hold it to about 500, and leave what is left out to the pages that use the term.'], stop: true })
  expect(lengthNotes(`<p>${'nước '.repeat(520)}</p>`, 16, 500)).toEqual({ notes: ['The entry is 520 words: hold it to about 500, and leave what is left out to the pages that use the term.'], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(600)}</p>`, 16)).toEqual({ notes: [], stop: false })
  // A term whose notes file names no kinds holds to about 400, however its lists look: pH's four bold labels are not kinds
  // (its draft ran to 916 words; this one, 917).
  const ph = `<ul>${['Làm pH lên:', 'Làm pH xuống:', 'Lá bàng và lũa:', 'Không đáng lo:'].map(k => `<li><strong>${k}</strong> ${'đá '.repeat(226)}</li>`).join('')}</ul>`
  expect(lengthNotes(ph)).toEqual({ notes: ['The entry is 917 words: hold it to about 400, and leave what is left out to the pages that use the term.'], stop: true })
  expect(lengthNotes(`<p>${'nước '.repeat(392)}</p>`)).toEqual({ notes: [], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(450)}</p>`)).toEqual({ notes: ['The entry is 450 words: hold it to about 400, and leave what is left out to the pages that use the term.'], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(478)}</p>`).stop).toBe(true)
  // A term whose notes file sets its own length (the chief of staff, 14 Nov 2026: pH 600, a stop past 690).
  expect(lengthNotes(`<p>${'nước '.repeat(650)}</p>`, 0, 600)).toEqual({ notes: ['The entry is 650 words: hold it to about 600, and leave what is left out to the pages that use the term.'], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(691)}</p>`, 0, 600).stop).toBe(true)
})

test('a term\'s notes file sets its length: pH\'s 648 words get a trim pass and save; a length past 600 names the chief of staff\'s word', async () => {
  const root = await site()
  const writes: string[] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    writes.push(prompt)
    return { ...written, body: `<p>${'Nước có pH. '.repeat(216)}</p>` } as never
  }
  expect(await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'ph', { kind: 'setup' })).toMatchObject({ id: 'ph', score: 1 })
  expect(writes.length).toBe(2)
  // The writer is told the term's own length (Codex, 14 Nov 2026: it was told only the prompt's 200–300 words).
  expect(writes[0]).toContain('--- ĐỘ DÀI ---\nKhoảng 630 chữ cả bài')
  const asks = JSON.parse(await readFile(new URL('../src/glossary-asks.json', import.meta.url), 'utf8')) as Record<string, { length?: { words: number; why: string } }>
  // The chief of staff's 620, 15 Nov 2026, once every read sentence was kept; 630 on 18 Nov, so a rewrite keeps the
  // almond-leaf credit and the pace in its step without cutting whole sentences.
  expect(asks.ph!.length!.words).toBe(630)
  for (const [id, a] of Object.entries(asks)) if (a.length) expect(a.length.words <= 600 || /chief of staff/.test(a.length.why), id).toBe(true)
})

// The owner, 15 Nov 2026: "what does each look like?". Nền bể names its kinds and sets its own length, 580 (the chief of
// staff, 16 Nov 2026): the writer is told the 580, and that each kind takes a line or two, as its picture shows how it looks.
test('a term with kinds and its own length tells the writer the length, and a line or two a kind', async () => {
  const root = await site()
  await mkdir(join(root, 'content/glossary/nen-be'), { recursive: true })
  await writeFile(join(root, 'content/glossary/nen-be/entity.json'), JSON.stringify({ id: 'nen-be', en: 'Substrate' }))
  await writeFile(join(root, 'content/glossary/nen-be/vi.json'), JSON.stringify({ slug: 'nen-be', name: 'Nền bể', altNames: [], sections: {}, definition: 'Lớp vật liệu phủ đáy bể.', quality: { score: 0.9, indexable: true } }))
  const writes: string[] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    writes.push(prompt)
    return written as never
  }
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'nen-be', { kind: 'setup' })
  expect(writes[0]).toContain('--- ĐỘ DÀI ---\nKhoảng 580 chữ cả bài, thay cho độ dài nói ở trên. Mỗi loại một hai câu, vì ảnh của nó cho thấy nó trông thế nào.')
  expect(writes[0]).toContain('--- LOẠI BÁN Ở VIỆT NAM ---\nđất nền (aqua soil)')
})

// Past Lũa's cap: its notes file names 17 kinds, so 1,920 words and a stop past 2,208.
const longKinds = `<h3>Các loại lũa</h3><ul>${['Lũa linh sam', 'Lũa sa tùng', 'Mopani'].map(k => `<li><strong>${k}</strong> ${'gỗ '.repeat(800)}</li>`).join('')}</ul><p>Lũa khô nổi cho tới khi ngấm đủ nước.</p>`

test('a draft that stops is rewritten from itself, twice if need be; advice alone never stops a save; this term\'s own notes reach the writer and the rules', async () => {
  const root = await site()
  const long = { ...written, body: longKinds }
  const short = { ...written, body: '<h3>Các loại lũa</h3><ul><li><strong>Lũa linh sam</strong> chìm ngay.</li></ul>' }
  const writes: string[] = []
  const rules: string[] = []
  const drafts = [long, long, short]
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) { rules.push(prompt); return { notes: [] } as never }
    if (isCheck(prompt)) return verdicts(prompt) as never
    writes.push(prompt)
    return drafts.shift() as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  // The long one, rewritten from itself on the length notes, still long; the second rewrite holds: saved.
  expect(writes).toHaveLength(3)
  expect(writes[1]).toContain('The entry is 2419 words: hold it to about 1920')
  expect(writes[1]).toContain(`--- BẢN TRƯỚC ---\n${JSON.stringify(long)}`)
  expect(r).toMatchObject({ id: 'lua', score: 1 })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe(short.body)
  // Lũa's own notes, for the writer and for the rules.
  expect(writes[0]).toContain('--- CHO MỤC NÀY ---\nBoiling, said once')
  expect(writes[0]).toContain('write "rễ cây ngập mặn", never "đước"')
  expect(rules[0]).toContain('--- THIS TERM ---\nBoiling, said once')
  expect(rules[0]).toContain('12. A line under THIS TERM is not followed.')
  // The headings rule (the Writing Lead, with the chief of staff's yes, 20 Nov 2026): the set headings hold only what they
  // say, any other section is headed by what it holds, and mistakes are "common" only where a fact says so. Advice only.
  expect(writes[0]).toContain('nếu không thì dưới "Sai lầm cần tránh"')
  expect(writes[0]).toContain('Phần nào chứa điều khác thì đặt tiêu đề theo đúng điều nó chứa')
  expect(rules[0]).toContain('15. A section holds what its heading doesn\'t say')
  // A disagreement is said once, with what to do only where the facts say it: the say-once rule asked chu trình nitơ and pH
  // for advice their facts don't give, and the writer wrote it (14 Nov 2026).
  expect(rules[0]).toContain('with what the keeper can do about it only where the FACTS say what to do; where they don\'t, it is said once and left')
  expect(rules[0]).toContain('Never ask for advice the FACTS don\'t give.')
  expect(writes[0]).toContain('dữ kiện không nói nên làm gì thì nêu một lần rồi thôi, không tự thêm lời khuyên')
  // A long one that stays long is not saved, however the rules read it.
  const again = await site()
  const before = await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')
  const always: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : long) as never
  expect(await makeGlossaryEntry(again, { research: async () => facts as never, llm: always }, 'lua', { kind: 'aquascaping' })).toMatchObject({ skipped: 'stopped by 1 note' })
  expect(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // Repetition, order and a term's own notes are advice: one rewrite on them, and saved.
  const third = await site()
  let w = 0
  const advice: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: ['Rule 4: floating is said twice', 'Rules 7 and 12: săn đá\'s use comes first'] } : isCheck(prompt) ? verdicts(prompt) : (w++, written)) as never
  expect(await makeGlossaryEntry(third, { research: async () => facts as never, llm: advice }, 'lua', { kind: 'aquascaping' })).toMatchObject({ id: 'lua', score: 1, notes: ['Rule 4: floating is said twice', 'Rules 7 and 12: săn đá\'s use comes first'] })
  expect(w).toBe(2)
})

// Lũa's sixth (14 Nov 2026) was the page the owner asked for, kept below the bar on repetition, order and length notes: the
// chief of staff accepted it as it stands, and asked that a revision change only the sentences a note quotes. A draft is
// accepted only as the step kept it, never with a note that stops a save or a fact score under the bar.
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

test('one table says which notes stop a save and which are advice; a kept draft may be accepted past its length, never past a stop', () => {
  expect(ruleNumbers('Rules 4 and 12: x')).toEqual([4, 12])
  expect(ruleNumbers('Rule 7: x')).toEqual([7])
  expect(ruleNumbers('Mopani "hợp Betta"')).toEqual([])
  expect(Object.entries(RULE_SIDE).filter(([, v]) => v === 'advice').map(([k]) => Number(k))).toEqual([4, 7, 12, 14, 15])
  expect(RULE_SIDE[13]).toBe('stop')
  expect(['Rule 4: x', 'Rules 7 and 12: x', 'Rule 12: x'].map(stops)).toEqual([false, false, false])
  expect(['Rule 1: x', 'Rules 4 and 6: x', 'Rule 11: x', 'An unnumbered note'].map(stops)).toEqual([true, true, true, true])
  expect(refusals(sixth)).toEqual([])
  const with_ = (note: string, o: Partial<Draft> = {}) => refusals({ ...sixth, notes: [...sixth.notes, note], broken: sixth.broken + 1, ...o })
  expect(with_('Rule 1: "không mục" beside "đang mục"')).toEqual(['a note that stops a save: Rule 1: "không mục" beside "đang mục"'])
  expect(with_('Rules 4 and 6: "pencilfish" is not our page\'s name')).toHaveLength(1)
  expect(with_('Rule 12: say boiling once')).toEqual([])
  expect(with_('The entry repeats itself')).toHaveLength(1)
  expect(refusals({ ...sixth, score: 0.7 })).toEqual(['its fact score 0.7 is under the bar, 0.75'])
  // A sentence the fact check stops refuses it; a fact note from before the sentence check (sixth's first) doesn't.
  const unborne = '"Nên thả lá từ từ rồi đo pH.": the facts don\'t carry it (unsupported, unsupported, unsupported): not in the facts'
  expect(refusals({ ...sixth, notes: [unborne, ...sixth.notes] })).toEqual([`a sentence the facts don't carry: ${unborne}`])
})

// A draft the step keeps, written by it: the writer gives `entry`, the sentence check supports every sentence, the rules
// check gives `rules`.
async function keptDraft(root: string, entry: Draft['entry'], rules: string[]) {
  const llm: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: rules } : isCheck(prompt) ? verdicts(prompt) : entry) as never
  return makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
}
const none: Llm = async () => { throw new Error('no model call') }
const draftPath = (root: string) => join(root, 'engine-state/glossary/lua.draft.json')
const long6 = { ...sixth.entry, body: longKinds }

// A draft a run kept, read, before a draft past its stop went unread (the chief of staff, 15 Nov 2026): its file, and its
// digest in the log, as the step wrote them.
async function readKept(root: string, d: Draft) {
  const text = `${JSON.stringify(d, null, 2)}\n`
  await mkdir(join(root, 'engine-state/glossary'), { recursive: true })
  await writeFile(join(root, 'engine-state/glossary/lua.json'), JSON.stringify(facts))
  await writeFile(draftPath(root), text)
  const review = { score: d.score, notes: d.notes }
  await logReviews(root, 'glossary', { id: 'glossary/lua', lang: 'vi' }, [review], undefined, { draft: { of: review, sha: createHash('sha256').update(text).digest('hex') } })
  return text
}

test('an accepted draft is saved as the step kept it, logged with who accepted it and every note; a refused one changes nothing', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  const accept = (o: { now?: () => Date } = {}) => makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff', ...o })
  // Refused: a contradiction.
  await keptDraft(root, sixth.entry, ['Rule 1: two statements contradict', 'Rule 4: x'])
  expect(await accept()).toMatchObject({ refused: ['a note that stops a save: Rule 1: two statements contradict'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // Refused: a draft past its stop, which the step kept unread (the chief of staff, 15 Nov 2026).
  await keptDraft(root, long6, sixth.notes.slice(1, 4))
  const unread = await readFile(draftPath(root), 'utf8')
  expect(JSON.parse(unread)).toMatchObject({ unread: true, entry: long6 })
  expect(await accept()).toEqual({ id: 'lua', refused: ['it was never read: it is past its length. Set its length in the notes file and run it from its draft'] })
  // Refused: a draft that isn't as the step kept it, however small the change.
  const kept = await readKept(root, { score: 1, broken: 7, notes: [...sixth.notes.slice(1, 4), ...lengthNotes(long6.body, 17).notes], entry: long6 })
  await writeFile(draftPath(root), kept.replace('ngấm đủ nước', 'ngấm nước'))
  expect(await accept()).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  await writeFile(draftPath(root), kept.replace(/"broken": \d+/, '"broken": 2'))
  expect(await accept()).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // A later draft kept, the earlier one put back byte for byte is still one the step kept.
  await keptDraft(root, { ...long6, body: long6.body.replace('Lũa khô nổi', 'Bản sau: lũa khô nổi') }, sixth.notes.slice(1, 4))
  expect(await readFile(draftPath(root), 'utf8')).not.toBe(kept)
  // Accepted as kept: saved, with no model call, the draft gone. A body cut by hand keeps its mark: the draft was kept
  // before, perhaps from facts a refused site gave, and nothing read it against the filtered ones.
  await writeFile(draftPath(root), kept)
  await writeFile(join(root, 'content/glossary/lua/vi.json'), JSON.stringify({ ...JSON.parse(before), bodyFixed: true }))
  const r = await accept({ now: () => new Date('2026-11-14T00:00:00Z') })
  expect(r).toMatchObject({ id: 'lua', score: 1, acceptedBy: 'the chief of staff', refs: 3 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  expect(vi).toMatchObject({ definition: sixth.entry.definition, body: long6.body, altNames: ['lũa gỗ', 'gỗ lũa'], quality: { score: 1, indexable: true }, bodyFixed: true })
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua']
  expect(log[0]).toMatchObject({ at: '2026-11-14T00:00:00Z', score: 1, notes: JSON.parse(kept).notes, kept: true, acceptedBy: 'the chief of staff' })
  // Three rules notes, the entry's length and its three long items.
  expect(JSON.parse(kept).notes).toHaveLength(7)
  await expect(readFile(draftPath(root), 'utf8')).rejects.toThrow()
  // Nothing kept: nothing to accept.
  expect(await accept()).toEqual({ id: 'lua', refused: ['no kept draft to accept'] })
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
    // Still the step's after a later draft is kept with a digest of its own, put back byte for byte (Lũa's sixth, after
    // its seventh and eighth: Codex, 14 Nov 2026).
    await keptDraft(root, long6, ['Rule 4: x'])
    expect(await readFile(draftPath(root), 'utf8')).not.toBe(text)
    await writeFile(draftPath(root), text)
    expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toMatchObject({ id: 'lua', score: 0.9, acceptedBy: 'the chief of staff' })
  } finally { LEGACY_DRAFTS.lua = real }
})

test('a revision of the kept draft changes only the sentences its notes quote, and is kept only if it comes closer', async () => {
  const root = await site()
  // Kept on a stop (a name), as Lũa's seventh was.
  await keptDraft(root, sixth.entry, ['Rules 4 and 12: Rot should be covered once.', 'Rule 5: lũa Malaysia is missing'])
  const kept = await readFile(draftPath(root), 'utf8')
  const writes: string[] = []
  const reply = (rules: string[] | (() => string[])): Llm => async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: typeof rules === 'function' ? rules() : rules } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    writes.push(prompt)
    return { ...sixth.entry, body: '<p>Sửa.</p>' } as never
  }
  const revise = (llm: Llm, at = root) => makeGlossaryEntry(at, { research: async () => { throw new Error('no research') }, llm }, 'lua', { kind: 'aquascaping', fromDraft: true })
  // As many stops: no closer, and the kept draft stays byte for byte.
  expect(await revise(reply(['Rule 6: x']))).toMatchObject({ skipped: 'stopped by 1 note', revised: false })
  expect(writes).toHaveLength(2)
  expect(writes[0]).toContain('Sửa bản trước, không viết lại: chỉ sửa, gộp hay bỏ những câu mà ghi chú trích hoặc chỉ tới, và giữ nguyên từng chữ mọi câu khác.')
  // On the notes as the checks read the draft now, not those it was kept with.
  expect(writes[0]).toContain('- Rule 6: x')
  expect(writes[0]).not.toContain('Rot should be covered once.')
  expect(writes[0]).toContain(`--- BẢN TRƯỚC ---\n${JSON.stringify(sixth.entry)}`)
  expect(await readFile(draftPath(root), 'utf8')).toBe(kept)
  // However many revisions come no closer, the kept draft stays the step's: its digest is logged again each time, though the
  // log keeps six reviews (Codex, 14 Nov 2026); an edit to it is still refused.
  for (let i = 0; i < 3; i++) await revise(reply(['Rule 6: x']))
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua']
  expect(log).toHaveLength(6)
  expect(log.find((t: { draft?: string }) => t.draft).draft).toBe(createHash('sha256').update(kept).digest('hex'))
  await writeFile(draftPath(root), kept.replace('ngấm đủ nước', 'ngấm nước'))
  expect(await revise(none)).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  await writeFile(draftPath(root), kept)
  // Fewer stops: closer, and it replaces the kept draft.
  let r = 0
  expect(await revise(reply(() => (r++ ? ['Rule 6: x'] : ['Rule 6: x', 'Rule 1: y'])))).toMatchObject({ skipped: 'stopped by 1 note', revised: true })
  expect(JSON.parse(await readFile(draftPath(root), 'utf8')).entry.body).toBe('<p>Sửa.</p>')
  // Read again at the bar, a kept draft is saved as it is, with no revision.
  const again = await site()
  await keptDraft(again, sixth.entry, ['Rule 5: lũa Malaysia is missing'])
  const before = writes.length
  expect(await revise(reply([]), again)).toMatchObject({ id: 'lua', score: 1 })
  expect(writes).toHaveLength(before)
  expect(JSON.parse(await readFile(join(again, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe(sixth.entry.body)
  // A revision at the bar is saved.
  let read = 0
  expect(await revise(reply(() => (read++ ? [] : ['Rule 6: x'])))).toMatchObject({ id: 'lua', score: 1 })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe('<p>Sửa.</p>')
})

// The chief of staff's middle path (14 Nov 2026): a sentence two reads call loose goes back once to the writer, only on an
// entry about to be saved; loose never stops a save, and what the rewording did is logged with the entry's notes.
test('an entry about to be saved has its loose sentences reworded once, and the log says what changed', async () => {
  const root = await site()
  const prompts: string[] = []
  const llm: Llm = async ({ prompt, system }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (system.startsWith('You reword')) { prompts.push(prompt); return { sentences: [{ n: 1, text: 'Ngâm lũa mới khoảng 1–2 tuần.' }] } as never }
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'Ngâm lũa mới 1–2 tuần.' ? 'loose: one source says two weeks' : undefined)) as never
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping', now: () => new Date('2026-11-14T00:00:00Z') })
  expect(r).toMatchObject({ id: 'lua', score: 1, notes: ['Loose, reworded: "Ngâm lũa mới 1–2 tuần." → "Ngâm lũa mới khoảng 1–2 tuần." (supported)'] })
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('LÝ DO: one source says two weeks')
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe('<h3>Nên làm gì</h3><p>Ngâm lũa mới khoảng 1–2 tuần.</p>')
  expect(JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua'][0]).toMatchObject({ kept: true, notes: (r as { notes: string[] }).notes })
})

// The chief of staff, 15 Nov 2026: chu trình nitơ's rewording undid three things its notes asked for, read by nothing after.
test('the house rules are read again after the rewording, and a rewording they note goes back before the entry is saved', async () => {
  const root = await site()
  let reads = 0
  const llm: Llm = async ({ prompt, system }) => {
    if (prompt.startsWith('GLOSSARY RULES')) { reads++; return { notes: prompt.split('--- ENTRY ---')[1]!.includes('khoảng 1–2 tuần') ? ['Rule 12: "Ngâm lũa mới khoảng 1–2 tuần." drops what THIS TERM asks for'] : [] } as never }
    if (system.startsWith('You reword')) return { sentences: [{ n: 1, text: 'Ngâm lũa mới khoảng 1–2 tuần.' }] } as never
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'Ngâm lũa mới 1–2 tuần.' ? 'loose: one source says two weeks' : undefined)) as never
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ id: 'lua', score: 1, notes: ['Loose, rewording broke a house rule or dropped a specific, old wording kept for the reader: "Ngâm lũa mới 1–2 tuần." (not "Ngâm lũa mới khoảng 1–2 tuần.": Rule 12: "Ngâm lũa mới khoảng 1–2 tuần." drops what THIS TERM asks for)'] })
  expect(reads).toBe(2)
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe('<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p>')
})

// Chu trình nitơ's saved entry (14 Nov 2026) has a sentence the sentence check stops, advice the old say-once rule pushed the
// writer to add; Lũa's next save rewrites its saved entry with its kinds' own pages. `revise` rewrites the saved entry once on
// its notes, from its research, and saves only what passes.
test('a saved entry revised: one rewrite on its notes, from its research, saved when it passes; nothing to revise, refused', async () => {
  const root = await site()
  const fresh: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never
  expect(await makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm: none }, 'lua', { kind: 'aquascaping', revise: true })).toEqual({ id: 'lua', refused: ['no saved entry or research to revise'] })
  await makeGlossaryEntry(root, { research: async () => facts as never, llm: fresh }, 'lua', { kind: 'aquascaping' })
  const writes: string[] = []
  const fixed = { ...written, body: '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần, thay nước.</p>' }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'Ngâm lũa mới 1–2 tuần.' ? 'unsupported: the writer\'s own advice' : undefined)) as never
    writes.push(prompt)
    return fixed as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm }, 'lua', { kind: 'aquascaping', revise: true })
  expect(r).toMatchObject({ id: 'lua', score: 1 })
  expect(writes).toHaveLength(1)
  expect(writes[0]).toContain('- "Ngâm lũa mới 1–2 tuần.": the facts don\'t carry it (unsupported, unsupported, unsupported): the writer\'s own advice')
  expect(writes[0]).toContain('--- BẢN TRƯỚC ---\n{"definition":"Gỗ đã ngâm lâu trong nước, dùng trang trí bể.","altNames":[],"body":"<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p>"')
  expect(JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).body).toBe(fixed.body)
  // An entry with advice notes alone still gets its one rewrite (Lũa's next save, on its notes file's lines).
  let w = 0
  const advice: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: ['Rule 12: link sa tùng to its own page'] } : isCheck(prompt) ? verdicts(prompt) : (w++, fixed)) as never
  expect(await makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm: advice }, 'lua', { kind: 'aquascaping', revise: true })).toMatchObject({ id: 'lua', score: 1 })
  expect(w).toBe(1)
})

// The chief of staff, 15 Nov 2026: each revision of pH and chu trình nitơ fixed what its notes asked and dropped something
// already read (pH's worked example of the log scale went in a trim for length), and a rewrite that put a notes line right
// lost a tie to the saved text on its length.
const scale: TopicFacts = { ...facts, facts: [...facts.facts, { section: 'what', fact: 'Each pH step is ten times the next: pH 4.0 is ten times more acidic than pH 5.0', source: 0 }] }
const logLine = 'Mỗi nấc cách nhau 10 lần, tức là pH 4,0 chua gấp 10 lần pH 5,0.'
const soak = '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p>'
const soakFixed = '<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần, thay nước.</p>'
async function savedWith(body: string, id = 'lua', kind: 'aquascaping' | 'care' = 'aquascaping') {
  const root = await site()
  const fresh: Llm = async ({ prompt }) => (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : { ...written, body }) as never
  await makeGlossaryEntry(root, { research: async () => scale as never, llm: fresh }, id, { kind })
  return root
}
const bodyOf = async (root: string, id = 'lua') => JSON.parse(await readFile(join(root, 'content/glossary', id, 'vi.json'), 'utf8')).body
/** The model for a revision: the rules read gives `notes` while the entry holds `while`, the writer gives `bodies` in turn. */
const revising = (writes: string[], bodies: string[], notes: string[], while_: string): Llm => async ({ prompt }) => {
  if (prompt.startsWith('GLOSSARY RULES')) return { notes: prompt.split('--- ENTRY ---')[1]!.includes(while_) ? notes : [] } as never
  if (isCheck(prompt)) return verdicts(prompt) as never
  writes.push(prompt)
  return { ...written, body: bodies.length > 1 ? bodies.shift() : bodies[0] } as never
}
const revise = (root: string, llm: Llm, id = 'lua', kind: 'aquascaping' | 'care' = 'aquascaping') => makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm }, id, { kind, revise: true })

test('a saved entry revised: a rewrite that drops what no note asks for is not saved, and what it dropped goes back to the writer once', async () => {
  const before = `${soak}<p>Thang pH là thang logarit. ${logLine}</p>`
  const asked = ['Rule 12: "Ngâm lũa mới 1–2 tuần." should say to change the water']
  const trimmed = `${soakFixed}<p>Thang pH là thang logarit, mỗi nấc cách nhau 10 lần.</p>`
  const whole = `${soakFixed}<p>Thang pH là thang logarit. ${logLine}</p>`
  // The first rewrite does as the note asks and trims the worked example; told what it dropped, the second keeps it.
  const root = await savedWith(before)
  const writes: string[] = []
  expect(await revise(root, revising(writes, [trimmed, whole], asked, 'Ngâm lũa mới 1–2 tuần.'))).toMatchObject({ id: 'lua', score: 1 })
  expect(writes).toHaveLength(2)
  expect(writes[1]).toContain(`- The rewrite dropped from "${logLine}" the figure 4,0, the figure 5,0, the advice "tức là pH 4,0 chua gấp 10 lần pH 5,0", and nothing lets that sentence go: write it as it was, word for word.`)
  expect(await bodyOf(root)).toBe(whole)
  // A writer that drops it again: the saved entry stays as it was.
  const again = await savedWith(before)
  const twice: string[] = []
  await revise(again, revising(twice, [trimmed], asked, 'Ngâm lũa mới 1–2 tuần.'))
  expect(twice).toHaveLength(2)
  expect(await bodyOf(again)).toBe(before)
  // A review note asking for it to go doesn't let it go (the seventh read, 15 Nov 2026: notes quote sentences to keep
  // them as often as to change them); a sentence the facts don't carry, stopped, may go.
  const cutBody = `${soak}<p>Thang pH là thang logarit.</p>`
  const third = await savedWith(before)
  const asks: string[] = []
  await revise(third, revising(asks, [cutBody], [`Rule 12: "${logLine}" says the scale twice: leave it out`], logLine))
  expect(asks).toHaveLength(2)
  expect(asks[1]).toContain(`- The rewrite dropped from "${logLine}"`)
  expect(await bodyOf(third)).toBe(before)
  const fourth = await savedWith(before)
  const once: string[] = []
  const unborne: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt, t => (t === logLine ? 'unsupported: not in the facts' : undefined)) as never
    once.push(prompt)
    return { ...written, body: cutBody } as never
  }
  expect(await revise(fourth, unborne)).toMatchObject({ id: 'lua', score: 1 })
  expect(once).toHaveLength(1)
  expect(await bodyOf(fourth)).toBe(cutBody)
})

// The chief of staff, 16 Nov 2026: a run from a kept draft saved what a stopped revise had cut, with nothing to let it go
// (Artemia's second-stage larvae, dry food's crumbled flakes and its two months): the draft, and every rewrite of it, are
// held to the saved entry as a revise's are, and an accepted one is refused.
test('a kept draft run or accepted is held to the saved entry: what no stop lets go stops the save, a stopped sentence may go', async () => {
  const before = `${soak}<p>Thang pH là thang logarit. ${logLine}</p>`
  const cut = `${soakFixed}<p>Thang pH là thang logarit.</p>`
  const whole = `${soakFixed}<p>Thang pH là thang logarit. ${logLine}</p>`
  // A saved entry, and a draft kept from a revise of it that cut the worked example.
  const keptCut = async () => {
    const root = await savedWith(before)
    const text = `${JSON.stringify({ score: 1, broken: 1, notes: ['Rule 4: x'], entry: { ...written, altNames: [], body: cut } }, null, 2)}\n`
    await writeFile(draftPath(root), text)
    const review = { score: 1, notes: ['Rule 4: x'] }
    await logReviews(root, 'glossary', { id: 'glossary/lua', lang: 'vi' }, [review], undefined, { draft: { of: review, sha: createHash('sha256').update(text).digest('hex') } })
    return root
  }
  const fromDraft = (root: string, llm: Llm) => makeGlossaryEntry(root, { research: async () => { throw new Error('no research') }, llm }, 'lua', { kind: 'aquascaping', fromDraft: true })
  // A writer that cuts it again: nothing saved, and the writer was told what went.
  const root = await keptCut()
  const writes: string[] = []
  const r = await fromDraft(root, revising(writes, [cut], [], 'nothing'))
  expect(r).toMatchObject({ id: 'lua', skipped: expect.stringMatching(/^stopped by/) })
  expect(writes.length).toBeGreaterThan(0)
  expect(writes[0]).toContain(`- The rewrite dropped from "${logLine}"`)
  expect(await bodyOf(root)).toBe(before)
  // A writer that writes it back: saved.
  const back = await keptCut()
  expect(await fromDraft(back, revising([], [whole], [], 'nothing'))).toMatchObject({ id: 'lua', score: 1 })
  expect(await bodyOf(back)).toBe(whole)
  // Accepted as it stands: refused, with what it drops, and nothing changed. Its one read is of the saved entry's facts.
  const acc = await keptCut()
  const refused = await makeGlossaryEntry(acc, { research: none, llm: revising([], [cut], [], 'nothing') }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })
  expect(refused).toMatchObject({ id: 'lua', refused: [expect.stringContaining(`The rewrite dropped from "${logLine}"`)] })
  expect(await bodyOf(acc)).toBe(before)
  // A sentence of the saved entry the fact check stops may go, run or accepted, as in a revision (Fable's read, 16 Nov 2026).
  const unborne = (writes: string[], bodies: string[]): Llm => async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt, t => (t === logLine ? 'unsupported: not in the facts' : undefined)) as never
    writes.push(prompt)
    return { ...written, body: bodies.length > 1 ? bodies.shift() : bodies[0] } as never
  }
  const stoppedRun = await keptCut()
  expect(await fromDraft(stoppedRun, unborne([], [cut]))).toMatchObject({ id: 'lua', score: 1 })
  expect(await bodyOf(stoppedRun)).toBe(cut)
  const stoppedAccept = await keptCut()
  expect(await makeGlossaryEntry(stoppedAccept, { research: none, llm: unborne([], [cut]) }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toMatchObject({ id: 'lua', acceptedBy: 'the chief of staff' })
  expect(await bodyOf(stoppedAccept)).toBe(cut)
  // A draft that drops nothing, whose rewrite does, is held too: told what went, the writer puts it back.
  const clean = await savedWith(before)
  const text = `${JSON.stringify({ score: 1, broken: 1, notes: ['x'], entry: { ...written, altNames: [], body: before } }, null, 2)}\n`
  await writeFile(draftPath(clean), text)
  const review = { score: 1, notes: ['x'] }
  await logReviews(clean, 'glossary', { id: 'glossary/lua', lang: 'vi' }, [review], undefined, { draft: { of: review, sha: createHash('sha256').update(text).digest('hex') } })
  const told: string[] = []
  const soakStopped: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'Ngâm lũa mới 1–2 tuần.' ? 'unsupported: the writer\'s own advice' : undefined)) as never
    told.push(prompt)
    return { ...written, body: told.length > 1 ? whole : cut } as never
  }
  expect(await fromDraft(clean, soakStopped)).toMatchObject({ id: 'lua', score: 1 })
  expect(told).toHaveLength(2)
  expect(told[1]).toContain(`- The rewrite dropped from "${logLine}"`)
  expect(await bodyOf(clean)).toBe(whole)
})

// The Sonnet reviewer's read, 15 Nov 2026: a revision held to a kept draft in place of the saved entry would let the drop
// check pass what the saved entry lost.
test('a revision starts from the saved entry, never with a kept draft', async () => {
  const root = await savedWith(soak)
  const none: Llm = async () => { throw new Error('no model call') }
  for (const o of [{ fromDraft: true }, { accept: 'the chief of staff' }]) {
    expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', revise: true, ...o })).toEqual({ id: 'lua', refused: ['--revise starts from the saved entry, not with --from-draft or --accept'] })
  }
})

test('a saved entry revised: an unmet line of the term\'s notes outranks a length still under its stop', async () => {
  // pH's notes file sets its own length: a rewrite that meets the notes line 40 words past it, still under its stop, is saved.
  const own = (JSON.parse(await readFile(new URL('../src/glossary-asks.json', import.meta.url), 'utf8')) as Record<string, { length: { words: number } }>).ph!.length.words
  const root = await savedWith(soak, 'ph', 'care')
  const long = `${soakFixed}<p>${'nước '.repeat(own + 40)}</p>`
  const writes: string[] = []
  const r = await revise(root, revising(writes, [long], ['Rule 12: "Ngâm lũa mới 1–2 tuần." should say to change the water'], 'Ngâm lũa mới 1–2 tuần.'), 'ph', 'care')
  expect(r).toMatchObject({ id: 'ph', score: 1 })
  expect((r as { notes: string[] }).notes.some(n => /^The entry is \d+ words/.test(n))).toBe(true)
  expect(await bodyOf(root, 'ph')).toBe(long)
})

test('a sentence the whole entry\'s final read stops after the rewording keeps it from being saved, kept for a reader', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  let k = 0
  const llm: Llm = async ({ prompt, system }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (system.startsWith('You reword')) return { sentences: [{ n: 1, text: 'Ngâm lũa mới khoảng 1–2 tuần.' }] } as never
    if (isCheck(prompt)) { const read = ++k; return verdicts(prompt, t => (t === 'Ngâm lũa mới 1–2 tuần.' ? 'loose: x' : read > 3 && read < 6 && t === written.definition ? 'unsupported: y' : undefined)) as never }
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ id: 'lua', skipped: 'stopped by 1 note', draft: 'engine-state/glossary/lua.draft.json' })
  expect((r as { notes: string[] }).notes[0]).toBe(`"${written.definition}": the facts don't carry it (unsupported, unsupported, supported): y`)
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  expect(JSON.parse(await readFile(draftPath(root), 'utf8')).entry.body).toContain('Ngâm lũa mới khoảng 1–2 tuần.')
  // The draft's score is the entry's as kept, after the final read (Codex, 14 Nov 2026: the first check's 1 was kept).
  expect(JSON.parse(await readFile(draftPath(root), 'utf8')).score).toBe(0.67)
})

// The chief of staff, 15 Nov 2026: dry food and Artemia each paid about $3 of reads to stop on a word count.
test('the length is counted before any paid read: an entry past its stop is trimmed first, and one still past it is never read', async () => {
  const long = `<p>Tanin làm nước vàng. ${'nước '.repeat(470)}</p>`, short = `<p>Tanin làm nước vàng. ${'nước '.repeat(300)}</p>`
  const run = async (bodies: string[], at?: string, o: { fromDraft?: boolean } = {}) => {
    const root = at ?? await site()
    const calls: ('write' | 'read')[] = [], asked: string[] = []
    const llm: Llm = async ({ prompt }) => {
      if (prompt.startsWith('GLOSSARY RULES')) { calls.push('read'); return { notes: [] } as never }
      if (isCheck(prompt)) { calls.push('read'); return verdicts(prompt, t => (t.includes('chết') ? 'unsupported: made up' : undefined)) as never }
      calls.push('write')
      asked.push(prompt)
      return { ...written, body: bodies.length > 1 ? bodies.shift() : bodies[0] } as never
    }
    return { r: await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'tanin', { kind: 'setup', ...o }), calls, asked, root }
  }
  // Trimmed once before it is read, then read and saved.
  const one = await run([long, short])
  expect(one.r).toMatchObject({ id: 'tanin', score: 1 })
  expect(one.calls.slice(0, 3)).toEqual(['write', 'write', 'read'])
  expect(one.asked[1]).toContain('- The entry is 474 words: hold it to about 400, and leave what is left out to the pages that use the term.')
  // A writer that never gets under its stop: no read at all; the run stops on its length and keeps the draft, unread.
  const never = await run([long])
  expect(never.calls).not.toContain('read')
  expect(never.r).toMatchObject({ id: 'tanin', skipped: 'stopped by 1 note', notes: ['The entry is 474 words: hold it to about 400, and leave what is left out to the pages that use the term.'] })
  expect(JSON.parse(await readFile(join(never.root, 'engine-state/glossary/tanin.draft.json'), 'utf8'))).toMatchObject({ unread: true })
  // Run from that kept draft: trimmed before it is read too (frozen food, 15 Nov 2026: 731 words of 500, read first).
  const kept = await run([short], never.root, { fromDraft: true })
  expect(kept.calls.slice(0, 2)).toEqual(['write', 'read'])
  expect(kept.r).toMatchObject({ id: 'tanin', score: 1 })
  // A read draft in its length outranks an unread one, though two of its sentences are stopped: it is the one kept.
  const stopped = `<p>Tanin làm nước vàng. Tanin làm cá chết. Tanin làm cây chết. ${'nước '.repeat(300)}</p>`
  const both = await run([long, long, stopped])
  expect(both.r).toMatchObject({ id: 'tanin', skipped: 'stopped by 2 notes' })
  const d = JSON.parse(await readFile(join(both.root, 'engine-state/glossary/tanin.draft.json'), 'utf8'))
  expect(d.unread).toBeUndefined()
  expect(d.entry.body).toContain('Tanin làm cá chết.')
})

// Codex, 14 Nov 2026: the count after rewording held pH to 400 words, not its own 600, and stopped a right entry.
test('the entry as reworded is counted against the term\'s own length', async () => {
  const root = await site()
  const body = `<p>pH đo độ chua. Nước ${'nước '.repeat(590)}</p>`
  let rewordings = 0
  const llm: Llm = async ({ prompt, system }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (system.startsWith('You reword')) { rewordings++; return { sentences: [{ n: 1, text: 'pH đo độ chua của nước.' }] } as never }
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'pH đo độ chua.' ? 'loose: x' : undefined)) as never
    return { ...written, body } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'ph', { kind: 'setup' })
  expect(rewordings).toBe(1)
  expect(r).toMatchObject({ id: 'ph', score: 1 })
  expect(JSON.parse(await readFile(join(root, 'content/glossary/ph/vi.json'), 'utf8')).body).toContain('pH đo độ chua của nước.')
})

// Codex, 14 Nov 2026: a rewording that ran the entry past its cap was saved, since its length wasn't counted again. The
// chief of staff, 15 Nov 2026: then it stopped a right entry (Artemia, 455 words to 480); the rewording goes back instead.
test('the entry as reworded is held to its length: a rewording that would run it past goes back, and the entry is saved as written', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/tanin/vi.json'), 'utf8')
  const body = `<p>Tanin làm nước vàng. Nước ${'nước '.repeat(389)}</p>`
  const longer = `Tanin làm nước ngả vàng ${'nhạt '.repeat(70)}.`
  let rewordings = 0
  const llm: Llm = async ({ prompt, system }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (system.startsWith('You reword')) { rewordings++; return { sentences: [{ n: 1, text: longer }] } as never }
    if (isCheck(prompt)) return verdicts(prompt, t => (t === 'Tanin làm nước vàng.' ? 'loose: x' : undefined)) as never
    return { ...written, body } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'tanin', { kind: 'setup' })
  expect(rewordings).toBe(1)
  expect(r).toMatchObject({ id: 'tanin', score: 1 })
  expect((r as { notes: string[] }).notes).toContain(`Loose, rewording would take the entry past its length, old wording kept for the reader: "Tanin làm nước vàng." (not "${longer.replace(/\s+/g, ' ').trim()}")`)
  const saved = await readFile(join(root, 'content/glossary/tanin/vi.json'), 'utf8')
  expect(saved).not.toBe(before)
  expect(JSON.parse(saved).body).toBe(body)
})

test('a kind word the table allows before a scientific name doesn\'t stop a save; one it doesn\'t allow does', async () => {
  const root = await site()
  const species = async (slug: string, scientific: string, family: string, order: string) => {
    await mkdir(join(root, 'content/species', slug), { recursive: true })
    await writeFile(join(root, 'content/species', slug, 'entity.json'), JSON.stringify({ id: slug, scientificName: scientific, genus: scientific.split(' ')[0], family, order }))
    await writeFile(join(root, 'content/species', slug, 'vi.json'), JSON.stringify({ name: scientific }))
  }
  await species('caridina-dennerli', 'Caridina dennerli', 'Atyidae', 'Decapoda')
  await species('aulonocara-jacobfreibergi', 'Aulonocara jacobfreibergi', 'Cichlidae', 'Cichliformes')
  const run = async (body: string) => {
    const asked: string[] = []
    const wrote: string[] = []
    const llm: Llm = async ({ prompt }) => {
      if (prompt.startsWith('GLOSSARY RULES')) { asked.push(prompt); return { notes: ['Rule 6: "tép Caridina" in "Tép Caridina thích lũa.": a Vietnamese name the writer made up for a genus'] } as never }
      if (isCheck(prompt)) return verdicts(prompt) as never
      wrote.push(prompt)
      return { ...written, body } as never
    }
    return { r: await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' }), asked, wrote }
  }
  const fits = await run('<p>Tép Caridina thích lũa.</p>')
  expect(fits.r).toMatchObject({ id: 'lua', score: 1 })
  expect(fits.asked[0]).toContain('--- KIND WORDS ---\nTép Caridina\n')
  // The chief of staff, 14 Nov 2026, of pH's draft: "như Cá neon vua" mid-sentence is lower case; the site links it either way.
  expect(fits.asked[0]).toContain('Case doesn\'t count: mid-sentence a page\'s name starts in lower case like any common noun ("như cá neon vua").')
  expect(fits.wrote[0]).toContain('giữa câu thì viết thường như mọi danh từ chung ("như cá neon vua")')
  const wrong = await run('<p>Tép Caridina thích lũa, cá trê Aulonocara thì không.</p>')
  expect(wrong.r).toMatchObject({ id: 'lua', skipped: 'stopped by 1 note' })
  expect((wrong.r as { notes: string[] }).notes).toContain('Rule 6: "cá trê Aulonocara": "trê" is the word for other animals, not for Cichlidae (the table of kind words).')
})

// The chief of staff, 16 Nov 2026: other names were only ever added, so a wrong one stayed: "dGH" under GH is its unit,
// and "thức ăn viên" under dry food names one form. A term's notes take a name off, saved or newly written.
test('a name the term\'s notes take off leaves its other names, saved or newly written', async () => {
  const asks = JSON.parse(await readFile(new URL('../src/glossary-asks.json', import.meta.url), 'utf8')) as Record<string, { notNames?: string[] }>
  expect(asks.gh!.notNames).toEqual(['dGH'])
  expect(asks['thuc-an-kho']!.notNames).toEqual(['thức ăn viên'])
  const root = await site()
  await mkdir(join(root, 'content/glossary/gh'), { recursive: true })
  await writeFile(join(root, 'content/glossary/gh/entity.json'), JSON.stringify({ id: 'gh', en: 'General hardness' }))
  await writeFile(join(root, 'content/glossary/gh/vi.json'), JSON.stringify({ slug: 'gh', name: 'GH', altNames: ['dGH', 'độ cứng tổng'], sections: {}, definition: 'Độ cứng tổng của nước.', quality: { score: 0.9, indexable: true } }))
  const named: TopicFacts = { ...facts, facts: [...facts.facts, { section: 'other', fact: 'Keepers here write the term as "độ cứng chung" and measure it in dGH', source: 1 }] }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    return { definition: 'GH là độ cứng tổng của nước.', altNames: ['dGH', 'độ cứng chung'], body: '<h3>Trong bể của bạn</h3><p>GH đo canxi và magie trong nước.</p>', related: [] } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => named as never, llm }, 'gh', { kind: 'care' })
  expect(r).toMatchObject({ id: 'gh', score: 1 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/gh/vi.json'), 'utf8'))
  expect(vi.altNames).toEqual(['độ cứng tổng', 'độ cứng chung'])
})

// The chief of staff, 20 Nov 2026: "lớp nền" linked three fish pages to the sand entry. It and "vật liệu nền" name any bed,
// so they are Nền bể's link phrases: Nền cát's notes take them off and Nền bể's give them, and a save keeps it so. "lớp nền
// cát" is sand's own, given by Nền cát's notes (the chief of staff, same day: 28 pages write it).
test('a link phrase the term\'s notes take off goes on the save, and one its notes give is added once', async () => {
  const asks = JSON.parse(await readFile(new URL('../src/glossary-asks.json', import.meta.url), 'utf8')) as Record<string, { notNames?: string[]; linkNames?: string[] }>
  expect(asks['nen-cat']!.notNames).toEqual(['lớp nền', 'vật liệu nền'])
  expect(asks['nen-cat']!.linkNames).toEqual(['lớp nền cát'])
  expect(asks['nen-be']!.linkNames).toEqual(['lớp nền', 'vật liệu nền'])
  const root = await site()
  const put = async (id: string, en: string, vi: object) => {
    await mkdir(join(root, `content/glossary/${id}`), { recursive: true })
    await writeFile(join(root, `content/glossary/${id}/entity.json`), JSON.stringify({ id, en }))
    await writeFile(join(root, `content/glossary/${id}/vi.json`), JSON.stringify({ sections: {}, quality: { score: 0.9, indexable: true }, ...vi }))
  }
  await put('nen-cat', 'Sand substrate', { slug: 'nen-cat', name: 'Nền cát', altNames: [], linkNames: ['cát mịn', 'Lớp nền', 'vật liệu nền'], definition: 'Lớp cát dưới đáy bể.' })
  // A saved other name the notes give as a link phrase moves to the link phrases.
  await put('nen-be', 'Substrate', { slug: 'nen-be', name: 'Nền bể', altNames: ['vật liệu nền'], linkNames: ['nền thủy sinh', 'lớp nền'], definition: 'Lớp vật liệu dưới đáy bể.' })
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    return { definition: 'Nền là lớp dưới đáy bể.', altNames: ['vật liệu nền'], body: '<h3>Trong bể của bạn</h3><p>Nền giữ rễ cây.</p>', related: [] } as never
  }
  const links = async (id: string) => JSON.parse(await readFile(join(root, `content/glossary/${id}/vi.json`), 'utf8')) as { altNames: string[]; linkNames: string[] }
  // Sand's saved phrases go in either letter case, the writer's offer doesn't bring one back as an other name, and its own
  // is added.
  expect(await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'nen-cat', { kind: 'setup' })).toMatchObject({ id: 'nen-cat', score: 1 })
  expect(await links('nen-cat')).toMatchObject({ altNames: [], linkNames: ['cát mịn', 'lớp nền cát'] })
  // The bed's: the one it had stays as written, the other is added, and neither turns into an other name.
  expect(await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'nen-be', { kind: 'setup' })).toMatchObject({ id: 'nen-be', score: 1 })
  expect(await links('nen-be')).toMatchObject({ altNames: [], linkNames: ['nền thủy sinh', 'lớp nền', 'vật liệu nền'] })
})

// The chief of staff, 19 Nov 2026: "Oxy hoà tan", Oxy hòa tan's own name with its tone mark on the other vowel, came back
// as its other name until its notes took it off by hand. A name is one name in either placing. The term here has no notes,
// so nothing else takes the name off (Codex, 19 Nov 2026), and its own name in the other placing stays a link phrase: a page
// that writes it so still links the term.
test('a name that is the term\'s own, or another term\'s, in the other tone placing is never an other name; its own stays a link phrase', async () => {
  const root = await site()
  await mkdir(join(root, 'content/glossary/hoa-chat'), { recursive: true })
  await writeFile(join(root, 'content/glossary/hoa-chat/entity.json'), JSON.stringify({ id: 'hoa-chat', en: 'Aquarium chemicals' }))
  await writeFile(join(root, 'content/glossary/hoa-chat/vi.json'), JSON.stringify({ slug: 'hoa-chat', name: 'Hóa chất', altNames: ['Hoá chất', 'Hóa chất bể cá', 'thuốc thủy sinh', 'thuốc thuỷ sinh'], sections: {}, definition: 'Chất pha vào nước bể.', quality: { score: 0.9, indexable: true } }))
  await mkdir(join(root, 'content/glossary/thuy-sinh'), { recursive: true })
  await writeFile(join(root, 'content/glossary/thuy-sinh/entity.json'), JSON.stringify({ id: 'thuy-sinh', en: 'Planted tank' }))
  await writeFile(join(root, 'content/glossary/thuy-sinh/vi.json'), JSON.stringify({ slug: 'thuy-sinh', name: 'Bể thủy sinh', altNames: [], sections: {}, definition: 'Bể trồng cây.', quality: { score: 0.9, indexable: true } }))
  const named: TopicFacts = { ...facts, facts: [...facts.facts,
    { section: 'other', fact: 'Name for the term: "HOÁ CHẤT".', source: 1 },
    { section: 'other', fact: 'Name for the term: "bể thuỷ sinh".', source: 1 },
    { section: 'other', fact: 'Name for the term: "thuốc xử lý nước".', source: 1 }] }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    return { definition: 'Hóa chất là chất pha vào nước bể.', altNames: ['HOÁ CHẤT', 'bể thuỷ sinh', 'thuốc xử lý nước'], body: '<h3>Trong bể của bạn</h3><p>Pha hóa chất theo nhãn.</p>', related: [] } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => named as never, llm }, 'hoa-chat', { kind: 'care' })
  expect(r).toMatchObject({ id: 'hoa-chat', score: 1 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/hoa-chat/vi.json'), 'utf8'))
  // Its own name in the old placing goes from its other names, saved or newly written, and stays once as a link phrase, as
  // does an other name in both placings; "bể thuỷ sinh" is another term's name, "Bể thủy sinh".
  expect(vi.altNames).toEqual(['Hóa chất bể cá', 'thuốc thủy sinh', 'thuốc xử lý nước'])
  expect(vi.linkNames).toEqual(['Hoá chất', 'thuốc thuỷ sinh'])
  // Saved again, with the writer offering both placings in other letter cases, nothing changes: no other name turns into a
  // link phrase, every name it had is still in one of the lists, and each other name is there once, never the term's own.
  const again: TopicFacts = { ...named, facts: [...named.facts, { section: 'other', fact: 'Name for the term: "thuốc thuỷ sinh".', source: 1 }] }
  const llm2: Llm = async a => (a.prompt.startsWith('GLOSSARY RULES') || isCheck(a.prompt) ? llm(a) : ({ ...(await llm(a) as object), altNames: ['HOÁ CHẤT', 'bể thuỷ sinh', 'thuốc xử lý nước', 'THUỐC THUỶ SINH', 'Thuốc Thủy Sinh'] } as never))
  for (let i = 0; i < 2; i++) {
    await makeGlossaryEntry(root, { research: async () => again as never, llm: llm2 }, 'hoa-chat', { kind: 'care' })
    const now = JSON.parse(await readFile(join(root, 'content/glossary/hoa-chat/vi.json'), 'utf8'))
    expect([now.altNames, now.linkNames]).toEqual([vi.altNames, vi.linkNames])
    const has = new Set([now.name, ...now.altNames, ...now.linkNames].map((n: string) => n.toLowerCase()))
    for (const n of ['Hoá chất', 'Hóa chất bể cá', 'thuốc thủy sinh', 'thuốc thuỷ sinh']) expect(has.has(n.toLowerCase())).toBe(true)
    const keys = [now.name, ...now.altNames].map(toneKey)
    expect(new Set(keys).size).toBe(keys.length)
  }
  // A name the term's notes take off comes back in neither placing, as an other name or a new link phrase (Oxy hòa tan's
  // notes: "Oxy hoà tan").
  await mkdir(join(root, 'content/glossary/oxy-hoa-tan'), { recursive: true })
  await writeFile(join(root, 'content/glossary/oxy-hoa-tan/entity.json'), JSON.stringify({ id: 'oxy-hoa-tan', en: 'Dissolved oxygen' }))
  // A link phrase it has stays one when the writer offers it in the other placing.
  await writeFile(join(root, 'content/glossary/oxy-hoa-tan/vi.json'), JSON.stringify({ slug: 'oxy-hoa-tan', name: 'Oxy hòa tan', altNames: ['Oxy hoà tan', 'OXY HÒA TAN'], linkNames: ['oxy hoà tan trong nước'], sections: {}, definition: 'Khí oxy hòa trong nước.', quality: { score: 0.9, indexable: true } }))
  const inWater: TopicFacts = { ...named, facts: [...named.facts, { section: 'other', fact: 'Name for the term: "oxy hòa tan trong nước".', source: 1 }] }
  const llm3: Llm = async a => (a.prompt.startsWith('GLOSSARY RULES') || isCheck(a.prompt) ? llm(a) : ({ ...(await llm(a) as object), altNames: ['HOÁ CHẤT', 'thuốc xử lý nước', 'Oxy hòa tan trong nước'] } as never))
  await makeGlossaryEntry(root, { research: async () => inWater as never, llm: llm3 }, 'oxy-hoa-tan', { kind: 'care' })
  const oxy = JSON.parse(await readFile(join(root, 'content/glossary/oxy-hoa-tan/vi.json'), 'utf8'))
  // Hóa chất, just written, already has the writer's "thuốc xử lý nước", so no other name is left.
  expect(oxy.altNames).toEqual([])
  expect(oxy.linkNames).toEqual(['oxy hoà tan trong nước', 'Oxy hòa tan trong nước'])
})

// The chief of staff, 18 Nov 2026: "Tên khác" holds only what a keeper calls the thing. A link phrase stays one, kept on
// the save; a phrase the writer offers that a fact only quotes, and not as the term's name, is not an other name.
test('a term\'s link phrases are kept and never become its other names; a writer\'s name stays only when a fact gives it as one', async () => {
  const root = await site()
  await mkdir(join(root, 'content/glossary/gh'), { recursive: true })
  await writeFile(join(root, 'content/glossary/gh/entity.json'), JSON.stringify({ id: 'gh', en: 'General hardness' }))
  await writeFile(join(root, 'content/glossary/gh/vi.json'), JSON.stringify({ slug: 'gh', name: 'GH', altNames: ['độ cứng tổng'], sections: {}, linkNames: ['độ cứng của nước'], definition: 'Độ cứng tổng của nước.', quality: { score: 0.9, indexable: true } }))
  const quoted: TopicFacts = { ...facts, facts: [...facts.facts,
    { section: 'other', fact: 'Name for the term: "độ cứng chung".', source: 1 },
    { section: 'other', fact: 'A shop says "nước rất cứng" scales heaters, and calls "độ cứng của nước" the first thing to test', source: 1 },
    { section: 'other', fact: 'GH is short for General hardness, measured in dGH', source: 1 }] }
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
    return { definition: 'GH là độ cứng tổng của nước.', altNames: ['độ cứng chung', 'độ cứng của nước', 'nước rất cứng', 'General hardness'], body: '<h3>Trong bể của bạn</h3><p>GH đo canxi và magie trong nước.</p>', related: [] } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => quoted as never, llm }, 'gh', { kind: 'care' })
  expect(r).toMatchObject({ id: 'gh', score: 1 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/gh/vi.json'), 'utf8'))
  expect(vi.altNames).toEqual(['độ cứng tổng', 'độ cứng chung', 'General hardness'])
  expect(vi.linkNames).toEqual(['độ cứng của nước'])
})

// The chief of staff, 19 Nov 2026: two pages of one site are one source, and a claim only one site gives is that site's and
// is credited. The fact check counts a claim's sites, so it reads each source's site and each fact's other sources; the
// writer's facts stay as they were.
test('the fact check reads each source\'s site and each fact\'s other sources ("also"); the writer reads neither', async () => {
  const root = await site()
  const withAlso: TopicFacts = { ...facts, facts: facts.facts.map((f, i) => (i === 0 ? { ...f, also: [1, 0] } : f)) }
  const prompts: string[] = []
  const llm: Llm = async ({ prompt }) => { prompts.push(prompt); return (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never }
  await makeGlossaryEntry(root, { research: async () => withAlso as never, llm }, 'lua', { kind: 'aquascaping' })
  const check = prompts.find(isCheck)!
  const writer = prompts.find(p => p.startsWith('Bạn viết'))!
  expect(check).toContain('{"source":0,"kind":"university","site":"ufl.edu"}')
  expect(check).toContain('{"source":1,"kind":"keeper","site":"example.org"}')
  // Its own source never counts again as another.
  expect(check).toContain('"source":0,"also":[1]}')
  expect(writer).not.toContain('"site"')
  expect(writer).not.toContain('"also"')
})

// Codex, 19 Nov 2026: a host is not a site. A shop's blog on a subdomain is the shop, as topics.ts counts a site (siteOf),
// and a blog host's blogs are each their own.
test('a source\'s site is its registered domain: a shop\'s subdomain is the shop, a blog host\'s blogs are each one', async () => {
  const root = await site()
  const pages: TopicFacts = { ...facts, sources: [
    { url: 'https://example.org/a', title: 'A', kind: 'shop' }, { url: 'https://blog.example.org./b', title: 'B', kind: 'shop' },
    { url: 'https://a.blogspot.com/x', title: 'C', kind: 'keeper' }, { url: 'https://b.blogspot.com/y', title: 'D', kind: 'keeper' }],
    facts: [0, 1, 2, 3].map(i => ({ section: 'what', fact: `Driftwood fact ${i}`, source: i })) }
  const prompts: string[] = []
  const llm: Llm = async ({ prompt }) => { prompts.push(prompt); return (prompt.startsWith('GLOSSARY RULES') ? { notes: [] } : isCheck(prompt) ? verdicts(prompt) : written) as never }
  await makeGlossaryEntry(root, { research: async () => pages as never, llm }, 'lua', { kind: 'aquascaping' })
  const sites = JSON.parse(/"sources":(\[[^\]]*\])/.exec(prompts.find(isCheck)!)![1]!).map((x: { site: string }) => x.site)
  expect(sites).toEqual(['example.org', 'example.org', 'a.blogspot.com', 'b.blogspot.com'])
})

// Codex, 19 Nov 2026: the one-sentence reads' replies were matched to their sentence with the neighbours the read now
// shows still attached, so a stop the re-reads gave read as supported. Two re-reads of three that stop a sentence one
// read stopped keep the entry from being saved.
test('a sentence one read stops and two of its three re-reads stop keeps the entry from being saved', async () => {
  const root = await site()
  const bad = 'Ngâm lũa mới 1–2 tuần.'
  let all = 0, alone = 0
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt) && prompt.includes('\n\nSENTENCE:\n')) { alone++; return verdicts(prompt, t => (t === bad && alone % 3 !== 0 ? 'uncredited: one site, plain' : undefined)) as never }
    if (isCheck(prompt)) { all++; return verdicts(prompt, t => (t === bad && all % 3 === 1 ? 'uncredited: one site' : undefined)) as never }
    return written as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(alone).toBeGreaterThan(0)
  expect(r).toMatchObject({ id: 'lua', skipped: 'stopped by 1 note' })
  expect((r as { notes: string[] }).notes[0]).toBe(`"${bad}": the facts don't carry it (uncredited, supported, supported, uncredited, uncredited, supported): one site / one site, plain`)
})

// The Writing Lead's pointer to the site's own entry (20 Nov 2026, with the chief of staff's yes): the step's fact check
// passes a pointer to another of the site's terms, by that term's name, and reads one that also makes a claim.
test('the step\'s fact check passes a pointer to another term of the site\'s unread, and reads one with a claim in it', async () => {
  const root = await site()
  const pointer = 'Lũa nhả màu vào nước: xem mục Tanin.', claim = 'Tanin là chất làm pH xuống: xem mục Tanin.'
  const read: string[] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) { read.push(prompt); return verdicts(prompt) as never }
    return { ...written, body: `<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p><p>${pointer}</p><p>${claim}</p>` } as never
  }
  await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(read.length).toBeGreaterThan(0)
  expect(read.some(p => p.includes(pointer))).toBe(false)
  expect(read.some(p => p.includes(claim))).toBe(true)
})

// The chief of staff, 20 Nov 2026: Tảo's label line, the house form for a medicine's dose, was stopped by the fact check in
// 3 reads of 3, as no fact says "follow the label". The step's checks pass the form whole, and the guide form by an open
// guide's title (glossary-dose.ts).
test('the step\'s fact check passes the house form for a medicine\'s dose unread: the label form, and the guide form by an open guide', async () => {
  const root = await site()
  await mkdir(join(root, 'content/guides/fin-rot'), { recursive: true })
  await writeFile(join(root, 'content/guides/fin-rot/entity.json'), JSON.stringify({ id: 'fin-rot', kind: 'disease' }))
  await writeFile(join(root, 'content/guides/fin-rot/vi.json'), JSON.stringify({ slug: 'ca-bi-thoi-vay-thoi-duoi', name: 'Cá bị thối vây, thối đuôi: dấu hiệu', quality: { score: 0.9, indexable: true } }))
  const label = 'Liều và cách dùng: theo nhãn thuốc.', guide = 'Liều và cách dùng: xem bài Cá bị thối vây, thối đuôi.'
  const body = `<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần. ${label}</p><p>Thêm muối. ${guide}</p>`
  const read: string[] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) { read.push(prompt); return verdicts(prompt, t => (t.startsWith('Liều') ? 'unsupported: not in the facts' : undefined)) as never }
    return { ...written, body } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(r).toMatchObject({ id: 'lua', score: 1 })
  expect(read.length).toBeGreaterThan(0)
  expect(read.some(p => p.includes(label) || p.includes(guide))).toBe(false)
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  expect(vi.body).toContain(label)
  expect(vi.body).toContain(guide)
})

// The chief of staff, 20 Nov 2026: the dose rule stops a save, for an amount given for a medicine or a pointer to "the
// treatment guide" or to any guide that isn't open; the writer has the open guides' titles, and no address (an entry's
// links are stripped, so an address could only be printed). A guide held while still marked for search isn't open (its
// page answers 404).
test('the writer and the rules read the open disease guides, and an entry that points to a held one is not saved', async () => {
  const root = await site()
  const guide = async (id: string, vi: object) => {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'entity.json'), JSON.stringify({ id, kind: 'disease' }))
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify(vi))
  }
  await guide('fin-rot', { slug: 'ca-bi-thoi-vay-thoi-duoi', name: 'Cá bị thối vây, thối đuôi: dấu hiệu', quality: { score: 0.9, indexable: true } })
  await guide('white-spot', { slug: 'ca-bi-dom-trang', name: 'Cá bị đốm trắng: dấu hiệu', quality: { score: 0.8, indexable: true }, held: { checks: ['dose-caution'], at: '2026-11-20' } })
  const toHeld = 'Cách chữa đốm trắng: xem bài Cá bị đốm trắng.'
  const writes: string[] = [], rules: string[] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.startsWith('GLOSSARY RULES')) { rules.push(prompt); return { notes: [] } as never }
    if (isCheck(prompt)) return verdicts(prompt) as never
    writes.push(prompt)
    return { ...written, body: `<h3>Nên làm gì</h3><p>Ngâm lũa mới 1–2 tuần.</p><p>${toHeld}</p>` } as never
  }
  const r = await makeGlossaryEntry(root, { research: async () => facts as never, llm }, 'lua', { kind: 'aquascaping' })
  expect(writes[0]).toContain('--- BÀI CHỮA BỆNH ĐANG MỞ (tên bài) ---\nCá bị thối vây, thối đuôi\n')
  expect(writes[0]).not.toContain('/vi/huong-dan/')
  expect(writes[0]).not.toContain('Cá bị đốm trắng')
  expect(rules[0]).toContain('--- OPEN GUIDES ---\nCá bị thối vây, thối đuôi\n')
  expect(r).toMatchObject({ id: 'lua', skipped: expect.stringMatching(/^stopped by \d+ note/) })
  expect((r as { notes: string[] }).notes.some(n => n.startsWith('Rule 13: ') && n.includes(toHeld))).toBe(true)
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  expect(vi.body ?? '').not.toContain(toHeld)
})

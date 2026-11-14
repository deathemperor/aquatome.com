import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
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

/** A prompt for the sentence check (glossary-facts.ts): all of an entry's sentences, or one alone. */
const isCheck = (prompt: string) => prompt.startsWith('Below are FACTS')
/**
 * The sentence check's reply to `prompt`: every sentence supported, but those `say` gives a verdict ("unsupported: why").
 * A prompt for one sentence alone gets that sentence's.
 */
const verdicts = (prompt: string, say: (text: string) => string | undefined = () => undefined) => {
  const one = /\n\nSENTENCE:\n(.*)$/s.exec(prompt)
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
    if (prompt.startsWith('GLOSSARY RULES')) return { notes: [] } as never
    if (isCheck(prompt)) return verdicts(prompt) as never
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
  // A term whose notes file names no kinds holds to about 400, however its lists look: pH's four bold labels are not kinds
  // (its draft ran to 916 words; this one, 917).
  const ph = `<ul>${['Làm pH lên:', 'Làm pH xuống:', 'Lá bàng và lũa:', 'Không đáng lo:'].map(k => `<li><strong>${k}</strong> ${'đá '.repeat(226)}</li>`).join('')}</ul>`
  expect(lengthNotes(ph)).toEqual({ notes: ['The entry is 917 words: hold it to about 400, and leave what is left out to the pages that use the term.'], stop: true })
  expect(lengthNotes(`<p>${'nước '.repeat(392)}</p>`)).toEqual({ notes: [], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(450)}</p>`)).toEqual({ notes: ['The entry is 450 words: hold it to about 400, and leave what is left out to the pages that use the term.'], stop: false })
  expect(lengthNotes(`<p>${'nước '.repeat(478)}</p>`).stop).toBe(true)
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
  expect(Object.entries(RULE_SIDE).filter(([, v]) => v === 'advice').map(([k]) => Number(k))).toEqual([4, 7, 12])
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

test('an accepted draft is saved as the step kept it, logged with who accepted it and every note; a refused one changes nothing', async () => {
  const root = await site()
  const before = await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')
  // Refused: a contradiction.
  await keptDraft(root, long6, ['Rule 1: two statements contradict', 'Rule 4: x'])
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toMatchObject({ refused: ['a note that stops a save: Rule 1: two statements contradict'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // Refused: a draft that isn't as the step kept it, however small the change. Kept for its length alone.
  await keptDraft(root, long6, sixth.notes.slice(1, 4))
  const kept = await readFile(draftPath(root), 'utf8')
  await writeFile(draftPath(root), kept.replace('ngấm đủ nước', 'ngấm nước'))
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  await writeFile(draftPath(root), kept.replace(/"broken": \d+/, '"broken": 2'))
  expect(await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff' })).toEqual({ id: 'lua', refused: ['the kept draft is not as the step kept it'] })
  expect(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8')).toBe(before)
  // A later draft kept, the earlier one put back byte for byte is still one the step kept.
  await keptDraft(root, { ...long6, body: long6.body.replace('Lũa khô nổi', 'Bản sau: lũa khô nổi') }, sixth.notes.slice(1, 4))
  expect(await readFile(draftPath(root), 'utf8')).not.toBe(kept)
  // Accepted as kept: saved, with no model call, the draft gone.
  await writeFile(draftPath(root), kept)
  const r = await makeGlossaryEntry(root, { research: none, llm: none }, 'lua', { kind: 'aquascaping', accept: 'the chief of staff', now: () => new Date('2026-11-14T00:00:00Z') })
  expect(r).toMatchObject({ id: 'lua', score: 1, acceptedBy: 'the chief of staff', refs: 3 })
  const vi = JSON.parse(await readFile(join(root, 'content/glossary/lua/vi.json'), 'utf8'))
  expect(vi).toMatchObject({ definition: sixth.entry.definition, body: long6.body, altNames: ['lũa gỗ', 'gỗ lũa'], quality: { score: 1, indexable: true } })
  const log = JSON.parse(await readFile(join(root, 'engine-state/reviews/glossary.json'), 'utf8'))['vi/glossary/lua']
  expect(log[0]).toMatchObject({ at: '2026-11-14T00:00:00Z', score: 1, notes: JSON.parse(kept).notes, kept: true, acceptedBy: 'the chief of staff' })
  // Three rules notes, the entry's length and its three long items.
  expect(JSON.parse(kept).notes).toHaveLength(7)
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

// Codex, 14 Nov 2026: a rewording that ran the entry past its cap was saved, since its length wasn't counted again.
test('the entry as reworded is counted again: a rewording that runs it past the cap keeps it from being saved', async () => {
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
  expect(r).toMatchObject({ id: 'tanin', skipped: 'stopped by 1 note' })
  expect((r as { notes: string[] }).notes).toContain('The entry is 466 words: hold it to about 400, and leave what is left out to the pages that use the term.')
  expect(await readFile(join(root, 'content/glossary/tanin/vi.json'), 'utf8')).toBe(before)
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

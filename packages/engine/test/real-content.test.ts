import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, mayPublish, resolveDataCard, type Translation } from '@aq/schema'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { productOf } from '../src/fit'
import { loadPages } from '../src/pages'
import { ENGLISH_PLACE_WORD } from '../src/place-names'
import { fishThaiLai, wordingSlips } from '../src/sanitize'
import { cardOf, cardProblems, readSummaries } from '../src/summaries'
import { cardSchool, readTraits } from '../src/traits'

// The real content/, not the test store, as a public build shows it. Each class of defect here has a fix the engine
// makes on every page each cycle, before the build (`pnpm engine sweep`, sweep.ts; `pnpm engine metric` for units), so a
// page that has one is a page the fix missed: fix the sweep, not the page. Only the kinds of page each fix covers
// (RATCHETED). Pages with one on 2026-11-01, of 2,599: the source site's comments or related posts 22, a heading left at
// the end 2, a repeated paragraph 12, a photo of another fish or a map 25, a card figure out of bounds 12, a title
// promising a count the text lacks 4, numbered labels out of order 1, an imperial figure 1.
test('no page has a defect the sweep fixes', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id in RATCHETED))
  expect(errors).toEqual([])
  const held = ratcheted(findings)
  const left = Object.fromEntries(Object.keys(RATCHETED).map(id => [id, held.filter(f => f.rule === id).map(f => `${f.page.path}: ${f.detail}`)]))
  expect(left, 'run pnpm engine sweep').toEqual(Object.fromEntries(Object.keys(RATCHETED).map(id => [id, []])))
}, 300_000) // every page of the real content, in three languages: about 100 s on 2,599 pages

// The owner's names of 2026-11-07. The sweep writes each when the sentence says which fish it is (renameSwapped), so what
// fails here is a sentence it left, the fish unclear: a page that keeps one is written again.
test('no page calls a fish by the name it no longer has', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id === 'swapped-name'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.path}: ${f.detail}`)).toEqual([])
}, 300_000)

// The owner, 2026-11-11: "Cá thài lài doesn't exist in Vietnamese". The sweep writes the fish it named by their names
// (sanitize.ts WORDING); what fails here is a "thài lài" it left ("họ thài lài"): the page is written again.
test('no page, fish summary or caption calls a fish "thài lài"', async () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const { findings, errors } = checkPages(await loadPages(content), RULES.filter(r => r.id === 'fish-words'))
  expect(errors).toEqual([])
  const files = [...(await readdir(join(content, 'summaries'))).map(f => `summaries/${f}`), ...readdirSync(join(content, 'captions')).map(f => `captions/${f}`)]
  const left = (await Promise.all(files.map(async f => fishThaiLai(await readFile(join(content, f), 'utf8')).map(q => `${f}: ${q}`)))).flat()
  expect([...findings.map(f => `${f.page.path}: ${f.detail}`), ...left]).toEqual([])
}, 300_000)

// The owner's names of 2026-11-11, each guarded (nameFixed) so a later source read keeps it: the eartheaters the trade
// calls Hải Hồ (Geophagus, Satanoperca, Acarichthys heckelii; not Biotodoma or Gymnogeophagus, which no source calls so),
// and the four fish once headed "thài lài".
test("the owner's Hải Hồ and the names that replaced \"thài lài\" stay, each guarded", async () => {
  const dir = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const vi = (id: string) => JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation
  const eartheaters = readdirSync(dir).filter(id => /^(?:geophagus|satanoperca)-/.test(id) || id === 'acarichthys-heckelii')
  expect(eartheaters.length).toBeGreaterThanOrEqual(29)
  for (const id of eartheaters) expect([id, vi(id).name.startsWith('Cá hải hồ '), vi(id).nameFixed]).toEqual([id, true, true])
  for (const id of readdirSync(dir).filter(id => /^(?:biotodoma|gymnogeophagus)-/.test(id))) expect(vi(id).name, id).not.toMatch(/hải hồ/i)
  const four = { 'trichogaster-chuna': 'Cá sặc mật ong', 'trichopsis-vittata': 'Cá bã trầu', 'parosphromenus-phoenicurus': 'Cá liquorice gourami phoenicurus', 'ctenops-nobilis': 'Cá Ctenops nobilis' }
  for (const [id, name] of Object.entries(four)) expect([vi(id).name, vi(id).nameFixed]).toEqual([name, true])
})

// The owner, 2026-11-07: "fritz slim out is not for Vietnamese. I can effectively treat this with very cheap oxy già."
// And 2026-11-08, on a box stuck over the translated article: "The mention of US med is so irrelevant here." These two
// guides' treatment is written for a keeper in Vietnam: nothing not sold here, in any field of any language's file, and
// nothing explaining its absence. Fritz Slime Out, Tetra AlguMin Plus and AlgoStop depot: no listing on 22 Vietnamese
// shops' own search. Ultralife's only listing is a general pet wholesaler's, not counted as sold.
const BLUE_GREEN_ALGAE = {
  'aquariumcoop-blogs-aquarium-blue-green-algae': ['https://aquariumbreeder.com/blue-green-algae-cyanobacteria-profile-and-how-to-remove/', 'https://www.pharmacity.vn/oxy-gia-vp-3-60ml-loc-10-chai.html'],
  'aquariumbreeder-blue-green-algae-cyanobacteria-profile-and-how-to-remove': ['https://www.pharmacity.vn/oxy-gia-vp-3-60ml-loc-10-chai.html'],
}
test.each(Object.entries(BLUE_GREEN_ALGAE))('blue-green algae: %s names no product not sold in Vietnam, cites its dose, and the engine keeps it', async (id, cited) => {
  const dir = fileURLToPath(new URL(`../../../content/guides/${id}/`, import.meta.url))
  for (const file of await readdir(dir)) {
    const text = await readFile(join(dir, file), 'utf8')
    expect(text, file).not.toMatch(/fritz|slime\s*out|slime\s*stain|algu\s*min|algo\s*stop|ultra\s*life/iu)
    expect(text, file).not.toMatch(/bài gốc|ở mỹ|ở việt nam|aquatome thêm/iu)
  }
  const t = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  expect(t.bodyFixed).toBe(true)
  expect(t.localNote).toBeUndefined()
  expect(t.body).toContain('oxy già 3%')
  expect(t.body).toContain('3 ml cho mỗi 4 lít')
  // The dose says what it's for and carries its caution, so it can't be read against another guide's 0.4 ml for a whole tank.
  const dose = t.body!.match(/<li>[^<]*3 ml cho mỗi 4 lít[^<]*<\/li>/)?.[0]
  expect(dose).toContain('liều bơm tại chỗ, không phải liều châm đều cả bể')
  expect(dose).toMatch(/bỏng mang.*tép/)
  // No writer carries a guide's refs over a source read again (merge.ts writeGuide): this says so when one is lost.
  expect(t.refs?.map(r => r.url)).toEqual(expect.arrayContaining(cited))
})

// Praziquantel mixed into food, in all four languages, by the fish's weight (University of Florida; a trial on grass carp doses
// the same way). The guide had "35–125 mg/kg", which doesn't say a kilo of what, and a koi seller's own mix, per kilo of food,
// that no second source backs (2026-11-10).
test('the gill fluke guide gives praziquantel in food by the fish\'s weight, and the engine keeps it', async () => {
  const dir = fileURLToPath(new URL('../../../content/guides/aquatome-ca-bi-san-mang-gill-flukes-dau-hieu-cach-chua-va-phong/', import.meta.url))
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation
    expect(t.bodyFixed, lang).toBe(true)
    expect(t.body, lang).not.toMatch(/35–125|50–75 (?:mg|มก)/u)
    expect(t.body, lang).toMatch(/<td>40 (?:mg|มก)/u)
    expect(t.body, `${lang}: Florida's warning beside its food dose`).toMatch(/nghiên cứu|diteliti|dikaji|วิจัย/u)
  }
})

// University of Florida's angelfish paper: "50mg/kg body weight for five consecutive days". A dose per kilo says a kilo of what.
test('the hexamita guide says the food dose is per kilo of the fish, in every language', async () => {
  const dir = fileURLToPath(new URL('../../../content/guides/aquatome-ca-di-phan-trang-benh-trung-roi-hexamita-ca-dia-nguyen-nhan-cach-chua/', import.meta.url))
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation
    expect(t.body, lang).toMatch(/50 (?:mg|มก\.)(?:\/(?:kg|กก\.) | cho mỗi kg )(?:berat|น้ำหนัก|trọng lượng)/u)
    expect(t.body, lang).not.toMatch(/50 (?:mg|มก\.)\/(?:kg|กก\.)(?! (?:berat|น้ำหนัก))/u)
  }
})

// A fish's summary states its card's figures, as the card is now: the sweep sends back any that doesn't (cardProblems).
// On 2026-11-07, 54 of 505 approved summaries didn't (size 27 figures, temperature 23, pH 18, hardness 10, difficulty 10,
// minimum tank 5): checked once when written, against a card that changed after (Cá neon vua: 23–27 °C, card 23–29 °C).
test('no approved summary states a figure its card doesn\'t show', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const cards = new Map((await loadAll({ root, lang: 'vi', publicBuild: true })).species.map(s => [s.id, cardOf(s)]))
  const left = (await readSummaries(root)).filter(s => s.review === 'approved' && cards.has(s.id)).flatMap(s => cardProblems(s, cards.get(s.id)!).map(p => `${s.id}: ${p}`))
  expect(left, 'run pnpm engine sweep').toEqual([])
}, 300_000) // the real content loaded once: about 60 s on a loaded machine

// Every place, not the one a reader complained of: the sweep puts a generic word in Vietnamese each cycle, and the
// place-names step gives the name readers use (place-names.ts). 147 of 816 places on 2026-11-08, before them.
test('no Vietnamese place name keeps River, Island, Lake, Basin, Province, Mountains, Peninsula or Rio in another language', () => {
  const dir = fileURLToPath(new URL('../../../content/places', import.meta.url))
  const names = readdirSync(dir).map(id => (JSON.parse(readFileSync(`${dir}/${id}/vi.json`, 'utf8')) as { name: string }).name)
  expect(names.filter(n => ENGLISH_PLACE_WORD.test(n))).toEqual([])
})

// Alone, these read as a province or as nothing: "Bắc Giang" on a Chinese fish, "Mã" on a Vietnamese one.
test('no river a Vietnamese reader knows by name goes without its "sông"', () => {
  const dir = fileURLToPath(new URL('../../../content/places', import.meta.url))
  const names = readdirSync(dir).map(id => (JSON.parse(readFileSync(`${dir}/${id}/vi.json`, 'utf8')) as { name: string }).name)
  const known = ['Bắc Giang', 'Đông Giang', 'Tây Giang', 'Châu Giang', 'Mân Giang', 'Tùng Hoa', 'Nin', 'Dương Tử', 'Mê Kông', 'Sê Kông', 'Hoàng Hà', 'Lam', 'Mã', 'Vệ', 'Thu Bồn', 'Trà Khúc', 'Bến Hải']
  expect(names.filter(n => known.includes(n))).toEqual([])
})

// Settled from the fungus guide's source (Practical Fishkeeping, "Dealing with fish egg 'fungus'"): 1 ml per about 3.5
// litres is for 35% hydrogen peroxide. A reader here buys oxy già at the pharmacy, where it is 3% (market.ts), so a 35%
// dose that doesn't say so reads as a dose for that bottle, at about a twelfth of the strength.
test('a Vietnamese page that doses 35% oxy già says it isn\'t the pharmacy\'s 3%', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)), ['vi'])
  const strong = /(?:oxy già|hydrogen peroxide|H2O2)[^.!?]{0,40}35\s*%|35\s*%[^.!?]{0,40}(?:oxy già|hydrogen peroxide|H2O2)/i
  const told = /không phải[^.!?]{0,40}3\s*%[^.!?]{0,40}nhà thuốc/i
  const text = (p: (typeof pages)[number]) => [...p.fields.map(f => f.html), ...p.lines.map(l => l.text)].join(' ').replace(/<[^>]+>/g, ' ')
  expect(pages.filter(p => strong.test(text(p)) && !told.test(text(p))).map(p => p.path)).toEqual([])
}, 300_000)

// Two independent sources agreed against Seriously Fish on an adult size, far apart (Glaser, and FishBase from the checklist
// of South American fishes): the figure they agree on is the page's, on the card and in the text, whatever a re-read writes.
// Size and tank travel together: no source gives a tank for the larger fish, so the page shows none and says so.
const shownText = (fish: { sections: { key: string; source: string }[]; t: Translation }) => fish.sections.map(s => fish.t.sections[`${s.key}:${s.source}`] ?? '').join(' ')
test('a size two independent sources overrule is gone from the card and the text, and so is the tank set for the smaller fish', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  for (const [id, size, old] of [['myloplus-schomburgkii', 45, /\(SL\)\s*:?\s*12 cm|120 × 40/], ['moenkhausia-oligolepis', 12, /\(SL\)\s*:?\s*5 cm|60 × 40|45 × 25/]] as const) {
    const fish = species.find(x => x.id === id)!
    expect(resolveDataCard(fish.dataCard.sizeCm!, 'sizeCm')?.value, id).toBe(size)
    expect(fish.dataCard.tankCm, id).toBeUndefined()
    expect(shownText(fish), id).not.toMatch(old)
    expect(shownText(fish), id).toContain(`không ghi kích thước bể cho cá dài tới ${size} cm`)
  }
}, 120_000)

// Seriously Fish's keeping range for it contradicts the wild reading on its own page; BW Aquatics sides with the reading.
test('a hardness against its source\'s own measured reading gives way to the source that sides with the reading, in every language', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  for (const lang of ['vi', 'id', 'th'] as const) {
    const fish = (await loadAll({ root, lang, publicBuild: true })).species.find(x => x.id === 'pseudomugil-furcatus')!
    expect(resolveDataCard(fish.dataCard.gh!, 'gh'), lang).toMatchObject({ value: { min: 4, max: 12 }, sources: ['bwaquatics'] })
    expect(shownText(fish), lang).not.toMatch(/15\s*[–-]\s*30/)
  }
}, 240_000)

// A shop search carries the words a page's text uses: the sweep writes them the readers' way (sanitize.ts viSearchWords),
// so one the writers' rules would change can't sit where the wording rule doesn't look (the reader of #1135, 2026-11-12).
test('no shop search has words the text writes another way', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const slips: string[] = []
  for (const kind of ['species', 'plants']) for (const id of readdirSync(join(root, kind))) {
    let e: { productSlots?: { keywords: string[] }[] }
    try { e = JSON.parse(readFileSync(join(root, kind, id, 'entity.json'), 'utf8')) } catch { continue }
    for (const row of e.productSlots ?? []) for (const k of row.keywords) if (wordingSlips(k).length) slips.push(`${kind}/${id}: ${k}`)
  }
  expect(slips).toEqual([])
})

// The owner's report of 10 Nov: the Altum page said a hard, neutral tank is enough and that soft water is a must, under one
// heading. Where the sources can't both be true, the page shows the one that speaks for that heading (Seriously Fish for
// water, the owner's rule of 2026-11-06), whatever a later read of a source writes back into the page's file.
// The owner's report of 10 Nov: the chat rightly said the Altum page disagreed with itself about water. One block now, our
// figures first, the other source's reported in one sentence, and three editors at 9 (docs/review/editors.md).
test('the Altum page speaks with one voice about water, its own figures first', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const fish = (await loadAll({ root, lang: 'vi', publicBuild: true })).species.find(s => s.id === 'pterophyllum-altum')!
  expect(fish.sections.filter(s => s.key === 'waterConditions').map(s => s.source)).toEqual(['aquatome'])
  const water = fish.t.sections['waterConditions:aquatome']!
  expect(water.indexOf('4,8 đến 6,2')).toBeGreaterThan(-1)
  expect(water.indexOf('4,8 đến 6,2')).toBeLessThan(water.indexOf('Có tài liệu khác lại ghi là'))
}, 120_000)

test('a heading whose sources could not both be true speaks with one voice', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const voices = JSON.parse(readFileSync(join(root, 'one-voice.json'), 'utf8')) as Record<string, Record<string, string>>
  expect(Object.keys(voices)).toContain('pterophyllum-altum')
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  const heard = (id: string, key: string) => species.find(s => s.id === id)?.sections.filter(x => x.key === key).map(x => x.source)
  for (const [id, keep] of Object.entries(voices)) for (const [key, source] of Object.entries(keep)) expect(heard(id, key), `${id} ${key}`).toEqual([source])
}, 120_000)

// The neon tetra's blue stripe: The Spruce Pets said it starts at the tip of the nose, photos start it at the eye, and no
// other source says where it starts (2026-11-11). The page keeps what the sources agree on: it runs to the adipose fin.
test('the neon tetra\'s stripe has no starting point no source agrees on, in any language, and the engine keeps it so', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const notes = (JSON.parse(readFileSync(join(root, 'species/paracheirodon-innesi/entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string; fixed?: boolean }[] })
    .sections.find(s => s.key === 'notes' && s.source === 'sprucepets')!
  expect(notes.fixed).toBe(true)
  expect(notes.html).not.toMatch(/tip of the nose/)
  expect(notes.html).toMatch(/blue stripe that runs along the body to the adipose fin/)
  const nose = { vi: /chóp mõm đến vây mỡ/, id: /ujung moncong hingga/, th: /ปลายจมูกถึงครีบไขมัน/, ms: /hujung muncung hingga/ }
  for (const [lang, said] of Object.entries(nose)) {
    const t = JSON.parse(readFileSync(join(root, `species/paracheirodon-innesi/${lang}.json`), 'utf8')) as { sections: Record<string, string> }
    expect(t.sections['notes:sprucepets'], lang).not.toMatch(said)
  }
})

// The chief of staff, 2026-11-11: a card's school size is Seriously Fish's where it gives one (traits.ts sfSchool), as the
// card's other figures are. The cardinal tetra's card said 6 from another source, where Seriously Fish says 8-10.
test("every card's school size is Seriously Fish's where it gives one, never below another source's on the page; the cardinal tetra's is 8", async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8')) as Record<string, Parameters<typeof mayPublish>[0]>
  const wrong: string[] = []
  for (const t of await readTraits(root)) {
    const e = JSON.parse(readFileSync(join(root, 'species', t.id, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }
    const n = cardSchool(e.sections, s => mayPublish(sources[s], 'text'))
    if (n !== null && n !== t.schoolMin) wrong.push(`${t.id}: ${t.schoolMin} (should be ${n})`)
  }
  expect(wrong).toEqual([])
  expect((await readTraits(root)).find(t => t.id === 'paracheirodon-axelrodi')?.schoolMin).toBe(8)
})

// The owner, 2026-11-11, on the app's list of guides: "Duplicated". No two guides in a language share a title, and none is
// only a name (content-rules.ts guide-title), in every language. The pages here had one on 11 Nov: 2Hr Aquarist's 27 tank
// pages, titled with the aquascaper's name, and two videos with one title: all 29 titled by hand (nameFixed). A new one
// the sweep doesn't title (guide-titles.ts, ten a run) fails here.
test('no two guides in a language share a title, and none is only a name', async () => {
  const guides = (await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))).filter(p => p.kind === 'guides')
  const { findings, errors } = checkPages(guides, RULES.filter(r => r.id === 'guide-title'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.lang}/${f.page.id}: ${f.detail}`)).toEqual([])
}, 300_000)

// The chief of staff's rulings of 2026-11-12 on the tap-water report. Each is a hand fix the engine keeps: a guide's body
// marked bodyFixed, a page's part marked fixed (in English and in each language beside it), a note of ours in localNote.
test('the tap-water fixes hold: Seachem Prime named at its dose, our note on water for lucky bamboo beside its source\'s, our chloramine note, artemia salt in grams', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  type Guide = { body: string; bodyFixed?: boolean; faqFixed?: boolean; summary?: string[]; faq?: { q: string; a: string }[]; localNote?: { html: string; refs: { url: string }[] } }
  // Our dechlorinating guide: the dose's product is one the shops here sell, so the reader check doesn't hold the dose.
  const prime = read<Guide>('guides/aquatome-khu-clo-nuoc-may-cho-be-ca-cac-cach-va-cach-nao-an-toan/vi.json')
  expect(prime.bodyFixed).toBe(true)
  expect(prime.body).toMatch(/<h3>Liều dùng Seachem Prime theo nhà sản xuất<\/h3>\s*<p>[^<]*<\/p>\s*<ul>\s*<li>1 nắp \(5 mL\) cho 200 L/)
  expect(productOf('Seachem Prime', 'vi')?.status).toBe('sold')
  // Lucky bamboo (the chief of staff, 2026-11-12: a source is never credited with words it did not say). Aquarium Breeder's
  // parts keep what it says, RO or distilled water and dechlorinated tap water if you use it; the ruling, RO with minerals
  // added back where animals share the water and pure water only for the plant by itself, is our own part, labelled, with
  // its sources, in every language the page has.
  const ours = { en: /^<p><strong>AquaTome's note:<\/strong> [^<]*Where fish, shrimp or snails share the water, use dechlorinated tap water, or RO water with minerals added back/, vi: /^<p><strong>Ghi chú của AquaTome:<\/strong> [^<]*Bể có cá, tép hay ốc sống chung thì dùng nước máy đã khử clo, hoặc nước RO đã bù khoáng/, id: /^<p><strong>Catatan AquaTome:<\/strong> [^<]*Kalau ada ikan, udang, atau siput di air yang sama, gunakan air keran yang sudah dihilangkan klorinnya, atau air RO yang sudah ditambah mineral/, th: /^<p><strong>หมายเหตุจาก AquaTome:<\/strong> [^<]*ถ้ามีปลา กุ้ง หรือหอยอยู่ในน้ำเดียวกัน ให้ใช้น้ำประปาที่กำจัดคลอรีนแล้ว หรือน้ำ RO ที่เติมแร่ธาตุแล้ว/ }
  const ruling = { en: /minerals added back|kept by itself/, vi: /bù khoáng|trồng riêng/, id: /ditambah mineral|dipelihara sendiri/, th: /เติมแร่ธาตุ|ไว้อย่างเดียว/ }
  const plant = read<{ sections: { key: string; source: string; html: string; refs?: number[]; fixed?: boolean }[]; refs?: { url: string }[] }>('plants/dracaena-sanderiana/entity.json')
  const note = plant.sections.find(s => s.key === 'waterConditions' && s.source === 'aquatome')!
  expect(note.fixed).toBe(true)
  expect(note.html).toMatch(ours.en)
  // Each claim is a cited page's: RO or distilled for the plant, and tap water dechlorinated (Aquarium Breeder's guide to it);
  // shrimp need minerals, a conditioner with tap water, and snails suffer in distilled water (its shrimp page, the last in
  // its author's reply there); pure RO never on its own, fish need minerals (Seneye); a dechlorinator for tap water (Aquarium Co-op).
  expect(note.refs!.map(i => plant.refs![i]!.url)).toEqual(['https://aquariumbreeder.com/lucky-bamboo-in-the-aquarium-care-guide/', 'https://aquariumbreeder.com/shrimp-keeping-can-i-remineralize-tap-water/', 'https://answers.seneye.com/en/water_chemistry/RO_water_(reverse_osmosis)', 'https://www.aquariumcoop.com/blogs/aquarium/betta-fish-care-guide'])
  // What Aquarium Breeder says stays its own, in every language: RO or distilled water, tap water dechlorinated first.
  const says = { vi: [/nước RO hoặc nước cất/, /khử clo trước/], id: [/air RO atau air suling/, /hilangkan klorinnya dulu/], th: [/น้ำ RO หรือน้ำกลั่น/, /ต้องกำจัดคลอรีนก่อน/] }
  for (const lang of ['vi', 'id', 'th'] as const) {
    const t = read<{ sections: Record<string, string> }>(`plants/dracaena-sanderiana/${lang}.json`).sections
    expect(t['waterConditions:aquatome'], lang).toMatch(ours[lang])
    for (const key of ['maintenance', 'waterConditions']) expect(t[`${key}:aquariumbreeder`], `${lang} ${key}`).not.toMatch(ruling[lang])
    expect(t['maintenance:aquariumbreeder'], lang).toMatch(says[lang][0]!)
    expect(t['maintenance:aquariumbreeder'], lang).toMatch(says[lang][1]!)
    expect(t['waterConditions:aquariumbreeder'], lang).toMatch(says[lang][0]!)
  }
  for (const key of ['maintenance', 'waterConditions']) {
    const ab = plant.sections.find(s => s.key === key && s.source === 'aquariumbreeder')!
    expect(ab.html, key).toMatch(/Use only RO or distilled water/)
    if (key === 'maintenance') expect(ab.html).toMatch(/If you still use tap water, dechlorinate it first/)
    expect(ab.html, key).not.toMatch(ruling.en)
  }
  // The stand-tap-water video guide: the video's advice stays the video's, our note goes beside it, and "chỉ phí tiền" goes.
  const stand = read<Guide>('guides/youtube-S-FR9u--jVs/vi.json')
  // The note is ours and says no more than its sources: EPA on chloramine left standing, and the Hanoi study, where only
  // the groundwater high in ammonia bound the chlorine as chloramine. It names no video (the reader check's rule).
  expect(stand.bodyFixed).toBe(true)
  expect(stand.faqFixed).toBe(true)
  expect(stand.localNote?.html).toMatch(/^<p><strong>Ghi chú của AquaTome cho bạn đọc ở Việt Nam:<\/strong> Nước máy một số nơi có cloramin, để qua đêm không hết; không chắc thì dùng chất khử clo\. Ở Hà Nội, [^<]*nguồn nước ngầm nhiều amoni/)
  expect(stand.localNote?.html).not.toMatch(/video/i)
  expect(stand.localNote?.refs.map(r => r.url)).toEqual(['https://19january2017snapshot.epa.gov/www3/region9/water/chloramine.html', 'https://doi.org/10.1016/S0043-1354(03)00138-6'])
  expect(JSON.stringify([stand.body, stand.summary, stand.faq])).not.toMatch(/phí tiền/)
  // Artemia hatching water: about 30 g of salt a litre, in grams alone (a tablespoon is nearer 18 g).
  const spoon = { vi: /30 g[^.]{0,40}1 muỗng canh/, id: /30 g[^.]{0,60}1 sendok makan/, th: /30 กรัม[^<"]{0,60}1 ช้อนโต๊ะ/, ms: /30 g[^.]{0,80}1 sudu besar/ }
  for (const [lang, said] of Object.entries(spoon)) {
    const g = read<Guide>(`guides/aquatome-ap-trung-artemia-lam-thuc-an-cho-ca-con-cach-lam-tai-nha/${lang}.json`)
    expect(g.bodyFixed, lang).toBe(true)
    expect(JSON.stringify([g.body, g.summary, g.faq]), lang).not.toMatch(said)
  }
})

// GBIF's fuzzy matches made a catfish page a tube worm's (Brochis arcuata → Ditrupa arietina, Sabellida), and its exact
// Mollienisia, a moth's genus, gave a molly page a moth's family (Noctuidae). The engine now takes a match only of an animal
// the page's group can be (gbif.ts pageTaxon). This holds each fish or shrimp page's order to its group; "other" and
// "snails", too many orders to name, are held by that class check alone. The two above, and a spiny eel filed with the
// loaches, wait for their own fix.
const GROUP_ORDERS: Record<string, string[]> = {
  catfish: ['Siluriformes'],
  tetras: ['Characiformes'], characins: ['Characiformes'], characoids: ['Characiformes'],
  barbs: ['Cypriniformes'], danios: ['Cypriniformes'], rasboras: ['Cypriniformes'], cyprinid: ['Cypriniformes'],
  loaches: ['Cypriniformes'],
  cichlids: ['Perciformes', 'Cichliformes'], labyrinth: ['Perciformes', 'Anabantiformes'], gobies: ['Perciformes', 'Gobiiformes'],
  killifish: ['Cyprinodontiformes', 'Beloniformes'], livebearers: ['Cyprinodontiformes', 'Beloniformes'],
  rainbowfish: ['Atheriniformes'], shrimp: ['Decapoda'],
}
test('every species page\'s order fits its group', () => {
  const root = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const off = readdirSync(root).filter(id => {
    const e = JSON.parse(readFileSync(join(root, id, 'entity.json'), 'utf8')) as { group: string; order: string }
    return GROUP_ORDERS[e.group] !== undefined && !GROUP_ORDERS[e.group]!.includes(e.order)
  })
  expect(off.sort()).toEqual(['ditrupa-arietina', 'macrognathus-siamensis', 'mollienisia'])
})

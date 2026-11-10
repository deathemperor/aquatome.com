import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, type Translation } from '@aq/schema'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
import { ENGLISH_PLACE_WORD } from '../src/place-names'
import { cardOf, cardProblems, readSummaries } from '../src/summaries'

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

// The owner's report of 10 Nov: the Altum page said a hard, neutral tank is enough and that soft water is a must, under one
// heading. Where the sources can't both be true, the page shows the one that speaks for that heading (Seriously Fish for
// water, the owner's rule of 2026-11-06), whatever a later read of a source writes back into the page's file.
test('a heading whose sources could not both be true speaks with one voice', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const voices = JSON.parse(readFileSync(join(root, 'one-voice.json'), 'utf8')) as Record<string, Record<string, string>>
  expect(Object.keys(voices)).toContain('pterophyllum-altum')
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  const heard = (id: string, key: string) => species.find(s => s.id === id)?.sections.filter(x => x.key === key).map(x => x.source)
  for (const [id, keep] of Object.entries(voices)) for (const [key, source] of Object.entries(keep)) expect(heard(id, key), `${id} ${key}`).toEqual([source])
}, 120_000)

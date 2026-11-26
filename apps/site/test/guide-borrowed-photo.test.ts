import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { guideImage, mentionIndex, titleFaults, titleNames, withVietnameseHeads } from '../src/lib/mentions'
import picks from '../src/lib/guide-heads-picks.json' with { type: 'json' }

// 13 Nov, the Design Lead: the day's guide, on breeding guppies, opened in the app on a water louse. It has no photo of its
// own, so it borrows the first photo of a fish it names, and its text names the louse ("bo bo (rận nước)") before the
// guppy. A guide borrows the fish or plant its title names first; its card and its head are that picture. Here the
// fixture's neon tetra stands for the louse, named in passing, and the chili rasbora for the guppy, named by the title.
test('a guide with no photo of its own borrows the fish its title names, not the first one its text names', async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const [passing, subject] = [vi.species.find(s => s.id === 'paracheirodon-innesi')!, vi.species.find(s => s.id === 'boraras-brigittae')!]
  const g = { ...was, photos: [], mentions: [passing.id, subject.id], t: { ...was.t, name: `${subject.t.name} sắp đẻ: dấu hiệu và cách nuôi cá con`, body: '' } }
  const c = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? g : x)) }
  expect(mentionIndex(c).guides.get(g.id)!.species.map(s => s.id)).toEqual([passing.id, subject.id])
  expect(guideImage(c, g)?.url).toBe(subject.photos[0]!.url)
  // A title naming none of them borrows none (the chief of staff, 15 Nov 2026).
  const plain = { ...g, t: { ...g.t, name: 'Thay nước cho bể' } }
  const c2 = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? plain : x)) }
  expect(guideImage(c2, plain)).toBeUndefined()
}, 120_000)

// A guide's card stands for more than one page, so it borrows no non-commercial head: a plant's neither, which the
// engine's avoid list doesn't hold (a reader's point, 20 Nov; the chief of staff's rule, 17 Nov).
test("a guide borrows no non-commercial head, a plant's as well as a fish's", async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const plant = vi.plants.find(p => p.id === 'cryptocoryne-wendtii')!
  const g = { ...was, photos: [], mentions: [plant.id], t: { ...was.t, name: `${plant.t.name}: cách trồng`, body: '' } }
  const led = (licence: string) => ({ ...vi, plants: vi.plants.map(p => (p.id === plant.id ? { ...p, photos: [{ ...plant.photos[0]!, licence }] } : p)), guides: vi.guides.map(x => (x.id === g.id ? g : x)) })
  expect(guideImage(led('CC BY 4.0'), g)?.url).toBe(plant.photos[0]!.url)
  expect(guideImage(led('CC BY-NC 4.0'), g)).toBeUndefined()
}, 120_000)

// Grok's read of #1224, 13 Nov: titles list fish without their class word ("cupang, guppy, molly"), in the order the
// guide means; Thai writes a name glued to the next word; and a one-word other name ("Betta") can stand where a longer,
// more particular name does.
type Which = 'passing' | 'subject'
async function borrowing(title: string, edit: (x: { t: { name: string; altNames: string[] } }, which: Which) => void = () => {}, linked: Which[] = ['passing', 'subject']) {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const pick = (id: string) => { const s = vi.species.find(s => s.id === id)!; return { ...s, t: { ...s.t, altNames: [...s.t.altNames] } } }
  const [passing, subject] = [pick('paracheirodon-innesi'), pick('boraras-brigittae')]
  edit(passing, 'passing'); edit(subject, 'subject')
  const g = { ...was, photos: [], mentions: linked.map(w => (w === 'passing' ? passing : subject).id), t: { ...was.t, name: title, body: '' } }
  const c = { ...vi, species: vi.species.map(s => (s.id === passing.id ? passing : s.id === subject.id ? subject : s)), guides: vi.guides.map(x => (x.id === g.id ? g : x)) }
  return { url: guideImage(c, g)?.url, passing: passing.photos[0]!.url, subject: subject.photos[0]!.url }
}

test('a title that lists fish without their class word borrows the one it names first', async () => {
  // "Cá boraras đỏ" and "Cá neon xanh", listed as "boraras đỏ, neon xanh": the text names the neon first.
  const r = await borrowing('Phân biệt đực cái: boraras đỏ, neon xanh')
  expect(r.url).toBe(r.subject)
  const back = await borrowing('Phân biệt đực cái: neon xanh, boraras đỏ')
  expect(back.url).toBe(back.passing)
}, 120_000)

test('of two fish named at one place in the title, the longer name wins', async () => {
  // The neon's other name "Boraras" stands where the chili rasbora's "Boraras đỏ" does.
  const r = await borrowing('Boraras đỏ sắp đẻ', (x, which) => { if (which === 'passing') x.t.altNames.push('Boraras') })
  expect(r.url).toBe(r.subject)
}, 120_000)

test('a Thai name glued to the next word is still named by the title', async () => {
  const r = await borrowing('ปลาหางนกยูงใกล้คลอด: ดูสัญญาณ', (x, which) => { if (which === 'subject') x.t.name = 'ปลาหางนกยูง' })
  expect(r.url).toBe(r.subject)
}, 120_000)

// The owner's report, 15 Nov: "Cá đĩa đi phân trắng…" opened on an oscar its text names in passing. "Cá đĩa" is the
// discus page's own name, but the text doesn't link it, as other pages' names begin with it. A name only one page holds
// names that page, linked or not; a name two pages hold names neither (the chief of staff, 15 Nov 2026).
test('a title naming a page by a name only it holds borrows that page, though the text links it nowhere', async () => {
  const r = await borrowing('Cá boraras đỏ đi phân trắng: dấu hiệu', (x, which) => { if (which === 'passing') x.t.name = 'Cá boraras đỏ lùn' }, [])
  expect(r.url).toBe(r.subject)
  // A gloss in brackets after a name isn't part of it: the breed "Cá La Hán (Flowerhorn)" is "Cá La Hán".
  const glossed = await borrowing('Nuôi cá boraras đỏ trong bể nhỏ', (x, which) => { if (which === 'subject') x.t.name = 'Cá boraras đỏ (Chili)' }, [])
  expect(glossed.url).toBe(glossed.subject)
}, 120_000)

test('a name two pages hold borrows neither, and nothing else stands in for it', async () => {
  const r = await borrowing('Cá boraras đỏ sắp đẻ', (x, which) => { if (which === 'passing') x.t.altNames.push('Cá boraras đỏ') })
  expect(r.url).toBeUndefined()
}, 120_000)

test('a one-word name, or a name without its class word, counts only for a fish the text names', async () => {
  // A lamp's "đèn neon" isn't the neon tetra; "đuôi kiếm" in "Cá bảy màu đuôi kiếm đôi" is a guppy's tail, not the swordtail.
  const word = (linked: Which[]) => borrowing('Đèn zorbak cho bể thủy sinh', (x, which) => { if (which === 'subject') x.t.altNames.push('Zorbak') }, linked)
  expect((await word([])).url).toBeUndefined()
  const named = await word(['subject'])
  expect(named.url).toBe(named.subject)
  expect((await borrowing('Bể boraras đỏ 20 lít', () => {}, [])).url).toBeUndefined()
}, 120_000)

test('a title naming a breed borrows the breed, not the fish whose name its own begins with', async () => {
  const vi = await getContent('vi')
  const breed = vi.breeds.find(b => b.id === 'pigeon-blood-discus')!
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const g = { ...was, photos: [], mentions: [], t: { ...was.t, name: `${breed.t.name}: chọn cá và nuôi`, body: '' } }
  const c = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? g : x)) }
  expect(guideImage(c, g)?.url).toBe(breed.photos[0]!.url)
}, 120_000)

// The chief of staff, 15 Nov 2026: the owner was told a guide picturing the wrong animal shows no photo until its page is
// right. "Một loài cá rô phi lùn… Apistogramma sp." names the tilapia's "cá rô phi" for a dwarf cichlid: it borrows nothing.
test('a guide picked to borrow nothing borrows nothing, and one picked a page borrows that page, whatever its title names', async () => {
  const vi = await getContent('vi')
  const [subject, other] = [vi.species.find(s => s.id === 'boraras-brigittae')!, vi.species.find(s => s.id === 'paracheirodon-innesi')!]
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const ids = Object.entries(picks)
  const as = (id: string) => ({ ...was, id, photos: [], mentions: [subject.id], t: { ...was.t, name: `${subject.t.name} sắp đẻ`, body: '' } })
  const nothing = as(ids.find(([, p]) => p === null)![0])
  const c = { ...vi, guides: [...vi.guides, nothing] }
  expect(guideImage(c, nothing)).toBeUndefined()
  // A pick names a page by kind and id; here the fixture's neon stands for the page picked.
  const [pickedId, page] = ids.find(([, p]) => p?.startsWith('species/'))!
  const fake = { ...other, id: page!.slice('species/'.length) }
  const named = as(pickedId)
  const c2 = { ...vi, species: [...vi.species, fake], guides: [...vi.guides, named] }
  expect(guideImage(c2, named)?.url).toBe(other.photos[0]!.url)
}, 120_000)


// The chief of staff, 15 Nov 2026: a guide's head is chosen once, Curation's pick or else the page its Vietnamese title
// names, and shows in every language, so the languages can't disagree: the Indonesian discus guide's "Ikan Discus" named
// nothing, and the Thai text doesn't link the discus at all. A translated title that names another page is a translation
// fault, listed for Writing (titleFaults).
test('a guide borrows, in every language, the page its Vietnamese title names, whatever its own title names', async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const [passing, subject] = [vi.species.find(s => s.id === 'paracheirodon-innesi')!, vi.species.find(s => s.id === 'boraras-brigittae')!]
  const g = { ...was, photos: [], mentions: [], t: { ...was.t, name: `${subject.t.name} sắp đẻ`, body: '' } }
  const viC = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? g : x)) }
  // A translation put together by hand, whose title names the neon instead.
  const idG = { ...g, t: { ...g.t, name: `${passing.t.name} sắp đẻ` } }
  const id = { ...viC, lang: 'id' as const, guides: viC.guides.map(x => (x.id === g.id ? idG : x)) }
  expect(titleNames(id, idG).map(x => x.id)).toEqual([passing.id])
  expect(guideImage(withVietnameseHeads({ ...id }, viC), idG)?.url).toBe(subject.photos[0]!.url)
  expect(titleFaults(withVietnameseHeads({ ...id }, viC)).map(f => [f.id, f.own, f.vi])).toEqual([[g.id, [`species/${passing.id}`], [`species/${subject.id}`]]])
  // A title naming fewer of the Vietnamese title's pages is no fault: Thai runs words together.
  const both = { ...g, t: { ...g.t, name: `${subject.t.name} và ${passing.t.name} sắp đẻ` } }
  const viBoth = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? both : x)) }
  expect(titleFaults(withVietnameseHeads({ ...id, guides: id.guides.map(x => (x.id === g.id ? { ...idG, t: { ...idG.t, name: `${subject.t.name} sắp đẻ` } } : x)) }, viBoth))).toEqual([])
  // The page the Vietnamese names has none in this language: nothing, not the page its own title names.
  expect(guideImage(withVietnameseHeads({ ...id, species: id.species.filter(s => s.id !== subject.id) }, viC), idG)).toBeUndefined()
  // A guide the Vietnamese doesn't have (held there): its own title's.
  expect(guideImage(withVietnameseHeads({ ...id }, { ...viC, guides: viC.guides.filter(x => x.id !== g.id) }), idG)?.url).toBe(passing.photos[0]!.url)
}, 120_000)

test('an Indonesian or Malay title names a page by its name with the word for fish before it ("Ikan Discus")', async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const subject = vi.species.find(s => s.id === 'boraras-brigittae')!
  const g = { ...was, photos: [], mentions: [], t: { ...was.t, name: 'Ikan Zorbak bertelur: tanda dan cara', body: '' } }
  const named = (lang: 'id' | 'ms' | 'vi') => titleNames({ ...vi, lang, species: vi.species.map(s => (s.id === subject.id ? { ...s, t: { ...s.t, name: 'Zorbak', altNames: [] } } : s)), guides: vi.guides.map(x => (x.id === g.id ? g : x)) }, g).map(x => x.id)
  expect(named('id')).toEqual([subject.id])
  expect(named('ms')).toEqual([subject.id])
  // A one-word name alone still counts only for a fish the text names.
  expect(named('vi')).toEqual([])
}, 120_000)

// Grok's read of #1362: Malay's "Ikan Discus" page and the page "Discus" both held "ikan discus", so the hexamita guide's
// title named neither. A page's own name wins over another page's name with "Ikan" put before it.
test('"Ikan X" a page has as its own name stays that page, though another page is named "X"', async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const [own, other] = [vi.species.find(s => s.id === 'boraras-brigittae')!, vi.species.find(s => s.id === 'paracheirodon-innesi')!]
  const g = { ...was, photos: [], mentions: [], t: { ...was.t, name: 'Najis Putih Ikan Zorbak: Tanda dan Cara', body: '' } }
  const as = (s: typeof own, name: string) => ({ ...s, t: { ...s.t, name, altNames: [] } })
  const named = (lang: 'id' | 'ms') => titleNames({ ...vi, lang, species: vi.species.map(s => (s.id === own.id ? as(s, 'Ikan Zorbak') : s.id === other.id ? as(s, 'Zorbak') : s)), guides: vi.guides.map(x => (x.id === g.id ? g : x)) }, g).map(x => x.id)
  expect(named('ms')).toEqual([own.id])
  expect(named('id')).toEqual([own.id])
}, 120_000)

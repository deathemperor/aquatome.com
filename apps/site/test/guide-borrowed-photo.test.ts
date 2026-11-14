import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { guideImage, mentionIndex } from '../src/lib/mentions'
import awaiting from '../src/lib/guide-heads-awaiting.json' with { type: 'json' }
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
  // A title naming none of them borrows none (the chief of staff, 15 Nov 2026), unless the guide is one that borrowed before
  // that day and waits on Curation's keep or drop: it keeps the text's order until then.
  const plain = { ...g, t: { ...g.t, name: 'Thay nước cho bể' } }
  const c2 = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? plain : x)) }
  expect(guideImage(c2, plain)).toBeUndefined()
  const waits = { ...plain, id: awaiting[0]! }
  const c3 = { ...vi, guides: [...vi.guides, waits] }
  expect(guideImage(c3, waits)?.url).toBe(passing.photos[0]!.url)
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


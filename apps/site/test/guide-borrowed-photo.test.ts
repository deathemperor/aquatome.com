import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { guideImage, mentionIndex } from '../src/lib/mentions'

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
  // A title naming none of them keeps the text's order.
  const plain = { ...g, t: { ...g.t, name: 'Thay nước cho bể' } }
  const c2 = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? plain : x)) }
  expect(guideImage(c2, plain)?.url).toBe(passing.photos[0]!.url)
}, 120_000)

// Grok's read of #1224, 13 Nov: titles list fish without their class word ("cupang, guppy, molly"), in the order the
// guide means; Thai writes a name glued to the next word; and a one-word other name ("Betta") can stand where a longer,
// more particular name does.
async function borrowing(title: string, edit: (x: { t: { name: string; altNames: string[] } }, which: 'passing' | 'subject') => void = () => {}) {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const pick = (id: string) => { const s = vi.species.find(s => s.id === id)!; return { ...s, t: { ...s.t, altNames: [...s.t.altNames] } } }
  const [passing, subject] = [pick('paracheirodon-innesi'), pick('boraras-brigittae')]
  edit(passing, 'passing'); edit(subject, 'subject')
  const g = { ...was, photos: [], mentions: [passing.id, subject.id], t: { ...was.t, name: title, body: '' } }
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

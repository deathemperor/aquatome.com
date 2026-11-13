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

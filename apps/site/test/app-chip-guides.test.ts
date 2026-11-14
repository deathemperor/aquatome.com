import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CurationSchema, LANGS } from '@aq/schema'
import { appIndex, chipGuides, type AppChip, type AppItem } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'

// A chip's page lists "Bài viết" and "Video": the guides about its group, which the chips data carries (the Design Lead,
// 14 Nov). A guide is about the group when its title holds the chip's word or one of a member's names (the chief of
// staff, 14 Nov), and Curation adds or takes off one by hand where a title misleads.
const chip = (name: string, members: string[]): AppChip => ({ id: 'x', name, order: 1, count: members.length, members })
const fish = (id: string, name: string, aka?: string[]): AppItem => ({ kind: 'fish', id, name, path: `/ca/${id}/`, ...(aka ? { aka } : {}) }) as AppItem
const guide = (slug: string, name: string, video?: number): AppItem => ({ kind: 'guide', name, path: `/huong-dan/${slug}/`, ...(video ? { video } : {}) }) as AppItem

test("a guide is the group's when its title holds the chip's word or a member's name, a whole word; video guides apart, in the index's order", () => {
  const items = [
    fish('neocaridina-davidi', 'Tép cherry', ['Cherry shrimp']),
    guide('a', 'Cách nuôi tép cho người mới'),
    guide('b', 'Set bể nano cho Cherry shrimp', 300),
    guide('c', 'Ếch tépxx kỳ lạ'),
    guide('d', 'Tép cherry đổi màu vì sao?'),
    guide('e', 'Cá ăn rêu cho bể cộng đồng'),
  ]
  expect(chipGuides('vi', chip('Tép', ['neocaridina-davidi']), items)).toEqual({ guides: ['/huong-dan/a/', '/huong-dan/d/'], videos: ['/huong-dan/b/'] })
  expect(chipGuides('vi', chip('Ốc', []), items)).toEqual({})
})

test("a name another fish has too doesn't count, and another fish's name that holds the group's word is no mention of it", () => {
  const items = [
    fish('astronotus-ocellatus', 'Cá oscar', ['Cá hổ']),
    fish('chromobotia-macracanthus', 'Cá chạch hề', ['Cá hổ', 'Clown loach']),
    fish('neolamprologus-similis', 'Cá ở vỏ ốc', ['Cá ốc']),
    fish('clea-helena', 'Ốc sát thủ'),
    guide('hổ', 'Sự khác biệt về hoa văn ở cá hổ'),
    guide('oscar', 'Cách nuôi cá oscar'),
    guide('cá-ốc', 'Nuôi cá ốc Tanganyika'),
    guide('ốc-hại', 'Ốc hại trong bể thủy sinh'),
  ]
  expect(chipGuides('vi', chip('Cichlid châu Mỹ', ['astronotus-ocellatus']), items).guides).toEqual(['/huong-dan/oscar/'])
  expect(chipGuides('vi', chip('Ốc', ['clea-helena']), items).guides).toEqual(['/huong-dan/ốc-hại/'])
})

test("Curation adds a guide by hand where the title misses the group, and takes one off where the title misleads", () => {
  const items = [fish('a', 'Cá a'), guide('add', 'Cây cho bể cichlid châu Phi'), guide('off', 'Thức ăn cá a và rau'), guide('keep', 'Nuôi cá a')]
  expect(chipGuides('vi', chip('Ali', ['a']), items, { add: ['/huong-dan/add/'], off: ['/huong-dan/off/'] }).guides).toEqual(['/huong-dan/add/', '/huong-dan/keep/'])
})

test("Thai, written without spaces, finds the word anywhere in a title", () => {
  const items = [fish('betta-splendens', 'ปลากัด'), guide('a', 'วิธีเลี้ยงปลากัดสำหรับมือใหม่')]
  expect(chipGuides('th', chip('ปลากัด', ['betta-splendens']), items).guides).toEqual(['/huong-dan/a/'])
})

test("every language's chips name only its index's guides, written ones in `guides` and video ones in `videos`, and the curation file's hand lists name real guides", async () => {
  const file = CurationSchema.parse(JSON.parse(readFileSync(new URL('../../../content/curation.json', import.meta.url), 'utf8')))
  const real = new Set(readdirSync(new URL('../../../content/guides/', import.meta.url)))
  for (const ch of file.chips) for (const id of [...(ch.guides?.add ?? []), ...(ch.guides?.off ?? [])]) expect(real.has(id), `${ch.id}: ${id}`).toBe(true)
  const vi = await getContent('vi')
  for (const lang of LANGS) {
    const c = await getContent(lang), ix = appIndex(lang, c, new Map(), vi.species, { calendar: file, today: '2026-11-14' })
    const kind = new Map(ix.items.filter(i => i.kind === 'guide').map(i => [i.path, i.video ? 'video' : 'guide']))
    for (const ch of ix.home.chips ?? []) {
      for (const p of ch.guides ?? []) expect(kind.get(p), `${lang} ${ch.id} ${p}`).toBe('guide')
      for (const p of ch.videos ?? []) expect(kind.get(p), `${lang} ${ch.id} ${p}`).toBe('video')
    }
  }
}, 600_000)

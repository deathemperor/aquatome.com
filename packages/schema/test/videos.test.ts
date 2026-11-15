import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { loadAll } from '../src/load'
import { languageWord, videosForPage, videosOnTwoFish } from '../src/videos'
import type { Video } from '../src/types'

const v = (youtubeId: string, title: string, lang: string) => ({ youtubeId, title, durationSec: 60, lang })
const en = v('en1', 'Neon tetra care', 'en-US')
const fr = v('fr1', 'Le néon', 'fr')
const vi = v('vi1', 'Nuôi cá neon', 'vi')
const titles = { en1: 'Cách nuôi cá neon' }

test("a title in the page's language, the real one kept; a video spoken in that language first and never left out", () => {
  expect(videosForPage([en, vi], 'vi', titles, {})).toEqual([vi, { ...en, title: 'Cách nuôi cá neon', originalTitle: 'Neon tetra care' }])
  expect(videosForPage([en, vi], 'vi', titles, {}, { order: false }).map(x => x.youtubeId)).toEqual(['en1', 'vi1'])
})

test('with the rule on, a foreign video with no title in that language is not shown, and one spoken in it always is', () => {
  expect(videosForPage([fr, vi, en], 'vi', titles, {}, { requireTitle: true }).map(x => x.youtubeId)).toEqual(['vi1', 'en1'])
  expect(videosForPage([fr], 'vi', titles, {}).map(x => x.title)).toEqual(['Le néon'])
  expect(videosForPage([vi], 'vi', {}, {}, { requireTitle: true })).toEqual([vi])
})

test('a generated video is marked, translated or not', () => {
  const out = videosForPage([en, vi], 'vi', titles, { en1: 'generated', vi1: 'drawn' })
  expect(out.every(x => (x as { generated?: boolean }).generated === true)).toBe(true)
})

test("a video's language as a word in the page's language; none where the tag names none", () => {
  expect(languageWord('en', 'vi')).toBe('tiếng Anh')
  expect(languageWord('en-US', 'vi')).toBe('tiếng Anh')
  expect(languageWord('fr', 'vi')).toBe('tiếng Pháp')
  expect(languageWord('vi', 'vi')).toBe('tiếng Việt')
  expect(languageWord('en', 'id')).toBe('bahasa Inggris')
  expect(languageWord('vi', 'id')).toBe('bahasa Vietnam')
  expect(languageWord('en', 'th')).toBe('ภาษาอังกฤษ')
  expect(languageWord('en', 'ms')).toBe('bahasa Inggeris')
  expect(languageWord('zxx', 'vi')).toBeUndefined()
  expect(languageWord('und', 'vi')).toBeUndefined()
})

describe('a language not yet turned on for translated titles (content/video-titles/on.json; the chief of staff, 15 Nov)', () => {
  const vids: Video[] = [
    { youtubeId: 'kept1', title: 'Heckel tank tour', durationSec: 60, lang: 'en' },
    { youtubeId: 'other', title: 'Discus care guide', durationSec: 60, lang: 'en' },
    { youtubeId: 'none1', title: 'Discus breeding', durationSec: 60, lang: 'en' },
    { youtubeId: 'vivi1', title: 'Nuôi cá đĩa', durationSec: 60, lang: 'vi' },
  ]
  const titles = { kept1: 'Tham quan bể cá đĩa Heckel', other: 'Hướng dẫn nuôi cá đĩa' }
  const kept = { kept1: 'passed at 9' }
  test('shows only the kept titles translated; every other foreign video keeps its own title, marked, and none is hidden', () => {
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: false, kept })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false],
      ['other', 'Discus care guide', true],
      ['none1', 'Discus breeding', true],
    ])
  })
  test('turned on, every stored title shows, and a foreign video with none is hidden as before', () => {
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: true, kept })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false],
      ['other', 'Hướng dẫn nuôi cá đĩa', false],
    ])
  })
  test('turned on, a title the meaning check refused shows the video\'s own title, marked, and is not hidden; a kept title wins over a refusal (the chief of staff, 16 Nov)', () => {
    const refused = { other: 'added: a forum name made a fact', kept1: 'never applies to a kept title' }
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: true, kept, refused })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false, v.originalTitle])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false, undefined],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false, 'Heckel tank tour'],
      ['other', 'Discus care guide', true, undefined],
    ])
    // A product's reviews, which keep their order and every video: the same mark.
    const reviews = videosForPage(vids, 'vi', titles, {}, { order: false, on: true, kept, refused })
    expect(reviews.find(v => v.youtubeId === 'other')).toMatchObject({ title: 'Discus care guide', ownTitle: true })
  })
  test('turned on, a stored title shows only where the check passed those very words; one it never read, or passed in other words, keeps the video\'s own title, marked (the reviewers of the check, 16 Nov)', () => {
    const more: Video[] = [...vids, { youtubeId: 'later', title: 'Discus tank mates', durationSec: 60, lang: 'en' }, { youtubeId: 'redone', title: 'Discus water', durationSec: 60, lang: 'en' }]
    const stored = { ...titles, later: 'Cá nuôi chung với cá đĩa', redone: 'Nước cho cá đĩa' }
    const passed = { other: 'Hướng dẫn nuôi cá đĩa', redone: 'Nước nuôi cá đĩa, lần trước' }
    const out = videosForPage(more, 'vi', stored, {}, { requireTitle: true, on: true, kept, refused: {}, passed })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false],
      ['other', 'Hướng dẫn nuôi cá đĩa', false],
      ['later', 'Discus tank mates', true],
      ['redone', 'Discus water', true],
    ])
    // A refusal still wins over a pass of the same words.
    expect(videosForPage(more, 'vi', stored, {}, { on: true, kept, refused: { other: 'x' }, passed }).find(v => v.youtubeId === 'other')).toMatchObject({ title: 'Discus care guide', ownTitle: true })
    // Off, passes change nothing.
    expect(videosForPage(more, 'vi', stored, {}, { requireTitle: true, on: false, kept, passed }).filter(v => !v.ownTitle).map(v => v.youtubeId)).toEqual(['vivi1', 'kept1'])
  })
  test('the loader holds a stored title to the words the check passed (content/video-titles/<lang>.passed.json): none, or other words, shows the video\'s own title with the language on', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aq-passed-'))
    await cp(fileURLToPath(new URL('../../../apps/site/test/fixture-content', import.meta.url)), root, { recursive: true })
    const ram = async () => (await loadAll({ root, lang: 'vi', publicBuild: false })).species.find(s => s.id === 'mikrogeophagus-ramirezi')!.videos.find(v => v.youtubeId === 'enenenenene')!
    expect(await ram()).toMatchObject({ title: 'Cách nuôi cá phượng hoàng xanh', originalTitle: 'German blue ram care guide' })
    await writeFile(join(root, 'video-titles/vi.passed.json'), JSON.stringify({ enenenenene: 'Hướng dẫn nuôi cá phượng hoàng xanh' }))
    expect(await ram()).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
    await rm(join(root, 'video-titles/vi.passed.json'))
    expect(await ram()).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
  })
  test('a video on the pages of two fish keeps its own title, marked, whatever the files say, a kept title or a pass included; another language\'s video and two pages of one fish don\'t count (the reviewers of the check, 16 Nov)', () => {
    const pages = [
      { fish: 'Symphysodon discus', videos: [v('kept1', 'Heckel tank tour', 'en'), v('other', 'Discus care guide', 'en'), v('vivi1', 'Nuôi cá đĩa', 'vi')] },
      { fish: 'Symphysodon aequifasciatus', videos: [v('kept1', 'Heckel tank tour', 'en'), v('vivi1', 'Nuôi cá đĩa', 'vi')] },
      { fish: 'Symphysodon discus', videos: [v('other', 'Discus care guide', 'en')] },
    ]
    const shared = videosOnTwoFish(pages, 'vi')
    expect([...shared]).toEqual(['kept1'])
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: true, kept, refused: {}, passed: { other: 'Hướng dẫn nuôi cá đĩa' }, shared })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Heckel tank tour', true],
      ['other', 'Hướng dẫn nuôi cá đĩa', false],
    ])
  })
  test('the loader counts each video\'s fish over every species and product page in the language, held ones too: one taken up by a second fish\'s page, or a product\'s reviews, shows its own title on both, though passed in its words; a refusal beside a matching pass shows its own title too', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aq-shared-'))
    await cp(fileURLToPath(new URL('../../../apps/site/test/fixture-content', import.meta.url)), root, { recursive: true })
    const shown = async (id: string) => (await loadAll({ root, lang: 'vi', publicBuild: false, leaveOutHeld: true })).species.find(s => s.id === id)?.videos.find(v => v.youtubeId === 'enenenenene')
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'Cách nuôi cá phượng hoàng xanh' })
    const second = join(root, 'species/paracheirodon-axelrodi')
    const e = JSON.parse(await readFile(join(second, 'entity.json'), 'utf8')), ram = JSON.parse(await readFile(join(root, 'species/mikrogeophagus-ramirezi/entity.json'), 'utf8'))
    await writeFile(join(second, 'entity.json'), JSON.stringify({ ...e, videos: [...e.videos, ram.videos.find((x: Video) => x.youtubeId === 'enenenenene')] }))
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
    expect(await shown('paracheirodon-axelrodi')).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
    // Held in Vietnamese, the second page is left out of the build but still counts.
    const t = JSON.parse(await readFile(join(second, 'vi.json'), 'utf8'))
    await writeFile(join(second, 'vi.json'), JSON.stringify({ ...t, held: { checks: ['fit'], at: '2026-11-16' } }))
    expect(await shown('paracheirodon-axelrodi')).toBeUndefined()
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
    await writeFile(join(second, 'entity.json'), JSON.stringify(e))
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'Cách nuôi cá phượng hoàng xanh' })
    // A product's reviews count too, the product its own page.
    const lamp = join(root, 'products/chihiros-wrgb-ii-slim/entity.json'), p = JSON.parse(await readFile(lamp, 'utf8'))
    await writeFile(lamp, JSON.stringify({ ...p, reviews: { ...p.reviews, videos: [...p.reviews.videos, { ...ram.videos.find((x: Video) => x.youtubeId === 'enenenenene'), channel: 'C' }] } }))
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
    await writeFile(lamp, JSON.stringify(p))
    await writeFile(join(root, 'video-titles/vi.refused.json'), JSON.stringify({ enenenenene: 'dropped: x' }))
    expect(await shown('mikrogeophagus-ramirezi')).toMatchObject({ title: 'German blue ram care guide', ownTitle: true })
  })
  test('off, a refusal changes nothing: every foreign video but the kept already keeps its own title', () => {
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: false, kept, refused: { other: 'x' } })
    expect(out.map(v => [v.youtubeId, v.ownTitle ?? false])).toEqual([['vivi1', false], ['kept1', false], ['other', true], ['none1', true]])
  })
})

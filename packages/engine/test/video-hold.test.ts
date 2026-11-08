import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { TranslationSchema } from '@aq/schema'
import { fixStored } from '../src/content-rules'
import { metricPages } from '../src/metric'
import { sweep } from '../src/sweep'
import { holdGuides } from '../src/video-hold'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(v, null, 2)}\n`) }
const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
const quality = { score: 0.8, indexable: true, bySource: { youtube: 0.8 } }

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'vh-'))
  const guide = async (id: string, name: string, body: string, langs = ['vi']) => {
    const vid = id.slice('youtube-'.length)
    await put(root, `content/guides/${id}/entity.json`, {
      id, kind: 'disease', source: 'youtube', sourceUrl: `https://www.youtube.com/watch?v=${vid}`, html: '', photos: [], mentions: [], updatedAt: '2026-11-07',
      video: { youtubeId: vid, title: 'A video', channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/@MJAquascaping', durationSec: 600, chapters: [], thumb: { url: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, width: 1280, height: 720 } },
    })
    for (const lang of langs) await put(root, `content/guides/${id}/${lang}.json`, { slug: id, name, altNames: [], sections: {}, body, summary: [], faq: [], quality })
  }
  await put(root, 'content/sources.json', {})
  await guide('youtube-meds', 'Trị bệnh đốm trắng cho cá bằng thuốc', '<p>Nhiệt độ 30 °C, 5 gallon nước.</p>', ['vi', 'id'])
  await guide('youtube-water', 'Giữ pH ổn định', '<p>Đo pH mỗi tuần.</p>')
  return root
}

test('video-hold marks a class of guides in every language file they have, and --clear lets them back', async () => {
  const root = await setup()
  expect(await holdGuides(root, 'risk1')).toEqual(['youtube-meds'])
  expect((await read(root, 'content/guides/youtube-meds/vi.json')).quality).toEqual({ ...quality, chat: false })
  expect((await read(root, 'content/guides/youtube-meds/id.json')).quality).toEqual({ ...quality, chat: false })
  expect((await read(root, 'content/guides/youtube-water/vi.json')).quality).toEqual(quality)
  expect(await holdGuides(root, 'risk1')).toEqual([]) // already held: nothing written
  expect(await holdGuides(root, 'all')).toEqual(['youtube-water'])
  expect(await holdGuides(root, 'risk2', true)).toEqual(['youtube-water'])
  expect((await read(root, 'content/guides/youtube-water/vi.json')).quality).toEqual(quality)
})

test('the mark stays through the steps that rewrite a guide\'s files: the schema, the content rules, metric units, the sweep', async () => {
  const root = await setup()
  await holdGuides(root, 'risk1')
  const held = (await read(root, 'content/guides/youtube-meds/vi.json'))
  expect(TranslationSchema.parse(held).quality.chat).toBe(false) // what the cover writer and the site's loader parse with
  await fixStored(join(root, 'content'))
  await metricPages(join(root, 'content'), root)
  await sweep(root)
  const after = await read(root, 'content/guides/youtube-meds/vi.json')
  expect(after.body).toContain('20 lít') // the guide was rewritten: 5 gallons, converted and rounded
  expect(after.quality.chat).toBe(false)
  expect((await read(root, 'content/guides/youtube-meds/id.json')).quality.chat).toBe(false)
})

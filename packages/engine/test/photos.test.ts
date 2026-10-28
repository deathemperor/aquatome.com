import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { findPhotos } from '../src/photos'
import { findVideos } from '../src/videos'

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/commons/paracheirodon-axelrodi.json', import.meta.url), 'utf8'))

test('commons photos: open licences, ≥800px, plain-text author, 960px thumbs, max 4', async () => {
  const data = fixture()
  const first = Object.values(data.query.pages as Record<string, { index: number; imageinfo: { extmetadata: Record<string, { value: string }> }[] }>).sort((a, b) => a.index - b.index)[0]!
  first.imageinfo[0]!.extmetadata.LicenseShortName = { value: 'CC BY-NC-SA 4.0' }
  let url = ''
  const photos = await findPhotos('Paracheirodon axelrodi', async u => { url = u; return data })
  expect(url).toContain('Paracheirodon%20axelrodi')
  expect(photos).toHaveLength(4)
  for (const p of photos) {
    expect(p.width).toBeLessThanOrEqual(960)
    expect(p.author).not.toMatch(/[<>]/)
    expect(p.licence).not.toMatch(/NC/)
    expect(p.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    expect(p.url).toMatch(/960px/)
  }
  expect(photos.map(p => p.sourceUrl)).not.toContain(expect.stringContaining('Cardinal_Tetra_2.jpg')) // 656px original
})

test('videos are skipped without an API key', async () => {
  let called = false
  expect(await findVideos(['Paracheirodon axelrodi'], async () => { called = true; return {} as never }, async () => { called = true; return {} }, undefined)).toEqual([])
  expect(called).toBe(false)
})

test('videos: youtube search vetted by the llm', async () => {
  const http = async (u: string) => u.includes('/search')
    ? { items: [{ id: { videoId: 'aaaaaaaaaaa' } }, { id: { videoId: 'bbbbbbbbbbb' } }] }
    : { items: [
      { id: 'aaaaaaaaaaa', snippet: { title: 'Cardinal tetra care', description: 'x', defaultAudioLanguage: 'en' }, contentDetails: { duration: 'PT5M3S' } },
      { id: 'bbbbbbbbbbb', snippet: { title: 'Funny cats', description: 'y' }, contentDetails: { duration: 'PT1H' } },
    ] }
  const llm = async <T,>() => ({ keep: ['aaaaaaaaaaa'] }) as T
  expect(await findVideos(['Paracheirodon axelrodi', 'Cardinal tetra'], llm, http, 'KEY')).toEqual([{ youtubeId: 'aaaaaaaaaaa', title: 'Cardinal tetra care', durationSec: 303, lang: 'en' }])
})

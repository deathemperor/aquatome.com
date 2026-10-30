import sharp from 'sharp'
import { afterEach, expect, test, vi } from 'vitest'
import { r2Media } from '../src/media'

afterEach(() => vi.unstubAllGlobals())

test('uploads tell browsers to keep the image a year (keys never change content)', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => (calls.push({ url, headers: init.headers as Record<string, string> }), new Response('{}')))
  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#2f6b4f' } }).png().toBuffer()
  const m = r2Media({ accountId: 'acc', token: 't', bucket: 'b', publicBase: 'https://media.example' })
  await m.put('src/a.webp', png)
  await m.putThumb('src/b.webp', png)
  expect(calls.map(c => c.url.split('/objects/')[1])).toEqual(['src/a.webp', 'src/a-480.webp', 'src/b-480.webp'])
  for (const c of calls) expect(c.headers['cache-control']).toBe('public, max-age=31536000, immutable')
})

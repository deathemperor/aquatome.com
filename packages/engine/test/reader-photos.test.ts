import sharp from 'sharp'
import { expect, test } from 'vitest'
import { judgePrompt, moderatePhotos, type PhotoAdmin, type PhotoDecision } from '../src/reader-photos'

const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer()

test('screens each pending photo: unknown page, unreadable, face, wrong fish → removed; good → files then publish; model failure → stays pending', async () => {
  const big = await jpeg(3000, 2000)
  const raws: Record<string, Uint8Array> = { a: big, b: new TextEncoder().encode('not an image'), c: big, d: big, e: big, f: big }
  const queue = Object.keys(raws).map(id => ({ id, entity_ref: id === 'a' ? 'species:gone' : 'species:neon', name: 'Lộc', created_at: '' }))
  const decisions: PhotoDecision[] = []
  const puts: string[] = []
  const api: PhotoAdmin = {
    queue: async () => queue,
    raw: async id => raws[id]!,
    put: async (id, kind, webp) => { puts.push(`${id}:${kind}:${(await sharp(webp).metadata()).format}`) },
    decide: async d => { decisions.push(...d); return { applied: d.length, ignored: 0 } },
  }
  const faces = { c: 1 } as Record<string, number>
  const r = await moderatePhotos(api, {
    species: id => (id === 'neon' ? { name: 'Cá neon xanh', scientificName: 'Paracheirodon innesi' } : undefined),
    faces: async files => files.map(f => faces[f.split('/').pop()!.replace('.webp', '')] ?? 0),
    judge: async (file, prompt) => {
      expect(prompt).toContain('Cá neon xanh (Paracheirodon innesi)')
      const id = file.split('/').pop()!.replace('.webp', '')
      if (id === 'f') throw new Error('usage limit')
      return id === 'd' ? { approve: false, reason: 'a goldfish' } : { approve: true, reason: 'neon tetra' }
    },
  })
  expect(r).toEqual({ off: false, queued: 6, approved: 1, removed: 4, failed: 1 })
  expect(decisions.map(d => [d.id, d.action, d.reason])).toEqual([
    ['a', 'remove', 'species page not found'], ['b', 'remove', 'unreadable image'], ['c', 'remove', 'person in photo'],
    ['d', 'remove', 'a goldfish'], ['e', 'approve', 'neon tetra'],
  ])
  expect(decisions.find(d => d.id === 'e')).toMatchObject({ width: 1200, height: 800 }) // ≤1200 px
  expect(puts).toEqual(['e:full:webp', 'e:thumb:webp'])
})

test('a failed download leaves the photo pending; photos off → nothing to do', async () => {
  const api: PhotoAdmin = { queue: async () => [{ id: 'x', entity_ref: 'species:neon', name: 'n', created_at: '' }], raw: async () => { throw new TypeError('fetch failed') }, put: async () => {}, decide: async () => { throw new Error('must not decide') } }
  const deps = { species: () => ({ name: 'n', scientificName: 's' }), faces: async () => [0], judge: async () => ({ approve: true, reason: '' }) }
  expect(await moderatePhotos(api, deps)).toEqual({ off: false, queued: 1, approved: 0, removed: 0, failed: 1 })
  expect(await moderatePhotos({ ...api, queue: async () => null }, deps)).toEqual({ off: true })
  expect(judgePrompt({ name: 'A', scientificName: 'B' })).not.toContain('{{SPECIES}}')
})

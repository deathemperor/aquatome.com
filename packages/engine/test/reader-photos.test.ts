import sharp from 'sharp'
import { expect, test } from 'vitest'
import { judgePrompt, moderatePhotos, MOVE_CONFIDENCE, photoPages, type PhotoAdmin, type PhotoDecision, type Verdict } from '../src/reader-photos'

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
    page: ref => (ref === 'species:neon' ? { name: 'Cá neon xanh', scientificName: 'Paracheirodon innesi' } : undefined),
    find: () => undefined,
    faces: async files => files.map(f => faces[f.split('/').pop()!.replace('.webp', '')] ?? 0),
    judge: async (file, prompt) => {
      expect(prompt).toContain('Cá neon xanh (Paracheirodon innesi)')
      const id = file.split('/').pop()!.replace('.webp', '')
      if (id === 'f') throw new Error('usage limit')
      return id === 'd' ? { approve: false, reason: 'a goldfish', why: 'species', species: '', confidence: 0 } : { approve: true, reason: 'neon tetra', why: 'none', species: '', confidence: 0 }
    },
  })
  expect(r).toEqual({ off: false, queued: 6, approved: 1, removed: 4, failed: 1 })
  // Each removal carries the code its sender sees.
  expect(decisions.map(d => [d.id, d.action, d.reason, d.why])).toEqual([
    ['a', 'remove', 'page not found', 'other'], ['b', 'remove', 'unreadable image', 'quality'], ['c', 'remove', 'person in photo', 'face'],
    ['d', 'remove', 'a goldfish', 'species'], ['e', 'approve', 'neon tetra', undefined],
  ])
  expect(decisions.find(d => d.id === 'e')).not.toHaveProperty('entity')
  expect(decisions.find(d => d.id === 'e')).toMatchObject({ width: 1200, height: 800 }) // ≤1200 px
  expect(puts).toEqual(['e:full:webp', 'e:thumb:webp'])
})

test('a failed download leaves the photo pending; photos off → nothing to do', async () => {
  const api: PhotoAdmin = { queue: async () => [{ id: 'x', entity_ref: 'species:neon', name: 'n', created_at: '' }], raw: async () => { throw new TypeError('fetch failed') }, put: async () => {}, decide: async () => { throw new Error('must not decide') } }
  const deps = { page: () => ({ name: 'n', scientificName: 's' }), find: () => undefined, faces: async () => [0], judge: async () => ({ approve: true, reason: '' }) }
  expect(await moderatePhotos(api, deps)).toEqual({ off: false, queued: 1, approved: 0, removed: 0, failed: 1 })
  expect(await moderatePhotos({ ...api, queue: async () => null }, deps)).toEqual({ off: true })
  expect(judgePrompt({ name: 'A', scientificName: 'B' })).not.toContain('{{SPECIES}}')
})

test('a reported photo\'s reasons reach the judge, as claims to check; an unreported photo\'s prompt has none', async () => {
  const prompts: string[] = []
  const raw = await jpeg(800, 600)
  const api: PhotoAdmin = {
    queue: async () => [{ id: 'r', entity_ref: 'species:neon', name: 'n', created_at: '', reports: ['không phải cá neon', ''] }, { id: 'u', entity_ref: 'species:neon', name: 'n', created_at: '' }],
    raw: async () => raw, put: async () => {}, decide: async d => ({ applied: d.length, ignored: 0 }),
  }
  await moderatePhotos(api, { page: () => ({ name: 'A', scientificName: 'B' }), find: () => undefined, faces: async f => f.map(() => 0), judge: async (_f, p) => { prompts.push(p); return { approve: true, reason: 'ok' } } })
  expect(prompts[0]).toContain('["không phải cá neon",""]')
  expect(prompts[0]).toContain('untrusted claims')
  expect(prompts[1]).toBe(judgePrompt({ name: 'A', scientificName: 'B' }))
  expect(prompts[1]).not.toContain('reported')
})

/** Pending photos all on the neon's page, each judged by `verdicts` in turn (a second look for the fish it was moved to). */
async function run(ids: string[], verdicts: (id: string, prompt: string, n: number) => Verdict, find: (name: string) => { ref: string; name: string; scientificName: string } | undefined, movedFrom: (id: string) => string | null | undefined = () => null) {
  const raw = await jpeg(800, 600)
  const decisions: PhotoDecision[] = []
  const prompts: Record<string, string[]> = {}
  const api: PhotoAdmin = {
    queue: async () => ids.map(id => { const m = movedFrom(id); return { id, entity_ref: 'species:neon', name: 'n', created_at: '', ...(m === undefined ? {} : { moved_from: m }) } }),
    raw: async () => raw, put: async () => {}, decide: async d => { decisions.push(...d); return { applied: d.length, ignored: 0 } },
  }
  const r = await moderatePhotos(api, {
    page: ref => (ref === 'species:neon' ? { name: 'Cá neon xanh', scientificName: 'Paracheirodon innesi' } : undefined), find, faces: async f => f.map(() => 0),
    judge: async (file, prompt) => { const id = file.split('/').pop()!.replace('.webp', ''); (prompts[id] ??= []).push(prompt); return verdicts(id, prompt, prompts[id].length) },
  })
  return { r, decisions, prompts }
}
const wrong = (species: string, confidence: number): Verdict => ({ approve: false, reason: `that is ${species}`, why: 'species', species, confidence })
const GOLDFISH = { ref: 'species:carassius-auratus', name: 'Cá vàng', scientificName: 'Carassius auratus' }

test('a photo of another fish the handbook has moves to its page when Claude is sure and approves it there; else it is removed as the wrong fish', async () => {
  const handbook = (name: string) => (name.toLowerCase() === 'carassius auratus' ? GOLDFISH : name === 'Paracheirodon innesi' ? { ref: 'species:neon', name: 'Cá neon xanh', scientificName: name } : undefined)
  const { r, decisions, prompts } = await run(['sure', 'unsure', 'absent', 'same', 'refused'], (id, prompt, n) => {
    if (n === 2) return id === 'refused' ? { approve: false, reason: 'too blurred to tell', why: 'quality', species: '', confidence: 0 } : { approve: true, reason: 'a goldfish', why: 'none', species: '', confidence: 0 }
    if (id === 'sure') return wrong('Carassius auratus', MOVE_CONFIDENCE)
    if (id === 'unsure') return wrong('Carassius auratus', MOVE_CONFIDENCE - 0.01)
    if (id === 'absent') return wrong('Betta splendens', 0.99)
    if (id === 'same') return wrong('Paracheirodon innesi', 0.99)
    return wrong('carassius auratus', 0.95)
  }, handbook)
  expect(r).toEqual({ off: false, queued: 5, approved: 1, removed: 4, failed: 0 })
  // Sure, and the goldfish's page approves it: published there, the decision naming its page.
  expect(decisions.find(d => d.id === 'sure')).toMatchObject({ action: 'approve', entity: 'species:carassius-auratus', reason: 'a goldfish' })
  expect(prompts.sure![1]).toContain('Cá vàng (Carassius auratus)')
  // Just under the bar, a fish the handbook lacks, the page it was sent for, or turned down on the right page too: the wrong fish, judged once (twice for the last).
  for (const id of ['unsure', 'absent', 'same', 'refused']) expect(decisions.find(d => d.id === id), id).toMatchObject({ action: 'remove', why: 'species', reason: expect.stringMatching(/^that is /) })
  expect(Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.length]))).toEqual({ sure: 2, unsure: 1, absent: 1, same: 1, refused: 2 })
})

test('a turned-down photo\'s code is one the app words; anything else is "other"', async () => {
  const { decisions } = await run(['advert', 'bogus', 'none'], id => ({ approve: false, reason: 'no', why: id, species: '', confidence: 0 }), () => undefined)
  expect(decisions.map(d => [d.id, d.why])).toEqual([['advert', 'advert'], ['bogus', 'other'], ['none', 'other']])
})

test('a breed\'s page takes photos as that breed of its species (a hybrid: of its parents); a species\' page is found by its scientific name', async () => {
  const pages = photoPages({
    species: [{ id: 'astronotus-ocellatus', t: { name: 'Cá oscar' }, scientificName: 'Astronotus ocellatus' }],
    breeds: [
      { id: 'albino-oscar', t: { name: 'Cá oscar bạch tạng' }, basedOn: 'astronotus-ocellatus', parents: [] },
      { id: 'blood-parrot', t: { name: 'Cá két' }, parents: [{ name: 'Midas cichlid (Amphilophus citrinellus)' }, { name: 'Redhead cichlid (Vieja melanurus)' }] },
    ],
  })
  expect(pages.page('species:astronotus-ocellatus')).toEqual({ ref: 'species:astronotus-ocellatus', name: 'Cá oscar', scientificName: 'Astronotus ocellatus' })
  expect(pages.page('breed:albino-oscar')).toEqual({ ref: 'breed:albino-oscar', name: 'Cá oscar bạch tạng', scientificName: 'Astronotus ocellatus' })
  expect(pages.page('breed:blood-parrot')?.scientificName).toBe('Midas cichlid (Amphilophus citrinellus) × Redhead cichlid (Vieja melanurus)')
  for (const gone of ['breed:gone', 'species:gone', 'plant:astronotus-ocellatus', 'astronotus-ocellatus']) expect(pages.page(gone), gone).toBeUndefined()
  expect(pages.find(' astronotus OCELLATUS ')?.ref).toBe('species:astronotus-ocellatus')
  expect(pages.find('Amphilophus citrinellus')).toBeUndefined()

  // A photo sent on the breed's page is judged as the breed, not removed for want of a species' page.
  const raw = await jpeg(800, 600)
  const decisions: PhotoDecision[] = []
  const prompts: string[] = []
  await moderatePhotos({
    queue: async () => [{ id: 'b', entity_ref: 'breed:albino-oscar', name: 'n', created_at: '' }],
    raw: async () => raw, put: async () => {}, decide: async d => { decisions.push(...d); return { applied: d.length, ignored: 0 } },
  }, { ...pages, faces: async f => f.map(() => 0), judge: async (_f, p) => { prompts.push(p); return { approve: true, reason: 'an albino oscar' } } })
  expect(prompts[0]).toContain('Cá oscar bạch tạng (Astronotus ocellatus)')
  expect(decisions).toMatchObject([{ id: 'b', action: 'approve', reason: 'an albino oscar' }])
})

test('a photo moves once: not one already moved, and not when the Worker\'s queue can\'t say (a Worker older than moves)', async () => {
  const { decisions, prompts } = await run(['moved', 'old-worker', 'fresh'], (_id, _p, n) => (n === 2 ? { approve: true, reason: 'a goldfish' } : wrong('Carassius auratus', 0.99)), () => GOLDFISH,
    id => (id === 'moved' ? 'species:betta-splendens' : id === 'old-worker' ? undefined : null))
  expect(decisions.map(d => [d.id, d.action, d.entity ?? null])).toEqual([['moved', 'remove', null], ['old-worker', 'remove', null], ['fresh', 'approve', 'species:carassius-auratus']])
  expect(decisions.filter(d => d.action === 'remove').every(d => d.why === 'species')).toBe(true)
  expect(Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.length]))).toEqual({ moved: 1, 'old-worker': 1, fresh: 2 })
})

test('a species is found by genus and species when Claude adds more; a breed of a breed is named by the species under both; a breed with none by its name alone', async () => {
  const pages = photoPages({
    species: [{ id: 'carassius-auratus', t: { name: 'Cá vàng' }, scientificName: 'Carassius auratus' }],
    breeds: [
      { id: 'oranda', t: { name: 'Cá vàng oranda' }, basedOn: 'carassius-auratus', parents: [] },
      { id: 'red-cap-oranda', t: { name: 'Cá vàng hạc đỉnh hồng' }, basedOn: 'oranda', parents: [] },
      { id: 'electric-blue-ram', t: { name: 'Cá phượng hoàng lam (Electric blue ram)' }, parents: [] },
    ],
  })
  for (const n of ['Carassius auratus (goldfish)', 'carassius  auratus Linnaeus, 1758', 'Carassius auratus auratus']) expect(pages.find(n)?.ref, n).toBe('species:carassius-auratus')
  expect(pages.find('Carassius gibelio')).toBeUndefined()
  expect(pages.page('breed:red-cap-oranda')?.scientificName).toBe('Carassius auratus')
  const ram = pages.page('breed:electric-blue-ram')!
  expect(ram.scientificName).toBe('')
  expect(judgePrompt(ram)).toContain('the species page of Cá phượng hoàng lam (Electric blue ram) on AquaTome')
  expect(judgePrompt(ram)).not.toContain('()')
})

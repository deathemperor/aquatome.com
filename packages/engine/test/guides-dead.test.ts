import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, onTestFinished, test, vi } from 'vitest'
import { LlmError } from '../src/claude'
import type { DeadScreenDeps } from '../src/dead-screen'
import { GUIDE_DEAD_PROMPT, screenGuidesDead, takeOffGuidesDead } from '../src/guides-dead'
import { readPartPhotosOff } from '../src/video-images'

// The dead-fish question on guides' photos, stock photos and frames (the chief of staff, 22 Nov 2026).
const m = (name: string) => `https://m/${name}.webp`
const stockPage = 'https://commons.wikimedia.org/wiki/File:Example.jpg'
const pic = (name: string) => ({ url: m(name), width: 960, height: 640, licence: 'CC BY 4.0', author: 'Sample Tester', sourceUrl: 'https://example.org/x' })

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'guides-dead-'))
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  onTestFinished(() => { vi.unstubAllEnvs() })
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/guides/g/entity.json', {
    id: 'g',
    photos: [pic('g-live'), pic('g-dead'), pic('g-looked'), pic('g-screened'), pic('g-checked')],
    video: { figures: [
      { heading: 'one', photo: { ...pic('stock-dead'), sourceUrl: stockPage }, moments: [{ url: m('frame-live'), t: 30, width: 1280, height: 720 }] },
      { heading: 'two', moments: [{ url: m('frame-dead'), t: 60, width: 1280, height: 720 }] },
    ] },
  })
  // Asked already: by the guides' photo check, by this screen, by the photo check on a fish page.
  await put('engine-state/_photo-guides.json', { [m('g-looked')]: { person: false, mark: false, brand: false, note: '', dead: false } })
  await put('engine-state/_dead-screen.json', { [m('g-screened')]: { dead: false, note: '' } })
  await put('engine-state/_photo-subjects.json', { [m('g-checked')]: { fish: { ok: 'yes', typical: true, note: '', logo: false } } })
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))

function deps(o: { stop?: boolean } = {}) {
  const sent: string[] = [], prompts: string[] = []
  let sheet: string[] = []
  const d: DeadScreenDeps = {
    get: async u => { sent.push(u); sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async (_f, prompt) => {
      prompts.push(prompt)
      if (o.stop) throw new LlmError('usage limit')
      const tiles = sheet.map((u, i) => ({ n: i + 1, dead: /-dead\./.test(u), note: /-dead\./.test(u) ? 'fish lying flat in a bottle' : 'live fish in a tank' }))
      sheet = []
      return { tiles }
    },
  }
  return { d, sent, prompts }
}

test("guides' own photos, then stock photos, then frames, each not asked about a dead fish before; a dead one is off at its first verdict, marked, and the part-photo list keeps a rewrite from bringing it back", async () => {
  const root = await store()
  const { d, sent, prompts } = deps()
  const r = await screenGuidesDead(root, d, { limit: 100 })
  expect(sent).toEqual([m('g-live'), m('g-dead'), m('stock-dead'), m('frame-live'), m('frame-dead')])
  expect(prompts).toEqual([GUIDE_DEAD_PROMPT])
  expect(r).toMatchObject({ sheets: 1, judged: 5, left: 0, failed: [], stopped: '' })
  expect(r.off).toEqual([`${m('g-dead')}: guides/g`, `${m('stock-dead')}: guides/g`, `${m('frame-dead')}: guides/g`])
  // The second part kept no picture: it waits for the picture step's next run.
  expect(r.bare).toEqual(['guides/g: part 2'])
  const g = await json(root, 'content/guides/g/entity.json')
  expect(g.photos.map((p: { url: string }) => p.url)).toEqual([m('g-live'), m('g-looked'), m('g-screened'), m('g-checked')])
  expect(g.video.figures[0].photo).toBeUndefined()
  expect(g.video.figures[0].moments.map((x: { url: string }) => x.url)).toEqual([m('frame-live')])
  expect(g.video.figures[1].moments).toEqual([])
  // Off at its first verdict, restorable until a person looks: a record marked off and a waiting entry each.
  const sl = await json(root, 'engine-state/_photo-second-look.json')
  for (const u of [m('g-dead'), m('stock-dead'), m('frame-dead')]) expect(sl[u]).toMatchObject({ step: 'the dead-fish screen', pages: ['guides/g'], off: true, why: expect.stringMatching(/^flagged by the backlog's look: withheld \[sha256:[0-9a-f]{64}\]$/) })
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  for (const u of [m('g-dead'), m('stock-dead'), m('frame-dead')]) expect(rejected[u]).toMatch(/^waiting: withheld \[sha256:[0-9a-f]{64}\]$/)
  // The stock photo by its Commons page, hashed; the frame by its address with its second; both for this guide only.
  const parts = await readPartPhotosOff(join(root, 'content'))
  const stockKey = `sha256:${createHash('sha256').update(stockPage).digest('hex')}`
  expect(Object.keys(parts).sort()).toEqual([m('frame-dead'), stockKey].sort())
  expect(parts[stockKey]).toEqual({ why: expect.stringMatching(/^flagged by the backlog's look: withheld \[sha256:[0-9a-f]{64}\]$/), guides: ['g'], holds: { [`sha256:${createHash('sha256').update(m('stock-dead')).digest('hex')}`]: ['g'] } })
  expect(parts[m('frame-dead')]).toEqual({ why: expect.stringMatching(/^flagged by the backlog's look: withheld \[sha256:[0-9a-f]{64}\]$/), guides: ['g'], seconds: [60], holds: { [`sha256:${createHash('sha256').update(m('frame-dead')).digest('hex')}`]: ['g'] } })
  expect(JSON.stringify(parts)).not.toContain('bottle')
  // Each judged once: the next run asks nothing.
  const next = deps()
  expect(await screenGuidesDead(root, next.d, { limit: 100 })).toMatchObject({ sheets: 0, judged: 0, left: 0 })
  expect(next.sent).toEqual([])
})

test("the guides' screen takes at most its pictures a run, in its order; a stop at the line changes nothing and leaves the rest for the next run", async () => {
  const root = await store()
  const few = deps()
  expect(await screenGuidesDead(root, few.d, { limit: 3 })).toMatchObject({ judged: 3, left: 2 })
  expect(few.sent).toEqual([m('g-live'), m('g-dead'), m('stock-dead')])
  const stopped = deps({ stop: true })
  const before = await readFile(join(root, 'content/guides/g/entity.json'), 'utf8')
  expect(await screenGuidesDead(root, stopped.d, { limit: 100 })).toMatchObject({ judged: 0, left: 0, stopped: expect.any(String), off: [] })
  expect(await readFile(join(root, 'content/guides/g/entity.json'), 'utf8')).toBe(before)
  const rest = deps()
  await screenGuidesDead(root, rest.d, { limit: 100 })
  expect(rest.sent).toEqual([m('frame-live'), m('frame-dead')])
})

test("the take-off leaves alone a picture no guide shows, one a second look holds, and one the photo check asked on a fish page", async () => {
  const root = await store()
  await writeFile(join(root, 'engine-state/_photo-second-look.json'), JSON.stringify({ [m('g-live')]: { why: 'dead: withheld [sha256:' + '0'.repeat(64) + ']', step: 'the dead-fish screen', pages: ['guides/g'], at: '2026-11-26' } }))
  const r = await takeOffGuidesDead(root, new Map([[m('nowhere'), 'x'], [m('g-live'), 'x'], [m('g-checked'), 'x'], [m('g-dead'), 'x']]), 'the guide photo check')
  expect(r.off).toEqual([`${m('g-dead')}: guides/g`])
  expect((await json(root, 'content/guides/g/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([m('g-live'), m('g-looked'), m('g-screened'), m('g-checked')])
})

test('an agreed guide refusal is not requested again when its wrapper still exists', async () => {
  const root = await store()
  const flag = m('stock-dead')
  const file = join(root, 'engine-state/_photo-rejected.json')
  await writeFile(file, JSON.stringify({ [flag]: "flagged by the backlog's look: withheld" }))

  expect(await takeOffGuidesDead(root, new Map([[flag, 'sample']]), 'the guide photo check')).toEqual({ off: [], bare: [] })
  await expect(readFile(join(root, 'engine-state/_photo-second-look.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

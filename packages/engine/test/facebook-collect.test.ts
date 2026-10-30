import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { FB } from '../src/facebook/config'
import { collect, loadFbState, type FbBrowser } from '../src/facebook/collect'
import { photoUrl } from '../src/facebook/parse'
import { sourceBlockedSince } from '../src/state'

const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0a6' } }).jpeg().toBuffer()
const ALBUMS = `${FB.profile}photos_albums`
const albumUrl = (id: string) => `https://www.facebook.com/media/set/?set=a.${id}&type=3`

const post = (id: string, photos: string[], o: { text?: string; count?: number; reshare?: boolean } = {}) => ({
  __typename: 'Story', post_id: id, creation_time: 1790000000, permalink_url: `${FB.profile}posts/${id}`,
  actors: [{ __typename: 'User', id: FB.ownerId }],
  attachments: [{ styles: { attachment: photos.length === 1 ? { media: { __typename: 'Photo', id: photos[0] } } : { all_subattachments: { count: o.count ?? photos.length, nodes: photos.map(p => ({ media: { __typename: 'Photo', id: p } })) } } } }],
  comet_sections: { content: { story: { message: o.text ? { text: o.text } : null } } },
  ...(o.reshare ? { attached_story: { __typename: 'Story', post_id: '900' } } : {}),
})
const grid = (ids: string[]) => ({ grid_media: { edges: ids.map(id => ({ node: { __typename: 'Photo', id, image: { uri: `https://scontent.xx.fbcdn.net/${id}-s.jpg`, width: 843, height: 600 }, viewer_image: { width: 2048, height: 1460 }, accessibility_caption: 'May be an image of fish', is_playable: id.startsWith('v') } })) } })
const photoPage = (id: string, caption = '') => [{ __typename: 'Photo', id, message: caption ? { text: caption } : null, image: { uri: `https://scontent.xx.fbcdn.net/${id}-full.jpg`, width: 2048, height: 1460 } }]
const albumsHtml = (albums: [string, string][]) => `<script type="application/json">{"USER_ID":"61550000000001"}</script>${albums.map(([id, t]) => `<a href="${albumUrl(id)}"><span>${t}</span><span>3 items</span></a>`).join('')}`

/** Facebook as the collector sees it: pages by URL, and what each scroll of that page brings (then nothing more). */
function fakeFb(site: { pages: Record<string, unknown[] | string>; scrolls?: Record<string, unknown[][]>; failBytes?: (url: string) => boolean; wallAt?: string }) {
  const visits: string[] = []
  const fetched: string[] = []
  let at = ''
  const left: Record<string, unknown[][]> = {}
  const b: FbBrowser = {
    async goto(url) {
      visits.push(url)
      at = url
      left[url] = [...(site.scrolls?.[url] ?? [])]
      if (site.wallAt && url.startsWith(site.wallAt)) return { url: `https://www.facebook.com/login/?next=${encodeURIComponent(url)}`, html: '', data: [] }
      const p = site.pages[url] ?? []
      return typeof p === 'string' ? { url, html: p, data: [] } : { url, html: '<script type="application/json">{"USER_ID":"61550000000001"}</script>', data: p }
    },
    async scroll() { visits.push(`scroll ${at}`); return left[at]?.shift() ?? [] },
    async bytes(url) {
      fetched.push(url)
      if (site.failBytes?.(url)) throw new Error('HTTP 403')
      return jpeg
    },
  }
  return { b, visits, fetched }
}

function deps() {
  const uploads: string[] = []
  const waits: number[] = []
  return {
    uploads, waits,
    d: { putRaw: async (key: string, _b: Uint8Array, type: string) => { uploads.push(`${key} ${type}`); return `https://media.aquatome.com/${key}` }, sleep: async (ms: number) => { waits.push(ms) }, now: () => new Date('2026-10-30T00:00:00Z') },
  }
}
const O = { maxMinutes: 30, maxPhotos: 100, maxScrolls: 50 }

/** Jim's profile: a pinned post, a 2-photo post, a 5-photo post showing 3, a reshare; one album holding a photo from a post. */
function site(extra: Partial<Parameters<typeof fakeFb>[0]> = {}) {
  return {
    pages: {
      [FB.profile]: [post('1', ['11'], { text: 'Pinned: welcome' }), post('2', ['21', '22'], { text: 'Betta macrostoma pair' })],
      [`${FB.profile}posts/3`]: [post('3', ['31', '32', '33', '34', '35'])],
      [ALBUMS]: albumsHtml([['100', 'Wild bettas']]),
      [albumUrl('100')]: [grid(['21', '101', 'v102'])],
      ...Object.fromEntries(['11', '21', '22', '31', '32', '33', '34', '35', '101'].map(id => [photoUrl(id), photoPage(id, id === '101' ? 'Betta albimarginata' : '')])),
    },
    scrolls: { [FB.profile]: [[post('3', ['31', '32', '33'], { count: 5 })], [post('4', ['41'], { reshare: true })]] },
    ...extra,
  }
}

test('first run: posts (with every photo of a post that held some back), albums and photos; raw originals stored once each; ≥ 5 s between pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const fb = fakeFb(site())
  const { d, uploads, waits } = deps()
  const r = await collect(root, fb.b, d, O)
  expect(r).toMatchObject({ newPosts: 4, newAlbums: 1, stored: 9, failed: [] })
  const s = await loadFbState(root)
  expect(s.posts['3']!.photoIds).toEqual(['31', '32', '33', '34', '35'])
  expect(s.posts['4']).toMatchObject({ reshare: true, photoIds: [] })
  expect(s.albums['100']).toMatchObject({ title: 'Wild bettas', photoIds: ['21', '101'] }) // the video is left out
  expect(s.photos['101']).toMatchObject({ status: 'stored', caption: 'Betta albimarginata', raw: 'https://media.aquatome.com/facebook/101.jpg', width: 2048 })
  expect(uploads.filter(u => u.startsWith('facebook/21.'))).toEqual(['facebook/21.jpg image/jpeg']) // in a post and the album: one upload
  expect(fb.fetched).toContain('https://scontent.xx.fbcdn.net/21-full.jpg')
  expect(s.timelineDone).toBe(true)
  expect(waits.length).toBeGreaterThan(0)
  expect(Math.min(...waits)).toBeGreaterThanOrEqual(5000)
  const md = await readFile(join(root, FB.snapshotDir, 'posts/2.md'), 'utf8')
  expect(md).toContain('url: https://www.facebook.com/jim.cumming.982410/posts/2')
  expect(md).toContain('- https://media.aquatome.com/facebook/22.jpg')
  expect(md).toContain('Betta macrostoma pair')
  const album = await readFile(join(root, FB.snapshotDir, 'albums/100.md'), 'utf8')
  expect(album).toContain('title: Wild bettas')
  expect(album).toContain('- https://media.aquatome.com/facebook/101.jpg — Betta albimarginata')
})

test('second run with nothing new: no uploads, and the timeline stops after 3 scrolls without a new post even though the pinned post is known', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  await collect(root, fakeFb(site()).b, deps().d, O)
  const again = fakeFb({ ...site(), scrolls: { [FB.profile]: [[], [], [], [post('5', ['51'])]] } })
  const { d, uploads } = deps()
  const r = await collect(root, again.b, d, O)
  expect(uploads).toEqual([])
  expect(r.newPosts).toBe(0)
  expect(again.visits.filter(v => v === `scroll ${FB.profile}`)).toHaveLength(3)
})

test('before the first full pass, the timeline keeps scrolling past known posts (up to the scroll budget)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const first = fakeFb({ ...site(), scrolls: { [FB.profile]: [] } })
  await collect(root, first.b, deps().d, { ...O, maxScrolls: 0 })
  expect((await loadFbState(root)).timelineDone).toBe(false)
  const later = fakeFb({ ...site(), scrolls: { [FB.profile]: [[post('1', ['11'])], [post('2', ['21', '22'])], [post('1', ['11'])], [post('2', ['21', '22'])], [post('6', ['61'])]] } })
  const r = await collect(root, later.b, deps().d, O)
  expect(r.newPosts).toBeGreaterThanOrEqual(1)
  expect((await loadFbState(root)).posts['6']).toBeDefined()
})

test('an image Facebook refuses is an error, retried on later runs, at most 3 times; the rest are stored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const bad = (u: string) => u.includes('/22-full')
  for (let i = 0; i < 4; i++) await collect(root, fakeFb(site({ failBytes: bad })).b, deps().d, O)
  const s = await loadFbState(root)
  expect(s.photos['22']).toMatchObject({ status: 'error', attempts: 3 })
  expect(s.photos['21']!.status).toBe('stored')
})

test('a login wall mid-run: what was collected is kept, the source is marked blocked, and no more pages are opened', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const fb = fakeFb(site({ wallAt: albumUrl('100') }))
  const r = await collect(root, fb.b, deps().d, O)
  expect(r.blocked).toBe('login')
  expect(Object.keys((await loadFbState(root)).posts)).toContain('2')
  expect(await sourceBlockedSince(root, FB.id)).toBe('2026-10-30T00:00:00.000Z')
  expect(fb.visits.at(-1)).toBe(albumUrl('100'))
})

test('the photo budget: at most maxPhotos photo pages a run, the rest wait for the next', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const r = await collect(root, fakeFb(site()).b, deps().d, { ...O, maxPhotos: 2 })
  expect(r.stored).toBe(2)
  expect(Object.values((await loadFbState(root)).photos).filter(p => p.status === 'new').length).toBe(7)
})

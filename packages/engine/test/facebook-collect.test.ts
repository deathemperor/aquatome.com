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
const grid = (ids: string[], more = false) => ({ grid_media: { edges: ids.map(id => ({ node: { __typename: 'Photo', id, image: { uri: `https://scontent.xx.fbcdn.net/${id}-s.jpg`, width: 843, height: 600 }, viewer_image: { width: 2048, height: 1460 }, accessibility_caption: 'May be an image of fish', is_playable: id.startsWith('v') } })), page_info: { has_next_page: more } } })
/** The last page of a list, as Facebook marks it. */
const last = (...posts: unknown[]) => ({ edges: posts.map(node => ({ node })), page_info: { has_next_page: false } })
const photoPage = (id: string, caption = '') => [{ __typename: 'Photo', id, message: caption ? { text: caption } : null, image: { uri: `https://scontent.xx.fbcdn.net/${id}-full.jpg`, width: 2048, height: 1460 } }]
const albumsHtml = (albums: [string, string][]) => `<script type="application/json">{"USER_ID":"61550000000001"}</script>${albums.map(([id, t]) => `<a href="${albumUrl(id)}"><span>${t}</span><span>3 items</span></a>`).join('')}`

/** Facebook as the collector sees it: pages by URL, and what each scroll of that page brings (then nothing more). */
function fakeFb(site: { pages: Record<string, unknown[] | string>; scrolls?: Record<string, (unknown[] | string)[]>; failBytes?: (url: string) => boolean; wallAt?: string; throwAt?: string }) {
  const visits: string[] = []
  const fetched: string[] = []
  let at = ''
  let html = ''
  const left: Record<string, (unknown[] | string)[]> = {}
  const b: FbBrowser = {
    async goto(url) {
      visits.push(url)
      at = url
      left[url] = [...(site.scrolls?.[url] ?? [])]
      if (site.throwAt === url) throw new Error('Timeout 45000ms exceeded')
      if (site.wallAt && url.startsWith(site.wallAt)) return { url: `https://www.facebook.com/login/?next=${encodeURIComponent(url)}`, html: '', data: [] }
      const p = site.pages[url] ?? []
      html = typeof p === 'string' ? p : '<script type="application/json">{"USER_ID":"61550000000001"}</script>'
      return { url, html, data: typeof p === 'string' ? [] : p }
    },
    async scroll() {
      visits.push(`scroll ${at}`)
      const next = left[at]?.shift() ?? []
      if (typeof next === 'string') html = next
      return { data: typeof next === 'string' ? [] : next, html }
    },
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
const O = { maxMinutes: 30, maxPhotos: 100, maxScrolls: 50, backfill: true }

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
    scrolls: { [FB.profile]: [[post('3', ['31', '32', '33'], { count: 5 })], [last(post('4', ['41'], { reshare: true }))]] },
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

test('before the first full pass, a backfill run keeps scrolling past known posts; a normal run stops at known posts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  await collect(root, fakeFb({ ...site(), scrolls: { [FB.profile]: [] } }).b, deps().d, { ...O, maxScrolls: 0 })
  expect((await loadFbState(root)).timelineDone).toBe(false)
  const deep = [[post('1', ['11'])], [post('2', ['21', '22'])], [post('1', ['11'])], [post('2', ['21', '22'])], [post('6', ['61'])]]
  const normal = fakeFb({ ...site(), scrolls: { [FB.profile]: deep } })
  await collect(root, normal.b, deps().d, { ...O, backfill: false })
  expect((await loadFbState(root)).posts['6']).toBeUndefined()
  expect(normal.visits.filter(v => v === `scroll ${FB.profile}`)).toHaveLength(3)
  const r = await collect(root, fakeFb({ ...site(), scrolls: { [FB.profile]: deep } }).b, deps().d, O)
  expect(r.newPosts).toBeGreaterThanOrEqual(1)
  expect((await loadFbState(root)).posts['6']).toBeDefined()
})

test('silence is not the end: scrolls that bring nothing (slow load, soft block) leave the timeline unfinished, with a warning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const r = await collect(root, fakeFb({ ...site(), scrolls: { [FB.profile]: [[post('3', ['31'])]] } }).b, deps().d, O)
  expect((await loadFbState(root)).timelineDone).toBe(false)
  expect(r.warnings.join(' ')).toMatch(/timeline/)
})

test('one photo page that will not load is an error for that photo only; the run goes on', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const r = await collect(root, fakeFb(site({ throwAt: photoUrl('11') })).b, deps().d, O)
  const s = await loadFbState(root)
  expect(s.photos['11']).toMatchObject({ status: 'error', attempts: 1 })
  expect(r.stored).toBe(8)
})

test('a post that still holds photos back on its own page: they come from the post\'s photo set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const pcb = 'https://www.facebook.com/media/set/?set=pcb.3'
  const fb = fakeFb(site({ pages: { ...site().pages, [`${FB.profile}posts/3`]: [post('3', ['31', '32', '33'], { count: 5 })], [pcb]: [grid(['31', '32', '33', '34', '35'])] } }))
  await collect(root, fb.b, deps().d, O)
  expect((await loadFbState(root)).posts['3']!.photoIds).toEqual(['31', '32', '33', '34', '35'])
})

test('the albums tab is scrolled for albums beyond the first screen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const more = albumsHtml([['100', 'Wild bettas'], ['200', 'Paretroplus']])
  const fb = fakeFb(site({ pages: { ...site().pages, [albumUrl('200')]: [grid(['201'])], [photoUrl('201')]: photoPage('201') }, scrolls: { ...site().scrolls, [ALBUMS]: [more] } }))
  const r = await collect(root, fb.b, deps().d, O)
  expect(r.newAlbums).toBe(2)
  expect((await loadFbState(root)).albums['200']).toMatchObject({ title: 'Paretroplus', photoIds: ['201'] })
})

test('each list has its own scroll budget: a long timeline does not starve the albums', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fb-'))
  const endless = Array.from({ length: 20 }, (_, i) => [post(`t${i}`, [])])
  const fb = fakeFb(site({ pages: { ...site().pages, [albumUrl('100')]: [grid(['21', '101', 'v102'], true)] }, scrolls: { [FB.profile]: endless, [albumUrl('100')]: [[grid(['103'], true)]] } }))
  await collect(root, fb.b, deps().d, { ...O, maxScrolls: 5 })
  expect(fb.visits.filter(v => v === `scroll ${albumUrl('100')}`).length).toBeGreaterThan(0)
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

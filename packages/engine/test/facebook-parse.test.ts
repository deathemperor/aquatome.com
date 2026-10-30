import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { FB } from '../src/facebook/config'
import { albumsIn, jsonIn, jsonLines, listEnd, photoFull, photosIn, storiesIn, wall } from '../src/facebook/parse'

const fx = (name: string) => readFileSync(new URL(`./fixtures/facebook/${name}`, import.meta.url), 'utf8')
const data = (name: string) => JSON.parse(fx(name)) as unknown[]

test('jsonIn: the page\'s embedded data blobs, skipping any that are not JSON', () => {
  const html = '<script type="application/json" data-sjs>{"a":1}</script><script type="application/json">{oops</script><script>var x = 1</script>'
  expect(jsonIn(html)).toEqual([{ a: 1 }])
})

test('jsonLines: a GraphQL response body is JSON objects one per line, sometimes behind for (;;);', () => {
  expect(jsonLines('for (;;);{"a":1}\n{"b":2}\nnot json\n')).toEqual([{ a: 1 }, { b: 2 }])
})

test('wall: logged out, login redirect and checkpoint are walls; a logged-in page is not', () => {
  expect(wall(FB.profile, fx('logged-out.html'))).toBe('login')
  expect(wall('https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fphoto%2F%3Ffbid%3D1', '')).toBe('login')
  expect(wall('https://www.facebook.com/checkpoint/1501092823525282/', '')).toBe('checkpoint')
  expect(wall(FB.profile, fx('logged-in.html'))).toBeNull()
})

/** A post in the shape Facebook sends (the real post fixture has no text, several photos or a reshare). */
const story = (o: { postId: string; actor?: string; text?: string; photos?: string[]; count?: number; reshare?: boolean; video?: boolean }) => ({
  __typename: 'Story', post_id: o.postId, creation_time: 1790000000, permalink_url: `https://www.facebook.com/jim.cumming.982410/posts/${o.postId}`,
  actors: [{ __typename: 'User', id: o.actor ?? FB.ownerId }],
  attachments: [{ styles: { attachment: {
    ...(o.photos && o.photos.length === 1 ? { media: { __typename: 'Photo', id: o.photos[0] } } : {}),
    ...(o.photos && o.photos.length > 1 ? { all_subattachments: { count: o.count ?? o.photos.length, nodes: o.photos.map(id => ({ media: { __typename: 'Photo', id } })) } } : {}),
    ...(o.video ? { media: { __typename: 'Video', id: '777' } } : {}),
  } } }],
  comet_sections: { content: { story: { message: o.text ? { text: o.text } : null } }, feedback: { story: { comments: [{ __typename: 'Comment', body: { text: 'nice fish' }, media: { __typename: 'Photo', id: '999' } }] } } },
  ...(o.reshare ? { attached_story: { __typename: 'Story', post_id: '555', attachments: [{ media: { __typename: 'Photo', id: '556' } }] } } : {}),
})

test('storiesIn: the real post — id, permalink, time, its one photo, not a reshare', () => {
  const [p, ...rest] = storiesIn(data('post.json'), FB.ownerId)
  expect(rest).toEqual([])
  expect(p).toEqual({ id: '4141495002813965', url: 'https://www.facebook.com/jim.cumming.982410/posts/1416575903975148:1416575903975148', time: '2026-10-28T04:50:28.000Z', text: '', photoIds: ['4141495002813965'], more: false, reshare: false })
})

test('storiesIn: full text, every photo of a multi-photo post, "more" when Facebook holds some back; comments ignored', () => {
  const [p] = storiesIn([{ data: { node: story({ postId: '10', text: 'Apistogramma cacatuoides, F1 pair', photos: ['11', '12', '13'], count: 5 }) } }], FB.ownerId)
  expect(p).toMatchObject({ id: '10', text: 'Apistogramma cacatuoides, F1 pair', photoIds: ['11', '12', '13'], more: true, reshare: false })
})

test('storiesIn: Jim\'s reshare keeps his own words but none of the shared photos; a post someone else wrote on his timeline is left out entirely', () => {
  const ps = storiesIn([story({ postId: '20', reshare: true, text: 'Look at this one' }), story({ postId: '30', actor: '42', photos: ['31'], text: 'Happy birthday Jim!' })], FB.ownerId)
  expect(ps.map(p => [p.id, p.reshare, p.photoIds, p.text])).toEqual([['20', true, [], 'Look at this one']])
})

test('listEnd: Facebook says a list has no next page (only for the list asked about, not a comment thread)', () => {
  const comments = { edges: [{ node: { __typename: 'Comment' } }], page_info: { has_next_page: false } }
  const feed = (more: boolean) => ({ edges: [{ node: story({ postId: '1' }) }], page_info: { has_next_page: more } })
  expect(listEnd([comments], 'Story')).toBe(false)
  expect(listEnd([{ data: feed(true) }], 'Story')).toBe(false)
  expect(listEnd([{ data: feed(false) }], 'Story')).toBe(true)
  expect(listEnd([{ grid_media: { edges: [{ node: { __typename: 'Photo', id: '1' } }], page_info: { has_next_page: false } } }], 'Photo')).toBe(true)
})

test('storiesIn: videos are skipped; the same post seen twice (nested copies, later pages) is one post', () => {
  const ps = storiesIn([story({ postId: '40', video: true }), { again: story({ postId: '40', video: true }) }], FB.ownerId)
  expect(ps).toHaveLength(1)
  expect(ps[0]!.photoIds).toEqual([])
})

test('photosIn: album grid photos with their image, full size and Facebook\'s description', () => {
  const ps = photosIn(data('album.json'))
  expect(ps.length).toBeGreaterThanOrEqual(8)
  expect(new Set(ps.map(p => p.id)).size).toBe(ps.length)
  expect(ps[0]).toMatchObject({ id: '4141495002813965', fullWidth: 1057, fullHeight: 517, video: false })
  expect(ps[0]!.src).toMatch(/^https:\/\/scontent[^/]*\.fbcdn\.net\/.*873603178_1116116247486594/)
})

test('albumsIn: every album on the albums tab with its title', () => {
  expect(albumsIn(fx('albums.html'))).toEqual([
    { id: '1382144048749088', url: 'https://www.facebook.com/media/set/?set=a.1382144048749088&type=3', title: 'Cover photos' },
    { id: '1385326998430793', url: 'https://www.facebook.com/media/set/?set=a.1385326998430793&type=3', title: 'Photos' },
    { id: '1382127485417411', url: 'https://www.facebook.com/media/set/?set=a.1382127485417411&type=3', title: 'Profile pictures' },
  ])
})

test('photoFull: the largest image Facebook gives for that photo, and its caption', () => {
  const page = [{ currMedia: { __typename: 'Photo', id: '5', message: { text: 'Betta macrostoma male' }, image: { uri: 'https://scontent.xx.fbcdn.net/big.jpg', width: 2048, height: 1365 } } }, { __typename: 'Photo', id: '5', image: { uri: 'https://scontent.xx.fbcdn.net/small.jpg', width: 600, height: 400 } }, { __typename: 'Photo', id: '6', image: { uri: 'https://scontent.xx.fbcdn.net/other.jpg', width: 4000, height: 3000 } }]
  expect(photoFull(page, '5')).toEqual({ src: 'https://scontent.xx.fbcdn.net/big.jpg', width: 2048, height: 1365, caption: 'Betta macrostoma male' })
  expect(photoFull(data('album.json'), '4141495002813965')).toMatchObject({ width: 824, caption: '' })
  expect(photoFull(page, '404')).toBeNull()
})

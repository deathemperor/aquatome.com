import { parse } from 'node-html-parser'

/**
 * Facebook pages carry their content as Relay data: JSON in <script type="application/json"> on first load, and
 * one JSON object per line in the /api/graphql/ responses that scrolling triggers. The parsers read that data, not the
 * markup (its class names are generated and change often); only the album list and the login wall use the page itself.
 */

/** The page's embedded data blobs; any that aren't JSON are skipped. */
export function jsonIn(html: string): unknown[] {
  const out: unknown[] = []
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { out.push(JSON.parse(m[1]!)) } catch { /* not data */ }
  }
  return out
}

/** A GraphQL response body: one JSON object per line, sometimes behind an anti-hijacking `for (;;);`. */
export function jsonLines(text: string): unknown[] {
  const out: unknown[] = []
  for (const line of text.replace(/^for \(;;\);/, '').split('\n')) {
    try { out.push(JSON.parse(line)) } catch { /* not data */ }
  }
  return out
}

/** A page a person has to deal with: logged out (or sent to log in), or a security checkpoint. */
export function wall(url: string, html: string): 'login' | 'checkpoint' | null {
  const path = new URL(url).pathname
  if (path.startsWith('/checkpoint')) return 'checkpoint'
  if (path.startsWith('/login') || /"USER_ID":"0"/.test(html)) return 'login'
  return null
}

export const photoUrl = (id: string) => `https://www.facebook.com/photo/?fbid=${id}`

export type FbPost = { id: string; url: string; time?: string; text: string; photoIds: string[]; more: boolean; reshare: boolean }
export type FbAlbum = { id: string; url: string; title: string }
/** A photo as an album grid or feed lists it: a preview `src` (Facebook's scaled copy) and the full size it has. */
export type FbGridPhoto = { id: string; src: string; width: number; height: number; fullWidth?: number; fullHeight?: number; alt: string; video: boolean }
export type FbPhoto = { src: string; width: number; height: number; caption: string }

type Obj = Record<string, unknown>
const isObj = (o: unknown): o is Obj => !!o && typeof o === 'object' && !Array.isArray(o)

/** Every object in the data for which `hit` is true; `skip` keys are not entered, and a hit's own insides only when `inside`. */
function find(o: unknown, hit: (x: Obj) => boolean, o2: { skip?: RegExp; inside?: boolean } = {}, out: Obj[] = []): Obj[] {
  if (Array.isArray(o)) { for (const x of o) find(x, hit, o2, out); return out }
  if (!isObj(o)) return out
  if (hit(o)) { out.push(o); if (!o2.inside) return out }
  for (const [k, v] of Object.entries(o)) if (!o2.skip?.test(k)) find(v, hit, o2, out)
  return out
}

/** Parts of a post that aren't the post: the reshared original, comments and reactions, the people in it. */
const NOT_POST = /^(attached_story|feedback|comments?|comment_list_renderer|actors|to)$/

/** Posts in the data, each once (Facebook nests copies of a post in itself and repeats it on later pages). */
export function storiesIn(data: unknown[], ownerId: string): FbPost[] {
  const seen = new Map<string, FbPost>()
  for (const s of find(data, x => x.__typename === 'Story' && typeof x.post_id === 'string' && typeof x.creation_time === 'number')) {
    const id = s.post_id as string
    if (seen.has(id)) continue
    const actor = (s.actors as Obj[] | undefined)?.[0]?.id
    const reshare = !!s.attached_story || actor !== ownerId
    const photoIds = reshare ? [] : [...new Set(find(s, x => x.__typename === 'Photo' && typeof x.id === 'string', { skip: NOT_POST }).map(x => x.id as string))]
    const message = find(s, x => isObj(x.message) && typeof x.message.text === 'string', { skip: NOT_POST })[0]?.message as { text: string } | undefined
    const counts = find(s, x => isObj(x.all_subattachments) && typeof x.all_subattachments.count === 'number', { skip: NOT_POST }).map(x => (x.all_subattachments as { count: number }).count)
    seen.set(id, {
      id, url: typeof s.permalink_url === 'string' ? s.permalink_url : `https://www.facebook.com/${id}`,
      time: new Date((s.creation_time as number) * 1000).toISOString(), text: message?.text ?? '',
      photoIds, more: !reshare && Math.max(0, ...counts) > photoIds.length, reshare,
    })
  }
  return [...seen.values()]
}

type Img = { uri: string; width?: number; height?: number }
const isImg = (v: unknown): v is Img => isObj(v) && typeof v.uri === 'string'

/** Photos listed in the data (album grids, profile photo tiles), each once. */
export function photosIn(data: unknown[]): FbGridPhoto[] {
  const seen = new Map<string, FbGridPhoto>()
  for (const p of find(data, x => x.__typename === 'Photo' && typeof x.id === 'string' && isImg(x.image))) {
    const id = p.id as string
    if (seen.has(id)) continue
    const img = p.image as Img
    const full = isObj(p.viewer_image) ? p.viewer_image as { width?: number; height?: number } : {}
    seen.set(id, { id, src: img.uri, width: img.width ?? 0, height: img.height ?? 0, fullWidth: full.width, fullHeight: full.height, alt: typeof p.accessibility_caption === 'string' ? p.accessibility_caption : '', video: p.is_playable === true })
  }
  return [...seen.values()]
}

/** The largest image Facebook gives for one photo (on its photo page), with the owner's caption; null when it isn't there. */
export function photoFull(data: unknown[], id: string): FbPhoto | null {
  const nodes = find(data, x => x.__typename === 'Photo' && x.id === id, { inside: true })
  const imgs = nodes.flatMap(n => Object.values(n).filter(isImg))
  if (!imgs.length) return null
  const best = imgs.reduce((a, b) => ((b.width ?? 0) > (a.width ?? 0) ? b : a))
  const caption = nodes.map(n => (isObj(n.message) && typeof n.message.text === 'string' ? n.message.text : '')).find(Boolean) ?? ''
  return { src: best.uri, width: best.width ?? 0, height: best.height ?? 0, caption }
}

/** Albums on the profile's albums tab (the data holds their ids but not their titles). */
export function albumsIn(html: string): FbAlbum[] {
  const seen = new Map<string, FbAlbum>()
  for (const a of parse(html).querySelectorAll('a[href*="set=a."]')) {
    const id = a.getAttribute('href')?.match(/[?&]set=a\.(\d+)/)?.[1]
    if (!id || seen.has(id) || !/media\/set\//.test(a.getAttribute('href')!)) continue
    const title = a.querySelectorAll('span').map(s => s.childNodes.filter(n => n.nodeType === 3).map(n => n.text).join('').trim()).find(Boolean) ?? ''
    seen.set(id, { id, url: `https://www.facebook.com/media/set/?set=a.${id}&type=3`, title })
  }
  return [...seen.values()]
}

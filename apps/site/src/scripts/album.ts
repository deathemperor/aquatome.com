import { ct } from './ct'
import { photoOfHash } from './photo-view'
import type { Viewer, ViewerPhoto } from './photo-viewer'
import type { AlbumPhoto } from '../lib/album'
import { unsplashParts } from '../lib/unsplash'

/**
 * A fish's, breed's or plant's album, opened over its page (GalleryStrip.astro): a thumb opens its photo in the viewer
 * (photo-viewer.ts), which steps through the whole album; "Xem tất cả … ảnh" and the jump row's photo chip (#a1) open
 * the first. Each photo's address is #aN, so a reload, a shared link or an old album address (the Worker forwards it
 * here, and the browser keeps its #aN) opens that photo, with the page under it for Back. The viewer loads at the first
 * tap. Without this script each thumb stays a link to its photo; a tap before it has run is the strip's own (its inline
 * script, GalleryStrip.astro): the photo's #aN, which this opens once it runs.
 */
const box = document.querySelector<HTMLElement>('[data-album]')
const json = box?.querySelector('script[type="application/json"]')?.textContent
if (box && json) {
  const album = JSON.parse(json) as { name: string; ai: string; altered: string; photos: AlbumPhoto[] }
  const link = (href: string, text: string) => { const l = document.createElement('a'); l.href = href; l.rel = 'noopener'; l.target = '_blank'; l.textContent = text; return l }
  // "Ảnh: <author>, <licence>", each a link to its page; an Unsplash photo's as Unsplash asks (lib/unsplash.ts).
  const credit = (p: AlbumPhoto) => (): (string | Node)[] => {
    if (p.ai) return [album.ai]
    const lic = p.l ? [', ', p.lu ? link(p.lu, p.l) : p.l] : []
    if (p.x) return [`${ct('Ảnh:')} `, link(p.s, p.a), ` · ${album.altered}`, ...lic]
    if (!p.un) return [`${ct('Ảnh:')} `, link(p.s, p.a), ...lic]
    return [...unsplashParts(ct('Ảnh: {author} trên {site}'), p.a, p.b ? { authorUrl: p.b } : { photo: p.s }).map(x => (x.href ? link(x.href, x.text) : x.text)), ...lic, ...(p.b ? [' · ', link(p.s, ct('Xem ảnh gốc ↗'))] : [])]
  }
  const photos: ViewerPhoto[] = album.photos.map(p => ({ src: p.u, thumb: p.t, width: p.w, height: p.h, alt: p.c ?? album.name, ...(p.c ? { caption: p.c } : {}), credit: credit(p) }))
  // Focus goes back to the photo's thumb when the thumb is whole in the strip's view; else to what opened the viewer. The phone's row scrolls its thumbs out of view sideways, the tall screen's column
  // clips the rows past its last whole one, and most of an album has no thumb.
  let opener: HTMLElement | undefined
  const inView = (a: HTMLElement) => {
    if (!(a.checkVisibility?.() ?? a.offsetParent !== null)) return false
    const r = a.getBoundingClientRect(), v = (a.closest('ul') ?? box).getBoundingClientRect()
    return r.width > 0 && r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1
  }
  const thumb = (i: number) => [...box.querySelectorAll<HTMLElement>(`a[data-i="${i}"]`)].find(inView)
  let viewer: Promise<Viewer> | undefined
  const view = () => (viewer ??= import('./photo-viewer').then(m => m.createViewer({ id: 'album', photos, tile: i => thumb(i) ?? opener, address: i => `#a${i + 1}` })))
  const open = (i: number, from?: HTMLElement) => {
    opener = from
    view().then(v => v.open(i, { from }), () => location.assign(photos[i]!.src))
  }
  document.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-i], a[href^="#a"]')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const i = a.dataset.i !== undefined ? Number(a.dataset.i) : photoOfHash(a.getAttribute('href')!, photos.length)
    if (i === null || !(i >= 0 && i < photos.length)) return
    e.preventDefault()
    open(i, a)
  })
  const at = () => photoOfHash(location.hash, photos.length)
  const mine = () => (history.state as { viewer?: unknown } | null)?.viewer === 'album'
  // The page was loaded on a photo's address (a shared link, an old album address): the address it was loaded at, which
  // a #aN followed since doesn't change.
  const arrived = () => {
    const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
    return !nav || photoOfHash(new URL(nav.name).hash, photos.length) !== null
  }
  // Reloaded with a photo open: that photo again. Loaded on a photo's address (#a5): that photo, the page put under it
  // for Back. A #aN followed while the page loaded (a thumb, "Xem tất cả", the photo chip), or typed into the address
  // bar since: its entry is over the page's already, and the viewer takes it.
  // Once the viewer's code is here, the address may have moved on (Back pressed while it loaded): the photo the address
  // asks for then, if any, and none when the viewer holds the entry already.
  const openHere = (how: () => { under?: string; adopt?: boolean }) => void view().then(v => {
    const i = at()
    if (i !== null && !mine()) v.open(i, how())
  }, () => {})
  if (mine()) void view().then(v => v.restore(), () => {})
  else if (at() !== null) openHere(() => (arrived() ? { under: location.pathname + location.search } : { adopt: true }))
  addEventListener('hashchange', () => { if (at() !== null && !mine()) openHere(() => ({ adopt: true })) })
  box.setAttribute('data-ready', '')
}

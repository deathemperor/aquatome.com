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
  // Focus goes back to the closing photo's thumb, in view (the Design Lead, 18 Nov): the phone's row, which scrolls
  // sideways, brings a thumb past its edge back first, its start at the row's (where the row's scroll snaps), the page
  // left where it is. Else to what opened the viewer: the tall screen's column clips the rows past its last whole one,
  // and most of an album has no thumb.
  let opener: HTMLElement | undefined
  const thumb = (i: number) => {
    for (const a of box.querySelectorAll<HTMLElement>(`a[data-i="${i}"]`)) {
      if (!(a.checkVisibility?.() ?? a.offsetParent !== null)) continue
      const ul = a.closest('ul') ?? box, r = a.getBoundingClientRect(), v = ul.getBoundingClientRect()
      if (!(r.width > 0 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1)) continue
      if (r.left < v.left - 1 || r.right > v.right + 1) {
        if (ul.scrollWidth <= ul.clientWidth) continue
        ul.scrollLeft += r.left - v.left
      }
      return a
    }
    return undefined
  }
  let viewer: Promise<Viewer> | undefined
  const view = () => (viewer ??= import('./photo-viewer').then(m => m.createViewer({ id: 'album', photos, tile: i => thumb(i) ?? opener, address: i => `#a${i + 1}` })))
  const open = (i: number, from?: HTMLElement) => {
    opener = from
    view().then(v => v.open(i, { from }), () => location.assign(photos[i]!.src))
  }
  document.addEventListener('click', e => {
    // A thumb, the strip's "Xem tất cả" (the first photo) or a link to a photo's address (the jump row's chip).
    const a = (e.target as Element).closest<HTMLElement>('a[data-i], [data-album] [data-all], a[href^="#a"]')
    // A link clicked with a key held opens as the browser does it (a new tab); the button has nothing else to do.
    if (!a || (a.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))) return
    const i = a.dataset.i !== undefined ? Number(a.dataset.i) : a.hasAttribute('data-all') ? 0 : photoOfHash(a.getAttribute('href')!, photos.length)
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

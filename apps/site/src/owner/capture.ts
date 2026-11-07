// A picture of what's on the screen, drawn from the page: an iPhone browser can't grab its own screen. Loaded only when
// the owner taps "Báo lỗi". Tried on the live site in WebKit at a phone's size: this library's text and layout match the
// screen, where html2canvas drew a scrolled fish page's lines on top of each other.
import { domToBlob } from 'modern-screenshot'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const MEDIA = 'https://media.aquatome.com/'

const toDataUrl = (blob: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result))
  r.onerror = () => no(r.error)
  r.readAsDataURL(blob)
})

/** The address the page can read a picture from: the photo host sends no CORS header, so its photos come through the Worker, for the owner alone. */
export const readable = (url: string) => (url.startsWith(MEDIA) ? `/api/feedback/media/${url.slice(MEDIA.length).split('?')[0]}` : url)

/**
 * What's stuck to the screen would scroll away with the page in the picture, which moves the page by the scroll. Each is
 * marked with where it is now, the picture's copy put back there.
 */
function markStuck(scroll: number): () => void {
  const marked: HTMLElement[] = []
  for (const e of document.querySelectorAll<HTMLElement>('body *')) {
    const { position } = getComputedStyle(e)
    if (position !== 'fixed' && position !== 'sticky') continue
    const now = e.getBoundingClientRect()
    if (now.bottom < 0 || now.top > innerHeight) continue
    if (position === 'fixed') {
      e.dataset.capturePosition = `position:absolute;top:${now.top + scroll}px;bottom:auto;left:${now.left}px;right:auto;width:${now.width}px;transform:none`
    } else {
      // Where it would be unstuck, read with no paint in between.
      const before = e.style.position
      e.style.position = 'static'
      const flow = e.getBoundingClientRect().top
      e.style.position = before
      e.dataset.capturePosition = `position:relative;top:${now.top - flow}px;bottom:auto`
    }
    marked.push(e)
  }
  return () => { for (const e of marked) delete e.dataset.capturePosition }
}

/**
 * What's wholly off screen is drawn as an empty box of its size, so what's on screen stays where it is. Cloning a long
 * page node by node is most of the work: on a list of hundreds, this is what makes it take seconds. An element holding a
 * fixed one stays whole.
 */
function pruneOffScreen(): { hollow: WeakSet<Node>; unmark: () => void } {
  const hollow = new WeakSet<Node>()
  const marked: HTMLElement[] = []
  const keep = new WeakSet<Element>()
  for (const e of document.querySelectorAll<HTMLElement>('[data-capture-position]')) {
    for (let a: Element | null = e; a; a = a.parentElement) keep.add(a)
  }
  const walk = (parent: Element) => {
    for (const e of parent.children) {
      if (keep.has(e)) { walk(e); continue }
      const r = e.getBoundingClientRect()
      if (!(e instanceof HTMLElement) || (r.bottom > 0 && r.top < innerHeight)) { walk(e); continue }
      if (!r.width && !r.height) continue
      e.dataset.captureBox = `width:${r.width}px;height:${r.height}px;min-height:0;overflow:hidden`
      marked.push(e)
      hollow.add(e)
    }
  }
  walk(document.body)
  return { hollow, unmark: () => { for (const e of marked) delete e.dataset.captureBox } }
}

/**
 * The library waits for every picture in the page to load, up to its timeout, before it draws. A lazy one below the
 * screen, or in something hidden, hasn't loaded and won't: on a fish page, that was 8 s of "Đang chụp…" before a report
 * went. Its address is taken off while the picture is taken (it's an empty box in it anyway) and put back after. One
 * above the screen keeps it: without it the page above would change size and move what's on screen.
 */
function holdUnloaded(): () => void {
  const held: [HTMLImageElement, string | null, string | null][] = []
  for (const img of document.images) {
    if (img.complete) continue
    const r = img.getBoundingClientRect()
    if (r.top < innerHeight && (r.width || r.height)) continue
    held.push([img, img.getAttribute('src'), img.getAttribute('srcset')])
    img.removeAttribute('srcset')
    img.removeAttribute('src')
  }
  return () => {
    for (const [img, src, srcset] of held) {
      if (srcset !== null) img.setAttribute('srcset', srcset)
      if (src !== null) img.setAttribute('src', src)
    }
  }
}

export async function captureViewport(): Promise<Blob> {
  const root = document.documentElement
  const scroll = scrollY
  const seen = new Set<string>()
  for (const img of document.images) {
    const r = img.getBoundingClientRect()
    if (r.bottom > 0 && r.top < innerHeight && img.currentSrc) seen.add(img.currentSrc)
  }
  const unmark = markStuck(scroll)
  const { hollow, unmark: unbox } = pruneOffScreen()
  const unhold = holdUnloaded()
  try {
    return await domToBlob(root, {
      type: 'image/jpeg',
      quality: 0.8,
      scale: Math.min(devicePixelRatio, 2),
      width: innerWidth,
      height: innerHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      timeout: 8000,
      style: { transform: `translateY(${-scroll}px)`, height: `${root.scrollHeight}px`, overflow: 'hidden' },
      // The sheet and the bar aren't what they're reporting.
      filter: n => {
        if (n.parentNode && hollow.has(n.parentNode)) return false
        return !(n instanceof HTMLElement && ('ownerBar' in n.dataset || 'ownerReport' in n.dataset || n.tagName === 'IFRAME'))
      },
      onCloneEachNode: clone => {
        if (!(clone instanceof HTMLElement)) return
        const css = [clone.dataset.capturePosition, clone.dataset.captureBox].filter(Boolean).join(';')
        if (css) clone.style.cssText += `;${css}`
      },
      // A picture off screen costs no fetch: on a list of hundreds, that's the difference between seconds and a minute.
      fetchFn: async url => {
        if (url.startsWith('data:')) return false
        const image = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i.test(url)
        if (!image) return false
        if (!seen.has(url)) return BLANK
        const r = await fetch(readable(url))
        return r.ok ? toDataUrl(await r.blob()) : BLANK
      },
      fetch: { placeholderImage: BLANK },
    })
  } finally {
    unhold()
    unmark()
    unbox()
  }
}

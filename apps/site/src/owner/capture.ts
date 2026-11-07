// A picture of what's on the screen, drawn from the page: an iPhone browser can't grab its own screen. Loaded only when
// the owner taps "Báo lỗi". Tried on the live site in WebKit at a phone's size: this library's text and layout match the
// screen, where html2canvas drew a scrolled fish page's lines on top of each other. It's still a drawing, so the report
// says so, and what it couldn't draw is marked as such: a false blank would send someone after a bug that isn't there.
import { domToForeignObjectSvg } from 'modern-screenshot'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/** In place of something on screen that couldn't be drawn. It can't pass for a blank on the page. */
const NOT_DRAWN = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" preserveAspectRatio="xMidYMid slice"><defs><pattern id="s" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="28" height="28" fill="#ffe08a"/><rect width="14" height="28" fill="#c0392b"/></pattern></defs><rect width="480" height="360" fill="url(#s)"/><rect x="100" y="146" width="280" height="68" fill="#fff"/><text x="240" y="192" font-family="sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#a3221b">NOT DRAWN</text></svg>')}`
const MEDIA = 'https://media.aquatome.com/'
/** Off screen, a picture costs nothing and draws nothing. */
const PICTURE = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i
/** The widest blur WebKit still paints where it belongs when it draws a page at more than 1×. */
const MAX_BLUR = 4
/** How often, and how long apart, to draw the page again while a photo in it is still blank: up to 5 seconds in all. */
const DRAWS = 20
const DRAW_GAP_MS = 250
/** Colour steps across a photo's samples below which it's one flat colour. */
const FLAT = 6

const toDataUrl = (blob: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result))
  r.onerror = () => no(r.error)
  r.readAsDataURL(blob)
})

/** The address the page can read a picture from: the photo host sends no CORS header, so its photos come through the Worker, for the owner alone. */
export const readable = (url: string) => (url.startsWith(MEDIA) ? `/api/feedback/media/${url.slice(MEDIA.length).split('?')[0]}` : url)

/**
 * A box-shadow's parts WebKit paints properly in a drawing. A wide blur at more than 1× comes out as a grey block beside
 * the element, which isn't on the screen, so it's left out: a missing soft shadow can't be mistaken for a fault on the page.
 */
export function hardShadows(shadow: string): string {
  const kept = shadow.split(/,(?![^(]*\))/).filter(part => {
    const blur = part.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g)?.[2]
    return parseFloat(blur ?? '0') <= MAX_BLUR
  })
  return kept.length ? kept.join(',') : 'none'
}

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

const onScreen = (e: Element) => {
  const r = e.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
}

/** Whether a set of RGBA samples is all one colour. */
const isFlat = (samples: Uint8ClampedArray[]) => {
  for (const channel of [0, 1, 2]) {
    const values = samples.map(s => s[channel]!)
    if (Math.max(...values) - Math.min(...values) > FLAT) return false
  }
  return true
}

/** The part of a photo that shows: on the screen, and not under something else on the page. */
function showing(img: HTMLImageElement) {
  const r = img.getBoundingClientRect()
  const x = Math.max(r.left, 0), y = Math.max(r.top, 0)
  const width = Math.min(r.right, innerWidth) - x, height = Math.min(r.bottom, innerHeight) - y
  if (width < 16 || height < 16) return null
  const top = document.elementsFromPoint(x + width / 2, y + height / 2).find(e => !e.closest('[data-owner-report],[data-owner-bar]'))
  return top === img ? { x, y, width, height } : null
}

/** Is the source one flat colour? Then a flat drawing of it is right. A source that can't be read counts as not flat. */
async function flatSource(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = c.height = 5
    const x = c.getContext('2d', { willReadFrequently: true })!
    // Single points, as the drawing is read: a mostly white photo stays mostly white, not an average of it.
    x.imageSmoothingEnabled = false
    x.drawImage(bitmap, 0, 0, 5, 5)
    bitmap.close()
    const { data } = x.getImageData(0, 0, 5, 5)
    return isFlat(Array.from({ length: 25 }, (_, i) => data.subarray(i * 4, i * 4 + 4)))
  } catch {
    return false
  }
}

const wait = (ms: number) => new Promise(ok => setTimeout(ok, ms))

/** The picture, and how many things on the screen it has marked as not drawn. */
export async function captureViewport(): Promise<{ blob: Blob; notDrawn: number }> {
  const root = document.documentElement
  const scroll = scrollY
  // Only what's on the screen and has loaded: a picture still loading shows nothing there either.
  const seen = new Set<string>()
  for (const img of document.images) {
    if (img.currentSrc && img.naturalWidth && onScreen(img)) seen.add(img.currentSrc)
  }
  // Each picture's bytes as they came, by its address.
  const sources = new Map<string, Blob>()
  // Another site's frame can't be drawn from here.
  const frames = [...document.querySelectorAll('iframe')].filter(onScreen).length
  const unmark = markStuck(scroll)
  const { hollow, unmark: unbox } = pruneOffScreen()
  try {
    const scale = Math.min(devicePixelRatio, 2)
    const svg = await domToForeignObjectSvg(root, {
      width: innerWidth,
      height: innerHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      timeout: 8000,
      style: { transform: `translateY(${-scroll}px)`, height: `${root.scrollHeight}px`, overflow: 'hidden' },
      // The sheet and the bar aren't what they're reporting.
      filter: n => {
        if (n.parentNode && hollow.has(n.parentNode)) return false
        return !(n instanceof HTMLElement && ('ownerBar' in n.dataset || 'ownerReport' in n.dataset))
      },
      onCloneEachNode: clone => {
        if (!(clone instanceof HTMLElement)) return
        const css = [clone.dataset.capturePosition, clone.dataset.captureBox].filter(Boolean).join(';')
        if (css) clone.style.cssText += `;${css}`
        if (clone.style.boxShadow) clone.style.boxShadow = hardShadows(clone.style.boxShadow)
        if (clone instanceof HTMLIFrameElement) {
          clone.removeAttribute('src')
          clone.removeAttribute('srcdoc')
          clone.style.background = `url("${NOT_DRAWN}") center/cover`
        }
      },
      // A picture off screen costs no fetch: on a list of hundreds, that's the difference between seconds and a minute.
      fetchFn: async url => {
        if (url.startsWith('data:')) return false
        if (!seen.has(url)) return PICTURE.test(url) ? BLANK : false
        const r = await fetch(readable(url)).catch(() => null)
        if (!r?.ok) return NOT_DRAWN
        const blob = await r.blob()
        const data = await toDataUrl(blob)
        sources.set(url, blob)
        return data
      },
      fetch: { placeholderImage: NOT_DRAWN },
    })

    // Drawn here, not by the library: WebKit decodes the pictures inside a drawing in its own time, and a drawing made too
    // soon has them blank. So it's drawn until every photo that shows is there, and a photo still blank gets marked.
    const drawing = new Image()
    drawing.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    await drawing.decode().catch(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(innerWidth * scale)
    canvas.height = Math.floor(innerHeight * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const photos: { x: number; y: number; width: number; height: number }[] = []
    for (const img of document.images) {
      const blob = sources.get(img.currentSrc)
      const part = blob && showing(img)
      if (part && !(await flatSource(blob))) photos.push(part)
    }
    const blank = () => photos.filter(p => {
      const samples = Array.from({ length: 25 }, (_, i) => context.getImageData(
        Math.floor((p.x + (p.width * (i % 5 + 0.5)) / 5) * scale),
        Math.floor((p.y + (p.height * (Math.floor(i / 5) + 0.5)) / 5) * scale), 1, 1).data)
      return isFlat(samples)
    })
    let missing = photos
    for (let i = 0; i < DRAWS; i++) {
      context.fillStyle = getComputedStyle(document.body).backgroundColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(drawing, 0, 0, canvas.width, canvas.height)
      missing = blank()
      // The fonts in a drawing come in the same way, so it's never just the first one.
      if (i >= 2 && !missing.length) break
      await wait(DRAW_GAP_MS)
    }
    if (missing.length) {
      const mark = new Image()
      mark.src = NOT_DRAWN
      await mark.decode().catch(() => {})
      for (const p of missing) context.drawImage(mark, p.x * scale, p.y * scale, p.width * scale, p.height * scale)
    }
    const blob = await new Promise<Blob>((ok, no) => canvas.toBlob(b => (b ? ok(b) : no(new Error('toBlob'))), 'image/jpeg', 0.8))
    return { blob, notDrawn: frames + missing.length + [...seen].filter(url => !sources.has(url)).length }
  } finally {
    unmark()
    unbox()
  }
}

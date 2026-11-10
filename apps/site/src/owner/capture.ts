// A picture of what's on the screen, drawn from the page: an iPhone browser can't grab its own screen. Loaded only when
// the owner taps "Báo lỗi". Tried on the live site in WebKit at a phone's size: this library's text and layout match the
// screen, where html2canvas drew a scrolled fish page's lines on top of each other. It's still a drawing, so the report
// says so, and what it couldn't draw is marked as such: a false blank would send someone after a bug that isn't there.
import { domToForeignObjectSvg } from 'modern-screenshot'
import { photosShowing, type Shown } from './shown'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/** In place of something on screen that couldn't be drawn. It can't pass for a blank on the page. */
const NOT_DRAWN = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" preserveAspectRatio="xMidYMid slice"><defs><pattern id="s" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="28" height="28" fill="#ffe08a"/><rect width="14" height="28" fill="#c0392b"/></pattern></defs><rect width="480" height="360" fill="url(#s)"/><rect x="100" y="146" width="280" height="68" fill="#fff"/><text x="240" y="192" font-family="sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#a3221b">NOT DRAWN</text></svg>')}`
const MEDIA = 'https://media.aquatome.com/'
/** Off screen, a picture costs nothing and draws nothing. */
const PICTURE = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i
/** The widest blur WebKit still paints where it belongs when it draws a page at more than 1×. */
const MAX_BLUR = 4
/** How long to keep drawing the page again while a photo in it is still blank, and how long apart. */
const DRAW_FOR_MS = 5000
const DRAW_GAP_MS = 250
/** A photo that hasn't come in by then is marked, not waited for. */
const FETCH_MS = 8000
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

const onScreen = (e: Element) => {
  const r = e.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
}

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
 * One pass over the page, for what the picture would otherwise get wrong. What's stuck to the screen would scroll away with
 * the page in the picture, which moves the page by the scroll: each is marked with where it is now, the picture's copy put
 * back there. Photos as backgrounds on the screen are collected into `backgrounds`.
 */
function markStuck(scroll: number, backgrounds: Set<string>): () => void {
  const marked: HTMLElement[] = []
  for (const e of document.querySelectorAll<HTMLElement>('body *')) {
    // A row scrolled sideways (a page's section tabs, a strip of photos) would be drawn from its start: what's in it is
    // moved by the scroll instead, as it is on the screen.
    if ((e.scrollLeft || e.scrollTop) && onScreen(e)) {
      for (const child of e.children) {
        if (!(child instanceof HTMLElement)) continue
        const own = getComputedStyle(child).transform
        child.dataset.captureShift = `translate(${-e.scrollLeft}px,${-e.scrollTop}px)${own === 'none' ? '' : ` ${own}`}`
        marked.push(child)
      }
    }
    const { position, backgroundImage } = getComputedStyle(e)
    // A photo as a background (a video's thumbnail) on the screen: read once over this same pass.
    if (backgroundImage.includes('url(') && onScreen(e)) {
      for (const [, url] of backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) if (url && !url.startsWith('data:')) backgrounds.add(url)
    }
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
  return () => {
    for (const e of marked) {
      delete e.dataset.capturePosition
      delete e.dataset.captureShift
    }
  }
}

/**
 * The text on the screen as the page has laid it out. Each box keeps the page's width in a drawing, while the same words can
 * measure a little wider there (Chrome zoomed in or out): a chip's label broke onto a second line and a shop fell out of its
 * row, faults the page doesn't have. So where each line of text breaks is marked, for the copy to break there and nowhere
 * else, and a wrapping row that's one row on the screen is marked to stay one.
 */
function markLines(): () => void {
  const marked: HTMLElement[] = []
  const lines = new Map<HTMLElement, Record<number, number[]>>()
  const blockOf = (e: HTMLElement): HTMLElement => (e.parentElement && getComputedStyle(e).display === 'inline' ? blockOf(e.parentElement) : e)
  const range = document.createRange()
  const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let last: { block: HTMLElement; line: DOMRect } | undefined
  for (let n = texts.nextNode() as Text | null; n; n = texts.nextNode() as Text | null) {
    const parent = n.parentElement
    if (!parent || !n.data.trim() || !onScreen(parent) || getComputedStyle(parent).whiteSpace !== 'normal') continue
    const block = blockOf(parent)
    const breaks: number[] = []
    for (const word of n.data.matchAll(/\S+/g)) {
      range.setStart(n, word.index)
      range.setEnd(n, word.index + word[0].length)
      const rects = range.getClientRects()
      const first = rects[0], end = rects[rects.length - 1]
      if (!first || !end) continue
      // A word too long for its line, broken inside: left to wrap.
      if (end.top > first.top + first.height / 2) parent.dataset.captureWraps = ''
      const below = last?.block === block && first.top > last.line.top + last.line.height / 2
      // A line the page itself ends with a <br> has one already.
      if (below && !(word.index === n.data.search(/\S/) && n.previousSibling instanceof HTMLBRElement)) breaks.push(word.index)
      last = { block, line: end }
    }
    const own = lines.get(parent) ?? {}
    own[[...parent.childNodes].filter(c => c.nodeType === Node.TEXT_NODE).indexOf(n)] = breaks
    lines.set(parent, own)
    // What it stands in: the spaces between one inline and the next can break a line too.
    if (!lines.has(block)) lines.set(block, {})
  }
  for (const [e, own] of lines) {
    e.dataset.captureLines = JSON.stringify(own)
    marked.push(e)
  }
  for (const e of document.querySelectorAll<HTMLElement>('body *')) {
    if (getComputedStyle(e).flexWrap === 'nowrap' || !onScreen(e)) continue
    const boxes = [...e.children].map(c => c.getBoundingClientRect()).filter(r => r.width && r.height)
    if (boxes.length > 1 && Math.max(...boxes.map(r => r.top)) < Math.min(...boxes.map(r => r.bottom))) {
      e.dataset.captureRow = ''
      marked.push(e)
    }
  }
  return () => {
    for (const e of marked) {
      delete e.dataset.captureLines
      delete e.dataset.captureRow
      delete e.dataset.captureWraps
    }
  }
}

/** The page's lines in the drawing's copy of an element (markLines). */
function keepLines(clone: HTMLElement) {
  if ('captureRow' in clone.dataset) clone.style.flexWrap = 'nowrap'
  if (clone.dataset.captureLines === undefined) return
  clone.style.whiteSpace = 'captureWraps' in clone.dataset ? 'normal' : 'nowrap'
  const texts = [...clone.childNodes].filter((c): c is Text => c.nodeType === Node.TEXT_NODE)
  for (const [i, breaks] of Object.entries(JSON.parse(clone.dataset.captureLines) as Record<string, number[]>)) {
    for (const at of [...breaks].reverse()) {
      const text = texts[Number(i)]
      if (text) (at ? text.splitText(at) : text).before(document.createElement('br'))
    }
  }
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

/** Whether a set of RGBA samples is all one colour. */
const isFlat = (samples: Uint8ClampedArray[]) => {
  for (const channel of [0, 1, 2]) {
    const values = samples.map(s => s[channel]!)
    if (Math.max(...values) - Math.min(...values) > FLAT) return false
  }
  return true
}

/** Where a point on the screen falls in the photo's own pixels, as its object-fit and object-position place it; null off it. */
function inSource(p: Shown, x: number, y: number, size: [number, number]): [number, number] | null {
  const [w, h] = p.natural
  const { left, top, width, height } = p.box
  let sx = width / w, sy = height / h
  if (p.fit === 'cover') sx = sy = Math.max(sx, sy)
  else if (p.fit === 'contain') sx = sy = Math.min(sx, sy)
  else if (p.fit === 'none') sx = sy = 1
  else if (p.fit === 'scale-down') sx = sy = Math.min(1, sx, sy)
  const [ax = 0.5, ay = 0.5] = p.position.split(' ').map(v => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5))
  const u = (x - left - (width - w * sx) * ax) / sx, v = (y - top - (height - h * sy) * ay) / sy
  return u >= 0 && v >= 0 && u < w && v < h ? [Math.floor((u * size[0]) / w), Math.floor((v * size[1]) / h)] : null
}

/**
 * 16 points across the part of a photo on the screen, with where each falls in the photo; points off the photo left out.
 * None at the centre, where WebKit puts its small broken-picture sign: a photo that broke in the drawing reads as blank.
 */
async function checkPoints(p: Shown, blob: Blob) {
  const points = Array.from({ length: 16 }, (_, i) => ({
    x: p.visible.x + (p.visible.width * ((i % 4) + 0.5)) / 4,
    y: p.visible.y + (p.visible.height * (Math.floor(i / 4) + 0.5)) / 4,
  }))
  try {
    const bitmap = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bitmap.width
    c.height = bitmap.height
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(bitmap, 0, 0)
    const size: [number, number] = [bitmap.width, bitmap.height]
    bitmap.close()
    const inside = points.flatMap(pt => {
      const at = inSource(p, pt.x, pt.y, size)
      return at ? [{ ...pt, source: x.getImageData(at[0], at[1], 1, 1).data }] : []
    })
    // Flat where it shows (a white studio ground, open water): a flat drawing of it is right.
    return isFlat(inside.map(pt => pt.source)) ? [] : inside
  } catch {
    // A photo the phone can't read here can't be checked against; any flat drawing of it is a blank.
    return points
  }
}

const wait = (ms: number) => new Promise(ok => setTimeout(ok, ms))

/**
 * The picture, and how many things on the screen it has marked as not drawn. `shown`: the photos on top, measured before
 * a modal sheet opened over the page (shown.ts).
 */
export async function captureViewport(shown: Shown[] = photosShowing()): Promise<{ blob: Blob; notDrawn: number }> {
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
  const backgrounds = new Set<string>()
  const unmark = markStuck(scroll, backgrounds)
  const unline = markLines()
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
        // A <picture>'s other sources would win over the photo put in its <img>, and point where a drawing can't load.
        if (n instanceof HTMLSourceElement && n.parentNode instanceof HTMLPictureElement) return false
        return !(n instanceof HTMLElement && ('ownerBar' in n.dataset || 'ownerReport' in n.dataset))
      },
      onCloneEachNode: clone => {
        if (!(clone instanceof HTMLElement)) return
        const css = [clone.dataset.capturePosition, clone.dataset.captureBox].filter(Boolean).join(';')
        if (css) clone.style.cssText += `;${css}`
        if (clone.dataset.captureShift) clone.style.transform = clone.dataset.captureShift
        keepLines(clone)
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
        if (!seen.has(url) && !backgrounds.has(url)) return PICTURE.test(url) ? BLANK : false
        const r = await fetch(readable(url), { signal: AbortSignal.timeout(FETCH_MS) }).catch(() => null)
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
    // A drawing that doesn't load is no picture: the sheet says so, rather than sending the page's background colour.
    await new Promise<void>((ok, no) => {
      drawing.onload = () => ok()
      drawing.onerror = () => no(new Error('drawing'))
      drawing.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    })
    await drawing.decode().catch(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(innerWidth * scale)
    canvas.height = Math.floor(innerHeight * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    // Each photo on top, with the points to read it at: blank where the drawing is flat and the photo isn't.
    const photos: { visible: Shown['visible']; points: { x: number; y: number }[] }[] = []
    for (const p of shown) {
      const blob = sources.get(p.src)
      const points = blob ? await checkPoints(p, blob) : []
      if (points.length) photos.push({ visible: p.visible, points })
    }
    const blank = () => photos.filter(p => isFlat(p.points.map(pt =>
      context.getImageData(Math.floor(pt.x * scale), Math.floor(pt.y * scale), 1, 1).data)))
    let missing = photos
    const until = performance.now() + DRAW_FOR_MS
    for (let i = 0; ; i++) {
      context.fillStyle = getComputedStyle(document.body).backgroundColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(drawing, 0, 0, canvas.width, canvas.height)
      missing = blank()
      // The fonts in a drawing come in the same way, so it's never just the first one.
      if ((i >= 2 && !missing.length) || performance.now() > until) break
      await wait(DRAW_GAP_MS)
    }
    if (missing.length) {
      const mark = new Image()
      mark.src = NOT_DRAWN
      await mark.decode().catch(() => {})
      for (const { visible: v } of missing) context.drawImage(mark, v.x * scale, v.y * scale, v.width * scale, v.height * scale)
    }
    const blob = await new Promise<Blob>((ok, no) => canvas.toBlob(b => (b ? ok(b) : no(new Error('toBlob'))), 'image/jpeg', 0.8))
    return { blob, notDrawn: frames + missing.length + [...seen, ...backgrounds].filter(url => !sources.has(url)).length }
  } finally {
    unmark()
    unline()
    unbox()
  }
}

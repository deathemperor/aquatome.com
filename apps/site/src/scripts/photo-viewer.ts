import { ct } from './ct'
import { clampPan, fit, MAX_ZOOM, swipeStep, TAP_ZOOM, viewerHistory, wrap, zoomAt, type Point, type Size } from './photo-view'
import css from './photo-viewer.css?inline'

/**
 * The photo viewer, for a gallery page's photos and readers' photos: full screen, in place, the phone's Back button
 * closes it. Swipe (it follows the finger), the arrow keys or its buttons step through; pinch, double-tap, a click
 * or the wheel zoom, and a zoomed photo pans. The tile's own picture shows, scaled up, until the full photo is decoded,
 * and the photos either side load in the slides beside it. Its history and arithmetic: photo-view.ts.
 */
export type ViewerPhoto = {
  /** The full photo. */
  src: string
  /** The tile's picture, loaded already: shown under the full photo until that one is ready. */
  thumb: string
  width: number
  height: number
  alt: string
  caption?: string
  /** The credit line; the viewer adds "· n/N" after it. */
  credit: () => (string | Node)[]
}

export type ViewerOptions = {
  /** Tells this viewer's history entries from another viewer's. */
  id: string
  photos: ViewerPhoto[]
  /** Photo i's tile: focus goes back to the tile of the photo the viewer closes on. */
  tile: (i: number) => HTMLElement | undefined
  /** The address while photo i is open (a gallery's #aN), which its share button shares; without it, the page's own. */
  address?: (i: number) => string
}

export type Viewer = {
  /** Open on photo i. `from`: the tile tapped, which the photo grows from; `under`: see viewerHistory().open. */
  open(i: number, o?: { from?: HTMLElement; under?: string }): void
  /** Open on the photo the current history entry had open (a reload, Forward), if it is this viewer's. */
  restore(): boolean
}

type Slide = { el: HTMLElement; pic: HTMLElement; thumb: HTMLImageElement; full: HTMLImageElement; i: number; box: Size }

const GAP = 24
const icon = (d: string) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const SLIDE = '<div class="pv-slide"><div class="pv-pic"><img class="pv-thumb" alt="" draggable="false"><img class="pv-full" alt="" draggable="false" decoding="async"></div></div>'
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function createViewer({ id, photos, tile, address }: ViewerOptions): Viewer {
  // `photos` may grow while the viewer is closed (readers' photos' "Xem thêm"): it steps through them as they are.
  const n = () => photos.length
  const hist = viewerHistory(history, id)
  let d: HTMLDialogElement | undefined
  let stage: HTMLElement, track: HTMLElement, cap: HTMLElement, by: HTMLElement, status: HTMLElement
  let slides: Slide[] = []
  let at = 0
  let room: Size = { w: 0, h: 0 }
  let scale = 1
  let pan: Point = { x: 0, y: 0 }
  let settling: (() => void) | undefined
  let timer = 0

  const cur = () => slides[1]!

  function build() {
    if (!document.getElementById('pv-css')) document.head.insertAdjacentHTML('beforeend', `<style id="pv-css">${css}</style>`)
    d = document.createElement('dialog')
    d.className = 'lb pv'
    d.setAttribute('aria-label', ct('Xem ảnh'))
    d.innerHTML = `<div class="pv-bar">${address && 'share' in navigator ? `<button type="button" class="pv-btn share">${icon('M12 15V4m0 0L8 8m4-4 4 4M6 11H5v9h14v-9h-1')}</button>` : ''}<button type="button" class="pv-btn close" autofocus>${icon('M6 6l12 12M18 6 6 18')}</button></div>`
      + `<div class="pv-stage"><div class="pv-track">${SLIDE.repeat(3)}</div></div>`
      + `<button type="button" class="pv-btn step prev">${icon('M15 5l-7 7 7 7')}</button>`
      + `<div class="pv-text"><p class="cap"></p><p class="by"></p></div>`
      + `<button type="button" class="pv-btn step next">${icon('M9 5l7 7-7 7')}</button>`
      + '<span class="pv-status" role="status"></span>'
    const $ = <T extends Element = HTMLElement>(s: string) => d!.querySelector<T>(s)!
    $('.close').setAttribute('aria-label', ct('Đóng'))
    $('.prev').setAttribute('aria-label', ct('Ảnh trước'))
    $('.next').setAttribute('aria-label', ct('Ảnh sau'))
    d.querySelector('.share')?.setAttribute('aria-label', ct('Chia sẻ ảnh'))
    stage = $('.pv-stage'); track = $('.pv-track'); cap = $('.cap'); by = $('.by'); status = $('.pv-status')
    slides = [...track.children].map(el => ({ el: el as HTMLElement, pic: el.firstElementChild as HTMLElement, thumb: el.querySelector<HTMLImageElement>('.pv-thumb')!, full: el.querySelector<HTMLImageElement>('.pv-full')!, i: -1, box: { w: 0, h: 0 } }))
    document.body.append(d)

    $('.close').addEventListener('click', () => d!.close())
    $('.prev').addEventListener('click', () => go(-1))
    $('.next').addEventListener('click', () => go(1))
    d.querySelector('.share')?.addEventListener('click', () => void navigator.share({ title: document.title, url: location.href }).catch(() => {}))
    d.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1) }
    })
    d.addEventListener('close', () => {
      finish()
      zoom(1, { x: 0, y: 0 }, false)
      points.clear()
      hist.close()
      tile(at)?.focus()
    })
    track.addEventListener('transitionend', e => { if (e.target === track) finish() })
    new ResizeObserver(layout).observe(stage)
    gestures()
  }

  /** Photo i into a slide: its tile's picture at once, the full photo over it once decoded. */
  function fill(s: Slide, i: number) {
    if (s.i === i) return
    const p = photos[i]!
    s.i = i
    s.pic.classList.remove('ready')
    s.thumb.src = p.thumb
    s.full.alt = p.alt
    s.full.src = p.src
    s.full.decode().then(() => { if (s.i === i) s.pic.classList.add('ready') }, () => {})
    size(s)
  }
  function size(s: Slide) {
    const p = photos[s.i]
    if (!p) return
    s.box = fit({ w: p.width, h: p.height }, room)
    s.pic.style.width = `${s.box.w}px`
    s.pic.style.height = `${s.box.h}px`
  }
  /** The slides side by side, the current one in the middle; the ones either side hidden from screen readers. */
  function place() {
    slides.forEach((s, k) => {
      s.el.style.transform = `translateX(${(k - 1) * (room.w + GAP)}px)`
      s.el.inert = k !== 1
      s.el.hidden = k !== 1 && n() < 2
    })
  }
  function layout() {
    room = { w: stage.clientWidth, h: stage.clientHeight }
    slides.forEach(size)
    place()
    zoom(scale, pan, false)
  }

  function words() {
    const p = photos[at]!
    cap.textContent = p.caption ?? ''
    cap.hidden = !p.caption
    by.replaceChildren(...p.credit(), ` · ${at + 1}/${n()}`)
    status.textContent = `${at + 1}/${n()}`
  }
  function show(i: number) {
    finish()
    at = i
    fill(slides[1]!, at)
    if (n() > 1) { fill(slides[0]!, wrap(at - 1, n())); fill(slides[2]!, wrap(at + 1, n())) }
    zoom(1, { x: 0, y: 0 }, false)
    words()
  }

  /** The track to `x` (px), animated unless motion is reduced, then `done`. */
  function slide(x: number, done?: () => void) {
    finish()
    if (still()) { track.style.transform = ''; done?.(); return }
    track.classList.add('pv-anim')
    track.style.transform = `translateX(${x}px)`
    settling = () => { settling = undefined; clearTimeout(timer); track.classList.remove('pv-anim'); done?.() }
    timer = window.setTimeout(() => settling?.(), 400)
  }
  /** Ends a slide still running, at once. */
  const finish = () => settling?.()

  /** To the next photo (1) or the one before (-1): the caption and address now, the slides once they've moved. */
  function go(dir: -1 | 1) {
    if (n() < 2 || !d?.open) return
    finish()
    zoom(1, { x: 0, y: 0 }, false)
    at = wrap(at + dir, n())
    words()
    hist.step(at, address?.(at))
    slide(-dir * (room.w + GAP), () => {
      slides = dir > 0 ? [slides[1]!, slides[2]!, slides[0]!] : [slides[2]!, slides[0]!, slides[1]!]
      fill(slides[dir > 0 ? 2 : 0]!, wrap(at + dir, n()))
      track.style.transform = ''
      place()
    })
  }

  /** The current photo zoomed to `s`, its centre at `p` from the stage's (kept within its edges). */
  function zoom(s: number, p: Point, ease: boolean, free = false) {
    const c = slides[1]
    if (!c || !d) return
    scale = s
    pan = free ? p : clampPan(p, s, c.box, room)
    c.pic.classList.toggle('pv-ease', ease && !still())
    c.pic.style.transform = scale === 1 && !pan.x && !pan.y ? '' : `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
    d.dataset.zoom = scale > 1 ? 'in' : 'out'
  }
  const zoomBy = (s: number, at: Point, ease: boolean) => { const next = clamp(s, 1, MAX_ZOOM); zoom(next, zoomAt(pan, scale, next, at), ease) }

  const points = new Map<number, Point>()
  function gestures() {
    type Drag = { kind: 'wait' | 'swipe' | 'pan' | 'none'; from: Point; pan: Point; t: number; trail: { x: number; t: number }[] }
    type Pinch = { kind: 'pinch'; dist: number; mid: Point; scale: number; pan: Point; now: Point }
    let g: Drag | Pinch | undefined
    let tapped = { t: -1e9, x: 0, y: 0 }
    const centre = (p: Point) => { const r = stage.getBoundingClientRect(); return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 } }
    const two = () => { const [a, b] = [...points.values()] as [Point, Point]; return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: centre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) } }
    const drag = (p: Point, t: number): Drag => ({ kind: scale > 1 ? 'pan' : 'wait', from: p, pan, t, trail: [{ x: p.x, t }] })
    const onPhoto = (p: Point) => { const r = cur().pic.getBoundingClientRect(); return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom }

    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0 || points.size >= 2) return
      stage.setPointerCapture(e.pointerId)
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (points.size === 1) { finish(); g = drag({ x: e.clientX, y: e.clientY }, e.timeStamp); return }
      // A second finger: a pinch, from wherever a swipe had got to.
      track.style.transform = ''
      const { dist, mid } = two()
      g = { kind: 'pinch', dist, mid, scale, pan, now: mid }
    })
    stage.addEventListener('pointermove', e => {
      if (!points.has(e.pointerId) || !g) return
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (g.kind === 'pinch') {
        if (points.size < 2) return
        const { dist, mid } = two()
        g.now = mid
        const s = clamp((g.scale * dist) / g.dist, 0.8, MAX_ZOOM * 1.2)
        // The photo's point under the fingers when they met stays under them.
        zoom(s, { x: mid.x - ((g.mid.x - g.pan.x) * s) / g.scale, y: mid.y - ((g.mid.y - g.pan.y) * s) / g.scale }, false, true)
        return
      }
      const dx = e.clientX - g.from.x, dy = e.clientY - g.from.y
      g.trail = [...g.trail.filter(p => e.timeStamp - p.t < 100), { x: e.clientX, t: e.timeStamp }]
      if (g.kind === 'wait' && Math.hypot(dx, dy) > 8) g.kind = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'none'
      if (g.kind === 'swipe') track.style.transform = `translateX(${n() < 2 ? dx / 4 : dx}px)`
      if (g.kind === 'pan') zoom(scale, { x: g.pan.x + dx, y: g.pan.y + dy }, false)
    })
    const up = (e: PointerEvent) => {
      if (!points.delete(e.pointerId) || !g) return
      if (g.kind === 'pinch') {
        // Back within 1×–4×; the finger still down pans, or does nothing at 1× (no swipe out of a pinch).
        zoomBy(scale, g.now, true)
        const left = [...points.values()][0]
        g = left ? { ...drag(left, -Infinity), kind: scale > 1 ? 'pan' : 'none' } : undefined // never a tap
        return
      }
      const dx = e.clientX - g.from.x
      if (g.kind === 'swipe') {
        const first = g.trail[0]!
        const step = e.type === 'pointercancel' ? 0 : swipeStep(dx, (e.clientX - first.x) / Math.max(1, e.timeStamp - first.t), room.w, n())
        if (step) go(step)
        else slide(0, () => { track.style.transform = '' })
      } else if (g.kind !== 'none' && e.type === 'pointerup' && Math.hypot(dx, e.clientY - g.from.y) < 10 && e.timeStamp - g.t < 300) {
        tap({ x: e.clientX, y: e.clientY }, e)
      }
      g = undefined
    }
    stage.addEventListener('pointerup', up)
    stage.addEventListener('pointercancel', up)

    /**
     * With a mouse, a click on the photo zooms in there, or back out (its cursor is a magnifier), and the second click of
     * a double click changes nothing more; a click beside it closes the viewer. A finger zooms with a double tap.
     */
    function tap(p: Point, e: PointerEvent) {
      const on = onPhoto(p)
      if (e.pointerType === 'mouse' && on) {
        if (e.timeStamp - tapped.t < 300) { tapped = { t: -1e9, x: 0, y: 0 }; return }
        tapped = { t: e.timeStamp, x: p.x, y: p.y }
        if (scale > 1) zoom(1, { x: 0, y: 0 }, true)
        else zoomBy(TAP_ZOOM, centre(p), true)
        return
      }
      if (on && e.timeStamp - tapped.t < 300 && Math.hypot(p.x - tapped.x, p.y - tapped.y) < 30) {
        tapped = { t: -1e9, x: 0, y: 0 }
        if (scale > 1) zoom(1, { x: 0, y: 0 }, true)
        else zoomBy(TAP_ZOOM, centre(p), true)
        return
      }
      tapped = on ? { t: e.timeStamp, x: p.x, y: p.y } : { t: -1e9, x: 0, y: 0 }
      if (!on && e.pointerType === 'mouse') d!.close()
    }
    // The wheel zooms where the cursor is. With Ctrl (a trackpad's pinch too) it stays the browser's own page zoom.
    stage.addEventListener('wheel', e => {
      if (e.ctrlKey) return
      e.preventDefault()
      zoomBy(scale * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.002)), centre({ x: e.clientX, y: e.clientY }), false)
    }, { passive: false })
  }

  /** The photo grows from the tile tapped to its place. */
  function grow(from: HTMLElement) {
    const r = (from.querySelector('img') ?? from).getBoundingClientRect()
    const c = cur(), box = c.pic.getBoundingClientRect()
    if (still() || !r.width || !box.width) return
    const k = r.width / box.width
    c.pic.animate([
      { transform: `translate(${r.left + r.width / 2 - (box.left + box.width / 2)}px, ${r.top + r.height / 2 - (box.top + box.height / 2)}px) scale(${k})` },
      { transform: 'none' },
    ], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }

  function open(i: number, o: { from?: HTMLElement; under?: string } = {}) {
    if (!d) build()
    d!.classList.toggle('pv-one', n() < 2)
    const first = !d!.open
    if (first) d!.showModal()
    layout()
    show(i)
    hist.open(i, address?.(i), o.under)
    if (first && o.from) grow(o.from)
  }

  addEventListener('popstate', () => {
    const i = hist.current()
    if (i === null) { if (d?.open) d.close() } else if (i < n()) open(i)
  })

  return {
    open,
    restore() {
      const i = hist.current()
      if (i === null || i >= n()) return false
      open(i)
      return true
    },
  }
}

import { expect, test } from 'vitest'
import { clampPan, fit, photoOfHash, swipeStep, viewerHistory, wrap, zoomAt, type Hist } from '../src/scripts/photo-view'

test('photos go round: after the last the first, before the first the last', () => {
  expect([wrap(0, 5), wrap(4, 5), wrap(5, 5), wrap(-1, 5), wrap(-6, 5)]).toEqual([0, 4, 0, 4, 4])
  expect(wrap(1, 1)).toBe(0)
})

test('a photo fills as much of the stage as it can, keeping its shape, never past its own pixels', () => {
  expect(fit({ w: 2000, h: 1500 }, { w: 390, h: 700 })).toEqual({ w: 390, h: 292.5 })
  expect(fit({ w: 1500, h: 2000 }, { w: 1100, h: 600 })).toEqual({ w: 450, h: 600 })
  expect(fit({ w: 800, h: 600 }, { w: 1100, h: 700 })).toEqual({ w: 800, h: 600 })
})

test('a zoomed photo pans no further than its edges, and stays centred along a side it does not fill', () => {
  const box = { w: 400, h: 300 }, stage = { w: 400, h: 700 }
  expect(clampPan({ x: 500, y: 500 }, 1, box, stage)).toEqual({ x: 0, y: 0 })
  // At 2× it is 800 × 600: 200 px to spare on each side across, none down (600 < 700).
  expect(clampPan({ x: 500, y: 90 }, 2, box, stage)).toEqual({ x: 200, y: 0 })
  expect(clampPan({ x: -150, y: -90 }, 2, box, stage)).toEqual({ x: -150, y: 0 })
  // At 4×, 1200 tall: 250 px to spare up and down.
  expect(clampPan({ x: -900, y: -900 }, 4, box, stage)).toEqual({ x: -600, y: -250 })
})

test('zooming keeps the point under the fingers or the cursor where it is', () => {
  const at = { x: 100, y: -40 }
  const pan = zoomAt({ x: 0, y: 0 }, 1, 2, at)
  expect(pan).toEqual({ x: -100, y: 40 })
  // The photo's point under `at`, before and after: (at - pan) / scale.
  expect((at.x - pan.x) / 2).toBe(at.x / 1)
  expect(zoomAt(pan, 2, 1, at)).toEqual({ x: 0, y: 0 })
})

test('a swipe moves on past a quarter of the width or with a flick, else springs back; one photo never moves', () => {
  expect(swipeStep(-120, 0, 400, 5)).toBe(1)
  expect(swipeStep(120, 0, 400, 5)).toBe(-1)
  expect(swipeStep(-60, 0, 400, 5)).toBe(0)
  expect(swipeStep(-40, -0.8, 400, 5)).toBe(1)
  expect(swipeStep(-40, 0.8, 400, 5)).toBe(0) // flicked back the other way
  expect(swipeStep(-10, -2, 400, 5)).toBe(0) // a twitch, not a swipe
  expect(swipeStep(-300, -2, 400, 1)).toBe(0)
})

test('a gallery address names its photo: #a5 is the fifth, if the gallery has five', () => {
  expect(photoOfHash('#a5', 6)).toBe(4)
  expect(photoOfHash('#a1', 6)).toBe(0)
  expect([photoOfHash('#a7', 6), photoOfHash('#a0', 6), photoOfHash('#x', 6), photoOfHash('', 6)]).toEqual([null, null, null, null])
})

/** The browser's history for one tab: entries of state and address, Back popping one (popstate: `onPop`). */
function tab(first: string) {
  const entries: { state: unknown; url: string }[] = [{ state: null, url: first }]
  let at = 0
  let onPop = () => {}
  const resolve = (url?: string | URL | null) => (url == null ? entries[at]!.url : new URL(String(url), `https://x${entries[at]!.url}`).href.replace('https://x', ''))
  const h: Hist = {
    get state() { return entries[at]!.state },
    pushState(state, _t, url) { const next = resolve(url); entries.splice(at + 1); entries.push({ state, url: next }); at++ },
    replaceState(state, _t, url) { entries[at] = { state, url: resolve(url) } },
    back() { if (at > 0) { at--; onPop() } },
  }
  return { h, urls: () => entries.map(e => e.url), here: () => entries[at]!.url, at: () => at, popped: (f: () => void) => (onPop = f), forward: () => { at++; onPop() } }
}

test('the viewer adds one entry, whatever it steps through, and closing it by its button or Esc takes it off', () => {
  const t = tab('/vi/ca/x/anh/')
  const v = viewerHistory(t.h, 'gallery')
  expect(v.current()).toBeNull()
  v.open(2, '#a3')
  expect(t.urls()).toEqual(['/vi/ca/x/anh/', '/vi/ca/x/anh/#a3'])
  expect(v.current()).toBe(2)
  v.step(3, '#a4')
  v.step(4, '#a5')
  expect(t.urls()).toEqual(['/vi/ca/x/anh/', '/vi/ca/x/anh/#a5'])
  v.close()
  expect([t.at(), t.here(), v.current()]).toEqual([0, '/vi/ca/x/anh/', null])
  v.close() // closed already: Back isn't pressed again
  expect(t.at()).toBe(0)
})

test('Back closes it (the entry under it is not the viewer\'s), Forward opens it again on the same photo', () => {
  const t = tab('/vi/ca/x/')
  const v = viewerHistory(t.h, 'reader')
  const seen: (number | null)[] = []
  t.popped(() => seen.push(v.current()))
  v.open(1) // a reader photo: the address stays the page's
  expect(t.urls()).toEqual(['/vi/ca/x/', '/vi/ca/x/'])
  t.h.back()
  t.forward()
  expect(seen).toEqual([null, 1])
})

test('a page opened on a photo\'s own address (#a5) gets an entry under it, so Back shows the gallery, not the photo again', () => {
  const t = tab('/vi/ca/x/')
  t.h.pushState(null, '', '/vi/ca/x/anh/#a5') // from the fish's page, its fifth photo
  const v = viewerHistory(t.h, 'gallery')
  v.open(4, '#a5', '/vi/ca/x/anh/')
  expect(t.urls()).toEqual(['/vi/ca/x/', '/vi/ca/x/anh/', '/vi/ca/x/anh/#a5'])
  v.close()
  expect(t.here()).toBe('/vi/ca/x/anh/')
})

test('reloaded with the viewer open, its entry is still its own: opening it again adds none', () => {
  const t = tab('/vi/ca/x/anh/')
  const first = viewerHistory(t.h, 'gallery')
  first.open(0, '#a1')
  const again = viewerHistory(t.h, 'gallery') // the page loaded again on the same entry
  expect(again.current()).toBe(0)
  again.open(0, '#a1', '/vi/ca/x/anh/')
  expect(t.urls()).toEqual(['/vi/ca/x/anh/', '/vi/ca/x/anh/#a1'])
  expect(viewerHistory(t.h, 'reader').current()).toBeNull() // another viewer's entry isn't this one's
})

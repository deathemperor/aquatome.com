import { expect, test } from './fixtures'
import { LIVE, sourcePages, templateOf } from './pages'

type Piece = { kind: 'item' | 'dot'; left: number; right: number; mid: number }

// The footer's links (and its languages) wrap on a phone. A "·" between two of them once ended a line ("Thiết bị ·") on a
// Pixel 7 (the council, 2026-11-06): every row starts and ends with a link, and no two run together.
for (const path of ['/', '/ca/ca-neon-vua/']) {
  test(`the footer's links on ${path}: each row starts and ends with a link, never a separator`, async ({ page }, info) => {
    const widths = info.project.name === 'phone' ? [412, 360] : [1280]
    await page.goto(path)
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 })
      for (const nav of ['footer nav.links', 'footer nav.langs']) {
        // The languages show on a page that has another language's copy.
        if (nav.endsWith('langs') && path !== '/' && (await page.locator(nav).count()) === 0) continue
        const pieces = await page.locator(nav).evaluate((el): Piece[] => {
          const out: Piece[] = []
          for (const x of el.querySelectorAll('a, button, [aria-current]')) {
            const r = x.getBoundingClientRect()
            if (r.width > 0) out.push({ kind: 'item', left: r.left, right: r.right, mid: r.top + r.height / 2 })
          }
          // A separator written as text between them, wherever it lands.
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (n.parentElement?.closest('a, button, [aria-current]')) continue
            for (const m of (n.textContent ?? '').matchAll(/[·|•]/g)) {
              const range = document.createRange()
              range.setStart(n, m.index)
              range.setEnd(n, m.index + 1)
              const r = range.getBoundingClientRect()
              if (r.width > 0) out.push({ kind: 'dot', left: r.left, right: r.right, mid: r.top + r.height / 2 })
            }
          }
          return out
        })
        const items = pieces.filter(p => p.kind === 'item')
        expect(items.length, `${nav} at ${width}px`).toBeGreaterThan(1)
        // Rows by the links' middles; a separator belongs to the row whose middle is nearest its own.
        const mids = [...new Set(items.map(p => Math.round(p.mid)))].sort((a, b) => a - b)
        const rowOf = (p: Piece) => mids.reduce((best, m) => (Math.abs(m - p.mid) < Math.abs(best - p.mid) ? m : best))
        for (const mid of mids) {
          const row = pieces.filter(p => rowOf(p) === mid).sort((a, b) => a.left - b.left)
          expect(row[0]!.kind, `${nav} at ${width}px: a row's first piece`).toBe('item')
          expect(row.at(-1)!.kind, `${nav} at ${width}px: a row's last piece`).toBe('item')
          const links = row.filter(p => p.kind === 'item')
          for (let i = 1; i < links.length; i++) expect(links[i]!.left - links[i - 1]!.right, `${nav} at ${width}px: space between two links`).toBeGreaterThanOrEqual(8)
        }
        // A phone's narrow screen wraps the links (the case this guards); a computer's fits them on one line.
        if (nav === 'footer nav.links') {
          if (width === 1280) expect(mids.length, `${nav} at ${width}px: rows`).toBe(1)
          if (width === 360) expect(mids.length, `${nav} at ${width}px: rows`).toBeGreaterThan(1)
        }
      }
    }
  })
}

// The photo credits ("Nguồn ảnh trên trang này"), read on one page of every kind that has them, in the light look and the
// dark: every link in the list (each name, each numbered photo, each licence) and every word of it (a name in bold, the
// licence and count) reads at 4.5 to 1 or more on the list's own ground. A name read 1.1 to 1 on the light look's plate
// (the chief of staff and Photo Sourcing, 17 Nov: the footer's own pale link ink won over the list's); the first link
// alone passed (the Unsplash rows' links carried the list's ink). A licence's name links its own page, as the licences
// ask.
// The chief of staff's three (a fish's, its photos', a glossary term's; on the fixture, a term with photos), then the first
// page of every other kind.
const NAMED = LIVE ? ['/ca/ca-neon-vua/', '/ca/ca-neon-vua/anh/', '/thuat-ngu/lua/'] : ['/ca/ca-neon-vua/', '/ca/ca-neon-vua/anh/', '/thuat-ngu/ca-dan/']
const KIND_PAGES = [...NAMED, ...new Map(sourcePages().filter(p => !NAMED.some(n => templateOf(n) === templateOf(p))).map(p => [templateOf(p), p])).values()]
test('the photo credits read in both looks, every link and word, on a page of every kind that has them', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'the colours are the same at any width')
  test.setTimeout(600_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const low: string[] = [], read = new Set<string>(), unlinked = new Set<string>()
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const path of KIND_PAGES) {
      await page.goto(path)
      const button = page.locator('footer button.credits-btn').first()
      if (!(await button.isVisible())) continue
      await button.click()
      await expect(page.locator('#photo-credits')).toBeVisible()
      read.add(`${path} ${scheme}`)
      const found = await page.locator('#photo-credits').evaluate(list => {
        const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
        const rgba = (c: string) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = '#000'; canvas.fillStyle = c; canvas.fillRect(0, 0, 1, 1); const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data; return [r!, g!, b!, a! / 255] }
        const lum = ([r, g, b]: number[]) => { const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
        const ground = (e: Element | null): number[] => { for (; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3]! > 0.99) return c } return [255, 255, 255, 1] }
        const out: { what: string; ratio: number; fg: string; bg: string }[] = []
        const lics: string[] = []
        for (const e of list.querySelectorAll('li a, li strong, li span')) {
          if (!e.textContent?.trim() || e.matches('.nums')) continue
          const bg = ground(e), fg0 = rgba(getComputedStyle(e).color)
          const fg = fg0.slice(0, 3).map((c, i) => c * fg0[3]! + bg[i]! * (1 - fg0[3]!))
          const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x)
          out.push({ what: `${e.tagName.toLowerCase()}${e.className ? `.${e.className.split(' ')[0]}` : ''} "${e.textContent!.trim().slice(0, 30)}"`, ratio: (hi! + 0.05) / (lo! + 0.05), fg: getComputedStyle(e).color, bg: getComputedStyle(list).backgroundColor })
        }
        // A licence named in a row's words, not linked (a source's own permission names none).
        for (const s of list.querySelectorAll('li .lic')) for (const n of s.childNodes) if (n.nodeType === 3 && /\bCC|Public domain|Unsplash License/i.test(n.textContent ?? '')) lics.push(n.textContent!.trim())
        return { out, lics }
      })
      for (const x of found.out) if (x.ratio < 4.5) low.push(`${path} ${scheme}: ${x.what} ${x.ratio.toFixed(2)} to 1 (${x.fg} on ${x.bg})`)
      for (const l of found.lics) unlinked.add(`${path}: ${l}`)
      await page.keyboard.press('Escape')
    }
  }
  // The chief of staff's three pages are among those read, in both looks.
  for (const path of NAMED) for (const scheme of ['light', 'dark']) expect([...read], `${path} ${scheme}`).toContain(`${path} ${scheme}`)
  expect(low).toEqual([])
  expect([...unlinked]).toEqual([])
  expect(errors).toEqual([])
})

import { expect, test } from './fixtures'

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

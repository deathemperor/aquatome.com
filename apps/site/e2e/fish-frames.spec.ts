import type { Locator, Page } from '@playwright/test'
import { expect, shownWhole, test } from './fixtures'
import { LIVE } from './pages'

// Where a fish's frame would cut the fish (its box: image-geometry.ts subjectFrame), the crop moves onto it, or the photo
// shows whole: a 4:3 tile on the same photo blurred, or on the tile's mat where the strips would be thin, in the tile's
// shape, so the grid stays even (SpeciesCard.astro); a page's head in its own shape on its plate, decided at 4:3 on a
// computer and at 16:9 on a species page on a phone (PhotoGallery.astro). The Design Lead's frames board, 12 Nov. The fixture boxes five heads, one for each way
// (test/engine-state/_photo-boxes.json); the cards the list's script builds come out the same (list-cards.spec.ts).
const style = (img: Locator) => img.evaluate(i => { const s = getComputedStyle(i), r = i.getBoundingClientRect(); return { fit: s.objectFit, pos: s.objectPosition, ratio: r.width / r.height } })

test('a fish tile that would cut the fish shows it whole, on itself blurred or on the mat, in the tile\'s shape', async ({ page, errors }) => {
  await page.goto('/ca/')
  const whole = page.locator('main .sc .whole')
  expect(await whole.count(), 'whole tiles on the first page').toBeGreaterThan(0)
  for (const w of await whole.all()) {
    const imgs = await w.locator('img').all(), img = imgs.at(-1)!
    // Each strip as a share of the tile's side it crosses: under 8%, the blur reads as a smear, so the mat shows (img.ts BLUR_STRIP).
    const r = Number(await img.getAttribute('width')) / Number(await img.getAttribute('height'))
    const strip = (1 - Math.min(r, 4 / 3) / Math.max(r, 4 / 3)) / 2
    if (strip < 0.08) expect(imgs, `strips of ${(strip * 100).toFixed(1)}%: on the mat, no blur`).toHaveLength(1)
    else {
      expect(imgs, `strips of ${(strip * 100).toFixed(1)}%: on itself blurred`).toHaveLength(2)
      const ground = imgs[0]!
      await expect(ground).toHaveAttribute('aria-hidden', 'true')
      expect(await ground.getAttribute('src')).toBe(await img.getAttribute('src'))
      expect(await ground.evaluate(e => getComputedStyle(e).filter)).toContain('blur')
    }
    expect(await shownWhole(img), 'the fish is cut').toBe(true)
  }
  for (const t of await page.locator('main .sc .plate > img, main .sc .plate > .whole').all()) {
    const b = (await t.boundingBox())!
    expect(Math.abs(b.width / b.height - 4 / 3), 'a tile out of the grid\'s shape').toBeLessThan(0.02)
  }
  expect(errors).toEqual([])
})

test('the fixture\'s boxed fish: each tile and head framed as the rule decides, on a computer and a phone', async ({ page }, info) => {
  test.skip(LIVE, 'reads the fixture\'s box record')
  const phone = info.project.name === 'phone'
  await page.goto('/ca/')
  const tile = (slug: string) => page.locator(`main [data-slug="${slug}"] .plate`)
  // The cherry shrimp is longer than the tile: whole, on the mat (its 3:2 photo leaves strips of 5.6%, too thin for the
  // blur). The ram sits on its photo's left edge, the discus at its top: the crop moves there. The angelfish's tile keeps
  // it, and no animal was found in the rasbora's: as today.
  await expect(tile('tep-red-cherry').locator('.whole > img')).toHaveCount(1)
  expect((await style(tile('ca-phuong-hoang').locator('img'))).pos).toBe('0% 50%')
  expect((await style(tile('ca-dia').locator('img'))).pos).toBe('50% 0%')
  for (const slug of ['ca-ong-tien', 'ca-boraras-do']) {
    await expect(tile(slug).locator('.whole'), slug).toHaveCount(0)
    expect(await style(tile(slug).locator('img')), slug).toMatchObject({ fit: 'cover', pos: '50% 50%' })
  }
  const head = async (p: Page, slug: string) => { await p.goto(`/ca/${slug}/`); return style(p.locator('main .gallery .plate img')) }
  // The cherry shrimp (960 × 640): whole on a computer; the phone's 16:9 crop keeps it.
  const shrimp = await head(page, 'tep-red-cherry')
  expect(shrimp).toMatchObject({ fit: phone ? 'cover' : 'contain', pos: '50% 50%' })
  expect(Math.abs(shrimp.ratio - (phone ? 16 / 9 : 960 / 640))).toBeLessThan(0.02)
  // The angelfish (960 × 720): the computer's 4:3 crop keeps it; whole on a phone, where 16:9 would cut it.
  expect(await head(page, 'ca-ong-tien')).toMatchObject({ fit: phone ? 'contain' : 'cover', pos: '50% 50%' })
  // The ram: moved to the left edge on a computer, centred at the phone's 16:9. The discus: moved up at both.
  expect((await head(page, 'ca-phuong-hoang')).pos).toBe(phone ? '50% 50%' : '0% 50%')
  expect(await head(page, 'ca-dia')).toMatchObject({ fit: 'cover', pos: '50% 0%' })
})

import type { Page } from '@playwright/test'
import type { AppIndex } from '../src/lib/app-index'
import { expect, test } from './fixtures'

// A fish page's "Phân bố tự nhiên" (components/RangeBlock.astro): where its sources say it lives, the sentences they
// say it in, and a map of its wild records on GBIF. The species come from the app index (`range`), so this runs on the
// fixture build and on aquatome.com, where the engine fills ranges in a few species a cycle: it skips until one has.

type Item = AppIndex['items'][number]
const index = async (page: Page): Promise<AppIndex> => (await page.request.get('/app/vi.json')).json()
/** The page of an index item ("/vi/ca/x/" → "/ca/x/"). */
const pathOf = (i: Item) => i.path.replace(/^\/vi\//, '/')
/** The fish with a block (a native part, or records), the most of a range first: native countries and records. */
const ranked = (ix: AppIndex) => ix.items.filter(i => i.kind === 'fish' && (i.range?.native?.length || i.range?.regions?.length || i.range?.records?.total))
  .sort((a, b) => Number(!!b.range!.native?.length) + Number(!!b.range!.records) - (Number(!!a.range!.native?.length) + Number(!!a.range!.records)))

test('a fish with a range says where it lives, with its sources\' sentences, and maps its wild records credited to GBIF', async ({ page, errors }) => {
  const ix = await index(page)
  const fish = ranked(ix)[0]
  test.skip(!fish, 'no fish has a range yet')
  await page.goto(pathOf(fish!))
  const block = page.locator('#muc-range')
  await expect(block.locator('h2')).toHaveText('Phân bố tự nhiên')
  // Its countries by the index's names, its regions as the index gives them.
  const words = block.locator('.words')
  for (const code of fish!.range!.native ?? []) await expect(words).toContainText(ix.countries![code]!.name)
  for (const r of fish!.range!.regions ?? []) await expect(words).toContainText(r)
  // Every line cites its sources, as the page's text does.
  if (fish!.range!.native?.length || fish!.range!.regions?.length) await expect(words.locator('a.cite').first()).toBeVisible()

  // The sentences, on request: shut at first, then each with its source, in its own language.
  const said = block.locator('details.said')
  if (await said.count()) {
    const first = said.locator('li').first()
    await expect(first).toBeHidden()
    await said.locator('summary').click()
    await expect(first).toBeVisible()
    await expect(first.locator('[lang=en]')).toHaveText(/^“.+”$/)
    await expect(first.locator('a.cite')).toHaveAttribute('href', /^https?:\/\//)
  }

  const records = fish!.range!.records
  if (records?.total) {
    await expect(block.locator('.records')).toContainText(`GBIF có ${records.total.toLocaleString('vi-VN')} ghi nhận`)
    const map = block.locator('svg.map')
    await expect(map).toBeVisible()
    // Its words for a screen reader; sized by its own box, so nothing moves when it draws; inside its column.
    await expect(map).toHaveAttribute('role', 'img')
    await expect(map).toHaveAttribute('aria-label', /^Bản đồ .+ GBIF/)
    const [w, h] = (await map.getAttribute('viewBox'))!.split(' ').slice(2).map(Number)
    const box = (await map.boundingBox())!
    expect(Math.abs(box.width / box.height - w! / h!)).toBeLessThan(0.02)
    expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    // Inside and outside apart, by a legend that names them.
    if (records.inside !== undefined) await expect(block.locator('.legend')).toContainText('Ghi nhận trong các nước bản địa')
    if (records.inside !== undefined && records.inside < records.total) await expect(block.locator('.legend')).toContainText('Ghi nhận ở nơi khác')
    const gbif = block.locator('.credit a', { hasText: 'GBIF.org' })
    await expect(gbif).toHaveAttribute('href', new RegExp(`^https://www\\.gbif\\.org/occurrence/search\\?taxon_key=${records.taxonKey}&`))
    await expect(block.locator('.credit')).toContainText('CC0, CC BY 4.0')
    await expect(block.locator('.credit')).toContainText('Natural Earth')
  } else {
    await expect(block.locator('svg.map')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('a fish without a range has no block', async ({ page }) => {
  const fish = (await index(page)).items.find(i => i.kind === 'fish' && !i.range)
  test.skip(!fish, 'every fish has a range')
  await page.goto(pathOf(fish!))
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('#muc-range')).toHaveCount(0)
})

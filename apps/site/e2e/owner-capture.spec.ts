import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'
import type { BrowserContext, Page } from '@playwright/test'

// The owner's picture in iPhone WebKit (the `iphone` project, E2E_IPHONE=1): most of its faults are WebKit's. A drawn picture has to show what's on the screen or say it doesn't, because the owner reports what they see, and
// a false blank sends someone after a bug that isn't there. Sends are stand-ins, read where the page makes them.
const flag = (context: BrowserContext, baseURL: string) => context.addCookies([{ name: 'aq_owner', value: '1', url: baseURL }])

/** Keeps what the page sends: WebKit gives Playwright no multipart body. */
const keepSends = (page: Page) => page.addInitScript(() => {
  const real = window.fetch
  window.fetch = async (u, o) => {
    if (String(u) === '/api/feedback' && o?.body instanceof FormData) {
      const image = o.body.get('image') as Blob | null
      const data = image && await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(image) })
      ;(window as unknown as { sent: unknown }).sent = { report: JSON.parse(String(o.body.get('report'))), image: data }
      return new Response(JSON.stringify({ id: 'x', waiting: 1 }), { status: 201 })
    }
    return real(u, o)
  }
})

/** A generated photo. */
const PHOTO = readFileSync(fileURLToPath(new URL('./test-photo.webp', import.meta.url)))
const webp = { contentType: 'image/webp', body: PHOTO }

/** Sends a report from the page as it stands: what the sheet said of the picture, what was sent, and the picture to read. */
async function send(page: Page) {
  await page.locator('[data-owner-report-open]').click()
  const sheet = page.locator('[data-owner-report]')
  await expect(sheet.locator('[data-owner-report-shot]')).toContainText('vẽ lại', { timeout: 60_000 })
  const said = await sheet.locator('[data-owner-report-shot]').textContent()
  await sheet.locator('textarea').fill('x')
  await sheet.getByRole('button', { name: 'Gửi' }).click()
  await expect(sheet).toHaveCount(0)
  const where = await page.evaluate(() => (window as unknown as { sent: { report: { where: Record<string, string> } } }).sent.report.where)
  return { said, where }
}

/** 25 samples across a box of the sent picture, in page pixels: the channels of each, and how far they spread. */
const read = (page: Page, box: { x: number; y: number; width: number; height: number }) => page.evaluate(async box => {
  const { image } = (window as unknown as { sent: { image: string } }).sent
  const i = new Image(); i.src = image; await i.decode()
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight
  const x = c.getContext('2d')!; x.drawImage(i, 0, 0)
  const scale = i.naturalWidth / innerWidth
  const samples: number[][] = []
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    samples.push([...x.getImageData(Math.floor((box.x + box.width * (b + 0.5) / 5) * scale), Math.floor((box.y + box.height * (a + 0.5) / 5) * scale), 1, 1).data].slice(0, 3))
  }
  const spread = Math.max(...[0, 1, 2].map(k => Math.max(...samples.map(s => s[k]!)) - Math.min(...samples.map(s => s[k]!))))
  // A mark's stripes are the one thing here that's strongly red.
  return { spread, first: samples[0]!, red: samples.some(s => s[0]! > 170 && s[1]! < 90 && s[2]! < 80) }
}, box)

const BOX = { x: 24, y: 120, width: 342, height: 260 }

/** Puts a picture on the page, loaded, over what's there: the only one, so what's counted is this one. */
const addPhoto = (page: Page, src: string) => page.evaluate(async ({ src, BOX }) => {
  for (const other of document.querySelectorAll('img')) other.remove()
  const img = document.createElement('img')
  img.src = src
  // On a flat ground, as the site's photos are: a photo WebKit is late with comes out see-through.
  img.style.cssText = `position:absolute;left:${BOX.x}px;top:${BOX.y}px;width:${BOX.width}px;height:${BOX.height}px;z-index:9;object-fit:cover;background:#fff`
  document.body.append(img)
  await img.decode()
  scrollTo(0, 0)
}, { src, BOX })

/** Text a little wider in the drawing than on the page, as it comes out in Chrome zoomed in or out: made certain here. */
const widerInTheDrawing = (page: Page) => page.addInitScript(() => {
  const real = XMLSerializer.prototype.serializeToString
  XMLSerializer.prototype.serializeToString = function (node) {
    if (node instanceof SVGElement) {
      const wider = document.createElementNS('http://www.w3.org/1999/xhtml', 'style')
      wider.textContent = '* { letter-spacing: 0.25px !important }'
      node.querySelector('foreignObject')!.firstElementChild!.prepend(wider)
    }
    return real.call(this, node)
  }
})

/** How tall the ink is inside a box of the sent picture, in page pixels: 0 for none. Against the box's first pixel. */
const inkHeight = (page: Page, box: { x: number; y: number; width: number; height: number }) => page.evaluate(async box => {
  const { image } = (window as unknown as { sent: { image: string } }).sent
  const i = new Image(); i.src = image; await i.decode()
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight
  const x = c.getContext('2d')!; x.drawImage(i, 0, 0)
  const scale = i.naturalWidth / innerWidth
  const [left, top, width, height] = [box.x, box.y, box.width, box.height].map(v => Math.round(v * scale)) as [number, number, number, number]
  const d = x.getImageData(left, top, width, height).data
  let first = -1, last = -1
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const at = (row * width + col) * 4
    if ([0, 1, 2].some(k => Math.abs(d[at + k]! - d[k]!) > 70)) { if (first < 0) first = row; last = row }
  }
  return first < 0 ? 0 : (last - first + 1) / scale
}, box)

// A drawing takes seconds, more on a busy machine.
test.describe.configure({ timeout: 120_000 })

test.beforeEach(async ({ page, context, baseURL }) => {
  await flag(context, baseURL!)
  await keepSends(page)
})

test('a soft shadow paints no grey block beside its element', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(({ x, y, width, height }) => {
    const card = document.createElement('div')
    card.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:9;background:#fff;box-shadow:0 12px 30px -18px rgb(29 42 34 / 0.35)`
    document.body.append(card)
    scrollTo(0, 0)
  }, BOX)
  await send(page)
  // Inside the margin beside the card, well above where the real shadow reaches, against the margin on the other side.
  const beside = await read(page, { x: 372, y: BOX.y + 40, width: 12, height: 120 })
  const across = await read(page, { x: 6, y: BOX.y + 40, width: 12, height: 120 })
  for (const k of [0, 1, 2]) expect(Math.abs(beside.first[k]! - across.first[k]!), `channel ${k}`).toBeLessThan(12)
})

test('a row scrolled sideways is drawn where it\'s scrolled to', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(({ x, y, width, height }) => {
    const row = document.createElement('div')
    row.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:9;overflow-x:auto;display:flex`
    row.innerHTML = `<div style="flex:none;width:${width}px;background:#2f6b4f"></div><div style="flex:none;width:${width}px;background:#1d4ed8"></div>`
    document.body.append(row)
    row.scrollLeft = width
    scrollTo(0, 0)
  }, BOX)
  await send(page)
  // The second block, blue, is what shows; the first, green, is scrolled out of the row.
  const [r, g, b] = (await read(page, { x: BOX.x + 20, y: BOX.y + 20, width: BOX.width - 40, height: BOX.height - 40 })).first
  expect(b, `drew ${r},${g},${b}`).toBeGreaterThan(150)
  expect(g).toBeLessThan(120)
})

// The owner's Heckel page, 10 Nov: labels broke onto a second line in their chips, and a shop fell out of its row.
test('a chip and the shop picker keep their lines when the text measures wider in the drawing', async ({ page }) => {
  await widerInTheDrawing(page)
  await page.goto('/ca/ca-neon-vua/')
  const chip = page.locator('a[data-go]').first()
  await chip.scrollIntoViewIfNeeded()
  const shops = await page.locator('[data-shop-pick] button').all()
  const lastShop = (await shops.at(-1)!.boundingBox())!, firstShop = (await shops[0]!.boundingBox())!
  expect(lastShop.y, 'the shops are one row on the page').toBe(firstShop.y)
  const box = (await chip.boundingBox())!
  await send(page)
  const label = await inkHeight(page, { x: box.x + 14, y: box.y + 3, width: box.width - 44, height: box.height - 6 })
  expect(label, 'the label is one line').toBeGreaterThan(0)
  expect(label, 'the label is one line').toBeLessThan(30)
  const inPlace = await inkHeight(page, { x: lastShop.x + 6, y: lastShop.y + 8, width: lastShop.width - 12, height: lastShop.height - 16 })
  expect(inPlace, 'the last shop is still in its row').toBeGreaterThan(0)
})

test('a photo is in the picture, not a blank', async ({ page }) => {
  await page.route(url => url.hostname === 'media.aquatome.com', route => route.fulfill(webp))
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.fulfill(webp))
  await page.goto('/')
  await addPhoto(page, 'https://media.aquatome.com/photo.webp')
  const { where, said } = await send(page)
  expect(where.picture).toBe('drawn')
  expect(where.notDrawn, said!).toBeUndefined()
  expect((await read(page, BOX)).spread).toBeGreaterThan(40)
})

test('a photo that doesn\'t come out in the drawing is marked, with the sheet open over the page', async ({ page }) => {
  // The page shows the photo; what the drawing gets of it breaks there, as a photo WebKit is late with comes out blank.
  await page.route(url => url.hostname === 'media.aquatome.com', route => route.fulfill(webp))
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.fulfill({ contentType: 'image/webp', body: 'not a photo' }))
  await page.goto('/')
  await addPhoto(page, 'https://media.aquatome.com/photo.webp')
  const { where, said } = await send(page)
  expect(said).toContain('thiếu 1 chỗ')
  expect(where.notDrawn).toBe('1')
  expect((await read(page, BOX)).red).toBe(true)
})

test('a photo it can\'t read is marked in the picture, and the sheet and the report say so', async ({ page }) => {
  await page.route(url => url.hostname === 'media.aquatome.com', route => route.fulfill(webp))
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.fulfill({ status: 401, json: { error: 'signed_out' } }))
  await page.goto('/')
  await addPhoto(page, 'https://media.aquatome.com/photo.webp')
  const { where, said } = await send(page)
  expect(said).toContain('thiếu 1 chỗ')
  expect(where.picture).toBe('drawn')
  expect(where.notDrawn).toBe('1')
  expect((await read(page, BOX)).red).toBe(true)
})

test('another site\'s frame is marked, not left blank', async ({ page }) => {
  await page.route(url => url.hostname === 'frame.test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>video</p>' }))
  await page.goto('/')
  await page.evaluate(({ x, y, width, height }) => {
    const frame = document.createElement('iframe')
    frame.src = 'https://frame.test/'
    frame.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:9;border:0`
    document.body.append(frame)
    scrollTo(0, 0)
  }, BOX)
  const { where } = await send(page)
  expect(where.notDrawn).toBe('1')
  expect((await read(page, BOX)).red).toBe(true)
})

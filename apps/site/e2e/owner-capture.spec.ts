import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'
import type { BrowserContext, Page } from '@playwright/test'

// The owner's picture in iPhone WebKit (the `iphone` project, E2E_IPHONE=1): its faults are WebKit's, and Chromium has none
// of them. A drawn picture has to show what's on the screen or say it doesn't, because the owner reports what they see, and
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

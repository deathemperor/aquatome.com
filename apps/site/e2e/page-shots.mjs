// Before and after (docs/governance.md, rule 6 of every change): the same pages of two builds, screenshotted at a phone's
// and a computer's size, and the pairs that differ kept side by side.
//
//   node e2e/page-shots.mjs <before dist> <after dist> <out dir> [path,path…]
//
// Pages: the paths given, else a sample of the after build (one or two of each kind of page, e2e/pages.ts samplePages).
// <out dir>/summary.md lists the pages that look different, new or gone; each different one has
// <slug>/<phone|computer>/{before,after,side-by-side}.png. A page whose shots are the same bytes in both is left out.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { allPages, samplePages } from './pages.ts'

const [beforeDir, afterDir, outDir, only] = process.argv.slice(2)
if (!beforeDir || !afterDir || !outDir) throw new Error('usage: node e2e/page-shots.mjs <before dist> <after dist> <out dir> [path,path…]')
const out = resolve(outDir)
// The other checks' sizes (playwright.config.ts): a Pixel 7 phone and a 1280 px computer. Phone shots at 1x: smaller
// files, and both builds are drawn the same way.
const SIZES = {
  phone: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
  computer: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
}
// A long page is cut at this many screens.
const SCREENS = 6
// Every picture from elsewhere (the media host too: the fixture's pictures aren't there) is a grey box, so both builds draw
// the same thing and a broken-picture icon never shows as a difference; any other outside request is dropped.
const GREY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#d6d6d6"/></svg>'

const serve = (dir, port) => {
  const p = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname, dir, String(port)], { stdio: 'inherit' })
  return { port, stop: () => p.kill() }
}
const after = allPages(resolve(afterDir))
const before = new Set(allPages(resolve(beforeDir)))
const pages = only ? only.split(',') : samplePages(after)
// E2E_PORT: the before build's port (the after build's is the next), when another checkout's checks hold 4511.
const PORT = Number(process.env.E2E_PORT ?? 4511)
const servers = [serve(beforeDir, PORT), serve(afterDir, PORT + 1)]
const browser = await chromium.launch()
await new Promise(r => setTimeout(r, 500))

async function shot(context, port, path) {
  const page = await context.newPage()
  const own = `http://127.0.0.1:${port}`
  await page.route(url => url.origin !== own, r => (r.request().resourceType() === 'image' ? r.fulfill({ contentType: 'image/svg+xml', body: GREY }) : r.abort()))
  const res = await page.goto(own + path, { waitUntil: 'load' })
  if (!res || res.status() === 404) { await page.close(); return null }
  await page.evaluate(() => document.fonts.ready)
  // The page's scripts (filters, counts) run after load; a list opened with filters waits for its data file.
  await page.waitForTimeout(800)
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5000 }).catch(() => {})
  const { width, height } = page.viewportSize()
  const full = await page.evaluate(() => document.documentElement.scrollHeight)
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', clip: { x: 0, y: 0, width, height: Math.min(full, height * SCREENS) } })
  await page.close()
  return png
}

const slug = path => path.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '-') || 'root'
const changed = []
const added = []
// Pages a few at a time (each waits on its scripts more than it draws).
const AT_ONCE = 6
for (const [size, device] of Object.entries(SIZES)) {
  const context = await browser.newContext({ ...device, colorScheme: 'light', reducedMotion: 'reduce' })
  const shots = new Map()
  for (let i = 0; i < pages.length; i += AT_ONCE) {
    await Promise.all(pages.slice(i, i + AT_ONCE).map(async path => {
      const a = await shot(context, PORT + 1, path)
      shots.set(path, [a, a && before.has(path) ? await shot(context, PORT, path) : null])
    }))
  }
  for (const path of pages) {
    const [a, b] = shots.get(path)
    if (!a || (b && Buffer.compare(a, b) === 0)) continue
    const dir = join(out, slug(path), size)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'after.png'), a)
    if (!b) { if (!added.includes(path)) added.push(path); continue }
    writeFileSync(join(dir, 'before.png'), b)
    // The pair side by side, drawn by the browser from a page of two pictures.
    const html = join(dir, 'pair.html')
    writeFileSync(html, `<!doctype html><style>body{margin:0;display:flex;gap:16px;padding:16px;background:#888;font:600 20px system-ui;align-items:flex-start}figure{margin:0}figcaption{color:#fff;padding:0 0 8px}img{display:block}</style><figure><figcaption>before</figcaption><img src="before.png"></figure><figure><figcaption>after</figcaption><img src="after.png"></figure>`)
    const page = await browser.newPage()
    await page.goto(pathToFileURL(html).href)
    await page.screenshot({ path: join(dir, 'side-by-side.png'), fullPage: true })
    await page.close()
    changed.push(`${path} (${size})`)
  }
  await context.close()
}
await browser.close()
for (const s of servers) s.stop()

const gone = [...before].filter(p => !after.includes(p))
const list = xs => xs.map(x => `- ${x}`).join('\n')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'summary.md'), [
  `${pages.length} pages compared, at a phone's size (Pixel 7, 412 px) and a computer's (1280 px).`,
  changed.length ? `\nLook different (before, after, side by side):\n${list(changed)}` : '\nNo page compared looks different.',
  added.length ? `\nNew pages (after only):\n${list(added)}` : '',
  gone.length ? `\nPages gone:\n${list(gone)}` : '',
].filter(Boolean).join('\n') + '\n')
console.log(`${pages.length} pages: ${changed.length} shots differ, ${added.length} new pages, ${gone.length} gone (${out}/summary.md)`)

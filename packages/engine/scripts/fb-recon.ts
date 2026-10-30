/**
 * Saves raw Facebook pages for the parser fixtures (test/fixtures/facebook). Re-run when Facebook changes its markup.
 * Logged in: uses the engine's Chrome profile (log the spare account in by hand first; no engine cycle running).
 * --logged-out: a fresh temporary profile, to capture the login wall.
 * Output: /tmp/aqfb-recon/<name>.html (raw; trim and strip other people's names before committing).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/fb-recon.ts [--logged-out] [--album <url>] [--photo <url>] [--post <url>]
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { FB } from '../src/facebook/config'

const OUT = '/tmp/aqfb-recon'
const { values } = parseArgs({ options: { 'logged-out': { type: 'boolean' }, album: { type: 'string' }, photo: { type: 'string' }, post: { type: 'string' }, headless: { type: 'boolean' } } })
const profileDir = values['logged-out'] ? await mkdtemp(join(tmpdir(), 'aqfb-')) : join(homedir(), '.cache/thuysinh/chrome-profile')
const ctx = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: !!values.headless, locale: 'en-US', viewport: { width: 1280, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await mkdir(OUT, { recursive: true })

async function save(name: string, url: string, scrolls = 0) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(FB.polite)
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(FB.polite)
  }
  for (const b of await page.getByRole('button', { name: /^(See more|Xem thêm)$/ }).all()) await b.click().catch(() => {})
  await writeFile(join(OUT, `${name}.html`), await page.content())
  console.log(`${name}: ${page.url()} (${await page.title()})`)
}

try {
  await save('timeline', FB.profile, 3)
  await save('albums', `${FB.profile}photos_albums`, 2)
  if (values.album) await save('album', values.album, 2)
  if (values.photo) await save('photo', values.photo)
  if (values.post) await save('post-many', values.post)
} finally {
  await ctx.close()
}

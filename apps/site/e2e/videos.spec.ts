import type { APIRequestContext } from '@playwright/test'
import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// On an iPhone a YouTube embed without playsinline=1 leaves the page for iOS's full-screen player as it starts; with it
// the video plays where it was tapped, as on X (the owner, 2026-11-03). These checks run offline, so the player's own
// page never loads: what's checked is the address the site gives it. Both pages are found from the site itself, as no
// species has videos on both the test build and aquatome.com: the first species page with one, and the newest video guide.
const inline = (src: string | null) => new URL(src!).searchParams.get('playsinline')

async function speciesWithVideo(request: APIRequestContext): Promise<string> {
  const species = sourcePages().filter(p => /^\/ca\/[^/]+\/$/.test(p))
  // Twenty at a time: one at a time took 18 s of the test's 30 on aquatome.com, where the first with a video was the 12th.
  for (let i = 0; i < species.length; i += 20) {
    const batch = species.slice(i, i + 20)
    // The section, not the attribute's name: every species page's inline script names that.
    const has = await Promise.all(batch.map(async p => (await (await request.get(p)).text()).includes('<section class="videos"')))
    const hit = batch.find((_, j) => has[j])
    if (hit) return hit
  }
  throw new Error('no species page has a video')
}

test("a species page's video plays where it was tapped", async ({ page, request, errors }) => {
  await page.goto(await speciesWithVideo(request))
  await page.locator('.videos button[data-youtube-id]').first().click()
  const frame = page.locator('.videos iframe').first()
  await expect(frame).toHaveCount(1)
  expect(inline(await frame.getAttribute('src'))).toBe('1')
  expect(errors).toEqual([])
})

test("a guide's video plays where it was tapped, also when YouTube's control script can't load", async ({ page, errors }) => {
  await page.goto('/video/')
  await page.locator('section[aria-labelledby="new-h"] a[href^="/huong-dan/"]').first().click()
  await page.locator('.vp .facade').click()
  // Offline, YouTube's control script fails, so this is the plain embed the page falls back to.
  const frame = page.locator('.vp .frame iframe')
  await expect(frame).toHaveCount(1)
  expect(inline(await frame.getAttribute('src'))).toBe('1')
  expect(errors).toEqual([])
})

import { expect, test } from './fixtures'

// On an iPhone a YouTube embed without playsinline=1 leaves the page for iOS's full-screen player as it starts; with it
// the video plays where it was tapped, as on X (the owner, 2026-11-03). These checks run offline, so the player's own
// page never loads: what's checked is the address the site gives it.
const inline = (src: string | null) => new URL(src!).searchParams.get('playsinline')

test("a species page's video plays where it was tapped", async ({ page, errors }) => {
  await page.goto('/vi/ca/ca-neon-vua/')
  await page.locator('.videos button[data-youtube-id]').first().click()
  const frame = page.locator('.videos iframe').first()
  await expect(frame).toHaveCount(1)
  expect(inline(await frame.getAttribute('src'))).toBe('1')
  expect(errors).toEqual([])
})

test("a guide's video plays where it was tapped, also when YouTube's control script can't load", async ({ page, errors }) => {
  await page.goto('/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/')
  await page.locator('.vp .facade').click()
  // Offline, YouTube's control script fails, so this is the plain embed the page falls back to.
  const frame = page.locator('.vp .frame iframe')
  await expect(frame).toHaveCount(1)
  expect(inline(await frame.getAttribute('src'))).toBe('1')
  expect(errors).toEqual([])
})

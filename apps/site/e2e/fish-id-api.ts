import type { Page } from '@playwright/test'

// The fish-ID tool's endpoint and Turnstile, as stand-ins: no check ever sends a photo to the real endpoint (they run on
// aquatome.com too, watch.yml), and Turnstile passes at once. The tool's page (fish-id.spec.ts) and the "Bể của tôi"
// editor (my-tanks.spec.ts) use them.

/** A 1×1 PNG: enough for the browser to decode, shrink and send as JPEG. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

export type Reply = { status: number; body: unknown }
/** /api/fish-id: GET answers `status` (as it is when asked); each POST the next of `posts`, its body kept in `sent`. */
export async function mockFishId(page: Page, status: Reply, posts: Reply[] = []) {
  const sent: string[] = []
  await page.route('**/api/fish-id', async route => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ status: status.status, json: status.body })
    sent.push(req.postDataBuffer()?.toString('latin1') ?? '')
    const r = posts.shift() ?? { status: 500, body: { error: 'x' } }
    return route.fulfill({ status: r.status, json: r.body })
  })
  return sent
}
/** Turnstile's script: a widget that passes at once, and again after each reset. */
export async function fakeTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let cb; let n = 0; window.turnstile = { render(el, o) { cb = o.callback; setTimeout(() => cb('token-' + ++n), 10); return 'w' }, reset() { setTimeout(() => cb('token-' + ++n), 10) } }`,
  }))
}

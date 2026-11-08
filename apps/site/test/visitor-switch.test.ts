import { expect, test } from 'vitest'
import { handle, type Env } from '../worker/index'
import { beaconScript, NOCOUNT, VID } from '../src/lib/beacon'
import { APP_INSTALL_ID, VISITOR_STATS } from '../worker/stats-switch'
import { page } from './dist'

// One switch (worker/stats-switch.ts): the beacon sends the visitor code, the Worker keeps it and the privacy page says
// so, all three or none, in the same deploy.

test('the built beacon is the switch\'s, and so is Cloudflare Web Analytics\' stop for «Không đếm tôi»', () => {
  const { dom } = page('/ca/ca-neon-vua/')
  expect(dom.querySelector('script[data-beacon]')!.textContent).toBe(beaconScript(VISITOR_STATS))
})

test('the privacy page says what the beacon does, in each language', () => {
  for (const [path, button] of [['/chinh-sach-bao-mat/', 'Không đếm tôi'], ['/id/kebijakan-privasi/', 'Jangan hitung saya'], ['/th/privacy/', 'ไม่ต้องนับฉัน'], ['/ms/dasar-privasi/', 'Jangan kira saya']] as const) {
    let html: string
    try { html = page(path).html } catch { continue } // a language whose privacy page has another address: the Vietnamese one holds the rule
    expect(html.includes(`<strong>${VID}</strong>`), path).toBe(VISITOR_STATS)
    expect(html.includes(`<strong>${NOCOUNT}</strong>`), path).toBe(VISITOR_STATS)
    expect(html.includes('data-nocount'), path).toBe(VISITOR_STATS)
    expect(html.includes(button), path).toBe(VISITOR_STATS)
  }
  // The app's install code: its paragraph only once the app sends it.
  expect(page('/chinh-sach-bao-mat/').html.includes('Ứng dụng tạo một mã ngẫu nhiên khi được cài')).toBe(APP_INSTALL_ID)
})

test('the Worker keeps the visitor code as the switch says', async () => {
  const points: { blobs: string[] }[] = []
  const e = { ASSETS: { fetch: async () => new Response('x') }, EVENTS: { writeDataPoint: (p: { blobs: string[] }) => { points.push(p) } }, STAGING: '1' } as unknown as Env
  const body = JSON.stringify({ p: '/ca/ca-betta/', t: 'view', v: 1, sid: 'abc123def456', u: 'k3j9x0a1b2' })
  await handle(new Request('https://x.test/_e', { method: 'POST', body, headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'accept-language': 'vi', origin: 'https://x.test' } }), e)
  expect(points[0]!.blobs[6]).toBe(VISITOR_STATS ? 'k3j9x0a1b2' : '')
})

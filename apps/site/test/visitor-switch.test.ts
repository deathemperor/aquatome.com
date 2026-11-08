import { readFileSync } from 'node:fs'
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
  // With the visitor code on, events can be linked, so the app's events aren't called anonymous either ("as the website does").
  const vi = page('/chinh-sach-bao-mat/').html
  expect(vi.includes('gửi các sự kiện ẩn danh như trang web'), 'vi').toBe(!VISITOR_STATS)
  expect(vi.includes('sends anonymous events, as the website does'), 'en').toBe(!VISITOR_STATS)
  for (const [path, anon] of [['/id/kebijakan-privasi/', 'mengirim peristiwa anonim seperti situs web'], ['/th/privacy/', 'ส่งเหตุการณ์แบบไม่ระบุตัวตนเช่นเดียวกับเว็บไซต์'], ['/ms/dasar-privasi/', 'menghantar peristiwa tanpa nama sama seperti laman web']] as const) {
    let html: string
    try { html = page(path).html } catch { continue }
    expect(html.includes(anon), path).toBe(!VISITOR_STATS)
  }
})

test('the line on how to stop being counted names the button as each language shows it', () => {
  const src = readFileSync(new URL('../src/pages/chinh-sach-bao-mat/index.astro', import.meta.url), 'utf8')
  const button = (label: string) => src.includes(`<button type="button" data-nocount aria-pressed="false">${label}</button>`)
  // Vietnamese, and the English part of the same page, which has its own button under "Cookies and storage".
  expect(button("{t('Không đếm tôi')}")).toBe(true)
  expect(src).toContain('Muốn không bị đếm nữa, bấm “Không đếm tôi” ở mục 3.')
  expect(button("Don't count me")).toBe(true)
  expect(src).toContain('To stop being counted, press \\"Don\'t count me\\" under Cookies and storage below.')
  for (const lang of ['id', 'th', 'ms']) {
    const words = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
    const stats = Object.entries(words).find(([k]) => k.startsWith('Để biết trang nào hữu ích và người đọc có quay lại không'))![1]
    expect(stats, lang).toContain(`“${words['Không đếm tôi']}”`)
  }
})

test('the Worker keeps the visitor code as the switch says', async () => {
  const points: { blobs: string[] }[] = []
  const e = { ASSETS: { fetch: async () => new Response('x') }, EVENTS: { writeDataPoint: (p: { blobs: string[] }) => { points.push(p) } }, STAGING: '1' } as unknown as Env
  const body = JSON.stringify({ p: '/ca/ca-betta/', t: 'view', v: 1, sid: 'abc123def456', u: 'k3j9x0a1b2' })
  await handle(new Request('https://x.test/_e', { method: 'POST', body, headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'accept-language': 'vi', origin: 'https://x.test' } }), e)
  expect(points[0]!.blobs[6]).toBe(VISITOR_STATS ? 'k3j9x0a1b2' : '')
})

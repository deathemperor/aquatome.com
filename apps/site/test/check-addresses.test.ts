import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { missingAddresses } from '../scripts/check-addresses'

// The build's last word on its addresses (scripts/check-addresses.ts): the live checks of 14 Nov found a photo page in the
// sitemap that the build never made. A build folder of a few pages, in the system's temp folder.
const dist = mkdtempSync(join(tmpdir(), 'aq-check-addresses-'))
afterAll(() => rmSync(dist, { recursive: true, force: true }))
const page = (path: string) => { mkdirSync(join(dist, path), { recursive: true }); writeFileSync(join(dist, path, 'index.html'), '<h1>x</h1>') }
const urlset = (paths: string[]) => `<urlset>${paths.map(p => `<url><loc>https://aquatome.com${p}</loc></url>`).join('')}</urlset>`

test("the sitemaps' addresses and the redirects' targets with no page are named; those with one aren't", () => {
  for (const p of ['/', '/cay/cryptocoryne-spiralis-red/', '/ms/tumbuhan/cryptocoryne-spiralis-red/', '/ca/ca-dia/', '/id/asal/asia/amerika-serikat/']) page(p)
  writeFileSync(join(dist, 'sitemap.xml'), '<sitemapindex><sitemap><loc>https://aquatome.com/sitemap-plants.xml</loc></sitemap><sitemap><loc>https://aquatome.com/sitemap-plant-photos.xml</loc></sitemap></sitemapindex>')
  writeFileSync(join(dist, 'sitemap-plants.xml'), urlset(['/cay/cryptocoryne-spiralis-red/', '/ms/tumbuhan/cryptocoryne-spiralis-red/']))
  writeFileSync(join(dist, 'sitemap-plant-photos.xml'), urlset(['/cay/cryptocoryne-spiralis-red/anh/', '/ms/tumbuhan/cryptocoryne-spiralis-red/foto/']))
  writeFileSync(join(dist, 'redirects.json'), JSON.stringify({
    '/ca/ca-dia-nau/': '/ca/ca-dia/?tu=ca-dia-nau',
    '/cay/ten-cu/anh/': '/cay/cryptocoryne-spiralis-red/anh/',
    '/id/asal/asia/usa/': '/id/asal/asia/amerika-serikat/',
    '/ca/ca-khac/': '/ca/ca-khong-co/',
  }))
  expect(missingAddresses(dist)).toEqual({
    sitemap: ['/cay/cryptocoryne-spiralis-red/anh/', '/ms/tumbuhan/cryptocoryne-spiralis-red/foto/'],
    redirects: ['/cay/cryptocoryne-spiralis-red/anh/', '/ca/ca-khong-co/'],
  })
  // Once the photo pages are built, only the redirect to a page that isn't there is left.
  page('/cay/cryptocoryne-spiralis-red/anh/')
  page('/ms/tumbuhan/cryptocoryne-spiralis-red/foto/')
  expect(missingAddresses(dist)).toEqual({ sitemap: [], redirects: ['/ca/ca-khong-co/'] })
})

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { LANG } from '@aq/schema/langs'
import { DIST, page, sitemapText } from './dist'

// Malay is served (the language table's `served: true`): the fixture's Malay files, one of each kind the engine writes,
// are pages at Malay's addresses, in Malay, in the sitemap and in the app's index.
const FIXTURE = fileURLToPath(new URL('./fixture-content', import.meta.url))
const PAGES: Record<string, [string, string]> = {
  'species/apistogramma-cacatuoides': ['/ms/ikan/ikan-uji-melayu/', 'Ikan Uji Melayu'],
  'breeds/flowerhorn-cichlid': ['/ms/ikan/baka-uji-melayu/', 'Baka Uji Melayu'],
  'plants/alternanthera-reineckii-mini': ['/ms/tumbuhan/tumbuhan-uji-melayu/', 'Tumbuhan Uji Melayu'],
  'guides/aquariumcoop-blogs-aquarium-5-gallon-fish': ['/ms/panduan/panduan-uji-melayu/', 'Panduan Uji Melayu'],
  'glossary/ca-dan': ['/ms/istilah/istilah-uji-melayu/', 'Istilah Uji Melayu'],
}

test('the fixture\'s Malay files are pages at its addresses, in its sitemap and in the app\'s index', () => {
  expect(LANG.ms.served).toBe(true)
  const sitemap = sitemapText()
  const app = JSON.parse(readFileSync(join(DIST, 'app/ms.json'), 'utf8')) as { lang: string; items: { path: string }[] }
  expect(app.lang).toBe('ms')
  for (const [file, [path, name]] of Object.entries(PAGES)) {
    expect(existsSync(join(FIXTURE, file, 'ms.json')), file).toBe(true)
    const { dom } = page(path)
    expect(dom.querySelector('html')!.getAttribute('lang'), path).toBe('ms')
    expect(dom.querySelector('meta[property="og:locale"]')!.getAttribute('content'), path).toBe('ms_MY')
    expect(dom.querySelector('h1')!.text, path).toContain(name)
    expect(sitemap, path).toContain(`${path}</loc>`)
    expect(app.items.map(i => i.path), path).toContain(path)
  }
  expect(page('/ms/').dom.querySelector('html')!.getAttribute('lang')).toBe('ms')
})

test('a breed\'s parent its translation left unnamed, with no page in the language, is marked Vietnamese, as translated text marks names', () => {
  // The fixture's Malay breed has no `parents`: the discus, with no Malay page, keeps its Vietnamese name.
  const parents = page('/ms/ikan/baka-uji-melayu/').dom.querySelector('.parents')!
  expect(parents.querySelectorAll('[lang="vi"]').map(x => x.text)).toEqual(['Cá đĩa'])
  expect(parents.text).toContain('Amphilophus trimaculatus')
  // A Vietnamese page marks nothing.
  expect(page('/ca/ca-la-han/').dom.querySelectorAll('.parents [lang="vi"]')).toHaveLength(0)
})

test('a photo site\'s own Vietnamese name in a gallery\'s line is marked Vietnamese, as the about page marks it', () => {
  const lead = page('/ms/ikan/baka-uji-melayu/foto/').dom.querySelector('.lead')!
  expect(lead.querySelectorAll('[lang="vi"]').map(x => x.text)).toEqual(['Diễn Đàn Cá Cảnh'])
  expect(page('/ca/ca-la-han/anh/').dom.querySelectorAll('.lead [lang="vi"]')).toHaveLength(0)
})

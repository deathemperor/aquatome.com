import { expect, test } from 'vitest'
import { onePerKind } from '../e2e/pages'

test('onePerKind: the first page of each kind, then the extras, none twice', () => {
  // aquatome.com's sitemap lists the tank-mates page first among the tools; the Lighthouse check also names it, and a
  // duplicate test title stopped the whole watch run.
  const sitemap = ['/', '/cong-cu/', '/cong-cu/nuoi-chung/', '/cong-cu/the-tich-be/', '/th/']
  const pages = onePerKind(sitemap, ['vi//1', 'vi/cong-cu/2', 'vi/cong-cu/3', 'th//1', 'vi/ca/2'], ['/cong-cu/nuoi-chung/'])
  expect(pages).toEqual(['/', '/cong-cu/', '/cong-cu/the-tich-be/', '/th/', '/cong-cu/nuoi-chung/'])
  expect(new Set(pages).size).toBe(pages.length)
})

test('the Lighthouse sample takes a kind\'s first page that search engines are offered', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { indexed } = await import('../e2e/pages')
  const dist = await mkdtemp(join(tmpdir(), 'dist-'))
  const page = async (path: string, head: string) => { await mkdir(join(dist, path), { recursive: true }); await writeFile(join(dist, path, 'index.html'), `<html><head>${head}</head></html>`) }
  // Deploy 41244864797: a new thin plant page sorted first and its noindex failed the SEO score.
  await page('cay/ammannia-gracilis', '<meta name="robots" content="noindex, follow" />')
  await page('cay/anubias-barteri', '<title>x</title>')
  const paths = ['/cay/ammannia-gracilis/', '/cay/anubias-barteri/']
  expect(onePerKind(paths, ['vi/cay/3'], [], p => indexed(p, dist))).toEqual(['/cay/anubias-barteri/'])
  expect(onePerKind(paths, ['vi/cay/3'])).toEqual(['/cay/ammannia-gracilis/'])
})

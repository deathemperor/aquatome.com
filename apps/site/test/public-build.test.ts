import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'

const site = fileURLToPath(new URL('..', import.meta.url))
// Inside the site (gitignored .astro/), not the OS temp dir: Astro moves built files into OUT_DIR with rename(), which
// fails across filesystems (EXDEV), and some CI runners mount /tmp separately from the checkout.
mkdirSync(join(site, '.astro'), { recursive: true })
const out = mkdtempSync(join(site, '.astro', 'public-build-'))

beforeAll(() => {
  execFileSync('pnpm', ['exec', 'astro', 'build'], { cwd: site, env: { ...process.env, PUBLIC_BUILD: '1', OUT_DIR: out }, stdio: 'pipe' })
}, 120_000)
afterAll(() => rmSync(out, { recursive: true, force: true }))

test('public build with no cleared sources publishes no species, plants or guides', () => {
  expect(existsSync(join(out, 'vi', 'ca', 'ca-neon-vua'))).toBe(false)
  // Breed pages are AquaTome's own writing from cited research (like products): they don't depend on cleared sources.
  expect(readdirSync(join(out, 'vi', 'ca')).filter(f => f !== 'index.html').sort()).toEqual(['ca-dia-pigeon-blood', 'ca-la-han'])
  expect(readdirSync(join(out, 'vi', 'cay')).filter(f => f !== 'index.html')).toEqual([])
  expect(existsSync(join(out, 'vi', 'huong-dan', 'setup-be-thuy-sinh-dau-tien'))).toBe(false)
})
test('home page shows an empty state instead of failing', () => {
  expect(readFileSync(join(out, 'vi', 'index.html'), 'utf8')).toContain('Chưa có hồ sơ loài nào được xuất bản.')
})

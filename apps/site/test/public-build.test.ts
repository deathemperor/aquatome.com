import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'

const out = mkdtempSync(join(tmpdir(), 'aq-public-'))
const site = fileURLToPath(new URL('..', import.meta.url))

beforeAll(() => {
  execFileSync('pnpm', ['exec', 'astro', 'build'], { cwd: site, env: { ...process.env, PUBLIC_BUILD: '1', OUT_DIR: out }, stdio: 'pipe' })
}, 120_000)

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

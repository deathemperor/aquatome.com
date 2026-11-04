import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { expect, test } from 'vitest'
import { oneFishEach, tankCheck, type TankCheck, type TankFish, type TankSize } from '../src/scripts/tank-check'

// Shared with the iOS app's tests, which run the bundled copy of this code in JavaScriptCore on the same cases.
type Case = { note: string; lang: 'vi' | 'id' | 'th'; fish: TankFish[]; unlisted?: string[]; size: TankSize; check: TankCheck }
const { cases }: { cases: Case[] } = JSON.parse(readFileSync(new URL('../../../protocols/tankmates-vectors.json', import.meta.url), 'utf8'))
const bundle = new URL('../../ios/AquaTomeKit/Sources/TankCheck/tank-check.js', import.meta.url)

// A Vietnamese page's ct (the strings as they are) and the tool's fmt.
const ct = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s)
const fmt = (n: number, d = 1) => new Intl.NumberFormat('vi', { maximumFractionDigits: d }).format(n)

test('a saved tank gets the tank-mates tool\'s verdict, warnings and stocking', () => {
  expect(cases.filter(c => c.lang === 'vi').length).toBeGreaterThan(5)
  for (const c of cases.filter(c => c.lang === 'vi')) expect(tankCheck(c.fish, c.size, ct, fmt, c.unlisted), c.note).toEqual(c.check)
})

test('a tank\'s rows are one fish for each key, adding a row never lowering its number, a breed named as its species beside it', () => {
  const neon = (count?: number): TankFish => ({ key: 'neon', name: 'Cá neon', schoolMin: 6, ...(count === undefined ? {} : { count }) })
  const betta: TankFish = { key: 'betta', name: 'Cá betta', count: 1 }
  // One page put on twice (from its page, and by name before it had one): the numbers added up, in the first one's place.
  expect(oneFishEach([neon(10), betta, neon(5)])).toEqual([{ name: 'Cá neon', schoolMin: 6, count: 15 }, { name: 'Cá betta', count: 1 }])
  // A row without a number is a school, the number not given: the other row's 4 doesn't bring the 6 down; 10 is more.
  expect(oneFishEach([neon(), neon(4)])).toEqual([{ name: 'Cá neon', schoolMin: 6, count: 6 }])
  expect(oneFishEach([neon(4), neon()])).toEqual([{ name: 'Cá neon', schoolMin: 6, count: 6 }])
  expect(oneFishEach([neon(), neon(10)])).toEqual([{ name: 'Cá neon', schoolMin: 6, count: 10 }])
  // No school size: one.
  expect(oneFishEach([{ key: 'tep', name: 'Tép' }, { key: 'tep', name: 'Tép', count: 3 }])).toEqual([{ name: 'Tép', count: 3 }])
  // None given stays none, for the check to read as it reads one row.
  expect(oneFishEach([neon(), neon()])).toEqual([{ name: 'Cá neon', schoolMin: 6 }])
  // Rows with no key are each a fish of their own, even with one name.
  expect(oneFishEach([{ name: 'Cá neon', count: 2 }, { name: 'Cá neon', count: 3 }])).toHaveLength(2)
  // A breed alone is named as the reader added it; beside its species, or another breed of it, as the species.
  const halfmoon: TankFish = { key: 'betta', name: 'Cá betta Halfmoon', species: 'Cá betta', count: 1 }
  expect(oneFishEach([halfmoon]).map(f => f.name)).toEqual(['Cá betta Halfmoon'])
  expect(oneFishEach([halfmoon, betta]).map(f => f.name)).toEqual(['Cá betta'])
  expect(oneFishEach([halfmoon, { ...halfmoon, name: 'Betta đuôi tưa' }]).map(f => [f.name, f.count])).toEqual([['Cá betta', 2]])
})

test('the app\'s copy is built from this code, and answers each case in its language', () => {
  // Fails after a change to tank-check.ts, tankmates.ts, stocking.ts or calc.ts until the app's copy is built again.
  expect(() => execFileSync('node', [fileURLToPath(new URL('../scripts/app-tank-check.mjs', import.meta.url)), '--check'], { stdio: 'pipe' })).not.toThrow()
  const ctx = vm.createContext({})
  vm.runInContext(readFileSync(bundle, 'utf8'), ctx)
  const run = (c: Case) => JSON.parse((ctx.aqTankCheck as (s: string) => string)(JSON.stringify({ lang: c.lang, fish: c.fish, size: c.size, unlisted: c.unlisted })))
  for (const c of cases) expect(run(c), c.note).toEqual(c.check)
  expect(cases.some(c => c.lang === 'id') && cases.some(c => c.lang === 'th')).toBe(true)
})

test('the tool page writes its verdict, warnings and meter with this code, so the app\'s copy can\'t say other words', () => {
  const page = readFileSync(new URL('../src/pages/cong-cu/nuoi-chung.astro', import.meta.url), 'utf8')
  expect(page).toMatch(/import \{ LEVEL, stockingNotes, verdictSentence, warningsOf \} from '..\/..\/scripts\/tank-check'/)
  for (const copy of ['có thể ăn {small}', 'Còn thưa', 'sống theo đàn: nên nuôi từ', 'chưa tính vào mật độ']) expect(page, copy).not.toContain(copy)
})

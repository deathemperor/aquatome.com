import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { CHIHIROS_LINES, chihirosLine, controlOf, modelWords, PLUG_FAMILIES } from '../src/devices'

test('a model\'s words: II and 2 alike, joined or apart, a size in cm as its number', () => {
  expect(modelWords('WRGB II')).toEqual(modelWords('wrgb2'))
  expect(modelWords('WRGB2 90')).toEqual(['wrgb', '2', '90'])
  expect(modelWords('WRGB II 60cm')).toEqual(['wrgb', '2', '60'])
})

test('every line the light tool drives is controlled, and a page\'s spelling of it finds the same line', () => {
  for (const line of CHIHIROS_LINES) expect(controlOf('Chihiros', line)).toMatchObject({ kind: 'light', line, tool: '/vi/cong-cu/den-chihiros/' })
  expect(chihirosLine('WRGB 2')).toBe('WRGB II')
  expect(chihirosLine('WRGB2 90')).toBe('WRGB II')
  expect(chihirosLine('wrgb ii 60')).toBe('WRGB II')
  expect(chihirosLine('C2')).toBe('C II')
})

test('a line isn\'t swallowed by a shorter one, nor a size taken for a model number', () => {
  expect(chihirosLine('WRGB II Slim 60')).toBe('WRGB II Slim')
  expect(chihirosLine('WRGB II Pro')).toBe('WRGB II Pro')
  expect(chihirosLine('C II RGB')).toBe('C II RGB')
  expect(chihirosLine('C II')).toBe('C II') // not the C, in size 2
})

test('what the code doesn\'t drive is not controlled: other Chihiros lines, Week Aqua in progress, Sonoff until it has a PlugSource', () => {
  for (const m of ['X300', 'Z Light Tiny', 'Egg', 'Commander 1', 'CO2 Diffuser']) expect(controlOf('Chihiros', m), m).toBeUndefined()
  expect(controlOf('Week Aqua', 'L600 Pro')).toBeUndefined()
  expect(controlOf('WEEK AQUA', 'M800 Pro K')).toBeUndefined()
  expect(controlOf('Sonoff', 'Basic R2')).toBeUndefined()
  expect(controlOf('Fluval', 'Plant 3.0')).toBeUndefined()
  expect(controlOf('Tuya', 'Smart Life power strip')).toMatchObject({ kind: 'plug', family: 'tuya' })
  expect(controlOf('Smart Life', 'WiFi strip')).toMatchObject({ kind: 'plug', family: 'tuya' })
})

// Read, never changed: a maker the app gains or loses shows here first, and every product page follows the list.
test('the plug makers listed are the ones the app has a PlugSource for', () => {
  const dir = fileURLToPath(new URL('../../../apps/ios/AquaTomeKit/Sources/Plugs/', import.meta.url))
  const sources = readdirSync(dir).filter(f => f.endsWith('.swift')).flatMap(f => [...readFileSync(dir + f, 'utf8').matchAll(/(?:actor|class|struct)\s+(\w+)\s*:[^{\n]*\bPlugSource\b/g)].map(m => m[1]!))
  const real = sources.filter(s => !s.startsWith('Fake')).map(s => s.replace(/Plugs$/, '').toLowerCase())
  expect(real.length).toBeGreaterThan(0)
  expect(real.sort()).toEqual(PLUG_FAMILIES.map(f => f.id as string).sort())
})

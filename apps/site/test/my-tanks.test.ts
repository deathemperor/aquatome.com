import { expect, test } from 'vitest'
import { TANKS_PAGE } from '../worker/accounts/email'
import { localizePath, toVi } from '../src/lib/i18n'
import { channelsOf, dayPicture, facts } from '../src/scripts/my-tanks'

const ct = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k])) : s)
const num = (n: number, d = 1) => new Intl.NumberFormat('vi', { maximumFractionDigits: d }).format(n)

test('the email sign-in link goes to "Bể của tôi" in each language, and back', () => {
  for (const lang of ['vi', 'id', 'th'] as const) {
    expect(localizePath(lang, '/vi/cong-cu/be-cua-toi/')).toBe(TANKS_PAGE[lang])
    expect(toVi(TANKS_PAGE[lang])).toBe('/vi/cong-cu/be-cua-toi/')
  }
})

test('a tank\'s line: size, litres from the box or its own figure, substrate', () => {
  expect(facts({ dims: { l: 60, w: 30, h: 36 }, substrate: 'soil' }, ct, num)).toEqual(['60 × 30 × 36 cm', '64,8 lít', 'Phân nền (aqua soil)'])
  expect(facts({ litres: 120, substrate: 'akadama' }, ct, num)).toEqual(['120 lít', 'akadama'])
  expect(facts({}, ct, num)).toEqual([])
})

test('a light\'s channels come from its Bluetooth name; its day is lit from on to off', () => {
  const d = { id: 'x', tankId: 'y', kind: 'light', bleName: 'DYWPRO60AB', createdAt: '', updatedAt: '' }
  expect(channelsOf(d)).toEqual(['red', 'green', 'blue', 'white'])
  expect(channelsOf({ ...d, bleName: undefined, schedules: [{ id: 's', on: '12:00', off: '20:00', ramp: 0, levels: [50], savedAt: '' }] })).toEqual(['red'])
  const p = dayPicture({ on: '12:00', off: '00:00', ramp: 30, levels: [100, 100, 100] }, ['red', 'green', 'blue'])
  expect(p.hours).toBe(12)
  expect(p.path).toMatch(/^M0 48 L720 48 L750 [\d.]+ L1410 [\d.]+ L1440 48 L1440 48 Z$/)
})

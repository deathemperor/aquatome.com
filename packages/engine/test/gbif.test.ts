import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { gbifMatch, type Taxon } from '../src/gbif'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/gbif/${n}.json`, import.meta.url), 'utf8'))

test('exact match gives taxonomy and is cached', async () => {
  let calls = 0
  const http = async (url: string) => { calls++; expect(url).toContain('name=Paracheirodon%20axelrodi'); return fx('paracheirodon-axelrodi') }
  const cache: Record<string, Taxon | null> = {}
  const t = await gbifMatch('Paracheirodon axelrodi', http, cache)
  expect(t).toEqual({ canonicalName: 'Paracheirodon axelrodi', order: 'Characiformes', family: 'Characidae', genus: 'Paracheirodon', matchType: 'EXACT' })
  await gbifMatch('Paracheirodon axelrodi', http, cache)
  expect(calls).toBe(1)
})

test('NONE and genus-only matches are null', async () => {
  expect(await gbifMatch('Notafishus imaginarius', async () => fx('none'), {})).toBeNull()
  expect(await gbifMatch('Paracheirodon sp.', async () => ({ ...fx('paracheirodon-axelrodi'), matchType: 'HIGHERRANK', rank: 'GENUS', canonicalName: 'Paracheirodon' }), {})).toBeNull()
})

test('synonym resolves to the accepted species name', async () => {
  const syn = { ...fx('paracheirodon-axelrodi'), canonicalName: 'Cheirodon axelrodi', status: 'SYNONYM', species: 'Paracheirodon axelrodi' }
  expect((await gbifMatch('Cheirodon axelrodi', async () => syn, {}))?.canonicalName).toBe('Paracheirodon axelrodi')
})

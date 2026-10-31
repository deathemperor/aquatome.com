import { expect, test } from 'vitest'
import { agreed, inatLicence, inatPage, inatTaxon, newInatCursor } from '../src/inat'

test('iNaturalist licences: CC0, CC BY and CC BY-SA only (the site is commercial: NC, ND and none stay out)', () => {
  expect(['cc0', 'cc-by', 'cc-by-sa'].map(inatLicence)).toEqual(['CC0', 'CC BY', 'CC BY-SA'])
  expect(['cc-by-nc', 'cc-by-nd', 'cc-by-nc-sa', 'cc-by-nc-nd', null, undefined, ''].map(inatLicence)).toEqual(Array(7).fill(undefined))
})

test('taxon: an exact name, else a synonym iNaturalist knows (matched_term), never a genus; then the next name given', async () => {
  const taxa: Record<string, object[]> = {
    'Puntius tetrazona': [{ id: 1, name: 'Puntius', rank: 'genus', matched_term: 'Puntius' }, { id: 613443, name: 'Puntigrus tetrazona', rank: 'species', matched_term: 'Puntius tetrazona' }],
    'Cheirodon axelrodi': [],
    'Paracheirodon axelrodi': [{ id: 81000, name: 'Paracheirodon axelrodi', rank: 'species', matched_term: 'Paracheirodon axelrodi' }],
  }
  const http = async (u: string) => ({ results: taxa[new URL(u).searchParams.get('q')!] ?? [] })
  expect(await inatTaxon(['Puntius tetrazona'], http)).toBe(613443)
  expect(await inatTaxon(['Cheirodon axelrodi', 'Paracheirodon axelrodi'], http)).toBe(81000)
  expect(await inatTaxon(['Cheirodon axelrodi', ''], http)).toBeNull()
})

test('community agreement: research grade, or a community taxon equal to the observation\'s with an agreeing ID', () => {
  expect(agreed({ id: 1, quality_grade: 'research' })).toBe(true)
  expect(agreed({ id: 1, quality_grade: 'casual', taxon: { id: 7 }, community_taxon_id: 7, num_identification_agreements: 1 })).toBe(true)
  expect(agreed({ id: 1, quality_grade: 'casual', taxon: { id: 7 }, community_taxon_id: null, num_identification_agreements: 0 })).toBe(false)
  expect(agreed({ id: 1, quality_grade: 'needs_id', taxon: { id: 7 }, community_taxon_id: 3, num_identification_agreements: 2 })).toBe(false)
  expect(agreed({ id: 1, quality_grade: 'casual', taxon: { id: 7 }, community_taxon_id: 7, num_identification_agreements: 0 })).toBe(false)
})

const photo = (id: number, license_code: string | null, w = 2048) => ({ id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpeg`, license_code, original_dimensions: { width: w, height: w * 0.75 } })

test('a page: open-licence photos ≥ 800 px, at most 3 an observation, large photo + medium thumb, credited; the cursor moves on', async () => {
  const calls: string[] = []
  const full = Array.from({ length: 200 }, (_, i) => ({ id: 10 + i, quality_grade: 'research', user: { login: 'bob', name: i ? null : 'Bob B' }, photos: i ? [] : [photo(1, 'cc-by'), photo(2, 'cc-by-nc'), photo(3, 'cc0', 600), photo(4, 'cc-by-sa'), photo(5, 'cc0'), photo(6, 'cc0')] }))
  const http = async (u: string) => { calls.push(u); return { results: calls.length === 1 ? full : [] } }
  const c = newInatCursor(7)
  const p = await inatPage(c, http)
  expect(calls[0]).toContain('taxon_id=7')
  expect(calls[0]).toContain('photo_license=cc-by,cc-by-sa,cc0')
  expect(calls[0]).toContain('quality_grade=research')
  expect(calls[0]).toContain('order_by=id&order=asc&id_above=0')
  expect(p.cands.map(x => [x.key, x.licence])).toEqual([['inat:1', 'CC BY']]) // 2: NC; 3: too small; 4–6: past the first three
  expect(p.cands[0]).toMatchObject({ url: expect.stringMatching(/\/large\.jpeg$/), thumb: expect.stringMatching(/\/medium\.jpeg$/), width: 1024, height: 768, author: 'Bob B', sourceUrl: 'https://www.inaturalist.org/photos/1' })
  // A full page: the same pass continues after its last observation; a short one ends the pass.
  expect(p.cursor).toEqual({ taxon: 7, pass: 'research', after: { research: 209, agree: 0 } })
  const q = await inatPage(p.cursor, http)
  expect(calls[1]).toContain('id_above=209')
  expect(q.cursor.pass).toBe('agree')
  await inatPage(q.cursor, http)
  expect(calls[2]).toContain('quality_grade=needs_id,casual')
  expect(calls[2]).toContain('id_above=0')
  expect((await inatPage({ ...q.cursor, pass: 'done' }, http)).cands).toEqual([])
  expect(calls).toHaveLength(3)
})

test('no taxon: nothing to read', async () => {
  expect(newInatCursor(null).pass).toBe('done')
})

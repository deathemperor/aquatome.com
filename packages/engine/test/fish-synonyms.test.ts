import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fetchFishSynonyms, fishOlderNames } from '../src/fish-synonyms'

/** GBIF: an exact species match for each fish, and its synonyms (one a variety, which GBIF's helper leaves out). */
const SYN: Record<string, { canonicalName: string; rank: string }[]> = {
  '1': [{ canonicalName: 'Acanthorhodeus macropterus', rank: 'SPECIES' }, { canonicalName: 'Barbus bimaculatus', rank: 'SPECIES' }, { canonicalName: 'Oldplant aquaticus', rank: 'SPECIES' }, { canonicalName: 'Rhodeus sharedus', rank: 'SPECIES' }, { canonicalName: 'Acanthorhodeus macropterus varius', rank: 'VARIETY' }],
  '2': [{ canonicalName: 'Rhodeus sharedus', rank: 'SPECIES' }],
  '3': [],
}
const KEY: Record<string, string> = { 'Acheilognathus macropterus': '1', 'Barbus bimaculatus': '2', 'Danio rerio': '3' }

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-fish-syn-'))
  const put = async (path: string, x: unknown) => { await mkdir(join(r, path, '..'), { recursive: true }); await writeFile(join(r, path), JSON.stringify(x)) }
  await put('content/species/acheilognathus-macropterus/entity.json', { scientificName: 'Acheilognathus macropterus' })
  await put('content/species/barbus-bimaculatus/entity.json', { scientificName: 'Barbus bimaculatus' })
  await put('content/species/danio-rerio/entity.json', { scientificName: 'Danio rerio' })
  await put('content/species/betta-sp-mahachai/entity.json', { scientificName: "Betta sp. 'Mahachai'" })
  await put('content/plants/oldplant/entity.json', { scientificName: 'Newplant aquaticus', synonyms: ['Oldplant aquaticus'] })
  return r
}

test("each fish's older names are asked of GBIF once, a run's share at a time, and only a name that can point at that one fish is used", async () => {
  const r = await root()
  const asked: string[] = []
  let fail = ''
  const http = async (u: string) => {
    asked.push(u)
    const name = new URL(u).searchParams.get('name')
    if (name === fail) throw new Error('HTTP 503')
    if (name) return { matchType: 'EXACT', rank: 'SPECIES', usageKey: Number(KEY[name]), species: name }
    return { results: SYN[/species\/(\d+)\/synonyms/.exec(u)![1]!], endOfRecords: true }
  }
  const o = { gap: 0, sleep: async () => {} }
  fail = 'Barbus bimaculatus'
  expect(await fetchFishSynonyms(r, http, { ...o, limit: 2 })).toEqual({ asked: 1, failed: ['Barbus bimaculatus: HTTP 503'], left: 2 })
  fail = ''
  expect(await fetchFishSynonyms(r, http, { ...o, limit: 5 })).toMatchObject({ asked: 2, failed: [], left: 0 })
  // A trade form's name ("Betta sp. 'Mahachai'") is never asked; every fish asked once.
  asked.length = 0
  expect(await fetchFishSynonyms(r, http, { ...o, limit: 5 })).toEqual({ asked: 0, failed: [], left: 0 })
  expect(asked).toEqual([])
  const cache = JSON.parse(await readFile(join(r, 'engine-state/_gbif-synonyms.json'), 'utf8'))
  expect(Object.keys(cache)).toEqual(['Acheilognathus macropterus', 'Barbus bimaculatus', 'Danio rerio'])

  // Another fish's own name, a plant's synonym, and a name two fish would share are left out.
  expect([...await fishOlderNames(r)]).toEqual([['acheilognathus-macropterus', ['Acanthorhodeus macropterus']]])
})

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gbifSynonyms } from './gbif'

type Http = (url: string) => Promise<unknown>
/** GBIF's other names, by scientific name, shared with the plants' step (plant-synonyms.ts), asked once each. */
const CACHE = 'engine-state/_gbif-synonyms.json'
const BINOMIAL = /^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/
const key = (n: string) => n.trim().toLowerCase()

/**
 * Every fish's older scientific names from GBIF (`gbifSynonyms`: the accepted name when the page's is a synonym, and the
 * accepted name's synonyms at species rank), kept in engine-state so each is asked once. `limit` fish a run, at GBIF's
 * pace (`gap` ms between requests); a fish GBIF fails on is asked again next run. A name GBIF can't match exactly at
 * species rank keeps [] (a fuzzy match can be another fish). The chief of staff, 2026-11-12: Commons files some fish
 * under an older name (Acheilognathus macropterus), and search and name checks can use them too.
 */
export async function fetchFishSynonyms(root: string, http: Http, o: { limit: number; gap?: number; sleep?: (ms: number) => Promise<void> }) {
  const file = join(root, CACHE)
  const cache = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string[]>
  const report = { asked: 0, failed: [] as string[], left: 0 }
  const names: string[] = []
  for (const id of (await readdir(join(root, 'content/species')).catch(() => [] as string[])).sort()) {
    const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8').catch(() => 'null')) as { scientificName?: string } | null
    if (e?.scientificName && BINOMIAL.test(e.scientificName) && !(e.scientificName in cache)) names.push(e.scientificName)
  }
  const todo = [...new Set(names)]
  const paced: Http = async url => { await (o.sleep ?? (ms => new Promise(r => setTimeout(r, ms))))(o.gap ?? 300); return http(url) }
  for (const n of todo.slice(0, o.limit)) {
    try { cache[n] = await gbifSynonyms(n, paced); report.asked++ } catch (e) { report.failed.push(`${n}: ${(e as Error).message.slice(0, 80)}`) }
  }
  report.left = todo.length - report.asked
  if (report.asked) {
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  }
  return report
}

/**
 * The older names each fish may be found by: GBIF's (kept by `fetchFishSynonyms`), plain binomials only, leaving out a
 * name that is any page's own scientific name (a fish's or a plant's) or a plant's synonym, and one GBIF gives two of our
 * fish: such a name can't point at one fish. Fish id → names.
 */
export async function fishOlderNames(root: string): Promise<Map<string, string[]>> {
  const cache = JSON.parse(await readFile(join(root, CACHE), 'utf8').catch(() => '{}')) as Record<string, string[]>
  const read = async (kind: string) => Promise.all((await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort().map(async id => ({ id, e: JSON.parse(await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8').catch(() => 'null')) as { scientificName?: string; synonyms?: string[] } | null })))
  const fish = (await read('species')).filter(x => x.e?.scientificName)
  const taken = new Set([...fish, ...(await read('plants'))].flatMap(x => [x.e?.scientificName ?? '', ...(x.e?.synonyms ?? [])]).filter(Boolean).map(key))
  const found = new Map(fish.map(({ id, e }) => [id, [...new Set((cache[e!.scientificName!] ?? []).filter(n => BINOMIAL.test(n) && !taken.has(key(n))))]]))
  const owners = new Map<string, number>()
  for (const names of found.values()) for (const n of names) owners.set(key(n), (owners.get(key(n)) ?? 0) + 1)
  return new Map([...found].map(([id, names]): [string, string[]] => [id, names.filter(n => owners.get(key(n)) === 1)]).filter(([, names]) => names.length))
}

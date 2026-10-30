import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TargetLang } from './localize'

type Http = (url: string) => Promise<unknown>
/** By scientific name: the species' Wikidata label and aliases in each language (null: no item has that taxon name). */
type Names = Record<string, Partial<Record<TargetLang, string[]>> | null>
const CACHE = 'engine-state/_wikidata-names.json'
const LANGS: TargetLang[] = ['id', 'th']
const BATCH = 100
const MAX_ALT = 8

const readCache = async (root: string) => JSON.parse(await readFile(join(root, CACHE), 'utf8').catch(() => '{}')) as Names

/** Names Wikidata (CC0) gives these species in Indonesian and Thai, by taxon name (P225); fetched once each, cached. */
export async function fetchWikidataNames(root: string, http: Http, scis: string[]): Promise<Names> {
  const cache = await readCache(root)
  const todo = [...new Set(scis)].filter(s => !(s in cache))
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const q = `SELECT ?name ?lang ?label WHERE { VALUES ?name { ${batch.map(s => JSON.stringify(s)).join(' ')} } ?item wdt:P225 ?name .
      { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label } BIND(lang(?label) AS ?lang) FILTER(?lang IN (${LANGS.map(l => `"${l}"`).join(', ')})) }`
    const r = (await http(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`)) as { results: { bindings: { name: { value: string }; lang: { value: TargetLang }; label: { value: string } }[] } }
    for (const s of batch) cache[s] = null
    for (const b of r.results.bindings) {
      const n = (cache[b.name.value] ??= {})
      ;(n[b.lang.value] ??= []).push(b.label.value.trim())
    }
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, CACHE), `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  return cache
}

/** A Latin name ("Betta splendens", "Polyacanthus hasseltii"): not a name readers use. */
const latin = (s: string) => /^[A-Z][a-z]+( [a-z]+){1,2}$/.test(s)
/** An alias that describes rather than names ("สายพันธุ์อะโรวาน่าที่นิยมของตลาด", "the strain the market likes"). */
const phrase = (s: string) => /(?<!\p{L})(yang|dari|untuk)(?!\p{L})|ที่|ของ|^สายพันธุ์/u.test(s)
const key = (s: string) => s.toLowerCase().replace(/^(ikan|ปลา)\s*/, '').replace(/\s+/g, '')

/**
 * Wikidata's names for a species in this language, to add to its page's other names: not Latin, not already there, and
 * not a name any other page in the language uses or Wikidata gives another species (two species sharing a name would
 * send readers to the wrong one).
 */
export async function wikidataAltNames(root: string, lang: TargetLang): Promise<(id: string, sci: string, have: string[]) => string[]> {
  const cache = await readCache(root)
  const owners = new Map<string, Set<string>>()
  const own = (name: string, who: string) => (owners.get(key(name)) ?? owners.set(key(name), new Set()).get(key(name))!).add(who)
  for (const [sci, n] of Object.entries(cache)) for (const name of n?.[lang] ?? []) own(name, `sci:${sci}`)
  for (const kind of ['species', 'breeds', 'plants']) for (const id of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
    const t = JSON.parse(await readFile(join(root, 'content', kind, id, `${lang}.json`), 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (!t) continue
    for (const name of [t.name, ...t.altNames]) own(name, `${kind}:${id}`)
  }
  return (id, sci, have) => {
    const mine = new Set([`sci:${sci}`, `species:${id}`])
    const seen = new Set(have.map(key))
    return [...new Set(cache[sci]?.[lang] ?? [])].filter(n => {
      if (latin(n) || phrase(n) || seen.has(key(n)) || [...(owners.get(key(n)) ?? [])].some(o => !mine.has(o))) return false
      seen.add(key(n))
      return true
    })
  }
}

/** Every species page in the language gets the Wikidata names it lacks as other names (up to MAX_ALT in all). */
export async function addWikidataNames(root: string, http: Http, lang: TargetLang) {
  const dir = join(root, 'content/species')
  const ids = (await readdir(dir)).sort()
  const sci = new Map<string, string>()
  for (const id of ids) sci.set(id, (JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { scientificName: string }).scientificName)
  await fetchWikidataNames(root, http, [...sci.values()])
  const extra = await wikidataAltNames(root, lang)
  const added: string[] = []
  for (const id of ids) {
    const file = join(dir, id, `${lang}.json`)
    const t = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (!t || t.altNames.length >= MAX_ALT) continue
    const add = extra(id, sci.get(id)!, [t.name, ...t.altNames]).slice(0, MAX_ALT - t.altNames.length)
    if (!add.length) continue
    t.altNames = [...t.altNames, ...add]
    await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
    added.push(`${id}: ${add.join(', ')}`)
  }
  return added
}

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gbifSynonyms } from './gbif'

type Http = (url: string) => Promise<unknown>

/**
 * Names the hobby long sold a plant under that neither its sources nor GBIF give it, by page. GBIF holds each as a
 * species of its own, so only a person can say the hobby meant this plant. Kept short: a name joins when pages here use
 * it for the plant, with the reason beside it.
 */
export const HOBBY_NAMES: Record<string, string[]> = {
  // The trade's Java moss was sold as Vesicularia dubyana for decades; it is Taxiphyllum barbieri (V. dubyana is another moss).
  'taxiphyllum-barbieri': ['Vesicularia dubyana'],
}

const CACHE = 'engine-state/_gbif-synonyms.json'
/** A two-word scientific name: no cultivar, "sp." or "var.". */
const BINOMIAL = /^[A-Z][a-z]+ [a-z]{3,}(?:-[a-z]+)?$/
/**
 * A former name in a source's text, as its binomial without the cultivar: "Previously named Echinodorus tenellus
 * 'Green'", "(formerly known as Pogostemon erectus)", "previously Trichocoronis rivularis", "Used to be called
 * Micranthemum micranthemoides", "syn. Anubias nana". Not "sold as": a trade name can be another species ("used to be
 * sold as Anubias afzelii, but the latter is actually a much larger species").
 */
const FORMER = /(?<!\p{L})(?:(?:[Pp]reviously|[Ff]ormerly)(?:\s+(?:named|called|known\s+as|described\s+as|classified\s+as))?|[Uu]sed\s+to\s+be\s+(?:named|called|known\s+as)|[Ss]yn\.|[Ss]ynonyms?:?)\s+\(?([A-Z][a-z]+ [a-z]{3,}(?:-[a-z]+)?)(?![\p{L}-])/gu

export const formerNamesInText = (html: string) => [...html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').matchAll(FORMER)].map(m => m[1]!)

type Plant = { id: string; scientificName: string; sections: string[]; names: string[] }
const key = (s: string) => s.toLowerCase()

/** Every two-word scientific name a text writes ("Echinodorus amazonicus"), lowercased. */
export const binomialsIn = (text: string) => new Set([...text.matchAll(/[A-Z][a-z]+ [a-z]{3,}(?:-[a-z]+)?/g)].map(m => key(m[0])))

/**
 * Each plant's other scientific names: the hobby names above, the former names its sources give, then GBIF's (`gbif`, by
 * scientific name) that some page here writes (`mentioned`): GBIF lists every name a species was ever given, most of
 * them 19th-century botany no reader meets (91 for Leptodictyum riparium). Sources and GBIF count for a plant named by a
 * plain binomial only: a cultivar's page ("Echinodorus grisebachii 'Tropica'") would take its species' names. A name
 * another page is called by (another plant's names, or `taken`: fish's scientific names), or that two plants would take,
 * is left out: it can't point at one page.
 */
export function plantSynonyms(plants: Plant[], gbif: Record<string, string[]>, mentioned: Set<string>, taken: Set<string> = new Set()): Map<string, string[]> {
  const found = new Map(plants.map(p => {
    const read = BINOMIAL.test(p.scientificName)
    const seen = new Set([key(p.scientificName)])
    const all = [...(HOBBY_NAMES[p.id] ?? []), ...(read ? p.sections.flatMap(formerNamesInText) : []), ...(read ? (gbif[p.scientificName] ?? []).filter(n => mentioned.has(key(n))) : [])]
    return [p.id, all.filter(n => BINOMIAL.test(n) && !seen.has(key(n)) && !!seen.add(key(n)))]
  }))
  const owners = new Map<string, Set<string>>()
  const own = (n: string, id: string) => (owners.get(key(n)) ?? owners.set(key(n), new Set()).get(key(n))!).add(id)
  for (const p of plants) for (const n of [p.scientificName, ...p.names]) own(n, p.id)
  for (const [id, names] of found) for (const n of names) own(n, id)
  return new Map([...found].map(([id, names]) => [id, names.filter(n => !taken.has(key(n)) && owners.get(key(n))!.size === 1)]))
}

/** GBIF's other names for these scientific names, fetched once each and kept in engine-state; a name GBIF fails on is tried again next run. */
async function gbifNames(root: string, http: Http, names: string[]) {
  const file = join(root, CACHE)
  const cache = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string[]>
  const failed = new Set<string>()
  const todo = [...new Set(names)].filter(n => !(n in cache))
  for (const n of todo) {
    try { cache[n] = await gbifSynonyms(n, http) } catch (e) { failed.add(n); console.warn(`gbif synonyms: ${n}: ${(e as Error).message}`) }
  }
  if (todo.length > failed.size) {
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  }
  return { cache, failed }
}

/**
 * Every plant page's `synonyms` brought up to date (plantSynonyms), written only where they change, in the file's own
 * indentation. A plant whose GBIF lookup failed keeps what it has until the next run.
 */
export async function addPlantSynonyms(root: string, http: Http): Promise<{ changed: string[]; failed: string[] }> {
  const readJson = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  const dir = join(root, 'content/plants')
  const plants: (Plant & { raw: string; entity: Record<string, unknown> & { synonyms?: string[] } })[] = []
  // The scientific names pages write, in every language: plants' own synonyms aside, or a name would keep itself.
  const mentioned = new Set<string>()
  const mention = (text: string) => { for (const n of binomialsIn(text)) mentioned.add(n) }
  for (const id of (await readdir(dir)).sort()) {
    const raw = await readFile(join(dir, id, 'entity.json'), 'utf8').catch(() => '')
    if (!raw) continue
    const entity = JSON.parse(raw) as Record<string, unknown> & { scientificName: string; sections: { html: string }[]; synonyms?: string[] }
    const vi = await readJson<{ name: string; altNames: string[] }>(join(dir, id, 'vi.json'))
    plants.push({ id, scientificName: entity.scientificName, sections: entity.sections.map(s => s.html), names: vi ? [vi.name, ...vi.altNames] : [], raw, entity })
    const { synonyms: _, ...text } = entity
    mention(JSON.stringify(text))
  }
  const taken = new Set<string>()
  for (const kind of ['species', 'plants', 'guides', 'breeds', 'glossary']) {
    for (const id of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
      for (const f of await readdir(join(root, 'content', kind, id)).catch(() => [] as string[])) {
        if (!f.endsWith('.json') || (kind === 'plants' && f === 'entity.json')) continue
        const raw = await readFile(join(root, 'content', kind, id, f), 'utf8')
        mention(raw)
        if (kind === 'species' && f === 'entity.json') taken.add(key((JSON.parse(raw) as { scientificName: string }).scientificName))
      }
    }
  }
  const { cache, failed } = await gbifNames(root, http, plants.map(p => p.scientificName).filter(n => BINOMIAL.test(n)))
  const next = plantSynonyms(plants, cache, mentioned, taken)
  const changed: string[] = []
  for (const p of plants) {
    const names = next.get(p.id) ?? []
    if (failed.has(p.scientificName) || JSON.stringify(names) === JSON.stringify(p.entity.synonyms ?? [])) continue
    // Where the engine's own write puts it (PlantSchema's order): right after the scientific name.
    const { synonyms: _, ...rest } = p.entity
    const entity = Object.fromEntries(Object.entries(rest).flatMap(([k, v]) => (k === 'scientificName' && names.length ? [[k, v], ['synonyms', names]] : [[k, v]])))
    const indent = p.raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
    await writeFile(join(dir, p.id, 'entity.json'), `${JSON.stringify(entity, null, indent)}\n`)
    changed.push(`${p.id}: ${names.join(', ') || '(none)'}`)
  }
  return { changed, failed: [...failed] }
}

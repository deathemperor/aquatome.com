import { readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD } from '@aq/schema'
import { MISMATCHED } from './gbif'

/**
 * A species page filed under the wrong animal, and where it belongs, a person having read it against its sources:
 * - `into` a page the site has: the gone page's address forwards there. Its sources' text joins that page (each section
 *   that page lacks, in each language both have, with that source's own photos, card figures and L number), unless
 *   `text` is false: a source about several species, whose figures would be another fish's there. `quiet`: the
 *   forward names no old name, and search doesn't find the page by it (the old name was another animal's).
 * - `into` a page the site doesn't have: the page moves there whole, under `sci`, its address as it was.
 * The engine names a page by its species (run.ts, gbif.ts pageTaxon), so a page under the wrong one stays until moved.
 */
export type Fold = { from: string; into: string; sci?: string; text?: false; quiet?: true }
export const FOLDS: readonly Fold[] = [
  // The skunk cory (Seriously Fish, PlanetCatfish, C020), filed under a tube worm's name (gbif.ts MISMATCHED).
  { from: 'ditrupa-arietina', into: 'corydoras-arcuatus', quiet: true },
  // Spruce Pets' article on mollies, filed under a moth's genus: several species, so none of its text joins "Cá molly".
  { from: 'mollienisia', into: 'poecilia-sphenops', text: false },
  // A torrent catfish from the Minjiang (Scotcat), filed under another species of its genus.
  { from: 'liobagrus-chenghaiensis', into: 'liobagrus-chengduensis', sci: 'Liobagrus chengduensis' },
]

/**
 * Source pages about several species, never written to one species' page (run.ts): a person read each. Its page became
 * a forward (FOLDS); a guide on the group is its own job.
 */
export const GROUP_PAGES: readonly string[] = ['https://www.thesprucepets.com/the-mollie-1380726']

type Section = { key: string; source: string; sourceUrl: string }
type Photo = { url: string; sourceUrl?: string }
type Value = { source: string | number }
type Entity = { id: string; scientificName: string; genus?: string; lNumber?: string; sections: Section[]; photos: Photo[]; dataCard?: Record<string, Value[]>; places?: string[]; range?: Record<string, unknown>; updatedAt?: string }
type Quality = { score: number; indexable: boolean; bySource?: Record<string, number> }
type Stored = { slug: string; name: string; altNames: string[]; sections?: Record<string, string>; quality?: Quality; redirectFrom?: { slug: string; name: string }[] }

const indentOf = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
const json = async <T>(file: string): Promise<{ raw: string; data: T } | null> => {
  const raw = await readFile(file, 'utf8').catch(() => null)
  return raw === null ? null : { raw, data: JSON.parse(raw) as T }
}
const put = (file: string, raw: string | undefined, data: unknown) => writeFile(file, `${JSON.stringify(data, null, raw ? indentOf(raw) : 2)}\n`)

/**
 * Each fold in FOLDS whose page is still there, through the engine's own files: the page joined to its fish's or moved to
 * it, and what the engine keeps about it (each source's read, the hold by hand, GBIF's answers, summaries, traits and
 * caches) following it or gone. Done once: a fold whose page is gone is left. The pages folded, `from → into`.
 */
export async function foldPages(root: string, folds: readonly Fold[] = FOLDS, today = new Date().toISOString().slice(0, 10)): Promise<string[]> {
  const content = join(root, 'content')
  const state = join(root, 'engine-state')
  const done: string[] = []
  for (const f of folds) {
    const dir = join(content, 'species', f.from)
    const from = await json<Entity>(join(dir, 'entity.json'))
    if (!from) continue
    const into = join(content, 'species', f.into)
    const target = await json<Entity>(join(into, 'entity.json'))
    const langs = (await readdir(dir)).filter(x => x !== 'entity.json' && x.endsWith('.json'))
    if (!target) {
      // A move: the page is this species', whole; its range records were the other's.
      const { records: _other, ...range } = from.data.range ?? {}
      await mkdir(into, { recursive: true })
      await put(join(into, 'entity.json'), from.raw, { ...from.data, id: f.into, scientificName: f.sci ?? from.data.scientificName, genus: (f.sci ?? from.data.scientificName).split(' ')[0], ...(from.data.range ? { range } : {}) })
      for (const l of langs) await writeFile(join(into, l), await readFile(join(dir, l), 'utf8'))
      for (const kind of ['summaries', 'traits', 'gallery']) {
        const x = await json<{ id: string }>(join(content, kind, `${f.from}.json`))
        if (x) await put(join(content, kind, `${f.into}.json`), x.raw, { ...x.data, id: f.into })
      }
    } else {
      const urls = new Set(from.data.sections.map(s => s.sourceUrl))
      const had = new Set(target.data.sections.map(s => s.sourceUrl))
      const moving = f.text === false ? new Set<string>() : new Set([...urls].filter(u => !had.has(u)))
      if (moving.size) {
        const e = target.data
        const sources = new Set(from.data.sections.filter(s => moving.has(s.sourceUrl)).map(s => s.source))
        const card = { ...e.dataCard }
        for (const [field, vs] of Object.entries(from.data.dataCard ?? {})) {
          const theirs = vs.filter(v => sources.has(String(v.source)) && !(card[field] ?? []).some(w => w.source === v.source))
          if (theirs.length) card[field] = [...(card[field] ?? []), ...theirs]
        }
        const photos = [...e.photos, ...from.data.photos.filter(p => p.sourceUrl && moving.has(p.sourceUrl) && !e.photos.some(q => q.url === p.url))]
        await put(join(into, 'entity.json'), target.raw, {
          ...e, sections: [...e.sections, ...from.data.sections.filter(s => moving.has(s.sourceUrl))], photos, dataCard: card,
          places: [...new Set([...(e.places ?? []), ...(from.data.places ?? [])])], ...(e.lNumber || !from.data.lNumber ? {} : { lNumber: from.data.lNumber }), updatedAt: today,
        })
      }
      for (const l of langs) {
        const t = await json<Stored>(join(into, l))
        const g = await json<Stored>(join(dir, l))
        if (!t || !g) continue
        const sources = new Set(from.data.sections.filter(s => moving.has(s.sourceUrl)).map(s => s.source))
        const sections = { ...t.data.sections, ...Object.fromEntries(Object.entries(g.data.sections ?? {}).filter(([k]) => sources.has(k.split(':')[1]!) && !(k in (t.data.sections ?? {})))) }
        // Each source's translation keeps its score; the page's is the lowest, as run.ts combineQuality has it.
        const bySource = { ...Object.fromEntries(Object.entries(g.data.quality?.bySource ?? {}).filter(([k]) => sources.has(k))), ...t.data.quality?.bySource }
        const min = Math.min(...Object.values(bySource))
        const quality = t.data.quality && sources.size ? { ...t.data.quality, score: min, indexable: t.data.quality.indexable && min >= QUALITY_THRESHOLD, bySource } : t.data.quality
        // Its other names are the fish's; the name it was filed under stays off when it was another animal's.
        const altNames = sources.size ? [...new Set([...t.data.altNames, ...g.data.altNames])].filter(n => n !== t.data.name) : t.data.altNames
        // The site forwards a Vietnamese page's old addresses (apps/site renamed.ts); an empty name says none.
        const redirectFrom = l === 'vi.json' && !(t.data.redirectFrom ?? []).some(r => r.slug === g.data.slug) ? [...(t.data.redirectFrom ?? []), { slug: g.data.slug, name: f.quiet ? '' : g.data.name }] : t.data.redirectFrom
        await put(join(into, l), t.raw, { ...t.data, altNames, ...(t.data.sections ? { sections } : {}), ...(quality ? { quality } : {}), ...(redirectFrom ? { redirectFrom } : {}) })
      }
    }
    // What the engine keeps about the page: each source's read names the page it wrote now, or none.
    const now = target && f.text === false ? [] : [`species/${f.into}`]
    for (const file of (await readdir(state)).filter(x => x.endsWith('.json') && !x.startsWith('_'))) {
      const s = await json<Record<string, { entityIds?: string[] }>>(join(state, file))
      if (!s || !s.raw.includes(`"species/${f.from}"`)) continue
      for (const v of Object.values(s.data)) if (v?.entityIds?.includes(`species/${f.from}`)) v.entityIds = [...new Set(v.entityIds.flatMap(id => (id === `species/${f.from}` ? now : [id])))]
      await put(join(state, file), s.raw, s.data)
    }
    const held = await json<Record<string, unknown>>(join(state, 'held-by-hand.json'))
    if (held && `species/${f.from}` in held.data) {
      delete held.data[`species/${f.from}`]
      await put(join(state, 'held-by-hand.json'), held.raw, held.data)
    }
    for (const x of [...['summaries', 'traits', 'gallery'].map(k => join(content, k, `${f.from}.json`)), join(state, 'water', `${f.from}.json`), join(state, 'range', `${f.from}.json`), dir]) await rm(x, { recursive: true, force: true })
    done.push(`${f.from} → ${f.into}`)
  }
  // GBIF's answers a person found wrong leave the engine's record of them (gbif.ts asks again the right way).
  const names = await json<Record<string, unknown>>(join(state, '_gbif-names.json'))
  if (names && Object.keys(MISMATCHED).some(k => k in names.data)) {
    for (const k of Object.keys(MISMATCHED)) delete names.data[k]
    await put(join(state, '_gbif-names.json'), names.raw, names.data)
  }
  return done
}

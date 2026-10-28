import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'
import { isAllowedLicence } from './licence'
import { ChangelogSchema, GlossarySchema, GuideSchema, PlaceSchema, PlantSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { ChangelogEntry, DataCardField, GlossaryEntity, GuideEntity, Lang, Photo, PlaceEntity, PlantEntity, Section, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75

export type LoadOptions = { root: string; lang: Lang; publicBuild: boolean }
export type Localized<E> = E & { t: Translation }
export type Content = {
  species: Localized<SpeciesEntity>[]
  plants: Localized<PlantEntity>[]
  guides: Localized<GuideEntity>[]
  glossary: Localized<GlossaryEntity>[]
  places: Localized<PlaceEntity>[]
  sources: Partial<Record<SourceId, SourceInfo>>
  changelog: ChangelogEntry[]
}

async function readJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (e) {
    throw new Error(`Invalid content file ${path}: ${(e as Error).message}`)
  }
}

async function exists(path: string): Promise<boolean> {
  return readFile(path).then(() => true, () => false)
}

async function loadKind<S extends z.ZodType>(root: string, dir: string, schema: S, lang: Lang): Promise<Localized<z.infer<S>>[]> {
  const base = join(root, dir)
  const ids = await readdir(base).catch(() => [] as string[])
  const out: Localized<z.infer<S>>[] = []
  for (const id of ids.sort()) {
    const tPath = join(base, id, `${lang}.json`)
    if (!(await exists(tPath))) continue
    const entity = await readJson(join(base, id, 'entity.json'), schema)
    const t = await readJson(tPath, TranslationSchema)
    out.push({ ...(entity as object), t } as Localized<z.infer<S>>)
  }
  return out
}

export async function loadAll(opts: LoadOptions): Promise<Content> {
  const { root, lang, publicBuild } = opts
  const sources = await readJson(join(root, 'sources.json'), SourcesSchema)
  const allowed = (s: SourceId) => !publicBuild || sources[s]?.publish === true
  const cleanSections = (xs: Section[]) => xs.filter(s => allowed(s.source))
  /** Photos copied from a source follow that source's publish gate; others need an open licence. */
  const cleanPhotos = (xs: Photo[]) => xs.filter(p => (p.source ? allowed(p.source) : isAllowedLicence(p.licence)))
  const cleanCard = (card: SpeciesEntity['dataCard']): SpeciesEntity['dataCard'] =>
    Object.fromEntries(
      Object.entries(card)
        .map(([field, values]) => [field, (values ?? []).filter(v => allowed(v.source))] as const)
        .filter(([, values]) => values.length > 0),
    ) as Partial<Record<DataCardField, SpeciesEntity['dataCard'][DataCardField]>>

  /** Page quality counts only the sources this build may show. */
  const cleanQuality = <E extends { t: Translation }>(x: E): E => {
    const by = Object.entries(x.t.quality.bySource ?? {}).filter(([s]) => allowed(s as SourceId)).map(([, v]) => v as number)
    if (!by.length) return x
    const score = Math.min(...by)
    return { ...x, t: { ...x.t, quality: { ...x.t.quality, score, indexable: score >= QUALITY_THRESHOLD } } }
  }

  const species = (await loadKind(root, 'species', SpeciesSchema, lang))
    .map(s => cleanQuality({ ...s, sections: cleanSections(s.sections), photos: cleanPhotos(s.photos), dataCard: cleanCard(s.dataCard) }))
    .filter(s => s.sections.length > 0)
  const plants = (await loadKind(root, 'plants', PlantSchema, lang))
    .map(p => cleanQuality({ ...p, sections: cleanSections(p.sections), photos: cleanPhotos(p.photos) }))
    .filter(p => p.sections.length > 0)
  const guides = (await loadKind(root, 'guides', GuideSchema, lang))
    .filter(g => allowed(g.source))
    .map(g => ({ ...g, photos: cleanPhotos(g.photos) }))

  const changelogPath = join(root, 'changelog.json')
  const changelog = (await exists(changelogPath) ? await readJson(changelogPath, ChangelogSchema) : []).filter(e => allowed(e.source))

  return {
    species, plants, guides, changelog,
    glossary: await loadKind(root, 'glossary', GlossarySchema, lang),
    places: await loadKind(root, 'places', PlaceSchema, lang),
    sources,
  }
}

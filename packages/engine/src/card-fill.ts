import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mayPublish, shownCard, type DataCardField, type Section, type SourceId, type SpeciesEntity } from '@aq/schema'

/**
 * Data-card figures a species page lacks, as a public build shows its card (published sources only, no tank length made
 * from a volume: `shownCard`). The card-fill step (`runEngine` with `cardFill`) reads these pages' profiles on in-depth
 * sources the engine hasn't read for them yet, most popular first, as it reads any page: each figure comes from a source
 * that states it, through the same prompt rules and guards. A figure no published source states stays empty.
 */
export type Gap = { id: string; sources: SourceId[]; missing: DataCardField[] }

export const CARD_FIELDS: DataCardField[] = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty']
type Entity = Pick<SpeciesEntity, 'id' | 'dataCard' | 'sections'>
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)

/** Every published species page whose shown card lacks a figure, most popular first (`order`: ids), then by id. */
export async function cardGaps(contentRoot: string, order: string[]): Promise<Gap[]> {
  const published = (await readJson<Partial<Record<SourceId, { publish?: boolean | 'photos' }>>>(join(contentRoot, 'sources.json'))) ?? {}
  const allowed = (s: string) => mayPublish(published[s as SourceId], 'text')
  const gaps: Gap[] = []
  for (const id of (await readdir(join(contentRoot, 'species')).catch(() => [] as string[])).sort()) {
    const e = await readJson<Entity>(join(contentRoot, 'species', id, 'entity.json'))
    if (!e || !(await readJson(join(contentRoot, 'species', id, 'vi.json')))) continue
    const shown: Section[] = e.sections.filter(s => allowed(s.source))
    if (!shown.length) continue
    const card = shownCard(e.dataCard, shown, allowed)
    const missing = CARD_FIELDS.filter(f => !card[f]?.length)
    if (missing.length) gaps.push({ id, sources: [...new Set(shown.map(s => s.source))], missing })
  }
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  return gaps.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
}

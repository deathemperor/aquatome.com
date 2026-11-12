import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, WRITTEN_LANGS } from '@aq/schema'
import { roundPage } from './round'
import { carryTopicChecks } from './topic-check'

/** Pages written in metric only (°C, cm, litres: @aq/schema toMetric), in every language the engine writes: fish, plants, breeds and guides. */
export const METRIC_KINDS: readonly string[] = ['species', 'plants', 'breeds', 'guides']

/**
 * Every such page in content/ in metric only. Each writer (new pages, rewrites, translations, breeds, guides) already
 * writes metric; this catches what one didn't, before the build, whose tests fail on an imperial figure, and rounds a
 * figure only a conversion gives ("38 lít", "22,8 °C": round.ts), but one a fish or plant page's English gives itself. The pages it changed. Given the engine's root, a guide whose topic was already checked stays checked (no model call for a unit).
 */
export async function metricPages(contentRoot: string, engineRoot?: string): Promise<string[]> {
  // Loaded here: the reader, which renders the English, reads this file's kinds as it loads.
  const { englishOf, WITH_ENGLISH } = await import('./english')
  const changed: string[] = []
  const guides: { key: string; before: string; after: string }[] = []
  for (const kind of METRIC_KINDS) {
    for (const id of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).sort()) {
      const entity = WITH_ENGLISH.includes(kind) ? await readFile(join(contentRoot, kind, id, 'entity.json'), 'utf8').catch(() => null) : null
      const en = entity ? englishOf((JSON.parse(entity) as { sections?: { key: string; source: string; html: string }[] }).sections ?? []) : undefined
      for (const lang of WRITTEN_LANGS) {
        const file = join(contentRoot, kind, id, `${lang}.json`)
        const raw = await readFile(file, 'utf8').catch(() => null)
        if (!raw) continue
        const page = JSON.parse(raw) as Parameters<typeof metricPage>[0]
        const next = roundPage(metricPage(page, lang), lang, en)
        if (JSON.stringify(next) === JSON.stringify(page)) continue
        // The file's own indentation: a figure changed is one changed line, not every line of the page.
        await writeFile(file, `${JSON.stringify(next, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
        changed.push(`${kind}/${id}/${lang}`)
        if (kind === 'guides' && page.body !== undefined) guides.push({ key: lang === 'vi' ? id : `${id}:${lang}`, before: page.body, after: next.body! })
      }
    }
  }
  if (engineRoot && guides.length) await carryTopicChecks(engineRoot, guides)
  return changed
}

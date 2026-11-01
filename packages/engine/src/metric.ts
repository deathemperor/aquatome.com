import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, type UnitLang } from '@aq/schema'

/** Pages written in metric only (°C, cm, litres: @aq/schema toMetric), in every language: fish, plants and breeds. */
export const METRIC_KINDS: readonly string[] = ['species', 'plants', 'breeds']
const LANGS: UnitLang[] = ['vi', 'id', 'th']

/**
 * Every such page in content/ in metric only. Each writer (new pages, rewrites, translations, breeds) already writes
 * metric; this catches what one didn't, before the build, whose tests fail on an imperial figure. The pages it changed.
 */
export async function metricPages(contentRoot: string): Promise<string[]> {
  const changed: string[] = []
  for (const kind of METRIC_KINDS) {
    for (const id of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).sort()) {
      for (const lang of LANGS) {
        const file = join(contentRoot, kind, id, `${lang}.json`)
        const page = await readFile(file, 'utf8').then(s => JSON.parse(s) as Parameters<typeof metricPage>[0], () => null)
        if (!page) continue
        const next = metricPage(page, lang)
        if (JSON.stringify(next) === JSON.stringify(page)) continue
        await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
        changed.push(`${kind}/${id}/${lang}`)
      }
    }
  }
  return changed
}

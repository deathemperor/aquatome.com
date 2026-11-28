import type { Content, Lang } from '@aq/schema'

/** The last day any of the page's own files changed, or undefined when none are dated. */
export const lastChanged = (dates: Content['pageDates'], files: readonly string[]) =>
  files.map(file => dates[file]?.slice(0, 10)).filter(Boolean).sort().at(-1)

export function pageDateFiles(folder: string, id: string, lang: Lang): string[] {
  const files = [`${folder}/${id}/entity.json`, `${folder}/${id}/${lang}.json`]
  if (folder === 'species' && lang === 'vi') files.push(`summaries/${id}.json`)
  return files
}

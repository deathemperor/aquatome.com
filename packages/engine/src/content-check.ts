import { loadAll } from '@aq/schema'
import { LANGS } from '@aq/schema/langs'
import { checkPageDates } from './page-dates'

/**
 * The content through the site's loader, everything in it (not only what a public build shows), in every language, with its
 * pages' dates there and in their format: the number of files dated, or it throws. A push takes a sweep that changed only
 * the dates without the tests once this passes (swept_clean, cycle-checks.sh), since the dates move because main brought
 * pages, and the loader refuses what such a merge can break: a file off its format, a breed at a species' address, two
 * materials at one. Main's tests would then fail for every run until it was mended (the chief of staff, 15 Nov). It doesn't
 * stand for the other rules the tests hold the real content to, nor for the files the loader doesn't open.
 */
export async function checkContent(root: string) {
  const dated = await checkPageDates(root)
  for (const lang of LANGS) await loadAll({ root, lang, publicBuild: false })
  return dated
}

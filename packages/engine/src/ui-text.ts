import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LANG, OTHER_LANGS, WRITTEN_OTHER_LANGS, type WrittenOtherLang } from '@aq/schema/langs'

const read = async (dir: string, lang: string) => JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8').catch(() => '{}')) as Record<string, string>

/**
 * The UI strings each language the site doesn't serve yet still lacks, at most `limit` a language: a build asks only for
 * a served language's, so these come from a served language's dictionary (the build holds that one complete). A language
 * that goes live leaves this list, and its build says what it misses.
 */
export async function unservedMissing(dir: string, limit = Infinity): Promise<Partial<Record<WrittenOtherLang, string[]>>> {
  const strings = Object.keys(await read(dir, OTHER_LANGS[0]!))
  const out: Partial<Record<WrittenOtherLang, string[]>> = {}
  for (const lang of WRITTEN_OTHER_LANGS.filter(l => !LANG[l].served)) {
    const have = await read(dir, lang)
    const lacks = strings.filter(s => !(s in have)).slice(0, limit)
    if (lacks.length) out[lang] = lacks
  }
  return out
}

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Wikimedia's Artist field (HTML) → the author's name as plain text, without what wikis print beside a user name: the
 * "(talk)" and "(Uploads)" links and a signature's timestamp ("--Name (talk) 19:58, 7 October 2019 (UTC)").
 */
const LINKS = /\s*\((?:talk|thảo luận|discuter|discussion|Diskussion|discusión|discussão|обсуждение|overleg|dyskusja|tartışma|uploads|contribs|contributions)\)/gi
const SIGNED = /\s*\d{1,2}:\d{2}, \d{1,2} \p{L}+ \d{4} \(UTC\)/gu
export const authorText = (html = '') =>
  tidyAuthor(html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ')
    .replace(LINKS, '').replace(SIGNED, '').replace(/^\s*[-–—]{1,2}\s*/, '').replace(/\s+/g, ' ').trim())

/** Commons' stand-in where a file has no author field: "No machine-readable author provided. RuthJM assumed (based on copyright claims)." */
const ASSUMED = /^No machine-readable author provided\.\s*(.+?)\s+assumed \(based on copyright claims\)\.?$/i
/** A user name from before Wikimedia's 2015 single-login merge, renamed with its wiki's: "RuthJM~commonswiki". */
const RENAMED = /~[a-z_]*wiki\b/gi
/** The user Commons names, as people know them: "RuthJM", not its placeholder sentence or its rename suffix. */
export const tidyAuthor = (s: string) => s.replace(ASSUMED, '$1').replace(RENAMED, '').trim()

/**
 * Wikimedia photos already in content credited as imported before tidyAuthor: each `author` beside a Wikimedia
 * `sourceUrl`, on pages (species, plants, guides) and galleries, tidied in place: only author strings change in a file,
 * and such a string is tidied wherever it is in the file, as only Commons writes its placeholder, and a "~commonswiki"
 * name beside a Commons credit is the same renamed user.
 */
export async function tidyCredits(contentRoot: string): Promise<{ files: number; authors: number }> {
  const files: string[] = []
  for (const kind of ['species', 'plants', 'guides']) {
    for (const id of await readdir(join(contentRoot, kind)).catch(() => [] as string[])) files.push(join(contentRoot, kind, id, 'entity.json'))
  }
  for (const f of await readdir(join(contentRoot, 'gallery')).catch(() => [] as string[])) if (f.endsWith('.json')) files.push(join(contentRoot, 'gallery', f))
  let changedFiles = 0
  let authors = 0
  for (const file of files) {
    let raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw || !raw.includes('wikimedia.org')) continue
    const found = new Map<string, string>()
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (typeof o.author === 'string' && typeof o.sourceUrl === 'string' && /(^|\.)wikimedia\.org\//.test(o.sourceUrl.replace(/^https?:\/\//, ''))) {
        const t = tidyAuthor(o.author)
        if (t && t !== o.author) found.set(o.author, t)
      }
      Object.values(o).forEach(visit)
    }
    visit(JSON.parse(raw))
    if (!found.size) continue
    // As text, so the file keeps its own layout: the same name stands for the same person wherever it's written.
    for (const [from, to] of found) {
      const n = raw.split(JSON.stringify(from)).length - 1
      raw = raw.replaceAll(JSON.stringify(from), JSON.stringify(to))
      authors += n
    }
    await writeFile(file, raw)
    changedFiles++
  }
  return { files: changedFiles, authors }
}

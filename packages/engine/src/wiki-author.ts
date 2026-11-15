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
/**
 * An email address, which some photographers put in their Artist field ("I'd appreciate if you could mail me (…)"). A
 * credit is the photographer's name, and personal emails stay out of the repository (the chief of staff, 16 Nov 2026).
 */
const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g
/** Where the name ends in such a field: its first bracket, comma, semicolon or dash. */
const AFTER_NAME = /\s*[(<[,;]|\s+[-–—]\s/
/**
 * The field is HTML: an address may come in escaped brackets ("Name &lt;…&gt;") or with its "@" escaped ("&#64;"). A
 * code past the last character there is ("&#99999999;") stays as it is written.
 */
const character = (code: string, n: number) => (n <= 0x10ffff ? String.fromCodePoint(n) : code)
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (code, n: string) => character(code, Number(n))).replace(/&#x([0-9a-f]+);/gi, (code, n: string) => character(code, Number.parseInt(n, 16)))
/** The user Commons names, as people know them: "RuthJM", not its placeholder sentence or its rename suffix. */
export const tidyAuthor = (s: string) => {
  const t = s.replace(ASSUMED, '$1').replace(RENAMED, '').trim()
  const plain = unescape(t)
  if (!plain.match(EMAIL)) return t
  // Only the name before the rest, with no address left in it; a field with no name but the address is credited as the
  // import credits a file with no author.
  return plain.split(AFTER_NAME)[0]!.replace(EMAIL, '').replace(/\s+/g, ' ').replace(/\s+[.,;:]+$/, '').trim() || 'Wikimedia Commons'
}

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

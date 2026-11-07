#!/usr/bin/env node
// How often a phrase appears on the site and in the language's hobbyists' own writing, per million words (per million
// characters for languages written without spaces: Thai, Chinese), with examples.
// usage: node .claude/skills/content-council/phrase-check.mjs [--lang vi] [--examples 3] "phrase" ["phrase"…]
// A phrase may be a regular expression ("một cách (hiệu quả|dễ dàng)"). The reference corpus is local, never committed:
// ~/.cache/aquatome/corpus/<lang>/ (manifest.jsonl: one line per file, {file, url, site, type: forum|blog|shop-blog|wiki,
// year, words}), or CORPUS=<dir>.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args.splice(i, 2)[1] }
const lang = opt('lang', 'vi')
const CORPUS = process.env.CORPUS ?? join(homedir(), '.cache/aquatome/corpus', lang)
const UNSPACED = ['th', 'zh', 'zh-Hant'].includes(lang)
const UNIT = UNSPACED ? 'characters' : 'words'
const examples = Number(opt('examples', 3))
if (!args.length) { console.error('usage: phrase-check.mjs [--lang vi] [--examples 3] "phrase"…'); process.exit(1) }

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const plain = html => String(html ?? '').replace(/<\/(p|h3|li|td|th)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|\w+);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : ENTITY[e] ?? m))
/** The text's size: words, or for an unspaced language its letters and digits. */
const words = s => (UNSPACED ? s.match(/[\p{L}\p{M}\p{N}]/gu) : s.match(/[\p{L}\p{N}]+/gu))?.length ?? 0

/** The site's prose in one language, one document a page (references left out), grouped as video guides, guides, species… */
function site() {
  const docs = []
  for (const kind of readdirSync(join(ROOT, 'content'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
    if (kind === 'places') continue
    for (const slug of readdirSync(join(ROOT, 'content', kind))) {
      const f = join(ROOT, 'content', kind, slug, `${lang}.json`)
      if (!existsSync(f)) continue
      const p = JSON.parse(readFileSync(f, 'utf8'))
      const parts = [...Object.entries(p.sections ?? {}).filter(([k]) => !k.startsWith('references')).map(([, v]) => v), p.body, p.definition, ...(p.summary ?? []), ...(p.faq ?? []).flatMap(q => [q.q, q.a])]
      const text = plain(parts.filter(Boolean).join('\n')).normalize('NFC')
      docs.push({ group: kind === 'guides' && slug.startsWith('youtube-') ? 'video-guides' : kind, id: `${kind}/${slug}`, text })
    }
  }
  return docs
}

/** The reference corpus, one document a file, grouped by the manifest's type. */
function reference() {
  const m = join(CORPUS, 'manifest.jsonl')
  if (!existsSync(m)) return []
  return readFileSync(m, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).flatMap(e => {
    const f = join(CORPUS, e.file.replace(/^.*\/(?:vi-corpus|corpus\/[^/]+)\//, ''))
    return existsSync(f) ? [{ group: `ref:${e.type}`, id: e.url ?? e.file, text: readFileSync(f, 'utf8').normalize('NFC') }] : []
  })
}

const docs = [...site(), ...reference()]
const groups = [...new Set(docs.map(d => d.group))]
const size = Object.fromEntries(groups.map(g => [g, docs.filter(d => d.group === g).reduce((n, d) => n + words(d.text), 0)]))
if (!docs.some(d => d.group.startsWith('ref:'))) console.log(`(no reference corpus at ${CORPUS}: site counts only)\n`)

for (const phrase of args) {
  const re = new RegExp(UNSPACED ? `(?:${phrase.normalize('NFC')})` : `(?<![\\p{L}\\p{N}])(?:${phrase.normalize('NFC')})(?![\\p{L}\\p{N}])`, 'giu')
  console.log(`== ${phrase}`)
  for (const g of groups) {
    const hit = docs.filter(d => d.group === g).map(d => ({ d, n: [...d.text.matchAll(re)].length })).filter(x => x.n)
    const n = hit.reduce((s, x) => s + x.n, 0)
    console.log(`  ${g.padEnd(16)} ${String(n).padStart(6)}  ${(n / (size[g] / 1e6)).toFixed(1).padStart(8)}/M  in ${hit.length} of ${docs.filter(d => d.group === g).length} docs  (${(size[g] / 1e6).toFixed(2)}M ${UNIT})`)
  }
  // Examples: the reference corpus first (how people say it), then the site.
  for (const prefix of ['ref:', '']) {
    const shown = []
    for (const d of docs.filter(x => (prefix ? x.group.startsWith(prefix) : !x.group.startsWith('ref:')))) {
      for (const m of d.text.matchAll(re)) {
        if (shown.length >= examples) break
        shown.push(`    ${prefix ? 'ref ' : 'site'} ${d.id.slice(0, 50)}: …${d.text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70).replace(/\s+/g, ' ')}…`)
      }
      if (shown.length >= examples) break
    }
    if (shown.length) console.log(shown.join('\n'))
  }
  console.log('')
}

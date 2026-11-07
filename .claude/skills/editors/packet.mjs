#!/usr/bin/env node
// Reader-facing text, and what it was written from, as one Markdown file a council member reads.
//   node .claude/skills/editors/packet.mjs page <lang>/<kind>/<slug>      a page (species, plants, guides, breeds, glossary, products)
//   node .claude/skills/editors/packet.mjs strings <lang> site|app [--match <regex>]   the site's or the app's buttons and labels
//   node .claude/skills/editors/packet.mjs file <lang> <path> [--source <path>]       anything else: chat answers, an email
// Writes the packet under --out <dir> (default ~/.cache/aquatome/council) and prints its path.
// CONTENT_ROOT=<dir>: read pages from a scratch copy (packages/engine/scripts/rewrite-sample.ts) instead of content/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args.splice(i, 2)[1] }
const out = opt('out') ?? join(homedir(), '.cache/aquatome/council')
const match = opt('match')
const sourceFile = opt('source')
const [mode, ...rest] = args
const usage = () => { console.error('usage: packet.mjs page <lang>/<kind>/<slug> | strings <lang> site|app [--match re] | file <lang> <path> [--source path]  [--out dir]'); process.exit(1) }
const json = f => JSON.parse(readFileSync(f, 'utf8'))

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** HTML as plain lines: headings as "###", list items as "-", table cells split by "|". */
const text = html => (html ?? '')
  .replace(/<h3[^>]*>/gi, '\n### ').replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|h3|li|tr|ul|ol|table)>|<br\s*\/?>/gi, '\n')
  .replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e] ?? m)
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')

const P = 'packages/engine/src/prompts/'
let name, lines

if (mode === 'page') {
  const [lang, kind, slug] = rest[0]?.split('/') ?? []
  if (!lang || !kind || !slug) usage()
  const dir = join(process.env.CONTENT_ROOT ?? join(ROOT, 'content'), kind, slug)
  const page = json(join(dir, `${lang}.json`))
  const entity = json(join(dir, 'entity.json'))
  // The prompts that wrote this kind of page, in this language: their rules bind a finding too (no prices, no author's name…).
  const vi = entity.source === 'youtube' ? ['video-guide.md'] : entity.source === 'aquatome' ? ['topic.md'] : kind === 'breeds' ? ['breed.md'] : ['process.md', 'vi-rewrite.md']
  const intl = entity.source === 'aquatome' ? ['topic-intl.md'] : kind === 'breeds' ? ['breed-intl.md'] : kind === 'glossary' ? ['localize-glossary.md'] : ['localize.md']
  name = `${lang}-${kind}-${slug}`
  lines = [`# ${rest[0]}: ${page.name}`, '', `Language: ${lang}. Written under: ${(lang === 'vi' ? [...vi, 'vi-style.md'] : intl).map(f => P + f).join(', ')}`, '']
  lines.push(`## The page (${lang})`, '')
  if (page.summary?.length) lines.push('**Summary**', ...page.summary.map(s => `- ${text(s)}`), '')
  for (const [k, html] of Object.entries(page.sections ?? {}).filter(([k]) => !k.startsWith('references'))) lines.push(`**[${k}]**`, text(html), '')
  if (page.body) lines.push(text(page.body), '')
  if (page.definition) lines.push(text(page.definition), '')
  if (page.faq?.length) lines.push('**FAQ**', ...page.faq.flatMap(f => [`Q: ${text(f.q)}`, `A: ${text(f.a)}`]), '')
  lines.push('## The source', '')
  if (lang !== 'vi') {
    // Other languages are translated from the Vietnamese page.
    const v = join(dir, 'vi.json')
    lines.push('Translated from the Vietnamese page:', existsSync(v) ? text([...Object.values(json(v).sections ?? {}), json(v).body, json(v).definition].filter(Boolean).join('\n')) : '(no Vietnamese page)', '')
  } else if (kind === 'species' || kind === 'plants') {
    for (const s of (entity.sections ?? []).filter(s => s.key !== 'references')) lines.push(`**[${s.key}:${s.source}]** ${s.sourceUrl ?? ''}`, text(s.html), '')
  } else if (entity.source === 'youtube') {
    const t = join(homedir(), '.cache/aquatome/transcripts', `${entity.video.youtubeId}${entity.video.lang && entity.video.lang !== 'en' ? `.${entity.video.lang}` : ''}.txt`)
    lines.push(`A video's transcript: "${entity.video.title}" (${entity.video.channel}).`, existsSync(t) ? readFileSync(t, 'utf8').slice(0, 120_000) : `(not on this machine: ${t})`, '')
  } else if (entity.source === 'aquatome') {
    const f = join(ROOT, 'engine-state/topics', `${slug}.json`)
    lines.push('AquaTome\'s own guide, written from researched facts:', existsSync(f) ? readFileSync(f, 'utf8') : '(facts file not found)', '')
  } else if (entity.source) {
    const f = join(ROOT, 'sources', entity.source, `${slug.slice(entity.source.length + 1)}.md`)
    lines.push(`Translated from ${entity.sourceUrl}.`, existsSync(f) ? readFileSync(f, 'utf8').slice(0, 120_000) : '(source page not kept: judge faithfulness only where the text contradicts itself)', '')
  } else lines.push('(no source kept for this kind of page)', '')
} else if (mode === 'strings') {
  const [lang, where] = rest
  if (!lang || !['site', 'app'].includes(where)) usage()
  // Vietnamese is the source of both: the site's is in its code (each key of a translation file), the app's is each key
  // of its string catalogue. Other languages show beside the Vietnamese they were translated from.
  let pairs
  if (where === 'site') {
    const other = json(join(ROOT, 'apps/site/src/i18n', `${lang === 'vi' ? 'id' : lang}.json`))
    pairs = Object.entries(other).map(([vi, t]) => [vi, lang === 'vi' ? vi : t])
  } else {
    const cat = json(join(ROOT, 'apps/ios/AquaTome/Localizable.xcstrings'))
    pairs = Object.entries(cat.strings).map(([vi, s]) => [vi, lang === 'vi' ? vi : s.localizations?.[lang]?.stringUnit?.value]).filter(([, t]) => t)
  }
  if (match) pairs = pairs.filter(([vi, t]) => new RegExp(match, 'iu').test(`${vi}\n${t}`))
  name = `${lang}-strings-${where}${match ? '-match' : ''}`
  lines = [`# The ${where === 'site' ? "site's" : "app's"} buttons and labels (${lang})${match ? `, matching /${match}/` : ''}`, '',
    `Language: ${lang}. ${pairs.length} strings. Placeholders ({kg}, %@) are filled in at run time.`, '',
    ...pairs.map(([vi, t]) => (lang === 'vi' ? `- ${vi}` : `- ${t}    ← vi: ${vi}`))]
} else if (mode === 'file') {
  const [lang, path] = rest
  if (!lang || !path || !existsSync(path)) usage()
  name = `${lang}-file-${basename(path).replace(/\W+/g, '-')}`
  lines = [`# ${path}`, '', `Language: ${lang}.`, '', '## The text', '', readFileSync(path, 'utf8').slice(0, 150_000), '',
    ...(sourceFile ? ['## The source', '', readFileSync(sourceFile, 'utf8').slice(0, 120_000), ''] : [])]
} else usage()

mkdirSync(out, { recursive: true })
const file = join(out, `${name}.md`)
writeFileSync(file, `${lines.join('\n')}\n`)
console.log(file)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CardSchema, cardShownIn, GuideSchema, LANGS, mayPublish, SourcesSchema, type Lang } from '@aq/schema'
import { fitKey, fitText, type FitCheck, type FitState } from '../src/fit'
import { carriedChecks, gateCall, gateChecks, HAND_READ, HOLD_ALWAYS } from '../src/gate'
import { loadCards, loadPages } from '../src/pages'

// Reuse the gate’s comparison on pages copied from Git.
const [root, requestFile, ...requested] = process.argv.slice(2)
if (!root || !requestFile) throw new Error('publish-fit-hashes needs a content root and reviews')
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))
const { current, before, visibility } = json(requestFile) as {
  current: FitState; before?: { root: string; fit: FitState }; visibility: string[]
}
const langs = LANGS.filter(lang => requested.includes(lang))
const load = async (path: string) => [...await loadPages(path, langs), ...await loadCards(path, langs)]
const pages = Object.keys(current).length ? await load(root) : []
const oldPages = new Map(before && pages.length ? (await load(before.root)).map(p => [fitKey(p), p]) : [])
const results = pages.flatMap(page => {
  const key = fitKey(page), entry = current[key]
  if (!entry || entry.hash !== fitText(page).hash) return []
  const unkit = (checks: Iterable<FitCheck>) => [...checks].filter(c => c !== 'kit' || !(HAND_READ.has(key) || entry.pass === true))
  const checks = unkit(gateChecks(page, entry)).sort()
  const old = oldPages.get(key), saved = before?.fit[key]
  const liveEdit = before && gateCall(new Set(checks), {
    isNew: !old, wasHeld: false,
    ...(old ? { before: new Set(unkit([...gateChecks(old, saved?.hash === fitText(old).hash ? saved : undefined), ...carriedChecks(page, entry, old)])) } : {}),
  })
  return [[key, { checks, always: checks.filter(c => HOLD_ALWAYS.includes(c)), liveEdit }] as const]
})
// A card can expose another language, or a guide can move to a source whose text is public.
const newlyVisible = visibility.filter(key => {
  const [lang, kind, id] = key.split('/') as [Lang, 'cards' | 'guides', string]
  const shown = (path: string) => {
    const entity = json(join(path, kind, id, 'entity.json'))
    if (kind === 'cards') return cardShownIn(CardSchema.parse(entity), lang)
    return mayPublish(SourcesSchema.parse(json(join(path, 'sources.json')))[GuideSchema.parse(entity).source], 'text')
  }
  return langs.includes(lang) && before && shown(root) && !shown(before.root)
})
process.stdout.write(JSON.stringify({ reviews: Object.fromEntries(results), newlyVisible }))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CardSchema, cardShownIn, LANGS, type Lang } from '@aq/schema'
import { fitKey, fitText, type FitCheck, type FitState } from '../src/fit'
import { carriedChecks, gateCall, gateChecks, HAND_READ, HOLD_ALWAYS } from '../src/gate'
import { loadCards, loadPages, type Page } from '../src/pages'

// Reuse the gate’s comparison on pages copied from Git.
const [root, requestFile, ...requested] = process.argv.slice(2)
if (!root || !requestFile) throw new Error('publish-fit-hashes needs a content root and reviews')
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))
const { current, before, cards } = json(requestFile) as {
  current: FitState; before?: { root: string; fit: FitState }; cards: string[]
}
const langs = LANGS.filter(lang => requested.includes(lang))
const load = async (path: string) => [...await loadPages(path, langs), ...await loadCards(path, langs)]
const pages = before || Object.keys(current).length ? await load(root) : []
const oldPages = new Map(before && pages.length ? (await load(before.root)).map(p => [fitKey(p), p]) : [])
const newlyVisible = new Set<string>(), textChanged: string[] = []
// The loader keeps the underlying translation. The entity sections in `en` reflect the sources the build can show.
const shownSections = (page: Page) => Object.keys(page.en ?? {}).sort().join('\n')
const results = pages.flatMap(page => {
  const key = fitKey(page), hash = fitText(page).hash, recorded = current[key]
  const entry = recorded?.hash === hash ? recorded : undefined
  const old = oldPages.get(key), oldHash = old && fitText(old).hash, saved = before?.fit[key]
  if (before && !old) newlyVisible.add(key)
  if (old && (oldHash !== hash || shownSections(old) !== shownSections(page))) textChanged.push(key)
  if (!before && !entry) return []
  const unkit = (checks: Iterable<FitCheck>) => [...checks].filter(c => c !== 'kit' || !(HAND_READ.has(key) || entry?.pass === true))
  const checks = unkit(gateChecks(page, entry)).sort()
  // Without a matching read the gate can still decide harm from its rules.
  if (!entry && !checks.includes('harm')) return []
  const liveEdit = before && gateCall(new Set(checks), {
    isNew: !old, wasHeld: false,
    ...(old ? { before: new Set(unkit([...gateChecks(old, saved?.hash === oldHash ? saved : undefined), ...carriedChecks(page, entry, old)])) } : {}),
  })
  return [[key, { checks, always: checks.filter(c => HOLD_ALWAYS.includes(c)), liveEdit }] as const]
})
// The gate reads all card translations. The public build can expose another one when its country changes.
for (const key of cards) {
  const [lang, , id] = key.split('/') as [Lang, 'cards', string]
  const shown = (path: string) => cardShownIn(CardSchema.parse(json(join(path, 'cards', id, 'entity.json'))), lang)
  if (langs.includes(lang) && before && shown(root) && !shown(before.root)) newlyVisible.add(key)
}
process.stdout.write(JSON.stringify({ reviews: Object.fromEntries(results), newlyVisible: [...newlyVisible], textChanged }))

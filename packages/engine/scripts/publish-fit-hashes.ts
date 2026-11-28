import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CardSchema, cardShownIn, LANGS, type Lang } from '@aq/schema'
import { fitKey, fitText, type FitCheck, type FitEntry, type FitState } from '../src/fit'
import { carriedChecks, gateCall, gateChecks, HAND_READ, HOLD_ALWAYS } from '../src/gate'
import { loadCards, loadPages, type Page } from '../src/pages'
import { norm } from '../src/reader'

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
const newlyVisible = new Set<string>(), textChanged: string[] = [], sectionsExposed: string[] = []
// Keep the raw hash for matching saved reads. Publication decisions use the sections the build actually displays.
const publicText = (page: Page) => {
  const fields = page.fields.filter(field => !field.field.startsWith('sections.') || Object.hasOwn(page.en ?? {}, field.field))
  return fields.length === page.fields.length ? page : { ...page, fields }
}
const shownSections = (page: Page) => page.fields.filter(f => f.field.startsWith('sections.') && !f.field.startsWith('sections.references'))
  .map(f => f.field)
function publicReview(raw: Page, visible: Page, entry?: FitEntry): FitEntry | undefined {
  if (!entry || raw === visible) return entry
  const words = (page: Page) => fitText(page).parts.map(part => norm(part.text))
  const all = words(raw), shown = words(visible)
  const relevant = (quote: string) => {
    const q = norm(quote)
    return !q || shown.some(part => part.includes(q)) || !all.some(part => part.includes(q))
  }
  // A recorded finding or dose can be attached to a quote the public page never showed.
  return { ...entry, findings: (entry.findings ?? []).filter(f => relevant(f.quote)), products: (entry.products ?? []).filter(relevant),
    ...(entry.doses ? { doses: entry.doses.filter(d => relevant(d.quote)) } : {}) }
}
const results = pages.flatMap(page => {
  const key = fitKey(page), hash = fitText(page).hash, recorded = current[key]
  const entry = recorded?.hash === hash ? recorded : undefined
  const old = oldPages.get(key), oldHash = old && fitText(old).hash, saved = before?.fit[key]
  const shown = publicText(page), oldShown = old && publicText(old)
  if (before && !old) newlyVisible.add(key)
  if (oldShown && fitText(oldShown).hash !== fitText(shown).hash) textChanged.push(key)
  if (oldShown) {
    const beforeSections = new Set(shownSections(oldShown))
    if (shownSections(shown).some(section => !beforeSections.has(section))) sectionsExposed.push(key)
  }
  if (!before && !entry) return []
  const unkit = (checks: Iterable<FitCheck>) => [...checks].filter(c => c !== 'kit' || !(HAND_READ.has(key) || entry?.pass === true))
  const reviewed = publicReview(page, shown, entry)
  const checks = unkit(gateChecks(shown, reviewed)).sort()
  // Without a matching read the gate can still decide harm from its rules.
  if (!entry && !checks.includes('harm')) return []
  const liveEdit = before && gateCall(new Set(checks), {
    isNew: !old, wasHeld: false,
    ...(old && oldShown ? { before: new Set(unkit([
      ...gateChecks(oldShown, publicReview(old, oldShown, saved?.hash === oldHash ? saved : undefined)),
      ...carriedChecks(shown, reviewed, oldShown),
    ])) } : {}),
  })
  return [[key, { checks, always: checks.filter(c => HOLD_ALWAYS.includes(c)), liveEdit }] as const]
})
// The gate reads all card translations. The public build can expose another one when its country changes.
for (const key of cards) {
  const [lang, , id] = key.split('/') as [Lang, 'cards', string]
  const shown = (path: string) => cardShownIn(CardSchema.parse(json(join(path, 'cards', id, 'entity.json'))), lang)
  if (langs.includes(lang) && before && shown(root) && !shown(before.root)) newlyVisible.add(key)
}
process.stdout.write(JSON.stringify({ reviews: Object.fromEntries(results), newlyVisible: [...newlyVisible], textChanged, sectionsExposed }))

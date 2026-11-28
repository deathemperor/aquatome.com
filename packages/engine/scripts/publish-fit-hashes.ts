import { readFileSync } from 'node:fs'
import { LANGS } from '@aq/schema'
import { fitKey, fitText, type FitState } from '../src/fit'
import { gateChecks, HAND_READ, HOLD_ALWAYS } from '../src/gate'
import { loadCards, loadPages } from '../src/pages'

// Reuse the gate’s text hash and blocking checks on pages copied from the proposed Git tree.
const [root, reviewFile, ...requested] = process.argv.slice(2)
if (!root || !reviewFile) throw new Error('publish-fit-hashes needs a content root and reviews')
const reviews = JSON.parse(readFileSync(reviewFile, 'utf8')) as FitState
const langs = LANGS.filter(lang => requested.includes(lang))
const pages = [...await loadPages(root, langs), ...await loadCards(root, langs)]
const results = pages.flatMap(page => {
  const key = fitKey(page), entry = reviews[key]
  if (!entry || entry.hash !== fitText(page).hash) return []
  const checks = [...gateChecks(page, entry)].filter(c => c !== 'kit' || !(HAND_READ.has(key) || entry.pass === true)).sort()
  return [[key, { checks, always: checks.filter(c => HOLD_ALWAYS.includes(c)) }] as const]
})
process.stdout.write(JSON.stringify(Object.fromEntries(results)))

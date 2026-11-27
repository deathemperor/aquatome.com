import { LANGS } from '@aq/schema'
import { fitKey, fitText } from '../src/fit'
import { loadCards, loadPages } from '../src/pages'

// Reuse the gate’s text and hash on the candidate pages copied from the proposed Git tree.
const [root, ...requested] = process.argv.slice(2)
if (!root) throw new Error('publish-fit-hashes needs a content root')
const langs = LANGS.filter(lang => requested.includes(lang))
const pages = [...await loadPages(root, langs), ...await loadCards(root, langs)]
process.stdout.write(JSON.stringify(Object.fromEntries(pages.map(page => [fitKey(page), fitText(page).hash]))))

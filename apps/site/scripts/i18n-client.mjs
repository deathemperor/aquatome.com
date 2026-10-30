// Every ct('…') and msg('…') string in src/ → src/i18n/client.json (sorted), the list Base.astro translates for other languages' pages.
// Literal strings only: ct(`…${x}`) can't be translated, write ct('… {x}', { x }).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../src/', import.meta.url).pathname
const files = readdirSync(root, { recursive: true }).map(String).filter(f => /\.(ts|astro)$/.test(f) && !f.endsWith('ct.ts') && !f.endsWith('msg.ts'))
const found = new Set()
for (const f of files) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/\b(?:ct|msg)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) found.add(m[2].replace(/\\(['"\\])/g, '$1'))
const out = join(root, 'i18n/client.json')
const next = `${JSON.stringify([...found].sort(), null, 2)}\n`
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== next) { console.error('src/i18n/client.json is out of date: run node scripts/i18n-client.mjs'); process.exit(1) }
} else writeFileSync(out, next)

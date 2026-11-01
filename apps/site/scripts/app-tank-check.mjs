// The tank check (src/scripts/tank-check.ts: the tank-mates tool's own functions) as one script for the iOS app, which
// runs it in JavaScriptCore: apps/ios/AquaTomeKit/Sources/TankCheck/tank-check.js, with the Indonesian and Thai of every
// string it can show (src/i18n/{id,th}.json, as the site's pages get them). Run it after changing tank-check.ts,
// tankmates.ts, stocking.ts or calc.ts; with --check it only says whether the app's copy is out of date
// (test/tank-check.test.ts runs that on every PR).
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('../', import.meta.url))
const out = fileURLToPath(new URL('../../ios/AquaTomeKit/Sources/TankCheck/tank-check.js', import.meta.url))

// aqTankCheck(input JSON: { lang, fish, size }) → the check as JSON. ct and fmt as a page in that language has them
// (scripts/ct.ts, the tool's fmt).
const entry = `
import { tankCheck } from './src/scripts/tank-check'
const formats = {}
globalThis.aqTankCheck = input => {
  const { lang, fish, size } = JSON.parse(input)
  const dict = aqTankCheckStrings[lang] ?? {}
  const ct = (s, vars) => {
    const t = dict[s] ?? s
    return vars ? t.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : t
  }
  // One formatter per language and decimals: making one is most of a check's time in JavaScriptCore.
  const fmt = (n, d = 1) => (formats[lang + d] ??= new Intl.NumberFormat(lang, { maximumFractionDigits: d })).format(n)
  return JSON.stringify(tankCheck(fish, size, ct, fmt))
}
`
const { outputFiles } = await build({
  stdin: { contents: entry, resolveDir: site, loader: 'ts', sourcefile: 'app-tank-check' },
  // Paths in the output's comments are from the repository's root, wherever this runs from.
  absWorkingDir: fileURLToPath(new URL('../../../', import.meta.url)),
  bundle: true, write: false, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none', logLevel: 'error',
})
const code = outputFiles[0].text

// The strings the bundled code shows: its ct('…') and msg('…') literals (the code keeps those names).
const strings = [...new Set([...code.matchAll(/\b(?:ct|msg)\(\s*("(?:\\.|[^"\\])*")/g)].map(m => JSON.parse(m[1])))].sort()
const dict = {}
const missing = []
for (const lang of ['id', 'th']) {
  const all = JSON.parse(readFileSync(`${site}src/i18n/${lang}.json`, 'utf8'))
  dict[lang] = Object.fromEntries(strings.map(s => [s, all[s] ?? (missing.push(`${lang}: ${s}`), s)]))
}
if (missing.length) { console.error(`no translation in src/i18n/:\n${missing.join('\n')}`); process.exit(1) }

const next = `// Built by apps/site/scripts/app-tank-check.mjs from the site's tank-mates code: don't edit, run it again.
var aqTankCheckStrings = ${JSON.stringify(dict, null, 1)};
${code}`
if (process.argv.includes('--check')) {
  let kept = ''
  try { kept = readFileSync(out, 'utf8') } catch {}
  if (kept !== next) { console.error('The iOS app\'s tank check is out of date with the site\'s code: run node apps/site/scripts/app-tank-check.mjs'); process.exit(1) }
} else writeFileSync(out, next)

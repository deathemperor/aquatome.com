// Post-build: the site's two faces for the owner's dashboard (worker/admin/shell.ts), at stable names under
// dist/_ab/fonts/, since the site's own copies carry build hashes. Latin and Vietnamese subsets only.
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = (pkg: string, file: string) => fileURLToPath(new URL(`../node_modules/${pkg}/files/${file}`, import.meta.url))
const out = fileURLToPath(new URL('../dist/_ab/fonts/', import.meta.url))
mkdirSync(out, { recursive: true })
const FILES: [string, string][] = []
for (const sub of ['latin', 'vietnamese']) {
  for (const w of [400, 500, 600]) FILES.push(['@fontsource/be-vietnam-pro', `be-vietnam-pro-${sub}-${w}-normal.woff2`])
  FILES.push(['@fontsource-variable/newsreader', `newsreader-${sub}-wght-normal.woff2`])
}
for (const [pkg, file] of FILES) copyFileSync(from(pkg, file), `${out}${file}`)
console.log(`admin fonts: ${FILES.length} files`)

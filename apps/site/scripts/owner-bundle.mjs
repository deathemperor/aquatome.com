// Post-build: the owner bar (src/owner/bar.ts) as dist/_owner/bar.js, the one file a page with the owner's flag loads
// (worker/owner.ts), and the screenshot's library in a chunk of its own beside it, loaded only when the owner taps. No
// reader's page refers to either. The site's version goes into the bar here, so readers' pages don't carry it.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const at = path => fileURLToPath(new URL(path, import.meta.url))
const commit = () => {
  try { return execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}
const version = process.env.GITHUB_SHA?.slice(0, 9) || commit()
const out = at('../dist/_owner')
rmSync(out, { recursive: true, force: true })
await build({
  entryPoints: { bar: at('../src/owner/bar.ts') },
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  charset: 'utf8',
  target: ['es2021', 'safari15'],
  define: { __BUILD__: JSON.stringify(version) },
  chunkNames: '[name]-[hash]',
  outdir: out,
  logLevel: 'warning',
})
console.log(`owner bar: built with version ${version}`)

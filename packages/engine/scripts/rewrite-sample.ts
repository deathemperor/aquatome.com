/**
 * The editors' scratch rewrite (.claude/skills/editors/SKILL.md): copies a few pages from content/ to a
 * scratch content root, rewrites their Vietnamese there with the engine's style rewrite as it is now (rewrite-vi, every
 * part, reviewer-gated as on the site), and leaves content/ alone. Each run starts again from the site's text, so two
 * rounds compare the writer's rules, not two rewrites stacked.
 *
 *   CLAUDE_CODE_OAUTH_TOKENS="$(cat ~/.config/aquatome/claude-oauth-tokens)" \
 *     pnpm --filter @aq/engine exec tsx scripts/rewrite-sample.ts [--out <dir>] species/poecilia-reticulata guides/<slug>…
 *
 * Then: CONTENT_ROOT=<out>/content node .claude/skills/editors/packet.mjs page vi/<kind>/<slug> --out <round dir>
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeCli } from '../src/claude'
import { rewriteExisting } from '../src/vi-backfill'
import { VI_WRITE } from '../src/vi-rewrite'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } })
const pages = positionals.filter(p => /^[a-z]+\/[^/]+$/.test(p))
if (!pages.length) throw new Error('usage: rewrite-sample.ts [--out <dir>] <kind>/<slug>…')
const CONTENT = join(import.meta.dirname, '../../../content')
const out = resolve(values.out ?? join(homedir(), '.cache/aquatome/scratch'))
// The scratch root is emptied first: never inside the repository.
if (out.startsWith(resolve(import.meta.dirname, '../../..'))) throw new Error(`--out must be outside the repository: ${out}`)

await rm(out, { recursive: true, force: true })
await mkdir(join(out, 'content'), { recursive: true })
await mkdir(join(out, 'engine-state'), { recursive: true })
await cp(join(CONTENT, 'sources.json'), join(out, 'content/sources.json'))
for (const p of pages) await cp(join(CONTENT, p), join(out, 'content', p), { recursive: true })

const r = await rewriteExisting(join(out, 'content'), join(out, 'engine-state/vi-rewrite.json'), { llm: claudeCli, opts: VI_WRITE, now: () => new Date() }, { limit: pages.length, match: /[\s\S]/ })
console.log(`rewrite-sample: ${r.done.length} rewritten, ${r.kept.length} kept as they were, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
for (const x of [...r.done.map(d => `rewritten: ${d}`), ...r.kept.map(k => `kept: ${k}`), ...r.failed.map(f => `failed: ${f}`)]) console.log(x)
console.log(`scratch content: ${join(out, 'content')}`)

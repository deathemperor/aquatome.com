/**
 * Turns pages saved by fb-recon.ts into small, public-safe parser fixtures (test/fixtures/facebook):
 * only the embedded data blobs that hold posts, photos or albums, with comments, reactions, tracking and other
 * people's names removed. The repo is public: never commit raw recon HTML.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/fb-fixtures.ts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'node-html-parser'
import { FB } from '../src/facebook/config'
import { jsonIn } from '../src/facebook/parse'

const IN = '/tmp/aqfb-recon'
const OUT = join(import.meta.dirname, '../test/fixtures/facebook')
const DROP = /^(feedback|comment|encrypted|tracking|trackingdata|debug_info|click_tracking|serialized|viewability|sponsored|whatsapp|story_bucket|profile_picture|__module|future_of_feed|client_view_config|cix_screen|bumpers|schema_context|ufi|top_reactions|reactors|can_viewer|album_menu_items)/i

/** The outermost Stories, photo grids and Photos in a blob: the data the parsers read, without the page's config and tokens. */
function subtrees(o: unknown): unknown[] {
  if (Array.isArray(o)) return o.flatMap(subtrees)
  if (!o || typeof o !== 'object') return []
  const x = o as Record<string, unknown>
  if (x.__typename === 'Story' || x.__typename === 'Photo' || x.__typename === 'Album' || 'grid_media' in x) return [x]
  return Object.values(x).flatMap(subtrees)
}

function prune(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(prune)
  if (!o || typeof o !== 'object') return o
  const x = o as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(x)) if (!DROP.test(k)) out[k] = prune(v)
  if (x.__typename === 'User' && x.id !== FB.ownerId) return { __typename: 'User', id: '1', name: 'Someone' }
  return out
}

await mkdir(OUT, { recursive: true })
for (const name of ['timeline', 'post', 'album']) {
  const html = await readFile(join(IN, `${name === 'post' ? 'post-many' : name}.html`), 'utf8')
  const blobs = jsonIn(html).flatMap(subtrees).map(prune)
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(blobs)}\n`)
  console.log(`${name}.json: ${blobs.length} blobs`)
}
// Album list: the anchors only, classes dropped.
const albums = parse(await readFile(join(IN, 'albums.html'), 'utf8')).querySelectorAll('a[href*="media/set/?set=a."]')
  .map(a => `<a href="${a.getAttribute('href')!.replace(/&/g, '&amp;')}" role="link">${a.querySelectorAll('span').map(s => s.childNodes.filter(n => n.nodeType === 3).map(n => n.text).join('')).filter(Boolean).map(t => `<span>${t}</span>`).join('')}</a>`)
await writeFile(join(OUT, 'albums.html'), `<html><body><div role="main">\n${albums.join('\n')}\n</div></body></html>\n`)
console.log(`albums.html: ${albums.length} albums`)

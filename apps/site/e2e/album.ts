import type { APIRequestContext } from '@playwright/test'
import { sourcePages } from './pages'

/** A page's album as its strip carries it for the viewer (GalleryStrip.astro, lib/album.ts). */
export type Album = { name: string; photos: { u: string; w: number; h: number; a: string; s: string; l?: string; lu?: string; b?: string; ai?: 1; un?: 1 }[] }

/** The album a page's strip carries for the viewer (GalleryStrip.astro), read from its HTML. */
export const albumIn = (html: string): Album | undefined => {
  const m = /<section(?![^>]*\bhidden\b)[^>]*\bdata-album\b[^>]*>[\s\S]*?<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  return m ? (JSON.parse(m[1]!) as Album) : undefined
}

/** The first page of a section (of at most 40) whose album passes `ok`: by default any nonempty album. */
export async function albumPage(request: APIRequestContext, section: 'ca' | 'cay', ok = (a: Album, html: string) => a.photos.length > 0 && !!html) {
  const paths = sourcePages().filter(p => new RegExp(`^/${section}/[^/]+/$`).test(p)).slice(0, 40)
  // Serial discovery ran out of the test's 30 seconds on live. Start a few lookups together, but
  // consume them in sitemap order and surface any read error encountered before the first match.
  const batchSize = 4
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize).map(path => request.get(path, { maxRetries: 1 })
      .then(response => response.text())
      .then(html => ({ path, html }), (error: unknown) => ({ error })))
    for (const pending of batch) {
      const result = await pending
      if ('error' in result) throw result.error
      const { path, html } = result
      const album = albumIn(html)
      if (album && ok(album, html)) return { path, album, html }
    }
  }
  return undefined
}

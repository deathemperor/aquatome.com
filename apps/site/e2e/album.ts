import type { APIRequestContext } from '@playwright/test'
import { sourcePages } from './pages'

/** A page's album as its strip carries it for the viewer (GalleryStrip.astro, lib/album.ts). */
export type Album = { name: string; photos: { u: string; w: number; h: number; a: string; s: string; l?: string; lu?: string; b?: string; ai?: 1; un?: 1 }[] }

/** The album a page's strip carries for the viewer (GalleryStrip.astro), read from its HTML. */
export const albumIn = (html: string): Album | undefined => {
  const m = /<section[^>]*\bdata-album\b[^>]*>[\s\S]*?<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  return m ? (JSON.parse(m[1]!) as Album) : undefined
}

/** The first page of a section (of at most 40) whose album passes `ok`: by default one with "Xem tất cả", six photos or more. */
export async function albumPage(request: APIRequestContext, section: 'ca' | 'cay', ok = (a: Album, html: string) => a.photos.length >= 6 && !!html) {
  for (const path of sourcePages().filter(p => new RegExp(`^/${section}/[^/]+/$`).test(p)).slice(0, 40)) {
    const html = await (await request.get(path)).text()
    const album = albumIn(html)
    if (album && ok(album, html)) return { path, album, html }
  }
  return undefined
}

import type { APIRoute, GetStaticPaths } from 'astro'
import sharp from 'sharp'
import { getContent } from '../../../lib/content'
import { LANGS } from '../../../lib/i18n'
import { rangePicture } from '../../../lib/range'

// A species' records map as the app's picture (lib/range-map.ts): /app/range/<id>-<hash>.png, the PNG of the map its
// page draws inline, at twice the size in the light colours, no words in it (the copy's caption has the legend).
export const getStaticPaths: GetStaticPaths = async () => {
  const pics = new Map<string, string>()
  for (const lang of LANGS) {
    for (const s of (await getContent(lang)).species) {
      const pic = rangePicture(s.id, s.range)
      if (pic) pics.set(pic.file, pic.svg)
    }
  }
  return [...pics].map(([file, svg]) => ({ params: { file: file.replace(/^\/app\/range\/|\.png$/g, '') }, props: { svg } }))
}

// Full colour: about 30 ms a map, where a palette's would be a third smaller but three times as slow to make.
export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await sharp(Buffer.from((props as { svg: string }).svg)).png({ compressionLevel: 9 }).toBuffer()), { headers: { 'Content-Type': 'image/png' } })

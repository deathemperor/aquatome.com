import sharp from 'sharp'
import { THUMB_WIDTH } from '@aq/schema'
import type { Media } from './source-photos'

const thumbKey = (key: string) => key.replace(/\.webp$/, `-${THUMB_WIDTH}.webp`)
const thumb = (bytes: Uint8Array) => sharp(bytes).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()

/** Cloudflare R2 bucket behind a public custom domain; images are normalised to ≤1200px WebP plus a 480px card thumb, cached a year (a key is never reused for other content). */
export function r2Media(opts: { accountId: string; token: string; bucket: string; publicBase: string }): Media & { putThumb: (key: string, bytes: Uint8Array) => Promise<void> } {
  const urlFor = (key: string) => `${opts.publicBase}/${key}`
  async function upload(key: string, data: Uint8Array) {
    const put = () => fetch(`https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/r2/buckets/${opts.bucket}/objects/${key}`, {
      method: 'PUT', headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' }, body: new Uint8Array(data),
    })
    let r = await put()
    for (let i = 1; i <= 3 && r.status >= 500; i++) { // Cloudflare API hiccups (e.g. 10500) are transient
      await new Promise(res => setTimeout(res, 2000 * i))
      r = await put()
    }
    if (!r.ok) throw new Error(`R2 upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  return {
    urlFor,
    async put(key, bytes) {
      const { data, info } = await sharp(bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
      await upload(key, data)
      await upload(thumbKey(key), await thumb(bytes))
      return { url: urlFor(key), thumb: urlFor(thumbKey(key)), width: info.width, height: info.height }
    },
    /** Backfill: the thumb for an already-stored photo. */
    putThumb: async (key, bytes) => upload(thumbKey(key), await thumb(bytes)),
  }
}

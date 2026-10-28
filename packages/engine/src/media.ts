import sharp from 'sharp'
import type { Media } from './source-photos'

/** Cloudflare R2 bucket behind a public custom domain; images are normalised to ≤1200px WebP. */
export function r2Media(opts: { accountId: string; token: string; bucket: string; publicBase: string }): Media {
  const urlFor = (key: string) => `${opts.publicBase}/${key}`
  return {
    urlFor,
    async put(key, bytes) {
      const { data, info } = await sharp(bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/r2/buckets/${opts.bucket}/objects/${key}`, {
        method: 'PUT', headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'image/webp' }, body: new Uint8Array(data),
      })
      if (!r.ok) throw new Error(`R2 upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return { url: urlFor(key), width: info.width, height: info.height }
    },
  }
}

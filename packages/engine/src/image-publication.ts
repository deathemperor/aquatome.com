import sharp from 'sharp'
import type { Photo } from '@aq/schema'
import { imageXmp } from './image-transforms'
import { sha256 } from './image-reference'

export type ImageStore = (key: string, bytes: Uint8Array, contentType: string, signal?: AbortSignal) => Promise<string>
export const primaryImageBytes = (bytes: Uint8Array, lossless = false) =>
  (lossless ? sharp(bytes).rotate().webp({ lossless: true }) : sharp(bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 })).toBuffer()

/** Preserve provenance in ALL variants. A box-only repair's canonical file must remain lossless and unresized. */
export async function storeImageVariants(bytes: Uint8Array, record: Pick<Photo, 'generated' | 'altered'>, store: ImageStore, losslessCanonical = false, signal?: AbortSignal): Promise<Pick<Photo, 'url' | 'width' | 'height' | 'thumb' | 'large'>> {
  const xmp = imageXmp(record)
  const prepare = () => sharp(bytes).rotate()
  const main = await (losslessCanonical ? prepare().webp({ lossless: true }) : prepare().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 })).withXmp(xmp).toBuffer({ resolveWithObject: true })
  const key = `processed/${sha256(main.data).slice(0, 32)}`
  const url = await store(`${key}.webp`, main.data, 'image/webp', signal)
  const thumb = await store(`${key}-480.webp`, await prepare().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 75 }).withXmp(xmp).toBuffer(), 'image/webp', signal)
  const meta = await sharp(bytes).metadata()
  let large: Photo['large']
  if (!losslessCanonical && meta.width > main.info.width) {
    const b = await prepare().webp({ quality: 80 }).withXmp(xmp).toBuffer({ resolveWithObject: true })
    large = { url: await store(`${key}-large.webp`, b.data, 'image/webp', signal), width: b.info.width, height: b.info.height }
  }
  return { url, thumb, width: main.info.width, height: main.info.height, ...(large ? { large } : {}) }
}

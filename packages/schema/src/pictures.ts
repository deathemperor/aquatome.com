import { THUMB_WIDTH } from './thumb'
import type { Photo } from './types'

/** A photo a card can crop to its shape and keep the fish whole: not a strip wider than about 2:1. */
export const fitsCard = (p: Pick<Photo, 'width' | 'height'>) => p.width <= p.height * 2.2

/**
 * A photo without a source's watermark banner (Glaser stamps its name across the top) that a card can crop whole, else
 * one without the banner, else the first. The site's cards take this; the engine's ranking of a fish's head photo reads
 * the same order, so a card and the page it opens show one picture.
 */
export const cleanPhoto = (photos: Photo[]) => photos.find(p => p.source !== 'glaser' && fitsCard(p)) ?? photos.find(p => p.source !== 'glaser') ?? photos[0]

/**
 * One picture, whatever file it is in: the same photo stored twice (two articles of one source each had a copy),
 * resized or re-encoded, is still the same picture. Photos are compared by a 64-bit difference hash of the image
 * (content/picture-hashes.json, photo address → hex, written by `pnpm engine picture-hashes`); a YouTube thumbnail
 * is its video; anything else its address.
 */
export type PictureHashes = Record<string, string>

/** At most this many bits apart: the same picture (near-copies differ in a few, other photos in about 30). */
export const SAME_PICTURE = 6

/** Bits set in a 32-bit number. */
const bits = (x: number) => {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}
/** How many bits two hashes (16 hex digits) differ in. In 32-bit halves: a page compares each picture with every one it shows. */
export function hashDistance(a: string, b: string): number {
  return bits(parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) + bits(parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16))
}

const YOUTUBE = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//
const THUMB = new RegExp(`-${THUMB_WIDTH}\\.webp$`)

/** What a picture is known by: `yt:<id>` for a video's thumbnail; else its image hash when known; else its address (a card's thumb is its photo). */
export function pictureOf(src: string, hashes: PictureHashes): { key: string; hash?: string } {
  const yt = src.match(YOUTUBE)
  if (yt) return { key: `yt:${yt[1]}` }
  const url = src.replace(THUMB, '.webp')
  const hash = hashes[src] ?? hashes[url]
  return hash ? { key: url, hash } : { key: url }
}

/** The pictures one page shows, so nothing on it shows the same picture twice. */
export class PictureSet {
  private keys = new Set<string>()
  private hashes: string[] = []
  constructor(private known: PictureHashes) {}
  has(src: string | undefined): boolean {
    if (!src) return false
    const p = pictureOf(src, this.known)
    return this.keys.has(p.key) || (!!p.hash && this.hashes.some(h => hashDistance(h, p.hash!) <= SAME_PICTURE))
  }
  add(src: string | undefined): void {
    if (!src) return
    const p = pictureOf(src, this.known)
    this.keys.add(p.key)
    if (p.hash) this.hashes.push(p.hash)
  }
  /** The first photo whose picture the page doesn't show yet, now shown; undefined when every one is. */
  take<P extends { url: string }>(photos: (P | undefined)[]): P | undefined {
    const p = photos.find(x => x && !this.has(x.url))
    this.add(p?.url)
    return p
  }
}

import { thumbOf, type Photo } from '@aq/schema'

/** Card/thumbnail source: our recorded 480px thumb, Wikimedia's 500px size, else the full photo. */
export const smallSrc = (p: Photo) => p.thumb ?? (new URL(p.url).host.endsWith('wikimedia.org') ? thumbOf(p.url) : undefined) ?? p.url

/**
 * The photo the fish-ID tool sends: its long side at most this many pixels, as JPEG at this quality. The page shrinks
 * the reader's photo so (src/scripts/fish-id.ts), and the accuracy script its test photos, so both send Claude the same.
 * No imports: the page's script bundles this file.
 */
export const MAX_SIDE = 1024
export const JPEG_QUALITY = 0.85

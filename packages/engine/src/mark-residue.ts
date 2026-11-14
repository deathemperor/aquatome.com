import sharp from 'sharp'
import { MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION } from '@aq/schema'
import type { MarkBox } from './image-transforms'

export type ResidueMeasurement = { version: string; score: number | null; limit: number; originalEnergy: number; candidateEnergy: number }
/**
 * Original-coordinate detail is the template: mean RGB minus a one-pixel Gaussian background, absolute magnitude.
 * Its cosine overlap with repainted detail catches faint surviving outlines even after their colour changes.
 * The template includes natural detail too: correlated backgrounds can conservatively lose yield. This is not OCR
 * or a claim to segment glyphs perfectly. An absent original template is unmeasurable. A flat candidate has zero outline overlap; vision still judges its naturalness.
 */
export async function measureMarkResidue(original: Uint8Array, candidate: Uint8Array, b: MarkBox): Promise<ResidueMeasurement> {
  const crop = { left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }
  const details = async (input: Uint8Array) => {
    const bytes = await sharp(input).rotate().toColourspace('srgb').removeAlpha().extract(crop).raw().toBuffer()
    const blurred = await sharp(bytes, { raw: { width: crop.width, height: crop.height, channels: 3 } }).blur(1).raw().toBuffer()
    const out = new Float64Array(crop.width * crop.height)
    for (let i = 0; i < out.length; i++) {
      const at = i * 3
      out[i] = Math.abs((bytes[at]! + bytes[at + 1]! + bytes[at + 2]! - blurred[at]! - blurred[at + 1]! - blurred[at + 2]!) / 3)
    }
    return out
  }
  const [a, c] = await Promise.all([details(original), details(candidate)])
  let originalEnergy = 0, candidateEnergy = 0, dot = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]! * c[i]!; originalEnergy += a[i]! ** 2; candidateEnergy += c[i]! ** 2 }
  const score = originalEnergy <= 0 ? null : candidateEnergy === 0 ? 0 : Math.max(0, Math.min(1, dot / Math.sqrt(originalEnergy * candidateEnergy)))
  return { version: MARK_RESIDUE_VERSION, score, limit: MARK_RESIDUE_LIMIT, originalEnergy, candidateEnergy }
}
/** Invalid policy or malformed data is unavailable evidence, never a successful residue detection. */
export const validResidueMeasurement = (m: ResidueMeasurement | undefined): m is ResidueMeasurement =>
  !!m && m.version === MARK_RESIDUE_VERSION && m.limit === MARK_RESIDUE_LIMIT
  && Number.isFinite(m.originalEnergy) && m.originalEnergy >= 0 && Number.isFinite(m.candidateEnergy) && m.candidateEnergy >= 0
  && (m.score === null ? m.originalEnergy === 0 : Number.isFinite(m.score) && m.score >= 0 && m.score <= 1 && m.originalEnergy > 0)
export const residuePass = (m: ResidueMeasurement | undefined): m is ResidueMeasurement & { score: number } =>
  validResidueMeasurement(m) && m.score !== null && m.score < MARK_RESIDUE_LIMIT

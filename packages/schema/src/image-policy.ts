/** Activation is a reviewed code change after the owner's word. No environment variable enables publication. */
export type ImageSwitches = {
  generateMissing: boolean
  generatePopular: boolean
  upscaleGenerated: boolean
  removeMarks: boolean
  upscaleReal: boolean
  publishGenerated: boolean
  publishAltered: boolean
}
export const IMAGE_SWITCHES: Readonly<ImageSwitches> = Object.freeze({
  generateMissing: false,
  generatePopular: false,
  upscaleGenerated: false,
  removeMarks: false,
  upscaleReal: false,
  publishGenerated: false,
  publishAltered: false,
})

/** Reader gate: update alongside the judge instruction/model; a regression test holds them together. */
export const APPROVED_GENERATED_GATE = '6b426028ef80f6208d511e0a5367dd7a431f017a784e169383d3b1609777b7ed'

export const MARK_RESIDUE_LIMIT = 0.4
export const MARK_RESIDUE_VERSION = 'box-detail-cosine-v1'

/** Also refuses malformed or legacy generation markers in recognition paths. No runtime schema dependency. */
export const isGenerated = (p: unknown): boolean => !!p && typeof p === 'object' && 'generated' in p && (p as { generated?: unknown }).generated !== undefined

export type GeneratedRecord = {
  model: string
  driverModel: string
  date: string
  prompt: string
  referenceHash: string
  check?: { verdict: 'pass'; version: string; model: string; at: string; referenceHash: string; pixelHash: string; calibrationHash: string }
}
export type Alteration = {
  method: 'mark-removal' | 'lanczos3-upscale'
  date: string
  originalHash: string
  box?: { x0: number; y0: number; x1: number; y1: number }
  outsideChanged?: 0
  noTrace?: 'pass'
  permissionDate?: string
  residue?: { version: string; score: number; limit: number }
}

/** A positive, independently referenced verdict only. A real-photo 'unsure' can never stand in for this. */
export function generatedApproved(p: { generated?: GeneratedRecord }): boolean {
  const g = p.generated, c = g?.check
  return !!g?.model && g.model !== 'unreported' && !!g.driverModel && !!g.date && !!g.prompt && !!c && c.verdict === 'pass'
    && c.version === APPROVED_GENERATED_GATE && c.referenceHash === g.referenceHash && [g.referenceHash, c.version, c.pixelHash, c.calibrationHash].every(s => /^[a-f0-9]{64}$/.test(s))
}

/** Stable partition: no size, best-pick or species-check score may put an AI picture before a real one. */
export const realPhotosFirst = <P>(photos: P[]): P[] => [...photos.filter(p => !isGenerated(p)), ...photos.filter(isGenerated)]

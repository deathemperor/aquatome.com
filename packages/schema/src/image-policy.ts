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
export const APPROVED_GENERATED_GATE = '49b6aa07c932bbb0ffe0189066d599d96232f8f99f96ba1c53b72893b809fd69'

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
  check?: { passes?: 2; judgments?: [string, string]; verdict: 'pass'; version: string; model: string; at: string; referenceHash: string; pixelHash: string; calibrationHash: string }
}
export type Alteration = {
  method: 'mark-removal' | 'mark-crop' | 'lanczos3-upscale'
  date: string
  originalHash: string
  box?: { x0: number; y0: number; x1: number; y1: number }
  outsideChanged?: 0
  noTrace?: 'pass'
  permissionDate?: string
  residue?: { version: string; score: number; limit: number }
  crop?: import('./image-geometry').CropGeometry
  excludedMarks?: import('./image-geometry').PixelBox[]
  retainedChanged?: 0
  checks?: { species: [string,string]; ownership: [string,string]; noTrace?: [string,string]; preservation?: [string,string] }
}
export const validImageJudgmentHashes = (value:unknown):value is [string,string] => Array.isArray(value)&&value.length===2&&value[0]!==value[1]&&value.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h))

/** A positive, independently referenced verdict only. A real-photo 'unsure' can never stand in for this. */
export function generatedApproved(p: { generated?: GeneratedRecord }): boolean {
  const g = p.generated, c = g?.check
  return !!g?.model && g.model !== 'unreported' && !!g.driverModel && !!g.date && !!g.prompt && !!c && c.verdict === 'pass'
    && c.passes === 2 && Array.isArray(c.judgments) && c.judgments.length === 2 && c.judgments[0] !== c.judgments[1] && c.judgments.every(h => /^[a-f0-9]{64}$/.test(h))
    && c.version === APPROVED_GENERATED_GATE && c.referenceHash === g.referenceHash && [g.referenceHash, c.version, c.pixelHash, c.calibrationHash].every(s => /^[a-f0-9]{64}$/.test(s))
}

/** Stable partition: no size, best-pick or species-check score may put an AI picture before a real one. */
export const realPhotosFirst = <P>(photos: P[]): P[] => [...photos.filter(p => !isGenerated(p)), ...photos.filter(isGenerated)]

import reviewedControls from './image-controls.json'
import sharp from 'sharp'
import { MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION, type Alteration, type GeneratedRecord } from '@aq/schema'
import { LARGE_LONG, LARGE_SHORT } from './large-photos'
import { sha256 } from './image-reference'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { residuePass, validResidueMeasurement, type ResidueMeasurement } from './mark-residue'
import type { ImageReference } from './image-reference'
import { blendMarkPixels, MARK_BLEND_VERSION } from './image-blend'
import { validJudgmentPair, type JudgmentPairReceipt } from './image-judgments'

export type MarkBox = { x0: number; y0: number; x1: number; y1: number }
export const insideBox = (x: number, y: number, b: MarkBox) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
const pixels = (b: Uint8Array) => sharp(b).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
export async function pixelHash(b: Uint8Array): Promise<string> {
  const p = await pixels(b)
  return sha256(Buffer.concat([Buffer.from(`${p.info.width}x${p.info.height}:`), p.data]))
}

/** Compare the decoded original and the encoded result; metadata bytes do not stand in for a pixel proof. */
export async function outsideBoxProof(original: Uint8Array, changed: Uint8Array, box: MarkBox): Promise<{ inside: number; outside: number }> {
  const [a, b] = await Promise.all([pixels(original), pixels(changed)])
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error('mark removal changed the photo size')
  let inside = 0, outside = 0
  for (let y = 0; y < a.info.height; y++) for (let x = 0; x < a.info.width; x++) {
    const at = (y * a.info.width + x) * 4
    if (a.data.subarray(at, at + 4).equals(b.data.subarray(at, at + 4))) continue
    if (insideBox(x, y, box)) inside++; else outside++
  }
  return { inside, outside }
}

/** The generated edit may change its entire input. Only these original-coordinate pixels ever enter the result. */
export async function composeMarkPatch(original: Uint8Array, edit: Uint8Array, box: MarkBox, patch?: { left: number; top: number; width: number; height: number }): Promise<{ bytes: Buffer; proof: { inside: number; outside: number } }> {
  const a = await pixels(original), { width, height } = a.info
  if (![box.x0, box.y0, box.x1, box.y1].every(Number.isInteger) || box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height || box.x0 >= box.x1 || box.y0 >= box.y1) throw new Error('mark box outside original')
  const area = patch ?? { left: 0, top: 0, width, height }
  if (area.left < 0 || area.top < 0 || area.left + area.width > width || area.top + area.height > height || box.x0 < area.left || box.y0 < area.top || box.x1 > area.left + area.width || box.y1 > area.top + area.height) throw new Error('mark box outside patch')
  const b = await sharp(edit).rotate().toColourspace('srgb').ensureAlpha().resize(area.width, area.height, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer()
  const { data: out } = blendMarkPixels(a.data, b, width, area, box)
  const bytes = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
  const proof = await outsideBoxProof(original, bytes, box)
  if (proof.outside !== 0) throw new Error('mark removal changed pixels outside its box')
  return { bytes, proof }
}

/** Same target bounds as large-photos, with enlargement allowed and recorded, never represented as recovered detail. */
export const upscaleSize = ({ width, height }: { width: number; height: number }) => {
  if (width <= 0 || height <= 0) throw new Error('invalid image size')
  const scale = Math.max(1, Math.min(LARGE_SHORT / Math.min(width, height), LARGE_LONG / Math.max(width, height)))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
export async function upscaleImage(bytes: Uint8Array): Promise<Buffer> {
  const meta = await sharp(bytes).rotate().metadata()
  const size = upscaleSize({ width: meta.autoOrient.width, height: meta.autoOrient.height })
  return sharp(bytes).rotate().resize(size.width, size.height, { kernel: 'lanczos3' }).png().toBuffer()
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Machine provenance in every served variant, in addition to the record and the native original's C2PA. */
export const imageXmp = (record: { generated?: GeneratedRecord; altered?: Alteration[] }) => `<?xpacket begin="﻿"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:iptc="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(JSON.stringify(record))}</rdf:li></rdf:Alt></dc:description>${record.generated ? '<iptc:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</iptc:DigitalSourceType>' : ''}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`

export type NoTraceVerdict = { verdict: 'pass' | 'fail' | 'unsure'; residual: boolean; newMark: boolean; note: string }
export const NO_TRACE_SCHEMA = { type: 'object', required: ['verdict', 'residual', 'newMark', 'note'], properties: { verdict: { type: 'string', enum: ['pass', 'fail', 'unsure'] }, residual: { type: 'boolean' }, newMark: { type: 'boolean' }, note: { type: 'string' } } }
export const noTracePass = (v: NoTraceVerdict | undefined) => v?.verdict === 'pass' && v.residual === false && v.newMark === false
export const NO_TRACE_MODEL = 'gpt-6.1-sol'
export const NO_TRACE_INSTRUCTION = 'Examine the full photograph and enlarged removed-mark box for any residual lettering, signature stroke, logo outline, ghost, unnatural smear, patch or new mark, including faint traces. Pass only if no trace is visible and the patch looks natural. If uncertain, unsure. First attachment: candidate. Second: enlarged box. Failures stay private. Never transcribe lettering, signatures or personal names; report only that lettering is present and where it remains.'
export const ACCEPTED_MARK_RESIDUE = Object.freeze({ strength: 0.05, date: '2026-11-11', authority: 'accepted by the owner after viewing' })
export const noTraceVersion = () => sha256(JSON.stringify([ACCEPTED_MARK_RESIDUE, NO_TRACE_MODEL, 'high', NO_TRACE_INSTRUCTION, NO_TRACE_SCHEMA, MARK_RESIDUE_VERSION, MARK_RESIDUE_LIMIT, MARK_BLEND_VERSION]))
export type NoTraceCalibration = { version: string; subLimitMisses: {id:string;strength:number;score:number|null}[]; cases: { id?: string; n?: number; expected: 'pass' | 'refuse'; actual: 'pass' | 'refuse'; pixelHash: string; outside: number; originalHash: string; box: MarkBox; measurement: ResidueMeasurement; measurementTemplateHash?: string; judgments?: JudgmentPairReceipt; reason?: string }[] }
const reviewedMarkControls = [...reviewedControls.marks.map(f => ({ ...f, id: `frozen-${f.n}`, measurementTemplateHash: undefined as string | undefined })), ...reviewedControls.markSupplement.map(f => ({ ...f, measurementTemplateHash: 'measurementTemplateHash' in f ? f.measurementTemplateHash : undefined }))]
const residueStrength = (id:string) => /^residue-\d+-(0\.\d+)$/.exec(id)?.[1]
export const subLimitMarkMisses = (cases:NoTraceCalibration['cases']) => cases.flatMap(r=>{
  const strength=Number(residueStrength(r.id??''))
  return strength>0&&strength<ACCEPTED_MARK_RESIDUE.strength&&r.actual==='pass'?[{id:r.id!,strength,score:r.measurement.score}]:[]
})
/** All submitted safety controls bind readiness. Clean refusals lose yield; residues at the accepted strength require both eyes and measurement to refuse. */
export const noTraceCalibrationReady = (c: NoTraceCalibration | undefined): c is NoTraceCalibration => !!c && c.version === noTraceVersion() && Array.isArray(c.cases) && c.cases.length === reviewedMarkControls.length && c.cases.every(x=>!!x&&typeof x==='object'&&validResidueMeasurement(x.measurement)&&x.measurement.score!==null) && JSON.stringify(c.subLimitMisses)===JSON.stringify(subLimitMarkMisses(c.cases)) && reviewedMarkControls.every(f => {
  const rows = c.cases.filter(x => (x.id ?? `frozen-${x.n}`) === f.id), r = rows[0]
  return rows.length === 1 && !!r && r.expected === f.expected && r.pixelHash === f.pixelHash && r.originalHash === f.originalHash && JSON.stringify(r.box) === JSON.stringify(f.box) && r.measurementTemplateHash === f.measurementTemplateHash
    && r.outside === 0 && validJudgmentPair(r.judgments) && !!r.measurement && ['pass','refuse'].includes(r.actual)
    && (r.actual === 'pass' ? r.judgments.pass && residuePass(r.measurement) : !r.judgments.pass || !residuePass(r.measurement))
    && (f.expected === 'refuse' ? (Number(residueStrength(f.id))>0 ? Number(residueStrength(f.id))<ACCEPTED_MARK_RESIDUE.strength || r.judgments.judgments.every(j=>!j.passes)&&!residuePass(r.measurement) : r.actual==='refuse') : r.actual === 'pass' || !!r.reason?.trim())
})


/** Enlarged views keep endpoint/leaf details available without treating generated pixels as checking evidence. */
export async function generatedViews(candidate: string, reference: ImageReference, dir: string): Promise<{ files: string[]; roles: string[] }> {
  await mkdir(dir, { recursive: true })
  const files: string[] = [], roles: string[] = []
  for (const [i, item] of [{ file: candidate, role: 'candidate' }, ...reference.images.map(x => ({ file: x.file, role: 'real checking reference' }))].entries()) {
    files.push(item.file); roles.push(`${item.role}, full`)
    const meta = await sharp(item.file).metadata(), { width, height } = meta.autoOrient
    for (const [side, left] of [['left', 0], ['right', Math.floor(width * 0.45)]] as const) {
      const file = join(dir, `${i}-${side}.png`)
      await sharp(item.file).rotate().extract({ left, top: 0, width: width - Math.floor(width * 0.45), height }).resize({ width: 1400 }).png().toFile(file)
      files.push(file); roles.push(`${item.role}, enlarged ${side} view`)
    }
  }
  return { files, roles }
}

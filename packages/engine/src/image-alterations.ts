import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, isAllowedLicence, mayPublish, type Alteration, type ImageSwitches, type Photo, type SourceInfo } from '@aq/schema'
import { composeMarkPatch, imageXmp, noTracePass, NO_TRACE_INSTRUCTION, outsideBoxProof, upscaleImage, type MarkBox, type NoTraceVerdict } from './image-transforms'
import { measureMarkResidue, residuePass } from './mark-residue'
import { sha256 } from './image-reference'

export type MarkEvidence = { owner: 'source' | 'photographer' | 'third-party' | 'unknown'; text: string; box: MarkBox; sourceUrl: string }
const STOCK = /getty|shutterstock|\bistock\b|alamy|adobe\s*stock|dreamstime|123rf|depositphotos|pond5/i
const key = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
const host = (s: string) => { try { return new URL(s).hostname.replace(/^www\./, '') } catch { return '' } }
/** Ownership is established separately from permission to alter. A third party's mark is never cleaned for a source. */
export function ownsMark(photo: Photo, source: SourceInfo, mark: MarkEvidence): boolean {
  if (mark.owner === 'third-party' || mark.owner === 'unknown' || STOCK.test(mark.text) || !mark.text.trim() || mark.sourceUrl !== photo.sourceUrl) return false
  const sourceHost = host(source.homepage), photoHost = host(photo.sourceUrl)
  if (!sourceHost || (photoHost !== sourceHost && !photoHost.endsWith(`.${sourceHost}`))) return false
  const allowedHosts = [host(photo.sourceUrl), ...(photo.authorUrl ? [host(photo.authorUrl)] : [])].filter(Boolean)
  const namedHosts = mark.text.match(/(?:[a-z0-9-]+\.)+(?:com|org|net|de|vn|co|uk|th|id|my)\b/gi) ?? []
  if (namedHosts.some(h => !allowedHosts.some(a => h.toLowerCase() === a || a.endsWith(`.${h.toLowerCase()}`)))) return false
  const text = key(mark.text)
  if (mark.owner === 'source') return [key(source.name), ...allowedHosts.slice(0, 1).map(key)].some(n => n.length >= 4 && text.includes(n))
  // A source-only credit cannot establish the identity of an unnamed photographer's signature.
  const author = key(photo.author.replace(source.name, '').replace(/[\/|]/g, ' ').trim())
  return author.length >= 4 && (text.includes(author) || (photo.authorUrl !== undefined && text.includes(key(host(photo.authorUrl)))))
}

export function alterationAllowed(photo: Photo): boolean {
  if (/\bnd\b|no[ -]?derivatives?|no[ -]?alterations?/i.test(photo.licence)) return false
  return isAllowedLicence(photo.licence) || (!!photo.source && photo.licence === 'dùng với sự cho phép')
}

export function canRemoveMark(photo: Photo, source: SourceInfo | undefined, mark: MarkEvidence, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES): boolean {
  return switches.removeMarks && !photo.generated && !photo.altered?.length && !!source && mayPublish(source, 'photos')
    && source.permission?.markRemoval?.allowed === true && alterationAllowed(photo) && ownsMark(photo, source, mark)
}

export type AlterationDeps = {
  cache: string
  edit: (prompt: string, originalFile: string) => Promise<Uint8Array>
  noTrace: (file: string, prompt: string, images: string[]) => Promise<NoTraceVerdict>
  now: () => Date
}

/** The caller retains the original on every refusal; notably Glaser's permitted logo photo is not replaced by a smear. */
export async function removeSourceMark(photo: Photo, original: Uint8Array, source: SourceInfo, mark: MarkEvidence, d: AlterationDeps, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES): Promise<{ bytes: Uint8Array; altered: Alteration[] } | undefined> {
  if (!canRemoveMark(photo, source, mark, switches)) return undefined
  const hash = sha256(original), dir = join(d.cache, 'alterations', hash)
  await mkdir(dir, { recursive: true })
  const originalFile = join(dir, 'original')
  // Retain exactly the bytes received, independently of any decoded/composited or published file.
  await writeFile(originalFile, original, { flag: 'wx', mode: 0o600 }).catch(async e => { if (e.code !== 'EEXIST' || sha256(await readFile(originalFile)) !== hash) throw e })
  const edited = await d.edit(`Remove only the source's own mark or credited signature ${JSON.stringify(mark.text)} from box ${JSON.stringify(mark.box)} in the attached photograph. Repaint its natural background. Keep the fish or plant anatomically correct. Add no text, logo, person, hand, object or AquaTome mark.`, originalFile)
  const composed = await composeMarkPatch(original, edited, mark.box)
  const file = join(dir, 'candidate.png'), cropFile = join(dir, 'candidate-box.png')
  await writeFile(file, composed.bytes, { mode: 0o600 })
  const b = mark.box
  await sharp(composed.bytes).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }).resize({ width: Math.max(800, b.x1 - b.x0) }).png().toFile(cropFile)
  const measurement = await measureMarkResidue(original, composed.bytes, b)
  await writeFile(join(dir, 'residue.json'), JSON.stringify(measurement), { mode: 0o600 })
  if (!residuePass(measurement)) return undefined
  const verdict = await d.noTrace(file, `${NO_TRACE_INSTRUCTION} Former mark: ${JSON.stringify(mark.text)}; box: ${JSON.stringify(b)}.`, [cropFile])
  await writeFile(join(dir, 'no-trace.json'), JSON.stringify(verdict), { mode: 0o600 })
  if (!noTracePass(verdict)) return undefined
  const altered: Alteration[] = [{ method: 'mark-removal', date: d.now().toISOString(), originalHash: hash, box: b, outsideChanged: 0, noTrace: 'pass', residue: { version: measurement.version, score: measurement.score, limit: measurement.limit }, permissionDate: source.permission!.markRemoval!.allowed ? source.permission!.markRemoval!.date : undefined }]
  // Lossless canonical output is essential: the usual lossy media.put would invalidate the trial's pixel proof.
  const bytes = await sharp(composed.bytes).webp({ lossless: true }).withXmp(imageXmp({ altered })).toBuffer()
  const proof = await outsideBoxProof(original, bytes, b)
  await writeFile(join(dir, 'proof.json'), JSON.stringify(proof), { mode: 0o600 })
  if (proof.outside !== 0) throw new Error('encoded alteration changed pixels outside the mark box')
  return { bytes, altered }
}

/** Upscaling someone else's image is a separate operation; it never runs as a side effect of mark removal. */
export async function upscalePhoto(photo: Photo, bytes: Uint8Array, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES): Promise<{ bytes: Uint8Array; altered: Alteration[] } | undefined> {
  if (photo.generated ? !switches.upscaleGenerated : !switches.upscaleReal || !alterationAllowed(photo) || !!photo.altered?.length) return undefined
  return { bytes: await upscaleImage(bytes), altered: [{ method: 'lanczos3-upscale', date: new Date().toISOString(), originalHash: sha256(bytes) }] }
}

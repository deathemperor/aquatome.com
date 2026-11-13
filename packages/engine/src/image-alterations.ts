import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, isAllowedLicence, mayPublish, type Alteration, type ImageSwitches, type Photo, type SourceInfo } from '@aq/schema'
import { composeMarkPatch, imageXmp, noTracePass, NO_TRACE_INSTRUCTION, outsideBoxProof, upscaleImage, type MarkBox, type NoTraceVerdict } from './image-transforms'
import { measureMarkResidue, residuePass } from './mark-residue'
import { sha256 } from './image-reference'
import { cropOriginal, markCropOptions, retainedPixelProof } from './image-crop'
import { writeImageCache } from './image-cache-write'
import { publicImageEvidence } from './public-image-evidence'
import { pairedJudgments, judgmentReceipt, judgmentHashes } from './image-judgments'

export type MarkEvidence = { owner: 'source' | 'photographer' | 'third-party' | 'unknown'; text?: string; ownership?: {lettering:boolean;basis:'source-logo'|'contributor-signature'|'recorded-author'|'foreign-mark'|'uncertain';matchesSource:boolean;matchesRecordedAuthor:boolean}; box: MarkBox; sourceUrl: string; credit?: string; subjectBox?: MarkBox; wholeSubject?: boolean }
const STOCK = /getty|shutterstock|\bistock\b|alamy|adobe\s*stock|dreamstime|123rf|depositphotos|pond5/i
const key = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
const host = (s: string) => { try { return new URL(s).hostname.replace(/^www\./, '') } catch { return '' } }
/** Ownership is established separately from permission to alter. A third party's mark is never cleaned for a source. */
export function ownsMark(photo: Photo, source: SourceInfo, mark: MarkEvidence): boolean {
  const wording = `${mark.text??''} ${mark.credit ?? ''}`
  if (mark.owner === 'third-party' || mark.owner === 'unknown' || STOCK.test(wording) || !(mark.ownership?.lettering || mark.text?.trim()) || mark.sourceUrl !== photo.sourceUrl) return false
  const sourceHost = host(source.homepage), photoHost = host(photo.sourceUrl)
  if (!sourceHost || (photoHost !== sourceHost && !photoHost.endsWith(`.${sourceHost}`))) return false
  // A credit link is not permission to erase that site's or shop's mark.
  const allowedHosts = [host(photo.sourceUrl)].filter(Boolean)
  const namedHosts = wording.match(/(?:[a-z0-9-]+\.)+(?:com|org|net|de|vn|co|uk|th|id|my)\b/gi) ?? []
  if (namedHosts.some(h => !allowedHosts.some(a => host(`https://${h}`) === a || a.endsWith(`.${host(`https://${h}`)}`)))) return false
  const text = key(mark.text??'')
  if(mark.ownership){
    const evidence=mark.ownership
    if(evidence.lettering!==true||typeof evidence.matchesSource!=='boolean'||typeof evidence.matchesRecordedAuthor!=='boolean')return false
    if(mark.owner==='source')return evidence.basis==='source-logo'&&evidence.matchesSource
    if(mark.owner!=='photographer'||photo.source==='planetcatfish')return false
    if(photo.source==='seriouslyfish'||photo.source==='scotcat')return !!signatureCredit(mark)&&(
      evidence.basis==='contributor-signature'||evidence.basis==='recorded-author'&&evidence.matchesRecordedAuthor&&/[\p{L}\p{N}]/u.test(photo.author.replace(source.name,'')))
    return evidence.basis==='recorded-author'&&evidence.matchesRecordedAuthor&&!!photo.author.replace(source.name,'').trim()
  }
  if (mark.owner === 'source') return [key(source.name), ...allowedHosts.slice(0, 1).map(key)].some(n => n.length >= 4 && text.includes(n))
  // The owner explicitly covered these contributors. PlanetCatfish's contributor scope remains open.
  if (photo.source === 'planetcatfish') return false
  if (photo.source === 'seriouslyfish' || photo.source === 'scotcat') return !!signatureCredit(mark)
  // A source-only credit cannot establish the identity of an unnamed photographer's signature.
  const author = key(photo.author.replace(source.name, '').replace(/[\/|]/g, ' ').trim())
  const signed = key(mark.credit ?? mark.text??'')
  return author.length >= 4 && (signed.includes(author) || (photo.authorUrl !== undefined && text.includes(key(host(photo.authorUrl)))))
}

/** Signature wording belongs only in the content's credit, never evidence notes or logs. */
export function signatureCredit(mark: MarkEvidence): string | undefined {
  if (mark.owner !== 'photographer') return undefined
  const credit = (mark.credit ?? mark.text??'').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const contactOrDevice = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b/i
  return credit && credit.length <= 160 && !/[<>\u0000-\u001f]/.test(credit) && !contactOrDevice.test(credit) ? credit : undefined
}

export function alteredCredit(photo: Photo, source: SourceInfo, marks: MarkEvidence[]) {
  if(photo.source!=='seriouslyfish'&&photo.source!=='scotcat')return {author:photo.author,...(photo.authorUrl?{authorUrl:photo.authorUrl}:{})}
  const names = [...new Set(marks.filter(m => ownsMark(photo, source, m)).map(signatureCredit).filter((s): s is string => !!s))]
  if (!names.length) return { author: photo.author, ...(photo.authorUrl ? { authorUrl: photo.authorUrl } : {}) }
  const author = names.join(' / '), previous = key(photo.author.replace(source.name, '').replace(/[\/|]/g, ' ').trim()), differs = previous !== key(author)
  return { author, ...(!differs && photo.authorUrl ? { authorUrl: photo.authorUrl } : {}), ...(differs ? { mismatch: { source: photo.source!, photo: photo.url, differs: true as const } } : {}) }
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
  checks?: NonNullable<Alteration['checks']>
}

/** A crop is a discard operation. Its approval never calls the repaint's eye or residue measurement. */
export async function cropSourceMarks(photo:Photo,original:Uint8Array,source:SourceInfo,marks:MarkEvidence[],checks:NonNullable<Alteration['checks']>,now:()=>Date,switches:Readonly<ImageSwitches>=IMAGE_SWITCHES):Promise<{bytes:Uint8Array;altered:Alteration[]}|undefined> {
  if(!marks.length||marks.some(m=>!canRemoveMark(photo,source,m,switches)||m.wholeSubject!==true||!m.subjectBox))return
  const meta=await sharp(original).rotate().metadata(),width=meta.autoOrient.width,height=meta.autoOrient.height
  const subject=marks.map(m=>m.subjectBox!).reduce((a,b)=>({x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)}))
  const crop=markCropOptions(width,height,subject,marks.map(m=>m.box))[0]
  if(!crop)return
  const cut=await cropOriginal(original,crop),altered:Alteration[]=[{method:'mark-crop',date:now().toISOString(),originalHash:sha256(original),crop,excludedMarks:marks.map(m=>m.box),retainedChanged:0,permissionDate:source.permission!.markRemoval!.allowed?source.permission!.markRemoval!.date:undefined,checks}]
  const bytes=await sharp(cut).webp({lossless:true}).withXmp(imageXmp({altered})).toBuffer()
  if(await retainedPixelProof(original,bytes,crop.window)!==0)throw new Error('encoded crop changed retained pixels')
  return{bytes,altered}
}

/** The caller retains the original on every refusal; notably Glaser's permitted logo photo is not replaced by a smear. */
export async function removeSourceMark(photo: Photo, original: Uint8Array, source: SourceInfo, mark: MarkEvidence, d: AlterationDeps, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES): Promise<{ bytes: Uint8Array; altered: Alteration[] } | undefined> {
  if (!canRemoveMark(photo, source, mark, switches)) return undefined
  const hash = sha256(original), dir = join(d.cache, 'alterations', hash)
  await mkdir(dir, { recursive: true })
  const originalFile = join(dir, 'original')
  // Retain exactly the bytes received, independently of any decoded/composited or published file.
  await writeFile(originalFile, original, { flag: 'wx', mode: 0o600 }).catch(async e => { if (e.code !== 'EEXIST' || sha256(await readFile(originalFile)) !== hash) throw e })
  const prompt=`Remove only the source's own mark or credited signature in box ${JSON.stringify(mark.box)} in the attached photograph. Repaint its natural background. Keep the fish or plant anatomically correct. Add no text, logo, person, hand, object or AquaTome mark.`
  const editFile=join(dir,`native-${sha256(prompt)}.image`)
  const attempted=editFile+'.attempted'
  const edited=await readFile(editFile).catch(async e=>{
    if(e.code!=='ENOENT')throw e
    if(await access(attempted).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e}))throw new Error('kept native edit unavailable after an interrupted request; repair held for recovery')
    await writeImageCache(attempted,'requested')
    const bytes=await d.edit(prompt,originalFile)
    await writeImageCache(editFile,bytes)
    return Buffer.from(bytes)
  })
  try{await sharp(edited).rotate().raw().toBuffer()}catch{throw new Error('kept native edit cannot decode; repair held for recovery, no new image attempt')}
  const composed = await composeMarkPatch(original, edited, mark.box)
  const file = join(dir, 'candidate.png'), cropFile = join(dir, 'candidate-box.png')
  await writeFile(file, composed.bytes, { mode: 0o600 })
  const b = mark.box
  await sharp(composed.bytes).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }).resize({ width: Math.max(800, b.x1 - b.x0) }).png().toFile(cropFile)
  const measurement = await measureMarkResidue(original, composed.bytes, b)
  await writeFile(join(dir, 'residue.json'), JSON.stringify(measurement), { mode: 0o600 })
  if (!residuePass(measurement)) return undefined
  const pair = await pairedJudgments(async()=>{const v=await d.noTrace(file,NO_TRACE_INSTRUCTION,[cropFile]);if(!v||!['pass','fail','unsure'].includes(v.verdict)||typeof v.residual!=='boolean'||typeof v.newMark!=='boolean'||typeof v.note!=='string')throw new Error('no-trace judgment incomplete');return v},noTracePass,v=>noTracePass(v)?'pass':v.verdict)
  await writeFile(join(dir, 'no-trace.json'), JSON.stringify(publicImageEvidence({pair:judgmentReceipt(pair),verdicts:[pair.first.value,pair.second.value]})), { mode: 0o600 })
  if(pair.incomplete)throw new Error('no-trace judgment incomplete; retained edit awaits recheck')
  if (!pair.pass) return undefined
  const altered: Alteration[] = [{ method: 'mark-removal', date: d.now().toISOString(), originalHash: hash, box: b, outsideChanged: 0, noTrace: 'pass', ...(d.checks?{checks:{...d.checks,noTrace:judgmentHashes(judgmentReceipt(pair))}}:{}), residue: { version: measurement.version, score: measurement.score, limit: measurement.limit }, permissionDate: source.permission!.markRemoval!.allowed ? source.permission!.markRemoval!.date : undefined }]
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

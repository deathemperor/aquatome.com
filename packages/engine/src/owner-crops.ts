import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { OWNER_CROPS, ownerCropApproved, ownerCropCanonical, PhotoSchema, SourcesSchema, mayPublish, validCropGeometry, markOutsideCrop, validImageJudgmentHashes, awaitsScreen, type PhotoScreenEntry, type Photo, type OwnerCropApproval } from '@aq/schema'
import { validJudgmentPair, judgmentHashes } from './image-judgments'
import type { PhotoVerdict } from './photo-check'
import { pixelHash } from './image-transforms'
import { retainedPixelProof } from './image-crop'
import { storeImageVariants, type ImageStore } from './image-publication'
import { writeImageCache } from './image-cache-write'

const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')
const read = async (file: string) => JSON.parse(await readFile(file,'utf8'))
const decisions = async (file:string):Promise<Record<string, any>> => {
  const value=await read(file).catch(e=>{if(e.code==='ENOENT')return {};throw e})
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CropFailure('decision cache invalid')
  return value
}
class CropFailure extends Error {}
class PhotoVeto extends CropFailure {}
async function permitted(root:string,p:Photo,page:string) {
  const rejected=await decisions(join(root,'engine-state/_photo-rejected.json'))
  // The original's watermark rejection is expected. Only the approved crop URL is vetoed here.
  if(Object.hasOwn(rejected,p.url))throw new PhotoVeto('crop rejected')
  const subjects=await decisions(join(root,'engine-state/_photo-subjects.json')),previous=subjects[p.url]?.[page]
  if(previous&&(previous.ok!=='yes'||previous.person!==false||previous.logo||previous.guide))throw new PhotoVeto('crop refused')
  const sources=SourcesSchema.parse(await read(join(root,'content/sources.json'))),source=p.source&&sources[p.source]
  if(!p.source||!mayPublish(source,'photos')||source?.permission?.markRemoval?.allowed===false)throw new PhotoVeto('source withdrawn')
  return subjects
}
/** Withdraw only this approved address, including an entity left behind by an interrupted gallery/receipt write. */
async function withdraw(root:string,page:string,url:string) {
  for(const file of [join(root,'content',page,'entity.json'),join(root,'content/gallery',page.slice('species/'.length)+'.json')]) {
    const raw=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return undefined;throw e})
    if(!raw)continue
    const data=JSON.parse(raw)
    if(!Array.isArray(data.photos)||!data.photos.some((p:Photo)=>p.url===url))continue
    data.photos=data.photos.filter((p:Photo)=>p.url!==url)
    await writeImageCache(file,JSON.stringify(data,null,raw.match(/^\{\n( +)/)?.[1]?.length??2)+'\n')
  }
}
const stateFile = (root:string) => join(root,'engine-state/_owner-crops.json')
type CropScreenReceipt = {url:string;fileHash:string;record:PhotoScreenEntry}
async function screenReceipt(dir:string,a:OwnerCropApproval,p:Photo,main:Uint8Array):Promise<CropScreenReceipt|undefined> {
  if(!a.screenRecordHash)return
  const raw=await readFile(join(dir,'screen.json'))
  if(hash(raw)!==a.screenRecordHash)throw new CropFailure('watermark receipt changed')
  const r=JSON.parse(raw.toString()) as CropScreenReceipt
  // Only the stage's empty native read is transferable. Never manufacture a model verdict or copy lettering.
  if(!r||Object.keys(r).sort().join(',')!=='fileHash,record,url'||r.url!==p.url||r.fileHash!==hash(main)
    ||!r.record||Object.keys(r.record).join(',')!=='ocr'||!Array.isArray(r.record.ocr)||r.record.ocr.length||awaitsScreen(p.url,r.record))throw new CropFailure('watermark receipt does not bind this empty native read')
  return r
}
async function screenState(root:string):Promise<Record<string,PhotoScreenEntry>> {
  try {
    const cache=await read(join(root,'engine-state/_photo-watermarks.json'))
    if(!cache||typeof cache!=='object'||Array.isArray(cache))throw new CropFailure('invalid screen state')
    return cache
  } catch(cause) { throw new PhotoVeto('watermark state unavailable',{cause}) }
}
function screenAllows(cache:Record<string,PhotoScreenEntry>,url:string,required:boolean) {
  if(!Object.hasOwn(cache,url)) { if(required)throw new PhotoVeto('crop awaits watermark record');return }
  const r=cache[url]
  if(!r||!Array.isArray(r.ocr)||r.ocr.some(l=>!l||typeof l.t!=='string'||!Number.isFinite(l.c)||l.c<0||l.c>1)
    ||(r.watermark!==undefined&&typeof r.watermark!=='boolean'))throw new PhotoVeto('crop screen record invalid')
  if(r.watermark===true||awaitsScreen(url,r))throw new PhotoVeto('crop watermark refused or pending')
}
/** Copy a byte-bound output of the watermark stage before admitting its address; preserve every other record. */
async function installScreen(root:string,r:CropScreenReceipt) {
  const cache=await screenState(root)
  screenAllows(cache,r.url,false)
  if(!Object.hasOwn(cache,r.url)) {
    cache[r.url]=r.record
    await writeImageCache(join(root,'engine-state/_photo-watermarks.json'),JSON.stringify(cache,null,2)+'\n')
  }
}
/** The credit is already in the bound photo. Keep only the fact of disagreement in its audit list. */
async function recordCreditMismatch(root:string,a:OwnerCropApproval,p:Photo) {
  if(a.creditMismatch!==true)return
  const file=join(root,'content/photo-credit-mismatches.json')
  const prior=await read(file).catch(e=>{if(e.code==='ENOENT')return [];throw e})
  if(!Array.isArray(prior))throw new CropFailure('credit mismatch list invalid')
  const rows=prior.map(m=>({source:m.source,photo:m.photo,...(m.page?{page:m.page}:{}),differs:m.differs===true}))
  const row={source:p.source!,photo:p.original!.url,page:a.page,differs:true}
  if(!rows.some(m=>m.source===row.source&&m.photo===row.photo&&m.page===row.page&&m.differs))rows.push(row)
  await writeImageCache(file,JSON.stringify(rows,null,2)+'\n')
}
async function completed(root:string):Promise<string[]> {
  const data=await read(stateFile(root)).catch(e=>{if(e.code==='ENOENT')return [];throw e})
  if(!Array.isArray(data)||data.some(v=>typeof v!=='string'))throw new CropFailure('owner crop receipt invalid')
  return data
}
/** Keep causes privately without recording arbitrary provider text, file paths or photo lettering. */
async function failureLog(cache:string,a:OwnerCropApproval,stage:string,error:unknown) {
  const cause=(e:unknown,depth=0):unknown=>{
    const message=e instanceof Error?e.message:String(e)
    const code=(e as NodeJS.ErrnoException|undefined)?.code
    return {message:e instanceof CropFailure?message:'External error detail withheld',messageHash:hash(message),
      ...(typeof code==='string'&&/^(?:E[A-Z0-9_]+|ABORT_ERR)$/.test(code)?{code}:{}),
      ...(depth<2&&e instanceof Error&&e.cause!==undefined?{cause:cause(e.cause,depth+1)}:{})}
  }
  const dir=join(cache,'owner-crop-failures');await mkdir(dir,{recursive:true})
  await writeImageCache(join(dir,a.id+'.json'),JSON.stringify({at:new Date().toISOString(),id:a.id,stage,cause:cause(error)})+'\n')
}
/** No model, credentials or media client is constructed for an ordinary all-off fixture. */
export async function pendingOwnerCrops(root:string, entries=OWNER_CROPS):Promise<OwnerCropApproval[]> {
  const done=await completed(root), pending:OwnerCropApproval[]=[]
  for(const a of entries.filter(a=>a.approved&&!done.includes(a.id))) {
    try { await readFile(join(root,'content',a.page,'entity.json'));pending.push(a) }
    catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e }
  }
  return pending
}
export function validOwnerCropRecord(p:Photo,a:OwnerCropApproval):boolean {
  const alteration=p.altered?.[0],c=alteration?.crop
  return ownerCropApproved(p,a.page,a.scientificName,hash(ownerCropCanonical(p,a.page,a.scientificName)),[a]) && !p.headFit
    && validCropGeometry(c) && p.width===c.window.x1-c.window.x0 && p.height===c.window.y1-c.window.y0
    && alteration?.retainedChanged===0 && !!alteration.excludedMarks?.length && alteration.excludedMarks.every(m=>markOutsideCrop(c,m))
    && validImageJudgmentHashes(alteration.checks?.species) && validImageJudgmentHashes(alteration.checks?.ownership)
    && !/\bnd\b/i.test(p.licence.replace(/[^a-z0-9]+/gi,' '))
}
/** Publish only byte-identified, already judged crops approved individually by the owner. No image creation or new judgment. */
export async function publishOwnerCrops(root:string,cache:string,store:ImageStore,add:(page:{kind:'species';id:string},p:Photo)=>Promise<void>,signal:AbortSignal,entries=OWNER_CROPS) {
  const report={published:0,waiting:[] as string[],failed:[] as string[]}
  const done=await completed(root)
  for(const a of await pendingOwnerCrops(root,entries)) {
    signal.throwIfAborted()
    let stage='identity', approved:Photo|undefined
    try {
      const page=await read(join(root,'content',a.page,'entity.json'))
      if(!/^species\/[a-z0-9-]+$/.test(a.page)||page.scientificName!==a.scientificName)throw new CropFailure('page identity changed')
      const dir=join(cache,'owner-crops',a.id)
      stage='bundle record'
      const p=PhotoSchema.parse(await read(join(dir,'photo.json')))
      if(!validOwnerCropRecord(p,a))throw new CropFailure('approval changed')
      approved=p
      const pageId=a.page.slice('species/'.length)
      const check=async(required=false)=>{
        const subjects=await permitted(root,p,pageId)
        if(a.screenRecordHash)screenAllows(await screenState(root),p.url,required)
        return subjects
      }
      stage='preflight decisions'
      await check()
      stage='species receipts'
      const species=await read(join(dir,'species.json'))
      if(!validJudgmentPair(species.pair)||!species.pair.pass||JSON.stringify(judgmentHashes(species.pair))!==JSON.stringify(p.altered![0]!.checks!.species)||!Array.isArray(species.verdicts)||species.verdicts.length!==2||species.verdicts.some((v:PhotoVerdict)=>v.ok!=='yes'||v.person!==false))throw new CropFailure('original species receipts changed')
      stage='pixel proof'
      const [original,bytes]=await Promise.all([readFile(join(dir,'original')),readFile(join(dir,'crop.webp'))])
      if(hash(original)!==a.originalHash || await pixelHash(bytes)!==a.pixelHash || await retainedPixelProof(original,bytes,p.altered![0]!.crop!.window)!==0)throw new CropFailure('approved crop pixels changed')
      // Encode into memory first. Validate the exact addresses and fresh decisions before any public upload.
      stage='encoded record'
      const objects:{key:string;bytes:Uint8Array;mime:string;url:string}[]=[]
      const variants=await storeImageVariants(bytes,{altered:p.altered},async(key,bytes,mime)=>{
        const url=`https://media.aquatome.com/${key}`
        objects.push({key,bytes,mime,url});return url
      },true,signal)
      const actual={...p,...variants}
      if(!validOwnerCropRecord(actual,a)||objects.length!==2)throw new CropFailure('encoded crop differs from approved record')
      stage='watermark receipt'
      const main=objects.find(o=>`https://media.aquatome.com/${o.key}`===actual.url)
      if(!main)throw new CropFailure('encoded main photo missing')
      const screen=await screenReceipt(dir,a,actual,main.bytes)
      await check()
      stage='media variants'
      for(const object of objects) {
        await check()
        if(await store(object.key,object.bytes,object.mime,signal)!==object.url)throw new CropFailure('stored crop address changed')
      }
      stage='admission decisions'
      const subjects=await check()
      if(screen) {
        stage='watermark record'
        await installScreen(root,screen)
        await check(true)
      }
      // Carry the paired original verdict through the zero-change crop. Do not spend Claude quota rejudging it.
      await mkdir(join(root,'engine-state'),{recursive:true})
      if(!subjects[actual.url]?.[pageId]) {
        subjects[actual.url]={...subjects[actual.url],[pageId]:{ok:'yes',person:false,logo:false,typical:species.verdicts.every((v:PhotoVerdict)=>v.typical===true),note:'Two independent original species passes; crop preserves all retained pixels.'}}
        await writeImageCache(join(root,'engine-state/_photo-subjects.json'),JSON.stringify(subjects,null,2)+'\n')
      }
      await check(!!screen)
      stage='content writes'
      await add({kind:'species',id:a.page.slice('species/'.length)},actual)
      // Only complete entity + gallery writes acknowledge publication. A later ordinary refusal is never resurrected.
      await check(!!screen)
      if(a.creditMismatch===true) {
        stage='credit mismatch audit'
        await recordCreditMismatch(root,a,actual)
        await check(!!screen)
      }
      stage='completion receipt'
      done.push(a.id);await mkdir(join(root,'engine-state'),{recursive:true});await writeImageCache(stateFile(root),JSON.stringify(done)+'\n')
      report.published++
    } catch(e) {
      // Cancellation must not bypass withdrawal after a veto or an interrupted content write.
      if((e instanceof PhotoVeto || signal.aborted) && approved)await withdraw(root,a.page,approved.url)
      await failureLog(cache,a,stage,e).catch(()=>undefined)
      signal.throwIfAborted()
      if((e as NodeJS.ErrnoException).code==='ENOENT')report.waiting.push(`${a.page}: approved crop bundle unavailable`)
      else report.failed.push(`${a.page}: approved crop held (${stage})`)
    }
  }
  return report
}

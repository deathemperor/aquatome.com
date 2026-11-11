import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { OWNER_CROPS, ownerCropApproved, ownerCropCanonical, PhotoSchema, SourcesSchema, mayPublish, validCropGeometry, markOutsideCrop, validImageJudgmentHashes, type Photo, type OwnerCropApproval } from '@aq/schema'
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
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('decision cache invalid')
  return value
}
class PhotoVeto extends Error {}
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
async function completed(root:string):Promise<string[]> {
  const data=await read(stateFile(root)).catch(e=>{if(e.code==='ENOENT')return [];throw e})
  if(!Array.isArray(data)||data.some(v=>typeof v!=='string'))throw new Error('owner crop receipt invalid')
  return data
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
/** Publish only byte-identified, already judged crops approved individually on board 3. No image creation or new judgment. */
export async function publishOwnerCrops(root:string,cache:string,store:ImageStore,add:(page:{kind:'species';id:string},p:Photo)=>Promise<void>,signal:AbortSignal,entries=OWNER_CROPS) {
  const report={published:0,waiting:[] as string[],failed:[] as string[]}
  const done=await completed(root)
  for(const a of await pendingOwnerCrops(root,entries)) {
    signal.throwIfAborted()
    let stage='identity', approved:Photo|undefined
    try {
      const page=await read(join(root,'content',a.page,'entity.json'))
      if(!/^species\/[a-z0-9-]+$/.test(a.page)||page.scientificName!==a.scientificName)throw new Error('page identity changed')
      const dir=join(cache,'owner-crops',a.id)
      stage='bundle record'
      const p=PhotoSchema.parse(await read(join(dir,'photo.json')))
      if(!validOwnerCropRecord(p,a))throw new Error('approval changed')
      approved=p
      stage='preflight decisions'
      await permitted(root,p,a.page.slice('species/'.length))
      stage='species receipts'
      const species=await read(join(dir,'species.json'))
      if(!validJudgmentPair(species.pair)||!species.pair.pass||JSON.stringify(judgmentHashes(species.pair))!==JSON.stringify(p.altered![0]!.checks!.species)||!Array.isArray(species.verdicts)||species.verdicts.length!==2||species.verdicts.some((v:PhotoVerdict)=>v.ok!=='yes'||v.person!==false))throw new Error('original species receipts changed')
      stage='pixel proof'
      const [original,bytes]=await Promise.all([readFile(join(dir,'original')),readFile(join(dir,'crop.webp'))])
      if(hash(original)!==a.originalHash || await pixelHash(bytes)!==a.pixelHash || await retainedPixelProof(original,bytes,p.altered![0]!.crop!.window)!==0)throw new Error('approved crop pixels changed')
      // Encode into memory first. Validate the exact addresses and fresh decisions before any public upload.
      stage='encoded record'
      const objects:{key:string;bytes:Uint8Array;mime:string;url:string}[]=[]
      const variants=await storeImageVariants(bytes,{altered:p.altered},async(key,bytes,mime)=>{
        const url=`https://media.aquatome.com/${key}`
        objects.push({key,bytes,mime,url});return url
      },true,signal)
      const actual={...p,...variants},pageId=a.page.slice('species/'.length)
      if(!validOwnerCropRecord(actual,a)||objects.length!==2)throw new Error('encoded crop differs from approved record')
      await permitted(root,actual,pageId)
      stage='media variants'
      for(const object of objects) {
        await permitted(root,actual,pageId)
        if(await store(object.key,object.bytes,object.mime,signal)!==object.url)throw new Error('stored crop address changed')
      }
      stage='admission decisions'
      const subjects=await permitted(root,actual,pageId)
      // Carry the paired original verdict through the zero-change crop. Do not spend Claude quota rejudging it.
      await mkdir(join(root,'engine-state'),{recursive:true})
      if(!subjects[actual.url]?.[pageId]) {
        subjects[actual.url]={...subjects[actual.url],[pageId]:{ok:'yes',person:false,logo:false,typical:species.verdicts.every((v:PhotoVerdict)=>v.typical===true),note:'Two independent original species passes; crop preserves all retained pixels.'}}
        await writeImageCache(join(root,'engine-state/_photo-subjects.json'),JSON.stringify(subjects,null,2)+'\n')
      }
      await permitted(root,actual,pageId)
      stage='content writes'
      await add({kind:'species',id:a.page.slice('species/'.length)},actual)
      // Only complete entity + gallery writes acknowledge publication. A later ordinary refusal is never resurrected.
      await permitted(root,actual,pageId)
      stage='completion receipt'
      done.push(a.id);await mkdir(join(root,'engine-state'),{recursive:true});await writeImageCache(stateFile(root),JSON.stringify(done)+'\n')
      report.published++
    } catch(e) {
      signal.throwIfAborted()
      if(e instanceof PhotoVeto && approved)await withdraw(root,a.page,approved.url)
      if((e as NodeJS.ErrnoException).code==='ENOENT')report.waiting.push(`${a.page}: approved crop bundle unavailable`)
      else report.failed.push(`${a.page}: approved crop held (${stage})`)
    }
  }
  return report
}

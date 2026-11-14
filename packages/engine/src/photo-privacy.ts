import { artworkObservation } from './photo-artwork'
import { readFile, readdir } from 'node:fs/promises'
import { join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { awaitsScreen, ocrHit, validOcrSummary } from '@aq/schema'
import { compactPhotoState, PHOTO_STATE_FILES } from './photo-state'
import { photoReason, observationHash, PHOTO_MARK_KINDS, PHOTO_POSITIONS } from './photo-observations'
import { writeImageCache } from './image-cache-write'
import { recheckCandidates } from './photo-check'

/** Only migration-owned validation errors may reach the unattended log. */
class PhotoPrivacyValidationError extends Error {}
const same=isDeepStrictEqual
const mapValues=(v:Record<string,any>,f:(v:any)=>unknown)=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,f(x)]))
const verdict=(v:Record<string,any>)=>Object.fromEntries(Object.entries(v).filter(([k])=>!['note','noteHash','hints'].includes(k)))
/** Deliberately excludes prose and fingerprints, but includes every decision and source exception. */
function decisions(name:string,data:Record<string,any>):unknown {
 if(name==='_photo-watermarks.json')return Object.fromEntries(Object.entries(data).map(([u,v])=>[u,{waits:awaitsScreen(u,v),hit:ocrHit(v.ocr),watermark:v.watermark,kind:v.kind,retainedOwnMark:v.retainedOwnMark}]))
 if(name==='_photo-rejected.json'||name==='_video-rejected.json')return mapValues(data,s=>({rejected:!!s,watermarkPrefix:typeof s==='string'&&s.startsWith('watermark:')}))
 if(name==='_photo-subjects.json')return mapValues(data,by=>mapValues(by,verdict))
 if(name==='_dead-screen.json')return mapValues(data,v=>({...verdict(v),artwork:artworkObservation(v)}))
 if(name==='_video-stills.json')return mapValues(data,v=>({...v,...(v.failed!==undefined?{failed:!!v.failed}:{}),...(v.kept?{kept:mapValues(v.kept,why=>!!why)}:{})}))
 return mapValues(data,verdict)
}
const rejectedPattern=/^(?:watermark|people|dead|logo|face|faces|subject|too poor to show|unwell|rejected): withheld \[sha256:[a-f0-9]{64}\]$/
const previousOwnerNote='Two independent original species passes; crop preserves all retained pixels.'
export function photoPrivacyViolations(file:string,data:unknown):{code:string;locationHash:string}[] {
 const out:{code:string;locationHash:string}[]=[],name=basename(file),add=(code:string,path:string)=>out.push({code,locationHash:observationHash(path)})
 const walk=(v:any,path:string)=>{
  if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path+'/'+i));return}
  if(!v||typeof v!=='object')return
  if(Array.isArray(v.ocr)){
   if(v.ocr.some((x:any)=>x&&Object.hasOwn(x,'t')))add('raw OCR string',path)
   if(v.ocr.some((x:any)=>!validOcrSummary(x)||Object.keys(x).some(k=>!['c','at','alnum','mark','hash'].includes(k))))add('invalid public OCR observation',path)
   if(Object.keys(v).some(k=>!['ocr','watermark','kind','locations','observationHash','hints','retainedOwnMark'].includes(k)))add('uncontrolled screen field',path)
   if(v.kind!==undefined&&!PHOTO_MARK_KINDS.includes(v.kind))add('uncontrolled mark kind',path)
   if(v.locations!==undefined&&(!Array.isArray(v.locations)||v.locations.some((x:unknown)=>!(PHOTO_POSITIONS as readonly unknown[]).includes(x))))add('uncontrolled mark location',path)
   if(v.observationHash!==undefined&&(typeof v.observationHash!=='string'||!/^[a-f0-9]{64}$/.test(v.observationHash)))add('invalid screen fingerprint',path)
  }
  if(Object.hasOwn(v,'what')&&(Object.hasOwn(v,'ocr')||Object.hasOwn(v,'watermark')))add('free screen explanation',path)
  if(Object.hasOwn(v,'note')&&(typeof v.ok==='string'&&typeof v.typical==='boolean'||typeof v.dead==='boolean'||typeof v.mark==='boolean'&&typeof v.person==='boolean')){
   if(v.note!==photoReason(v)&&v.note!==previousOwnerNote)add('free photo verdict explanation',path)
   if(v.noteHash!==undefined&&(typeof v.noteHash!=='string'||!/^[a-f0-9]{64}$/.test(v.noteHash)))add('invalid observation fingerprint',path)
   if(Object.keys(v).some(k=>!['ok','typical','person','logo','guide','file','mark','brand','poor','unwell','q','on','other','dead','frames','note','noteHash','hints'].includes(k)))add('uncontrolled verdict field',path)
   // The day the question was asked: a real calendar date, never words.
   if(v.on!==undefined&&!realDay(v.on))add('invalid question day',path)
  }
  if(v.hints!==undefined&&(!v.hints||typeof v.hints.dead!=='boolean'||typeof v.hints.people!=='boolean'||(v.hints.artwork!==undefined&&typeof v.hints.artwork!=='boolean')||Object.keys(v.hints).some(k=>!['dead','people','artwork'].includes(k))))add('uncontrolled recheck hints',path)
  for(const[k,x]of Object.entries(v))walk(x,path+'/'+k)
 }
 walk(data,'')
 if(name==='_photo-rejected.json'&&data&&typeof data==='object')for(const[u,v]of Object.entries(data))if(v!==''&&(typeof v!=='string'||!rejectedPattern.test(v)))add('free rejection explanation',u)
 if(name==='_video-stills.json'&&data&&typeof data==='object')for(const[id,v]of Object.entries(data) as [string,any][]){
  if(!v||typeof v!=='object'||Array.isArray(v)){add('invalid still state record',id);continue}
  if(Object.keys(v).some(k=>!['at','timed','failed','kept'].includes(k)))add('uncontrolled still field',id)
  if(v.at!==undefined&&(typeof v.at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.at)))add('invalid still date',id)
  if(v.timed!==undefined&&typeof v.timed!=='boolean')add('invalid still timing flag',id)
  const safe=(s:unknown)=>s===''||typeof s==='string'&&/^photo operation unavailable \[sha256:[a-f0-9]{64}\]$/.test(s)
  if(v.failed!==undefined&&!safe(v.failed))add('free still failure explanation',id+'/failed')
  if(v.kept!==undefined&&(!v.kept||typeof v.kept!=='object'||Array.isArray(v.kept)))add('invalid kept still decisions',id+'/kept')
  else for(const[t,why]of Object.entries(v.kept??{}))if(!/^\d+(?:\.\d+)?$/.test(t)||why!=='rejected'&&!safe(why))add('free kept still explanation',id+'/kept/'+t)
 }
 if(name==='_video-rejected.json'&&data&&typeof data==='object')for(const[u,v]of Object.entries(data))if(typeof v==='string'&&/^(?:watermark|people|dead|logo):/.test(v)&&!rejectedPattern.test(v))add('free image/video rejection explanation',u)
 return out
}
const realDay=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(`${x}T00:00:00Z`))&&new Date(`${x}T00:00:00Z`).toISOString().slice(0,10)===x
const controlledOutcome=/^(?:subject (?:yes|other|none|habitat|unsure|dead|no)|guide photo|dead screen (?:dead|clear))(?:; (?:person|logo|mark|brand|poor|unwell))*$/
export function reviewPrivacyViolations(text:string):number {
 const headers=new Set(['Page','Photo','Recorded outcome','Kind','Question','State','Result','Count','Quality','Poor','Unwell','q','Asked'])
 return text.split('\n').filter(l=>l.startsWith('| ')).filter(l=>{
  const cells=l.split('|').slice(1,-1).map(s=>s.trim())
  return cells.some(c=>!headers.has(c)&&!/^[: -]+$/.test(c)&&!controlledOutcome.test(c)
   && !/^(?:species|plants|breeds)\/[a-z0-9-]+(?: \(a guide photo\))?$/.test(c)
   && !/^\[photo\]\(https?:\/\/[^\s]+\)$/.test(c)
   && !realDay(c)
   && !/^(?:true|false|yes|no|unsure|poor|unwell|[0-9]+(?:\.[0-9]+)?)$/.test(c))
 }).length
}
/** Retain the existing page, photo and counts; replace only a generated table's free explanation. */
export function compactPhotoReview(text:string,subjects:Record<string,Record<string,any>>):string {
 return text.split('\n').map(l=>{
  if(!l.startsWith('| ')||!l.includes('[photo]('))return l.replace('| What the model saw |','| Recorded outcome |').replace('| What it shows |','| Recorded outcome |')
  // A trial row starts with the day it was asked (photo-check.ts, the new answers' sheets).
  const m=/^\| (?:(\d{4}-\d{2}-\d{2}|-) \| )?((?:species|plants|breeds)\/([a-z0-9-]+)(?: \(a guide photo\))?) \| \[photo\]\((.+)\) \| .* \|$/.exec(l)
  if(!m)throw new PhotoPrivacyValidationError('photo review row format unavailable')
  const v=subjects[m[4]!]?.[m[3]!];if(!v)throw new PhotoPrivacyValidationError('photo review verdict unavailable')
  return `| ${m[1]?`${m[1]} | `:''}${m[2]} | [photo](${m[4]}) | ${photoReason(v)} |`
 }).join('\n').replace('names what the photo shows instead','records a different subject')
}

export async function assertPhotoPrivacy(root:string):Promise<void> {
 const state=join(root,'engine-state')
 for(const f of (await readdir(state,{recursive:true})).filter(f=>f.endsWith('.json'))){
  const data=JSON.parse(await readFile(join(state,f),'utf8')),bad=photoPrivacyViolations(f,data)
  if(bad.length)throw new PhotoPrivacyValidationError(`photo privacy: ${f} has ${bad.length} unsafe observation fields`)
 }
 const doc=await readFile(join(root,'docs/review/photo-subjects.md'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e})
 if(reviewPrivacyViolations(doc))throw new PhotoPrivacyValidationError('photo privacy: generated review contains free observations')
}

export async function migratePhotoPrivacy(root:string,write=false) {
 const changes:{file:string;beforeHash:string;afterHash:string;recordsChanged:number;records:number;decisionDifferences:number;waitingDifferences:number}[]=[],pending:{file:string;before:string;after:string}[]=[]
 const beforeRechecks=[...(await recheckCandidates(root)).keys()].sort()
 for(const name of PHOTO_STATE_FILES){
  const file=join(root,'engine-state',name),before=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return undefined;throw e});if(before===undefined)continue
  const raw=JSON.parse(before),next=compactPhotoState(name,raw) as Record<string,any>,oldDecision=decisions(name,raw) as Record<string,unknown>,newDecision=decisions(name,next) as Record<string,unknown>
  const differences=Object.keys(raw).filter(k=>!same(oldDecision[k],newDecision[k])).length
  const waiting=name==='_photo-watermarks.json'?Object.keys(raw).filter(u=>awaitsScreen(u,raw[u])!==awaitsScreen(u,next[u])).length:0
  if(differences||waiting)throw new PhotoPrivacyValidationError(`photo privacy migration changes decisions in ${name}`)
  const after=JSON.stringify(next,null,2)+'\n',recordsChanged=Object.keys(raw).filter(k=>!same(raw[k],next[k])).length
  changes.push({file:'engine-state/'+name,beforeHash:observationHash(before),afterHash:observationHash(after),recordsChanged,records:Object.keys(raw).length,decisionDifferences:differences,waitingDifferences:waiting})
  if(before!==after)pending.push({file,before,after})
 }
 const review=join(root,'docs/review/photo-subjects.md'),beforeDoc=await readFile(review,'utf8').catch(e=>{if(e.code==='ENOENT')return undefined;throw e})
 if(beforeDoc!==undefined){
  const state=pending.find(p=>p.file.endsWith('/_photo-subjects.json'))?.after??await readFile(join(root,'engine-state/_photo-subjects.json'),'utf8'),after=compactPhotoReview(beforeDoc,JSON.parse(state))
  const beforeRows=beforeDoc.split('\n').filter(l=>l.startsWith('| ')&&l.includes('[photo](')),afterRows=after.split('\n').filter(l=>l.startsWith('| ')&&l.includes('[photo]('))
  changes.push({file:'docs/review/photo-subjects.md',beforeHash:observationHash(beforeDoc),afterHash:observationHash(after),records:beforeRows.length,recordsChanged:beforeRows.filter((l,i)=>l!==afterRows[i]).length,decisionDifferences:0,waitingDifferences:0})
  if(beforeDoc!==after)pending.push({file:review,before:beforeDoc,after})
 }
 if(write){
  try{
   for(const p of pending)await writeImageCache(p.file,p.after)
   const afterRechecks=[...(await recheckCandidates(root)).keys()].sort();if(!same(beforeRechecks,afterRechecks))throw new PhotoPrivacyValidationError('photo privacy migration changes the recheck set')
   await assertPhotoPrivacy(root)
  }catch(e){for(const p of pending)await writeImageCache(p.file,p.before);throw e}
 }
 return {version:'photo-observations-v1',written:write,files:changes,recheckCount:beforeRechecks.length,decisionDifferences:0,waitingDifferences:0,modelCalls:0,nativeImageAttempts:0}
}
/** Publication's model-free boundary; never print upstream diagnostics or observed wording. */
export async function runPhotoPrivacyCommand(root:string,write:boolean,print:(line:string)=>void=console.log):Promise<number> {
 try {
  const report=await migratePhotoPrivacy(root,write)
  const records=report.files.reduce((n,f)=>n+f.recordsChanged,0)
  print(`photo-privacy: ${write?'migrated':'dry run'}, ${records} records changed, decisions 0, waiting 0, rechecks ${report.recheckCount}`)
  return 0
 } catch (error) {
  const reason=error instanceof PhotoPrivacyValidationError&&!/[\r\n]/.test(error.message)?error.message:'other error'
  print(`photo-privacy: migration failed: ${reason}; input restored; not publishable`)
  return 1
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{root:{type:'string'},write:{type:'boolean',default:false},report:{type:'string'}}})
 const report=await migratePhotoPrivacy(resolve(values.root??process.cwd()),values.write)
 if(values.report)await writeImageCache(resolve(values.report),JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report))
}

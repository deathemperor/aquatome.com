import { artworkObservation } from './photo-artwork'
import { createHash } from 'node:crypto'
import { ocrHit, validOcrSummary, type OcrSummary } from '@aq/schema'

export const observationHash = (s:string) => createHash('sha256').update(s).digest('hex')
const digest = (x:unknown):x is string => typeof x==='string' && /^[a-f0-9]{64}$/.test(x)
export const PHOTO_POSITIONS = ['top left','top centre','top right','middle left','middle centre','middle right','bottom left','bottom centre','bottom right','unknown'] as const
const position = (s:unknown) => typeof s==='string' && (PHOTO_POSITIONS as readonly string[]).includes(s) ? s : 'unknown'
export const PHOTO_MARK_KINDS = ['credit','logo','url','name','caption','stamp','none'] as const
export type PhotoMarkKind = typeof PHOTO_MARK_KINDS[number]
export type PhotoHints = { dead:boolean; people:boolean; artwork?:boolean }
export type CompactScreen = { ocr:OcrSummary[];watermark?:boolean;kind?:PhotoMarkKind;locations?:string[];observationHash?:string;hints?:PhotoHints;retainedOwnMark?:{source:'glaser';sourceUrl:string;owner:'source'} }
const DEAD_NOTE = /\b(?:dead(?! (?:leaf|leaves|wood|plants?|twigs?|branch(?:es)?|stems?|vegetation|grass|reeds?|algae|coral|trees?|logs?))|died|carcass(?:es)?|markets?|fishmonger|preserved|museum|mounted|taxiderm\w*|fillets?|cooked|fried|grilled|on ice|on a plate|catch(?:es)?|caught|landed|trays?|nets?|formalin|pickled|herbarium|pressed)\b|(?<!(?:lá|cành|gỗ|cây) )chết|chợ|bày bán|mẫu ngâm|mẫu vật|bảo tàng|tiêu bản|phi lê/i
const ARTWORK = /drawing|illustrat|engrav|painting|lithograph|watercolou?r/i
export const deadNote = (note: string) => DEAD_NOTE.test(note) && !ARTWORK.test(note)
/** Words in an earlier look's note that say a person or part of one may be in the photo (English, and the gallery's Vietnamese captions). */
const PEOPLE_NOTE = /\b(?:hands?|held|holding|fingers?|fingertips?|palms?|person|people|man|woman|child|diver|angler|feet|foot|arms?)\b|\btay\b|người/i
export const peopleNote = (note: string) => PEOPLE_NOTE.test(note)

/** Preserve the old recheck predicate before discarding its prose. */
export function photoHints(v:{hints?:PhotoHints;note?:unknown;what?:unknown}):PhotoHints {
  if(v.hints && typeof v.hints.dead==='boolean' && typeof v.hints.people==='boolean')return {dead:v.hints.dead,people:v.hints.people,...(artworkObservation(v)?{artwork:true}:{})}
  const s=typeof v.note==='string'?v.note:typeof v.what==='string'?v.what:''
  return {dead:deadNote(s),people:peopleNote(s),...(artworkObservation(v)?{artwork:true}:{})}
}
/** The first sixty characters were the old public record and predicate input. Only the fingerprint sees the full line. */
export function summarizeOcr(l:{t:string;c:number;at?:string}):OcrSummary {
  const t=l.t.slice(0,60),alnum=t.match(/[\p{L}\p{N}]/gu)?.length??0
  // Evaluate the exact legacy predicate at low confidence to isolate its unconditional mark test.
  return {c:l.c,...(l.at!==undefined?{at:position(l.at)}:{}),alnum,mark:ocrHit([{t,c:0}]),hash:observationHash(l.t)}
}
export function compactScreen(v:any):CompactScreen {
  if(!v||!Array.isArray(v.ocr))throw new Error('invalid photo screen record')
  const ocr:OcrSummary[]=v.ocr.map((l:any)=>{
    if(l&&typeof l.t==='string'&&Number.isFinite(l.c)&&l.c>=0&&l.c<=1)return summarizeOcr(l)
    if(validOcrSummary(l))return {c:l.c,...(l.at!==undefined?{at:position(l.at)}:{}),alnum:l.alnum,mark:l.mark,hash:l.hash}
    throw new Error('invalid OCR observation')
  })
  const locations=Array.isArray(v.locations)?[...new Set<string>(v.locations.map(position))]:[...new Set(ocr.flatMap(l=>l.at?[l.at]:[]))]
  return {ocr,...(typeof v.watermark==='boolean'?{watermark:v.watermark}:{}),
    ...((PHOTO_MARK_KINDS as readonly unknown[]).includes(v.kind)?{kind:v.kind as PhotoMarkKind}:{}),
    ...(locations.length?{locations}:{}),
    ...(typeof v.what==='string'?{observationHash:observationHash(v.what),hints:photoHints(v)}:digest(v.observationHash)?{observationHash:v.observationHash,hints:photoHints(v)}:{}),
    ...(v.retainedOwnMark?.source==='glaser'&&v.retainedOwnMark.owner==='source'&&typeof v.retainedOwnMark.sourceUrl==='string'?{retainedOwnMark:{source:'glaser' as const,sourceUrl:v.retainedOwnMark.sourceUrl,owner:'source' as const}}:{})}
}

/** Only controlled verdict labels are publishable. The explanatory answer never leaves memory. */
export function photoReason(v:Record<string,any>):string {
  const ok=['yes','other','none','habitat','unsure','dead','no'].includes(v.ok)?v.ok:undefined
  const parts=[ok?`subject ${ok}`:typeof v.dead==='boolean'?`dead screen ${v.dead?'dead':'clear'}`:'guide photo']
  for(const k of ['person','logo','mark','brand','poor','unwell'] as const)if(v[k]===true)parts.push(k)
  return parts.join('; ')
}
export function compactVerdict<T extends Record<string,any>>(v:T):T & {note:string;noteHash:string;hints:PhotoHints} {
  const out:Record<string,unknown>={}
  for(const k of ['ok','typical','person','logo','guide','file','mark','brand','poor','unwell','q','other','dead','frames'])if(Object.hasOwn(v,k)){
    const x=v[k]
    if(k==='ok'&&!['yes','other','none','habitat','unsure','dead','no'].includes(x))throw new Error('invalid photo verdict category')
    if(k==='q'&&(!Number.isSafeInteger(x)||x<0))throw new Error('invalid photo question version')
    if(k==='other'&&(!x||typeof x!=='object'||Array.isArray(x)||Object.entries(x).some(([s,b])=>!/[a-z]/.test(s)||s.length>64||typeof b!=='boolean')))throw new Error('invalid guide subject decisions')
    if(!['ok','q','other'].includes(k)&&typeof x!=='boolean')throw new Error('invalid photo verdict flag')
    out[k]=x
  }
  const note=photoReason(v),old=typeof v.note==='string'?v.note:''
  return {...out,note,noteHash:old===note&&digest(v.noteHash)?v.noteHash:observationHash(old),hints:photoHints(v)} as T & {note:string;noteHash:string;hints:PhotoHints}
}
const REASONS=['watermark','people','dead','logo','face','faces','subject','too poor to show','unwell','rejected'] as const
/** Keep the watermark: prefix exactly: it is part of the permitted-own-logo exception. */
export function compactRejection(s:string):string {
  if(!s)return s
  if(/^(?:watermark|people|dead|logo|face|faces|subject|too poor to show|unwell|rejected): withheld \[sha256:[a-f0-9]{64}\]$/.test(s))return s
  const category=REASONS.find(k=>s.startsWith(k+':'))??'rejected'
  return `${category}: withheld [sha256:${observationHash(s)}]`
}
export const compactRejections = (v:Record<string,string>):Record<string,string> => Object.fromEntries(Object.entries(v).map(([u,s])=>[u,compactRejection(s)]))
export const photoFailure = (e:unknown) => {const s=e instanceof Error?e.message:String(e);return /^photo operation unavailable \[sha256:[a-f0-9]{64}\]$/.test(s)?s:`photo operation unavailable [sha256:${observationHash(s)}]`}
export const photoModelStop = (e:unknown) => /usage limit|quota|weekly limit/i.test(e instanceof Error?e.message:String(e))?'usage limit':'photo model unavailable'

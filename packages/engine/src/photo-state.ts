import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { expandWholePhotoRejections, isVersionRejection, maySupersedePhotoRefusal, PHOTO_SCREEN_FILE, photoRejections, rejectedEntry, type PhotoScreenEntry } from '@aq/schema'
import { compactScreen, compactVerdict, compactRejections, compactRejection, photoFailure } from './photo-observations'
import { writeImageCache } from './image-cache-write'

export const PHOTO_STATE_FILES = ['_photo-watermarks.json','_photo-rejected.json','_photo-check.json','_photo-subjects.json','_photo-guides.json','_dead-screen.json','_video-stills.json','_video-rejected.json'] as const

/** Missing state is empty. A damaged or unreadable decision record must stop an edit. */
export async function readPhotoMap<T>(file: string): Promise<Record<string, T>> {
  const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{}'
    throw error
  })
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${basename(file)} must be a map`)
  return data as Record<string, T>
}
/** The shared persistence boundary. Model prose and OCR strings are never serialized by these writers. */
export function compactPhotoState(file:string,value:unknown):unknown {
  const name=basename(file),data=value as Record<string,any>
  if(!PHOTO_STATE_FILES.includes(name as typeof PHOTO_STATE_FILES[number]))return value
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('photo state must be a record')
  const entries=(f:(v:any)=>unknown)=>Object.fromEntries(Object.entries(data).map(([u,v])=>[u,f(v)]))
  if(name==='_photo-watermarks.json')return entries(compactScreen)
  if(name==='_photo-rejected.json')return compactRejections(data)
  if(name==='_photo-subjects.json')return entries(by=>Object.fromEntries(Object.entries(by).map(([id,v])=>[id,compactVerdict(v as Record<string,any>)])))
  if(name==='_photo-check.json'||name==='_photo-guides.json'||name==='_dead-screen.json')return entries(compactVerdict)
  if(name==='_video-rejected.json')return entries(s=>/^(?:dead|watermark|people|logo):/.test(s)?compactRejection(s):s)
  return entries(v=>{
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('invalid still state record')
    if(v.at!==undefined&&(typeof v.at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.at)))throw new Error('invalid still date')
    if(v.timed!==undefined&&typeof v.timed!=='boolean')throw new Error('invalid still timing flag')
    if(v.failed!==undefined&&typeof v.failed!=='string')throw new Error('invalid still failure')
    if(v.kept!==undefined&&(!v.kept||typeof v.kept!=='object'||Array.isArray(v.kept)))throw new Error('invalid kept still record')
    const kept=v.kept&&Object.fromEntries(Object.entries(v.kept).map(([t,why])=>{
      if(!/^\d+(?:\.\d+)?$/.test(t)||typeof why!=='string')throw new Error('invalid kept still decision')
      return[t,why==='rejected'?'rejected':why?photoFailure(why):why]
    }))
    return {...(v.at!==undefined?{at:v.at}:{}),...(v.timed!==undefined?{timed:v.timed}:{}),...(v.failed!==undefined?{failed:v.failed?photoFailure(v.failed):''}:{}),...(kept?{kept}:{})}
  })
}
async function storedWatermarks(file: string): Promise<Record<string, PhotoScreenEntry> | undefined> {
  return readFile(join(dirname(file), PHOTO_SCREEN_FILE), 'utf8').then(
    raw => JSON.parse(raw) as Record<string, PhotoScreenEntry>,
    (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return undefined },
  )
}

/** Keep an existing effective refusal unless the new one applies to the entire photo. */
export async function recordPhotoRefusals(
  file: string, rejected: Record<string, string>, refusals: ReadonlyMap<string, string>, marks?: Record<string, PhotoScreenEntry>,
): Promise<void> {
  if (!refusals.size) return
  const screen = marks ?? await storedWatermarks(file)
  const active = photoRejections(rejected, screen)
  const expanded = await expandWholePhotoRejections(join(dirname(dirname(file)), 'content'), Object.fromEntries(refusals), screen)
  const pending = rejectedEntry(expanded)
  for (const url of new Set([...Object.keys(expanded), ...Object.keys(rejected)])) {
    const decision = pending(url)?.[1]
    if (decision && maySupersedePhotoRefusal(active(url)?.[1], decision)) rejected[url] = decision
  }
}

export async function writePhotoState(file:string,value:unknown,indent:number|string=2):Promise<void> {
  let data = compactPhotoState(file, value)
  if (basename(file) === '_photo-rejected.json') {
    const rejected = data as Record<string, string>
    if (Object.values(rejected).some(why => why && !isVersionRejection(why))) {
      const state = dirname(file)
      data = await expandWholePhotoRejections(join(dirname(state), 'content'), rejected, await storedWatermarks(file))
    }
  }
  await writeImageCache(file, JSON.stringify(data, null, indent) + '\n')
}

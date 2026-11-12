import { basename } from 'node:path'
import { compactScreen, compactVerdict, compactRejections, compactRejection, photoFailure } from './photo-observations'
import { writeImageCache } from './image-cache-write'

export const PHOTO_STATE_FILES = ['_photo-watermarks.json','_photo-rejected.json','_photo-check.json','_photo-subjects.json','_photo-guides.json','_dead-screen.json','_video-stills.json','_video-rejected.json'] as const
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
  return entries(v=>({...v,...(typeof v.failed==='string'?{failed:v.failed?photoFailure(v.failed):''}:{}),...(v.kept?{kept:Object.fromEntries(Object.entries(v.kept).map(([t,why])=>[t,why==='rejected'?'rejected':why?photoFailure(why):why]))}:{})}))
}
export async function writePhotoState(file:string,value:unknown,indent:number|string=2):Promise<void> {
  await writeImageCache(file,JSON.stringify(compactPhotoState(file,value),null,indent)+'\n')
}

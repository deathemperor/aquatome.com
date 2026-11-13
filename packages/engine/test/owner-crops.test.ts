import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const { approvals }=vi.hoisted(()=>({approvals:[] as import('@aq/schema').OwnerCropApproval[]}))
vi.mock('../../schema/src/owner-crops.json',()=>({default:approvals}))
import { IMAGE_SWITCHES, LANGS, loadAll, ownerCropCanonical, ownerCropApproved, PhotoSchema, type Photo, type OwnerCropApproval } from '@aq/schema'
import { imageSteps, type ImageStepDeps } from '../src/image-steps'
import { pixelHash } from '../src/image-transforms'
import { cropOriginal } from '../src/image-crop'
import { storeImageVariants } from '../src/image-publication'
import { fixtureJudgments } from './image-fixtures'
import { judgmentHashes } from '../src/image-judgments'
import { photosFor, headOf, cardsOf } from '../src/curation'
import { validOwnerCropRecord } from '../src/owner-crops'
import { photoCredit } from '../../../apps/site/src/lib/cite'
import { licenceUrl } from '../../../apps/site/src/lib/gallery'
import { translator } from '../../../apps/site/src/lib/i18n'
import { checkPagePhotos } from '../src/photo-check'
const dirs:string[]=[]
afterEach(async()=>{approvals.splice(0);await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex')
async function setup() {
 approvals.splice(0)
 const root=await mkdtemp(join(tmpdir(),'owner-crops-'));dirs.push(root)
 await cp(fileURLToPath(new URL('../../schema/test/fixtures/store',import.meta.url)),join(root,'content'),{recursive:true})
 const file=join(root,'content/species/alpha/entity.json'),e=JSON.parse(await readFile(file,'utf8'));e.photos=[];await writeFile(file,JSON.stringify(e))
 const original=await sharp({create:{width:120,height:100,channels:3,background:'#527a93'}}).png().toBuffer()
 const crop={originalWidth:120,originalHeight:100,window:{x0:0,y0:0,x1:120,y1:80},subject:{x0:20,y0:24,x1:95,y1:54},margin:6}
 const bytes=await cropOriginal(original,crop),pair=fixtureJudgments(true),checks=judgmentHashes(pair)
 let p:Photo={url:'https://media.aquatome.com/placeholder.webp',width:120,height:80,source:'glaser',licence:'dùng với sự cho phép',author:'Fixture source credit',sourceUrl:'https://example.org/fish',original:{url:'https://media.aquatome.com/original.webp',width:120,height:100},ownerCrop:{id:'approved-alpha',pixelHash:await pixelHash(bytes)},altered:[{method:'mark-crop',date:'2026-11-11',permissionDate:'2026-11-10',originalHash:hash(original),crop,excludedMarks:[{x0:1,y0:90,x1:119,y1:99}],retainedChanged:0,checks:{species:checks,ownership:checks}}]}
 p=PhotoSchema.parse(p)
 const store=vi.fn(async(key:string)=>`https://media.aquatome.com/${key}`)
 p=PhotoSchema.parse({...p,...await storeImageVariants(bytes,{altered:p.altered},store,true)});store.mockClear()
 const a:OwnerCropApproval={id:p.ownerCrop!.id,approved:true,page:'species/alpha',scientificName:e.scientificName,date:'2026-11-11',authority:'owner viewed board 3',originalHash:hash(original),pixelHash:p.ownerCrop!.pixelHash,recordHash:hash(ownerCropCanonical(p,'species/alpha',e.scientificName))};approvals.push(a)
 const cache=join(root,'private'),dir=join(cache,'owner-crops',a.id);await mkdir(dir,{recursive:true})
 await Promise.all([writeFile(join(dir,'original'),original),writeFile(join(dir,'crop.webp'),bytes),writeFile(join(dir,'photo.json'),JSON.stringify(p)),writeFile(join(dir,'species.json'),JSON.stringify({pair,verdicts:[1,2].map(()=>({ok:'yes',person:false,typical:true}))}))])
 const sourceFile=join(root,'content/sources.json'),sources=JSON.parse(await readFile(sourceFile,'utf8'));sources.glaser={name:'Fixture source',homepage:'https://example.org/',publish:true,permission:{date:'2026-11-10',file:'owner permission',scope:['photos']}};await writeFile(sourceFile,JSON.stringify(sources))
 const forbidden=vi.fn(()=>{throw new Error('model, quota or new image forbidden')})
 const d:ImageStepDeps={cache,store,quota:forbidden,native:forbidden,extract:forbidden,judge:forbidden,get:forbidden,locateMark:forbidden,now:()=>new Date('2026-11-11')}
 return {root,cache,p,a,dir,e,file,store,forbidden,d,sourceFile,sources}
}
test('all-off whole step publishes only individually approved crop, records credit, preserves original, and never uses a model',async()=>{
 const f=await setup(),before=await readFile(join(f.dir,'original'))
 expect(validOwnerCropRecord(f.p,f.a)).toBe(true)
 const report=await imageSteps(f.root,async()=>f.d)
 expect(report).toMatchObject({off:false,published:1,repaired:1,generated:0,upscaled:0,failed:[]});expect(f.forbidden).not.toHaveBeenCalled();expect(f.store).toHaveBeenCalledTimes(2)
 const entity=JSON.parse(await readFile(f.file,'utf8')),gallery=JSON.parse(await readFile(join(f.root,'content/gallery/alpha.json'),'utf8'))
 expect(entity.photos).toEqual([f.p]);expect(gallery.photos).toEqual([f.p]);expect(entity.photos[0].headFit).toBeUndefined();expect(await readFile(join(f.dir,'original'))).toEqual(before)
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true,wholeBoxes:false});expect(c.species.find(s=>s.id==='alpha')!.photos[0]).toEqual(f.p)
 const check=await checkPagePhotos(f.root,{get:f.forbidden,look:f.forbidden},{limit:1,only:'alpha'});expect(check.judged).toBe(0);expect(f.forbidden).not.toHaveBeenCalled()
 f.store.mockClear();expect((await imageSteps(f.root,async()=>f.d)).off).toBe(true);expect(f.store).not.toHaveBeenCalled()
 // Later ordinary removal is not resurrected by the approval publisher.
 entity.photos=[];await writeFile(f.file,JSON.stringify(entity));expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0)
})
test('a seventh photo, changed credit, new URL, new pixels or another species cannot reuse an approval',async()=>{
 await positive();const f=await setup()
 for(const [p,page,name] of [[{...f.p,ownerCrop:{...f.p.ownerCrop!,id:'seventh'}},f.a.page,f.a.scientificName],[{...f.p,author:'Changed credit'},f.a.page,f.a.scientificName],[{...f.p,url:'https://media.aquatome.com/seventh.webp'},f.a.page,f.a.scientificName],[{...f.p,source:'bwaquatics'},f.a.page,f.a.scientificName],[{...f.p,original:{...f.p.original!,url:'https://media.aquatome.com/replaced-original.webp'}},f.a.page,f.a.scientificName],[{...f.p,altered:[{...f.p.altered![0]!,retainedChanged:undefined}]},f.a.page,f.a.scientificName],[f.p,'species/seventh',f.a.scientificName],[f.p,f.a.page,'Different species']] as [Photo,string,string][])expect(ownerCropApproved(p,page,name,hash(ownerCropCanonical(p,page,name)))).toBe(false)
 await writeFile(join(f.dir,'crop.webp'),await sharp({create:{width:120,height:80,channels:3,background:'red'}}).png().toBuffer())
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
})
test('source veto hides a previously admitted crop and independently prevents a pending upload',async()=>{
 const f=await positive()
 f.sources.glaser.permission.markRemoval={allowed:false};await writeFile(f.sourceFile,JSON.stringify(f.sources))
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true});expect(c.species.find(s=>s.id==='alpha')!.photos).toEqual([]);expect(c.galleries.alpha).toBeUndefined()
 const pending=await setup();pending.sources.glaser.permission.markRemoval={allowed:false};await writeFile(pending.sourceFile,JSON.stringify(pending.sources))
 expect((await imageSteps(pending.root,async()=>pending.d)).published).toBe(0);expect(pending.store).not.toHaveBeenCalled()
})
test('an altered approval record is held and cancellation starts no work',async()=>{
 await positive();const f=await setup();await writeFile(join(f.dir,'photo.json'),JSON.stringify({...f.p,author:'Changed credit'}))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
 const make=vi.fn(async()=>f.d);await expect(imageSteps(f.root,make,undefined,1,1000,AbortSignal.abort())).rejects.toThrow();expect(make).not.toHaveBeenCalled()
})
test('even a card-shaped owner crop is excluded from day-card candidates',async()=>{
 const {p}=await setup();const safe={...p,altered:undefined}
 expect(photosFor([safe],()=>true).photo).toEqual({});expect(headOf([safe],()=>true)).toBeUndefined()
})
test('a seventh private bundle and unapproved stored crop have no publication route',async()=>{
 const f=await setup(),seventh={...f.p,url:'https://media.aquatome.com/seventh.webp',ownerCrop:{...f.p.ownerCrop!,id:'seventh'}}
 const dir=join(f.cache,'owner-crops/seventh');await mkdir(dir,{recursive:true});await writeFile(join(dir,'photo.json'),JSON.stringify(seventh))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1)
 const entity=JSON.parse(await readFile(f.file,'utf8'));entity.photos.push(seventh);await writeFile(f.file,JSON.stringify(entity))
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true})
 expect(c.species.find(s=>s.id==='alpha')!.photos.map(p=>p.url)).toEqual([f.p.url])
})
test('a changed scientific identity alone prevents the approved upload',async()=>{
 await positive();const f=await setup(),entity=JSON.parse(await readFile(f.file,'utf8'));entity.scientificName='Corrected species';await writeFile(f.file,JSON.stringify(entity))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
})
test('failure of the second variant retries identical keys after the first variant was stored',async()=>{
 await positive();const f=await setup()
 f.store.mockImplementationOnce(async key=>`https://media.aquatome.com/${key}`).mockRejectedValueOnce(new Error('thumbnail upload interrupted'))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).toHaveBeenCalledTimes(2);await absent(f)
 const first=f.store.mock.calls.map(c=>c[0]);expect(first[1]).toContain('-480.webp')
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1);expect(f.store.mock.calls.slice(2).map(c=>c[0])).toEqual(first);expect(f.forbidden).not.toHaveBeenCalled()
})

test('a persisted day card cannot bypass the owner-crop exclusion',async()=>{
 const f=await setup(),dir=join(f.root,'content/cards/crop');await mkdir(dir,{recursive:true})
 const photo={...f.p,altered:undefined},entity={id:'crop',type:'trivia',sources:[{url:'https://example.org/',title:'Fixture',publisher:'Fixture source',date:'2026',accessed:'2026-11-11'}],show:{from:'2026-11-11',until:'2026-11-12'},updatedAt:'2026-11-11',photo}
 await writeFile(join(dir,'entity.json'),JSON.stringify(entity));await writeFile(join(dir,'vi.json'),JSON.stringify({eyebrow:'Fixture',title:'Fixture',body:'<p>Fixture</p>'}))
 const verdict=(await cardsOf(f.root)).get('cards/crop');expect(verdict && 'bad' in verdict ? verdict.bad : undefined).toContain('crop')
 const content=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true});expect(content.cards.find(c=>c.id==='crop')?.photo).toBeUndefined()
})

type Fixture=Awaited<ReturnType<typeof setup>>
async function positive(){const f=await setup();expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1);expect(f.store).toHaveBeenCalledTimes(2);return f}
async function state(f:Fixture,name:string,value:unknown){await mkdir(join(f.root,'engine-state'),{recursive:true});await writeFile(join(f.root,'engine-state',name),JSON.stringify(value))}
async function reject(f:Fixture,url=f.p.url){await state(f,'_photo-rejected.json',{[url]:'owner removed this photo'})}
async function absent(f:Fixture){
 expect(JSON.parse(await readFile(f.file,'utf8')).photos.map((p:Photo)=>p.url)).not.toContain(f.p.url)
 const gallery=await readFile(join(f.root,'content/gallery/alpha.json'),'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return {photos:[]};throw e})
 expect(gallery.photos.map((p:Photo)=>p.url)).not.toContain(f.p.url)
}
test('global rejection of the crop stops admission before any upload, including repeat visits',async()=>{
 await positive();const f=await setup();await reject(f)
 for(let n=0;n<2;n++)expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0)
 expect(f.store).not.toHaveBeenCalled();await absent(f)
})
test('the marked original rejection never vetoes its separately approved crop address',async()=>{
 const f=await setup();await reject(f,f.p.original!.url)
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1);expect(f.store).toHaveBeenCalledTimes(2)
})
test('an ordinary refusal stops every upload rather than leaving public unreferenced variants',async()=>{
 await positive();const f=await setup();await state(f,'_photo-subjects.json',{[f.p.url]:{alpha:{ok:'other',person:false,logo:false}}})
 for(let n=0;n<2;n++)expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0)
 expect(f.store).not.toHaveBeenCalled();await absent(f)
})
test('a rejection arriving during variant storage stops content admission and future uploads',async()=>{
 await positive();const f=await setup()
 f.store.mockImplementationOnce(async key=>`https://media.aquatome.com/${key}`).mockImplementationOnce(async key=>{await reject(f);return `https://media.aquatome.com/${key}`})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).toHaveBeenCalledTimes(2);await absent(f)
 f.store.mockClear();expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
})
test('a rejection between interrupted variants prevents the retry publishing anything',async()=>{
 await positive();const f=await setup();f.store.mockImplementationOnce(async key=>`https://media.aquatome.com/${key}`).mockRejectedValueOnce(new Error('thumbnail interrupted'))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).toHaveBeenCalledTimes(2)
 await reject(f);f.store.mockClear();expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled();await absent(f)
})
test('an entity left by a gallery-write failure is withdrawn if rejection arrives before retry',async()=>{
 await positive();const f=await setup(),gallery=join(f.root,'content/gallery/alpha.json');await mkdir(gallery,{recursive:true})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).toHaveBeenCalledTimes(2)
 expect(JSON.parse(await readFile(f.file,'utf8')).photos.map((p:Photo)=>p.url)).toEqual([f.p.url])
 await rm(gallery,{recursive:true});await reject(f);f.store.mockClear()
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled();await absent(f)
})
test('a completion-receipt failure cannot revive entity or album after a later rejection',async()=>{
 await positive();const f=await setup(),receipt=join(f.root,'engine-state/_owner-crops.json')
 f.store.mockImplementationOnce(async key=>`https://media.aquatome.com/${key}`).mockImplementationOnce(async key=>{await mkdir(receipt,{recursive:true});return `https://media.aquatome.com/${key}`})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).toHaveBeenCalledTimes(2)
 for(const path of [f.file,join(f.root,'content/gallery/alpha.json')])expect(JSON.parse(await readFile(path,'utf8')).photos.map((p:Photo)=>p.url)).toEqual([f.p.url])
 await rm(receipt,{recursive:true});await reject(f);f.store.mockClear()
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled();await absent(f)
})
test('an ordinary interrupted gallery write retries without duplicate entity or album entries',async()=>{
 await positive();const f=await setup(),gallery=join(f.root,'content/gallery/alpha.json');await mkdir(gallery,{recursive:true})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);await rm(gallery,{recursive:true})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1)
 for(const path of [f.file,gallery])expect(JSON.parse(await readFile(path,'utf8')).photos.map((p:Photo)=>p.url)).toEqual([f.p.url])
})

test('an approved adopted credit records only a nameless mismatch and preserves the exact credit',async()=>{
 const f=await setup();Object.assign(f.a,{creditMismatch:true})
 const file=join(f.root,'content/photo-credit-mismatches.json')
 // Existing audit order and legacy extra fields may not duplicate the row or carry lettering forward.
 await writeFile(file,JSON.stringify([{differs:true,page:f.a.page,photo:f.p.original!.url,source:f.p.source,recordAuthor:'PRIVATE_EXTRA_FIELD'}]))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1)
 const rows=JSON.parse(await readFile(file,'utf8'))
 expect(rows).toEqual([{source:f.p.source,photo:f.p.original!.url,page:f.a.page,differs:true}])
 expect((await readFile(file,'utf8'))).not.toContain('PRIVATE_EXTRA_FIELD')
 expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].author).toBe(f.p.author)
 expect(f.forbidden).not.toHaveBeenCalled()
})

test('an interrupted completion retries its approved credit audit without duplicating or losing it',async()=>{
 const f=await setup();Object.assign(f.a,{creditMismatch:true})
 const receipt=join(f.root,'engine-state/_owner-crops.json'),file=join(f.root,'content/photo-credit-mismatches.json');let stored=0
 f.store.mockImplementation(async key=>{if(++stored===2)await mkdir(receipt,{recursive:true});return `https://media.aquatome.com/${key}`})
 const first=await imageSteps(f.root,async()=>f.d)
 expect(first.published).toBe(0);expect(first.failed.join()).toContain('completion receipt')
 expect(JSON.parse(await readFile(file,'utf8'))).toEqual([{source:f.p.source,photo:f.p.original!.url,page:f.a.page,differs:true}])
 await rm(receipt,{recursive:true});f.store.mockImplementation(async key=>`https://media.aquatome.com/${key}`)
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1)
 expect(JSON.parse(await readFile(file,'utf8'))).toHaveLength(1);expect(f.forbidden).not.toHaveBeenCalled()
})

import { screenWatermarks } from '../src/watermarks'
import { publishOwnerCrops } from '../src/owner-crops'
async function stageScreen(f:Awaited<ReturnType<typeof setup>>) {
 const bytes=await readFile(join(f.dir,'crop.webp'));let main:Uint8Array|undefined
 await storeImageVariants(bytes,{altered:f.p.altered},async(key,b)=>{if(!key.endsWith('-480.webp'))main=b;return `https://media.aquatome.com/${key}`},true)
 const root=join(f.root,'screen-stage'),cache=join(root,'screen.json');await mkdir(join(root,'content'),{recursive:true})
 await writeFile(join(root,'content/photos.json'),JSON.stringify({photos:[f.p]}))
 const read=vi.fn(async(files:string[])=>files.map(()=>[]))
 const result=await screenWatermarks(root,cache,join(root,'rejected.json'),{get:async()=>main!,read,look:f.forbidden},{limit:0})
 expect(result).toMatchObject({read:1,hits:0,judged:0,failed:[]});expect(read).toHaveBeenCalledOnce()
 const record=JSON.parse(await readFile(cache,'utf8'))[f.p.url],raw=JSON.stringify({url:f.p.url,fileHash:hash(main!),record})+'\n'
 await writeFile(join(f.dir,'screen.json'),raw);Object.assign(f.a,{screenRecordHash:hash(raw)})
 await mkdir(join(f.root,'engine-state'),{recursive:true})
 const old={...f.p,url:f.p.original!.url,ownerCrop:undefined,altered:undefined,original:undefined}
 await writeFile(f.file,JSON.stringify({...f.e,photos:[old]}))
 const state=join(f.root,'engine-state/_photo-watermarks.json'),oldRecord={ocr:[],watermark:false,kind:'none',what:'Existing observation'}
 await writeFile(state,JSON.stringify({[old.url]:oldRecord}))
 return {state,old,oldRecord}
}

test('the stage-owned empty screen record lands before content admission and preserves every older screen decision',async()=>{
 const f=await setup(),s=await stageScreen(f);let added=0
 const result=await publishOwnerCrops(f.root,f.cache,f.store,async(_page,p)=>{
  const records=JSON.parse(await readFile(s.state,'utf8'))
  expect(records[p.url]).toEqual({ocr:[]});expect(records[s.old.url]).toMatchObject({ocr:[],watermark:false,kind:'none',observationHash:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(records[s.old.url]).not.toHaveProperty('what')
  expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].url).toBe(s.old.url)
  await writeFile(f.file,JSON.stringify({...f.e,photos:[p,s.old]}));added++
 },new AbortController().signal,approvals)
 expect(result).toMatchObject({published:1,failed:[]});expect(added).toBe(1);expect(f.forbidden).not.toHaveBeenCalled()
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true,photoScreen:'required'})
 expect(c.species[0]!.photos[0]!.url).toBe(f.p.url)
})

test.each(['missing','file-hash','record-text','extra-field'] as const)('a %s screen receipt holds the crop before any upload and keeps its old head',async kind=>{
 const f=await setup(),s=await stageScreen(f),file=join(f.dir,'screen.json')
 if(kind==='missing')await rm(file)
 else {
  const r=JSON.parse(await readFile(file,'utf8'))
  if(kind==='file-hash')r.fileHash='f'.repeat(64)
  if(kind==='record-text')r.record.ocr=[{t:'Synthetic fixture',c:1}]
  if(kind==='extra-field')r.record.note='PRIVATE_EXTRA_FIELD'
  const raw=JSON.stringify(r);await writeFile(file,raw);Object.assign(f.a,{screenRecordHash:hash(raw)})
 }
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
 expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].url).toBe(s.old.url)
 expect(JSON.parse(await readFile(s.state,'utf8'))).toEqual({[s.old.url]:s.oldRecord})
})

test.each(['pending','refused'] as const)('an existing %s watermark decision is never replaced by a frozen empty read',async verdict=>{
 const f=await setup(),s=await stageScreen(f),target=verdict==='pending'?{ocr:[{t:'Synthetic fixture',c:1}]}:{ocr:[],watermark:true}
 await writeFile(s.state,JSON.stringify({[s.old.url]:s.oldRecord,[f.p.url]:target}))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
 expect(JSON.parse(await readFile(s.state,'utf8'))[f.p.url]).toEqual(target)
 expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].url).toBe(s.old.url)
})

test('a pending screen decision arriving after the content write withdraws only the new crop and restores the older head',async()=>{
 const f=await setup(),s=await stageScreen(f)
 const result=await publishOwnerCrops(f.root,f.cache,f.store,async(_page,p)=>{
  await writeFile(f.file,JSON.stringify({...f.e,photos:[p,s.old]}))
  await writeFile(s.state,JSON.stringify({[s.old.url]:s.oldRecord,[p.url]:{ocr:[{t:'Synthetic fixture',c:1}]}}))
 },new AbortController().signal,approvals)
 expect(result.published).toBe(0);expect(result.failed).toHaveLength(1)
 expect(JSON.parse(await readFile(f.file,'utf8')).photos.map((p:Photo)=>p.url)).toEqual([s.old.url])
 expect(f.forbidden).not.toHaveBeenCalled()
})

test.each(['missing','malformed'] as const)('a %s master screen cache is held without replacing it or uploading',async kind=>{
 const f=await setup(),s=await stageScreen(f)
 if(kind==='missing')await rm(s.state);else await writeFile(s.state,'{')
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
 expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].url).toBe(s.old.url)
 if(kind==='missing')await expect(readFile(s.state)).rejects.toThrow();else expect(await readFile(s.state,'utf8')).toBe('{')
})


test('changed screen receipt bytes cannot reuse the approved fingerprint even when its content is equivalent',async()=>{
 const positive=await setup();await stageScreen(positive)
 expect((await imageSteps(positive.root,async()=>positive.d)).published).toBe(1)
 const f=await setup(),s=await stageScreen(f),file=join(f.dir,'screen.json'),approvedHash=f.a.screenRecordHash
 const raw=await readFile(file,'utf8');await writeFile(file,raw+'\n')
 expect(hash(await readFile(file))).not.toBe(approvedHash);expect(f.a.screenRecordHash).toBe(approvedHash)
 const result=await imageSteps(f.root,async()=>f.d)
 expect(result.published).toBe(0);expect(result.failed.join()).toContain('watermark receipt');expect(f.store).not.toHaveBeenCalled()
 expect(JSON.parse(await readFile(f.file,'utf8')).photos[0].url).toBe(s.old.url)
 expect(JSON.parse(await readFile(s.state,'utf8'))).toEqual({[s.old.url]:s.oldRecord})
 const diagnostic=JSON.parse(await readFile(join(f.cache,'owner-crop-failures',f.a.id+'.json'),'utf8'))
 expect(diagnostic).toMatchObject({stage:'watermark receipt',cause:{message:'watermark receipt changed'}})
})

test('cancellation cannot skip withdrawal when the screen cache disappears after content admission',async()=>{
 const f=await setup(),s=await stageScreen(f),controller=new AbortController(),gallery=join(f.root,'content/gallery/alpha.json')
 await expect(publishOwnerCrops(f.root,f.cache,f.store,async(_page,p)=>{
  await writeFile(f.file,JSON.stringify({...f.e,photos:[p,s.old]}))
  await mkdir(join(f.root,'content/gallery'),{recursive:true});await writeFile(gallery,JSON.stringify({photos:[p,s.old]}))
  await rm(s.state);controller.abort(new Error('fixture cancellation'))
 },controller.signal,approvals)).rejects.toThrow('fixture cancellation')
 for(const file of [f.file,gallery])expect(JSON.parse(await readFile(file,'utf8')).photos.map((p:Photo)=>p.url)).toEqual([s.old.url])
 await expect(readFile(join(f.root,'engine-state/_owner-crops.json'))).rejects.toThrow()
 expect(f.store).toHaveBeenCalledTimes(2);expect(f.forbidden).not.toHaveBeenCalled()
 const diagnostic=JSON.parse(await readFile(join(f.cache,'owner-crop-failures',f.a.id+'.json'),'utf8'))
 expect(diagnostic).toMatchObject({stage:'content writes',cause:{message:'watermark state unavailable',cause:{code:'ENOENT'}}})
})

test('private publisher diagnostics retain external error identity without arbitrary text',async()=>{
 const f=await setup();await stageScreen(f)
 f.store.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_EXTERNAL_DETAIL'),{code:'ECONNRESET'}))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0)
 const raw=await readFile(join(f.cache,'owner-crop-failures',f.a.id+'.json'),'utf8'),diagnostic=JSON.parse(raw)
 expect(diagnostic).toMatchObject({stage:'media variants',cause:{message:'External error detail withheld',messageHash:hash('PRIVATE_EXTERNAL_DETAIL'),code:'ECONNRESET'}})
 expect(raw).not.toContain('PRIVATE_EXTERNAL_DETAIL');expect(f.forbidden).not.toHaveBeenCalled()
})


test('the finite publisher compacts inherited screen and subject observations at its real write boundary',async()=>{
 const f=await setup(),s=await stageScreen(f),trip=['PRIVACY','OWNER','TEST','ONLY'].join('_')
 await writeFile(s.state,JSON.stringify({[s.old.url]:{ocr:[{t:trip,c:1,at:'bottom left'}],watermark:false,kind:'none',what:trip}}))
 await state(f,'_photo-subjects.json',{'https://example.org/older':{alpha:{ok:'yes',typical:true,person:false,logo:false,note:trip}}})
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(1)
 for(const file of ['_photo-watermarks.json','_photo-subjects.json'])expect(await readFile(join(f.root,'engine-state',file),'utf8')).not.toContain(trip)
 expect(f.forbidden).not.toHaveBeenCalled()
})


async function openLicensedFixture(licence='CC BY-SA 2.5') {
 const f=await setup()
 f.p=PhotoSchema.parse({...f.p,source:undefined,sourceUrl:'https://commons.wikimedia.org/wiki/File:Fixture_photo.jpg',licence})
 f.a.recordHash=hash(ownerCropCanonical(f.p,f.a.page,f.a.scientificName))
 await writeFile(join(f.dir,'photo.json'),JSON.stringify(f.p))
 return f
}

test('an individually approved open-licence crop publishes without a source grant, keeps its licence and needs no model',async()=>{
 const f=await openLicensedFixture(),before=await readFile(join(f.dir,'original'))
 const r=await imageSteps(f.root,async()=>f.d)
 expect(r).toMatchObject({published:1,repaired:1,generated:0,upscaled:0,failed:[],waiting:[]})
 expect(f.store).toHaveBeenCalledTimes(2);expect(f.forbidden).not.toHaveBeenCalled()
 expect(await readFile(join(f.dir,'original'))).toEqual(before)
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true,wholeBoxes:false})
 expect(c.species.find(s=>s.id==='alpha')!.photos[0]).toEqual(f.p)
 expect(f.p.licence).toBe('CC BY-SA 2.5')
 expect(licenceUrl(f.p.licence)).toBe('https://creativecommons.org/licenses/by-sa/2.5/')
 for(const lang of LANGS){
  const credit=photoCredit(lang,f.p)
  expect(credit.licence).toBe('CC BY-SA 2.5')
  expect(credit.url).toBe(f.p.sourceUrl)
  expect(credit.text).toContain(f.p.author)
  expect(credit.text).toContain(translator(lang)('Ảnh đã chỉnh sửa'))
 }
 f.store.mockClear()
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0)
 expect(f.store).not.toHaveBeenCalled()
})

test('a registered crop cannot replace its bound open licence or use an unknown or restrictive licence',async()=>{
 const f=await openLicensedFixture()
 await writeFile(join(f.dir,'photo.json'),JSON.stringify({...f.p,licence:'CC0'}))
 expect((await imageSteps(f.root,async()=>f.d)).published).toBe(0);expect(f.store).not.toHaveBeenCalled()
 for(const licence of ['unknown','CC BY-ND 4.0','CC BY-NC 4.0']){
  const held=await openLicensedFixture(licence)
  expect((await imageSteps(held.root,async()=>held.d)).published).toBe(0)
  expect(held.store).not.toHaveBeenCalled();expect(held.forbidden).not.toHaveBeenCalled()
 }
})

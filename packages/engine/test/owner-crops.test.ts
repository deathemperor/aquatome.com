import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const { approvals }=vi.hoisted(()=>({approvals:[] as import('@aq/schema').OwnerCropApproval[]}))
vi.mock('../../schema/src/owner-crops.json',()=>({default:approvals}))
import { IMAGE_SWITCHES, loadAll, ownerCropCanonical, ownerCropApproved, PhotoSchema, type Photo } from '@aq/schema'
import { imageSteps, type ImageStepDeps } from '../src/image-steps'
import { pixelHash } from '../src/image-transforms'
import { cropOriginal } from '../src/image-crop'
import { storeImageVariants } from '../src/image-publication'
import { fixtureJudgments } from './image-fixtures'
import { judgmentHashes } from '../src/image-judgments'
import { photosFor, headOf, cardsOf } from '../src/curation'
import { validOwnerCropRecord } from '../src/owner-crops'
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
 const a={id:p.ownerCrop!.id,approved:true,page:'species/alpha',scientificName:e.scientificName,date:'2026-11-11',authority:'owner viewed board 3',originalHash:hash(original),pixelHash:p.ownerCrop!.pixelHash,recordHash:hash(ownerCropCanonical(p,'species/alpha',e.scientificName))};approvals.push(a)
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
 const c=await loadAll({root:join(f.root,'content'),lang:'vi',publicBuild:true});expect(c.species.find(s=>s.id==='alpha')!.photos[0]).toEqual(f.p)
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

import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { awaitsScreen, ocrHit } from '@aq/schema'
import { summarizeOcr, compactScreen, compactVerdict, photoReason, observationHash } from '../src/photo-observations'
import { writePhotoState } from '../src/photo-state'
import { migratePhotoPrivacy, assertPhotoPrivacy, photoPrivacyViolations, compactPhotoReview, reviewPrivacyViolations } from '../src/photo-privacy'
import { screenWatermarks } from '../src/watermarks'
import { screenGuidePhotos } from '../src/guide-photos'
import { checkPagePhotos, recheckCandidates } from '../src/photo-check'
const trip=['PRIVACY','TEST','ONLY','SENTINEL'].join('_'),dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
async function root(){const r=await mkdtemp(join(tmpdir(),'aq-photo-privacy-'));dirs.push(r);await cp(fileURLToPath(new URL('../../schema/test/fixtures/store',import.meta.url)),join(r,'content'),{recursive:true});await mkdir(join(r,'engine-state'));await mkdir(join(r,'docs/review'),{recursive:true});return r}
async function put(r:string,file:string,data:unknown){await mkdir(join(r,file,'..'),{recursive:true});await writeFile(join(r,file),JSON.stringify(data))}
const load=(r:string,f:string)=>readFile(join(r,f),'utf8').then(JSON.parse)
const image=()=>sharp({create:{width:80,height:60,channels:3,background:'#345678'}}).png().toBuffer()

test('word-free OCR summaries preserve the actual screen predicate, including low-confidence marks and the 60-character boundary',()=>{
 for(const[t,c]of[[trip,1],['www.fixture.invalid',0],['I I',1],['abcd',.49],['abcd',.5],['©',0],[' '.repeat(60)+'copyright',.1],['魚魚魚',.8]]as const){
  const s=summarizeOcr({t,c,at:'bottom right'})
  expect(ocrHit([s])).toBe(ocrHit([{t:t.slice(0,60),c}]))
  expect(awaitsScreen('https://example.org/p',{ocr:[s]})).toBe(awaitsScreen('https://example.org/p',{ocr:[{t:t.slice(0,60),c}]}))
  expect(s.hash).toBe(observationHash(t));expect(Object.hasOwn(s,'t')).toBe(false)
 }
 expect(JSON.stringify(summarizeOcr({t:trip,c:1}))).not.toContain(trip)
 expect(photoPrivacyViolations('new.json',{ocr:[{text:trip,c:1}]}).length).toBeGreaterThan(0)
 expect(photoPrivacyViolations('new.json',{ocr:[],extracted:trip}).length).toBeGreaterThan(0)
 expect(photoPrivacyViolations('new.json',{ocr:[],locations:[trip]}).length).toBeGreaterThan(0)
 expect(photoPrivacyViolations('new.json',{ocr:[],kind:trip}).length).toBeGreaterThan(0)
 expect(JSON.stringify(compactVerdict({ok:'yes',typical:true,note:trip,hints:{dead:false,people:false,extracted:trip}}))).not.toContain(trip)
 expect(ocrHit([{c:1,alnum:0,mark:false,hash:'bad'}])).toBe(true)
})

test('the engine migration changes measurements and reasons, never verdicts, pending photos, original-logo exceptions or recheck membership',async()=>{
 const r=await root(),entity=await load(r,'content/species/alpha/entity.json'),u=entity.photos[0].url,glaser='https://media.aquatome.com/glaser/held.webp'
 const screens={
  [u]:{ocr:[{t:trip,c:1,at:'bottom left'}],what:'possible person '+trip},
  clear:{ocr:[],watermark:false,kind:'none',what:trip},
  noisy:{ocr:[{t:'ll',c:.2,at:'top centre'}]},
  marker:{ocr:[{t:'www.fixture.invalid',c:.1,at:'top right'}]},
  [glaser]:{ocr:[],watermark:true,kind:'logo',what:trip,retainedOwnMark:{source:'glaser',sourceUrl:'https://www.aquariumglaser.de/fish',owner:'source'}},
 }
 await put(r,'engine-state/_photo-watermarks.json',screens)
 await put(r,'engine-state/_photo-rejected.json',{[glaser]:'watermark: '+trip,other:'people: '+trip})
 await put(r,'engine-state/_photo-subjects.json',{[u]:{alpha:{logo:false,poor:true,unwell:false,note:trip,q:2,ok:'yes',typical:true}}})
 await put(r,'engine-state/_photo-check.json',{[u]:{ok:'yes',typical:true,note:'possible person '+trip}})
 await put(r,'engine-state/_photo-guides.json',{guide:{person:false,mark:true,brand:false,note:trip}})
 await put(r,'engine-state/_dead-screen.json',{photo:{dead:false,frames:true,note:trip}})
 await put(r,'engine-state/_video-stills.json',{guide:{at:'2026-11-12',failed:trip,kept:{'1':trip}}})
 await put(r,'engine-state/_video-rejected.json',{video:'dead: '+trip})
 await writeFile(join(r,'docs/review/photo-subjects.md'),`| species/alpha | [photo](${u}) | ${trip} |\n`)
 const before=await readFile(join(r,'engine-state/_photo-watermarks.json'),'utf8'),rechecks=[...(await recheckCandidates(r)).keys()]
 const dry=await migratePhotoPrivacy(r,false);expect(dry.written).toBe(false);expect(await readFile(join(r,'engine-state/_photo-watermarks.json'),'utf8')).toBe(before)
 const report=await migratePhotoPrivacy(r,true);expect(report).toMatchObject({decisionDifferences:0,waitingDifferences:0,modelCalls:0});expect(report.files.some(f=>f.recordsChanged>0)).toBe(true)
 const after=await load(r,'engine-state/_photo-watermarks.json')
 for(const[k,v]of Object.entries(screens))expect(awaitsScreen(k,after[k])).toBe(awaitsScreen(k,v))
 expect(after[glaser].retainedOwnMark).toEqual(screens[glaser].retainedOwnMark);expect((await load(r,'engine-state/_photo-rejected.json'))[glaser].startsWith('watermark:')).toBe(true)
 expect(await load(r,'engine-state/_photo-subjects.json')).toMatchObject({[u]:{alpha:{ok:'yes',typical:true,logo:false,poor:true,unwell:false,q:2}}})
 expect([...(await recheckCandidates(r)).keys()]).toEqual(rechecks)
 for(const f of report.files)expect(await readFile(join(r,f.file),'utf8')).not.toContain(trip)
 await assertPhotoPrivacy(r)
 expect((await migratePhotoPrivacy(r,true)).files.every(f=>f.recordsChanged===0)).toBe(true)
})

test('a new state file cannot hide raw OCR, and a failed guard rolls the migration back without printing its tripwire',async()=>{
 const r=await root();await put(r,'engine-state/_photo-watermarks.json',{x:{ocr:[{t:trip,c:1}]}});await put(r,'engine-state/unexpected.json',{nested:{ocr:[{t:trip,c:1}]}})
 const before=await readFile(join(r,'engine-state/_photo-watermarks.json'),'utf8')
 await expect(migratePhotoPrivacy(r,true)).rejects.toThrow('unsafe observation fields')
 expect(await readFile(join(r,'engine-state/_photo-watermarks.json'),'utf8')).toBe(before)
 expect(JSON.stringify(photoPrivacyViolations('unexpected.json',{nested:{ocr:[{t:trip,c:1}]}}))).not.toContain(trip)
 expect(photoPrivacyViolations('human.json',{diagnostic:'one dark body stripe reaches the tail'})).toEqual([])
})

test('the real watermark writer stores no reader or model lettering, and sends only measurements with the image',async()=>{
 const r=await mkdtemp(join(tmpdir(),'aq-screen-privacy-'));dirs.push(r);await mkdir(join(r,'content'),{recursive:true});await mkdir(join(r,'engine-state'))
 const url='https://media.example/test.webp';await put(r,'content/photos.json',{photos:[{url}]});const prompts:string[]=[]
 const report=await screenWatermarks(r,join(r,'engine-state/_photo-watermarks.json'),join(r,'engine-state/_photo-rejected.json'),{get:async()=>image(),read:async()=>[[{t:trip,c:1,x:0,y:.9,w:1,h:.1}]],look:async(_f,p)=>{prompts.push(p);return{photos:[{n:1,watermark:true,kind:'credit',locations:['bottom left'],what:trip}]}}},{limit:1})
 expect(report.judged).toBe(1);expect(prompts).toHaveLength(1);expect(prompts[0]).not.toContain(trip)
 for(const f of ['_photo-watermarks.json','_photo-rejected.json'])expect(await readFile(join(r,'engine-state',f),'utf8')).not.toContain(trip)
 await assertPhotoPrivacy(r)
})

test('guide and ordinary species writers never persist a model explanation or echo it in their report',async()=>{
 const r=await root();await put(r,'content/guides/private/entity.json',{kind:'care',photos:[{url:'https://example.org/private.png'}]});await put(r,'content/guides/private/vi.json',{name:'Fixture guide'})
 const guides=await screenGuidePhotos(r,{get:async()=>image(),look:async()=>({photos:[{n:1,person:false,mark:true,brand:false,note:trip}]})},{limit:1,only:['private']})
 expect(guides.judged).toBe(1);expect(JSON.stringify(guides)).not.toContain(trip);expect(await readFile(join(r,'engine-state/_photo-guides.json'),'utf8')).not.toContain(trip)
 const look=vi.fn(async()=>({photos:[{n:1,ok:'yes' as const,person:false,logo:false,typical:true,note:trip}]}))
 const report=await checkPagePhotos(r,{get:async()=>image(),look},{limit:1,only:'alpha'})
 expect(report.judged).toBe(1);expect(look).toHaveBeenCalledOnce();expect(JSON.stringify(report)).not.toContain(trip)
 expect(await readFile(join(r,'engine-state/_photo-subjects.json'),'utf8')).not.toContain(trip)
 expect(await readFile(join(r,'docs/review/photo-subjects.md'),'utf8')).not.toContain(trip)
})

test('every persistence shape and the generated review keep controlled reasons rather than arbitrary extra fields',async()=>{
 const r=await root(),v={ok:'other',typical:false,person:false,logo:true,note:trip,what:trip,secretExtraction:trip}
 for(const name of ['_photo-check.json','_photo-guides.json','_dead-screen.json']){await writePhotoState(join(r,'engine-state',name),{x:v});expect(await readFile(join(r,'engine-state',name),'utf8')).not.toContain(trip)}
 expect(compactVerdict(v).note).toBe(photoReason(v));expect(compactScreen({ocr:[],what:trip}).observationHash).toBe(observationHash(trip))
 const raw=`| species/alpha | [photo](https://example.org/p) | ${trip} |\n`,doc=compactPhotoReview(raw,{'https://example.org/p':{alpha:v}})
 expect(reviewPrivacyViolations(raw)).toBe(1);expect(reviewPrivacyViolations(doc)).toBe(0);expect(doc).not.toContain(trip)
})

test('all committed engine-state JSON and the generated photo review contain no raw photo lettering',async()=>{
 await assertPhotoPrivacy(fileURLToPath(new URL('../../../',import.meta.url)))
})

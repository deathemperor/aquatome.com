import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, PHOTO_SCREEN_FILE, type Photo } from '@aq/schema'
import { fixtureGeneratedCalibration, fixtureMarkCalibration, fixtureJudgments } from './image-fixtures'
import { ACCEPTED_MARK_RESIDUE, subLimitMarkMisses, noTraceCalibrationReady } from '../src/image-transforms'
import { originalSpecies } from '../src/image-real-checks'
import { imageSteps, type ImageStepDeps } from '../src/image-steps'
import { calibrateGenerated } from '../src/image-calibration'
import { calibrationReady, sha256, type ImageReference } from '../src/image-reference'

vi.mock('../src/codex-images', async original => ({
  ...await original<typeof import('../src/codex-images')>(),
  readImageQuota: vi.fn(async () => ({at:new Date().toISOString(),limitId:'codex',usedPercent:5,spendControlReached:false})),
  codexImageJson: vi.fn(async () => { throw Error('No provider calls allowed in review') }),
}))
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function dir(){const base=join(homedir(),'.cache/aquatome/cos');await mkdir(base,{recursive:true});const d=await mkdtemp(join(base,'review-1068-'));dirs.push(d);return d}
const save=(f:string,x:unknown)=>writeFile(f,JSON.stringify(x))
const read=async(f:string)=>JSON.parse(await readFile(f,'utf8'))
const facts=[{source:'seriouslyfish',sourceUrl:'https://www.seriouslyfish.com/species/alpha/',quote:'The fish has three black stripes along its body.'}]
const real:Photo={url:'https://media.aquatome.com/fixture.webp',width:100,height:80,licence:'CC0',author:'Fixture source',source:'seriouslyfish',sourceUrl:facts[0]!.sourceUrl}
const passed={verdict:'pass',identity:'pass',anatomy:'pass',referenceImages:'pass',person:false,text:false,logo:false,features:[{n:1,verdict:'pass',note:'visible'}],conflicts:[],note:'visible'}
async function fixture(){
 const root=await dir();await cp(new URL('../../schema/test/fixtures/store',import.meta.url),join(root,'content'),{recursive:true})
 const cache=join(root,'private');await mkdir(join(cache,'candidates'),{recursive:true});await mkdir(join(root,'engine-state'))
 const file=join(root,'content/species/alpha/entity.json'),e=await read(file);e.photos=[];e.scientificName='Paracheirodon innesi';e.sections=[{...e.sections[0],...facts[0],html:`<p>${facts[0]!.quote}</p>`}];await save(file,e)
 await save(join(cache,'calibration.json'),fixtureGeneratedCalibration());await save(join(cache,'marked-history-v1.json'),{})
 const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#abcdef'}}).png().toBuffer()
 const d:ImageStepDeps={cache,quota:async()=>({at:new Date().toISOString(),limitId:'codex',usedPercent:5,spendControlReached:false}),native:vi.fn(async(prompt,_dir,_ref,admit)=>(await admit('fixture-call'),{bytes,prompt,model:'gpt-image-2',driverModel:'gpt-5.6-sol',seconds:1,receiptHash:sha256('fixture')})),extract:async()=>({facts}),judge:vi.fn(async()=>passed) as ImageStepDeps['judge'],get:async()=>bytes,store:async key=>`https://media.aquatome.com/${key}`,locateMark:vi.fn(),now:()=>new Date()}
 return{root,cache,file,e,bytes,d}
}

test('review: a changed measurement cutoff cannot qualify repaint',()=>{
 const c=fixtureMarkCalibration(),miss=c.cases.find(x=>x.id==='residue-2-0.03')!
 miss.judgments=fixtureJudgments(true);miss.actual='refuse';miss.measurement.score=.3903539555209733;miss.measurement.limit=.3
 expect(noTraceCalibrationReady(c)).toBe(false)
})

test('review: every generated-calibration attachment path must be neutral',async()=>{
 const cache=await dir(),file=join(cache,'candidate.png'),named=join(cache,'lookalike-known-wrong-reference.png')
 const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#abcdef'}}).png().toBuffer();await writeFile(file,bytes);await writeFile(named,bytes)
 const reference:ImageReference={page:'species/fixture',scientificName:'Fixture species',facts,images:[{file:named,sourceUrl:facts[0]!.sourceUrl,sha256:sha256(bytes)}]}
 const judge=vi.fn(async(prompt:string)=>prompt.startsWith('Check only')?{verdict:'consistent',conflicts:[]}:passed)
 await calibrateGenerated([{id:'lookalike',expected:'refuse',file,reference}],cache,judge as Parameters<typeof calibrateGenerated>[2])
 const calls=judge.mock.calls as unknown as [string,object,string,string[]][]
 expect(calls.flatMap(c=>c[3]).some(path=>path.includes('lookalike'))).toBe(false)
})

test('review: an interrupted original-species cache write can be retried',async()=>{
 const cache=await dir(),judge=vi.fn(async()=>({photos:[{n:1,ok:'yes',person:false,typical:true,logo:false,note:'Fixture'}]}))
 const args=['original',Buffer.from('fixture'),{id:'fixture',kind:'species' as const},'Fixture species',cache,judge as unknown as Parameters<typeof originalSpecies>[5]] as const
 await originalSpecies(...args);const files=await readdir(join(cache,'original-species'));await writeFile(join(cache,'original-species',files[0]!),'{"key":')
 await expect(originalSpecies(...args)).resolves.toMatchObject({pair:{pass:true}})
 expect(judge).toHaveBeenCalledTimes(4);expect((await readdir(join(cache,'original-species'))).some(f=>f.endsWith('.next'))).toBe(false)
})

test('popular generation may supplement a passing real photograph under the owner’s order',async()=>{
 const f=await fixture();f.e.photos=[real];await save(f.file,f.e);await save(join(f.root,'engine-state/_photo-subjects.json'),{[real.url]:{alpha:{ok:'yes',person:false,logo:false}}})
 // A passing real photo has completed both the species check and the watermark screen.
 await save(join(f.root,'engine-state',PHOTO_SCREEN_FILE),{[real.url]:{ocr:[],watermark:false}})
 f.d.judge=vi.fn(async(_file,prompt)=>prompt.startsWith('Check only')?{verdict:'consistent',conflicts:[]}:passed) as ImageStepDeps['judge']
 const result=await imageSteps(f.root,async()=>f.d,{...IMAGE_SWITCHES,generatePopular:true,publishGenerated:true})
 expect(result.failed).toEqual([]);expect(f.d.native).toHaveBeenCalledTimes(1)
})

test('review: mark lettering is not persisted outside the page credit',async()=>{
 const f=await fixture(),sourcesFile=join(f.root,'content/sources.json'),sources=await read(sourcesFile)
 sources.seriouslyfish={name:'Seriously Fish',homepage:'https://www.seriouslyfish.com/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos','text'],markRemoval:{allowed:true,date:'2026-11-10'}}};await save(sourcesFile,sources)
 await mkdir(join(f.cache,'marked'));await save(join(f.cache,'marked/real.json'),{page:{kind:'species',id:'alpha'},photo:real})
 f.d.locateMark=async()=>({owner:'photographer',text:'SYNTHETIC_PRIVATE_LETTERING',credit:'Fixture contributor',sourceUrl:real.sourceUrl,box:{x0:0,y0:65,x1:100,y1:78},subjectBox:{x0:20,y0:20,x1:60,y1:45},wholeSubject:true})
 f.d.judge=async()=>({photos:[{n:1,ok:'yes',typical:true,person:false,logo:true,note:'Fixture'}]}) as never
 const r=await imageSteps(f.root,async()=>f.d,{...IMAGE_SWITCHES,removeMarks:true,publishAltered:true});expect(r.failed).toEqual([]);expect(r.published).toBe(1)
 const directory=join(f.cache,'mark-ownership',sha256(f.bytes)),file=(await readdir(directory)).find(x=>x.endsWith('.ownership.json'))!
 expect(await readFile(join(directory,file),'utf8')).not.toContain('SYNTHETIC_PRIVATE_LETTERING')
})

async function jsonFiles(path:string):Promise<string[]> {
 const rows=await readdir(path,{withFileTypes:true})
 return (await Promise.all(rows.map(r=>r.isDirectory()?jsonFiles(join(path,r.name)):r.name.endsWith('.json')?[join(path,r.name)]:[]))).flat()
}
test('runtime ownership and species records never retain lettering, names or raw reviewer notes',async()=>{
 const f=await fixture(),sourcesFile=join(f.root,'content/sources.json'),sources=await read(sourcesFile)
 sources.seriouslyfish={name:'Seriously Fish',homepage:'https://www.seriouslyfish.com/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}};await save(sourcesFile,sources)
 const old='SYNTHETIC_PRIOR_CREDIT',credit='SYNTHETIC_NEW_CREDIT',lettering='SYNTHETIC_PHOTO_LETTERING'
 await mkdir(join(f.cache,'marked'));const input=join(f.cache,'marked/real.json');await save(input,{page:{kind:'species',id:'alpha'},photo:{...real,author:old}})
 await save(join(f.root,'content/photo-credit-mismatches.json'),[{source:'seriouslyfish',photo:real.url,recordAuthor:old,differs:true}])
 f.d.locateMark=async()=>({owner:'photographer',ownership:{lettering:true,basis:'contributor-signature',matchesSource:false,matchesRecordedAuthor:false},credit,sourceUrl:real.sourceUrl,box:{x0:0,y0:65,x1:100,y1:78},subjectBox:{x0:20,y0:20,x1:60,y1:45},wholeSubject:true})
 f.d.judge=async()=>({photos:[{n:1,ok:'yes',person:false,logo:true,typical:true,note:lettering}]}) as never
 expect(await imageSteps(f.root,async()=>f.d,{...IMAGE_SWITCHES,removeMarks:true,publishAltered:true})).toMatchObject({published:1,failed:[]})
 for(const file of await jsonFiles(f.root)){
  if(file===input)continue // Existing source credit is an input, not a workflow output.
  const data=await read(file)
  if(file===f.file||file===join(f.root,'content/gallery/alpha.json')){
   expect(data.photos[0].author).toBe(credit);data.photos.forEach((p:Photo)=>{delete (p as Partial<Photo>).author})
  }
  const text=JSON.stringify(data)
  for(const sentinel of [old,credit,lettering])expect(text,file).not.toContain(sentinel)
 }
 const mismatch=(await read(join(f.root,'content/photo-credit-mismatches.json'))).find((x:{page?:string})=>x.page==='species/alpha')
 expect(mismatch).toEqual({source:'seriouslyfish',photo:real.url,page:'species/alpha',differs:true})
})
test('all measurement rows validate policy and numeric shape, including clean and sub-limit rows',()=>{
 for(const id of ['clean-1','residue-2-0.03','residue-2-0.05'])for(const changes of [{limit:.3},{version:'older'},{score:NaN},{score:2},{originalEnergy:Infinity},{candidateEnergy:-1},{score:null,originalEnergy:0}]){
  const c=fixtureMarkCalibration(),r=c.cases.find(x=>x.id===id)!
  Object.assign(r.measurement,changes)
  expect(noTraceCalibrationReady(c),id+JSON.stringify(changes)).toBe(false)
 }
})
test('the dated accepted limit retains every sub-limit miss and requires both eyes AND measurement at or above it',()=>{
 expect(ACCEPTED_MARK_RESIDUE).toEqual({strength:.05,date:'2026-11-11',authority:'accepted by the owner after viewing'})
 const c=fixtureMarkCalibration(),miss=c.cases.find(x=>x.id==='residue-2-0.03')!
 Object.assign(miss,{actual:'pass',judgments:fixtureJudgments(true)});miss.measurement.score=.3903539555209733
 c.subLimitMisses=subLimitMarkMisses(c.cases)
 expect(c.cases).toHaveLength(58);expect(c.subLimitMisses).toEqual([{id:miss.id,strength:.03,score:miss.measurement.score}]);expect(noTraceCalibrationReady(c)).toBe(true)
 for(const mode of ['measurement','eye'] as const){
  const x=structuredClone(c),r=x.cases.find(x=>x.id==='residue-2-0.05')!
  if(mode==='measurement')r.measurement.score=.39
  else {r.judgments!.judgments[0]!.passes=true;r.judgments!.judgments[0]!.decision='pass';r.judgments!.disagreement=true}
  expect(noTraceCalibrationReady(x),mode).toBe(false)
 }
 expect(noTraceCalibrationReady({...c,subLimitMisses:[]})).toBe(false)
 expect(noTraceCalibrationReady({...c,cases:c.cases.filter(x=>x.id!==miss.id)})).toBe(false)
})
test('no stored generated calibration lacking neutral attachment proof is ready or reusable',async()=>{
 const c=fixtureGeneratedCalibration();delete c.cases[0]!.attachments;expect(calibrationReady(c)).toBe(false)
 const cache=await dir(),file=join(cache,'candidate.png'),bytes=await sharp({create:{width:10,height:10,channels:3,background:'#abcdef'}}).png().toBuffer();await writeFile(file,bytes)
 const reference:ImageReference={page:'species/fixture',scientificName:'Fixture species',facts,images:[{file,sourceUrl:facts[0]!.sourceUrl,sha256:sha256(bytes)}]}
 const judge=vi.fn(async(prompt:string)=>prompt.startsWith('Check only')?{verdict:'consistent',conflicts:[]}:passed)
 const controls=[{id:'lookalike',expected:'refuse' as const,file,reference}]
 await calibrateGenerated(controls,cache,judge as Parameters<typeof calibrateGenerated>[2]);expect(judge).toHaveBeenCalledTimes(4)
 judge.mockClear();await calibrateGenerated(controls,cache,judge as Parameters<typeof calibrateGenerated>[2]);expect(judge).not.toHaveBeenCalled()
 const records=await read(join(cache,'calibration-results.json'));delete records[0].attachments;await save(join(cache,'calibration-results.json'),records)
 await calibrateGenerated(controls,cache,judge as Parameters<typeof calibrateGenerated>[2]);expect(judge).toHaveBeenCalledTimes(4)
})

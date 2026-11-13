import { fixtureGeneratedCalibration, fixtureMarkCalibration, fixtureJudgments } from './image-fixtures'
import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { calibrateGenerated, calibrateMarks } from '../src/image-calibration'
import { calibrationReady, generatedGateVersion, referenceHash, sha256, NEUTRAL_CALIBRATION_POLICY, type Calibration, type ImageReference } from '../src/image-reference'
import { noTraceCalibrationReady, noTraceVersion, pixelHash, type NoTraceCalibration } from '../src/image-transforms'
import generatedResults from '../../../docs/image-calibration-results.json'
import markResults from '../../../docs/mark-calibration-results.json'
import reviewed from '../src/image-controls.json'
const quota = vi.hoisted(()=>vi.fn(async()=>({at:new Date().toISOString(),limitId:'codex',usedPercent:5,spendControlReached:false})))
vi.mock('../src/codex-images',()=>({readImageQuota:quota,requireQuota:()=>{},codexImageJson:vi.fn()}))
const dirs:string[]=[]
afterEach(async()=>{vi.clearAllMocks();await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function dir(){await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true});const p=await mkdtemp(join(homedir(),'.cache/aquatome/calibration-test-'));dirs.push(p);return p}
test('reviewed controls pin every pixel, reference identity and expected outcome; extra failed safety controls close both gates',()=>{
 const c=fixtureGeneratedCalibration()
 expect(calibrationReady(c)).toBe(true)
 for(const key of ['pixelHash','referenceHash'] as const) expect(calibrationReady({...c,cases:c.cases.map((x,i)=>i?x:{...x,[key]:'a'.repeat(64)})})).toBe(false)
 expect(calibrationReady({...c,cases:[...c.cases,{...c.cases[1]!,id:'additional-wrong',actual:'pass'}]})).toBe(false)
 expect(calibrationReady({...c,cases:c.cases.map(x=>({...x,pixelHash:'a'.repeat(64),referenceHash:'a'.repeat(64)}))})).toBe(false)
 const m=fixtureMarkCalibration()
 expect(noTraceCalibrationReady(m)).toBe(true)
 expect(noTraceCalibrationReady({...m,cases:[...m.cases,{...m.cases[3]!,n:9,actual:'pass'}]})).toBe(false)
 expect(noTraceCalibrationReady({...m,cases:m.cases.map((x,i)=>i?x:{...x,originalHash:'a'.repeat(64)})})).toBe(false)
 expect(noTraceCalibrationReady({...m,cases:m.cases.map((x,i)=>i?x:{...x,box:{...x.box,x0:x.box.x0+1}})})).toBe(false)
})
test('both approvals are invalid before any quota or interrupted calibration work',async()=>{
 for(const kind of ['generated','mark']){const cache=await dir(),file=join(cache,kind==='mark'?'no-trace-calibration.json':'calibration.json');await writeFile(file,JSON.stringify({previous:'approved'}));quota.mockRejectedValueOnce(Error('quota unavailable'))
 await expect(kind==='mark'?calibrateMarks([],cache):calibrateGenerated([],cache)).rejects.toThrow('quota unavailable');expect(JSON.parse(await readFile(file,'utf8')).cases).toEqual([])}
})
test.each([false,true])('calibration preserves ordinary conflicts and reconstructs its output; cached=%s',async cached=>{
 const cache=await dir(),file=join(cache,'real.png');await sharp({create:{width:10,height:10,channels:3,background:'#abcdef'}}).png().toFile(file)
 const reference:ImageReference={page:'species/neon',scientificName:'Test species',facts:[{source:'seriouslyfish',sourceUrl:'https://example.org/',quote:'The blue stripe begins at the nose.'}],images:[{file,sourceUrl:'https://example.org/',sha256:sha256(await readFile(file))}]}
 const ordinary=[{page:'species/ordinary',quote:'Existing conflict remains'}];await writeFile(join(cache,'source-conflicts.json'),JSON.stringify(ordinary));await writeFile(join(cache,'calibration.json'),JSON.stringify({version:generatedGateVersion()}))
 const record={id:'neon-conflict',expected:'conflict',actual:'unsure',conflicts:1,pixelHash:await pixelHash(await readFile(file)),referenceHash:referenceHash(reference),realReferenceHashes:reference.images.map(i=>i.sha256),attachments:{policy:NEUTRAL_CALIBRATION_POLICY,pixelHash:await pixelHash(await readFile(file)),referenceHash:referenceHash(reference),referenceFiles:reference.images.map(i=>i.sha256),candidateFiles:Array(6).fill(sha256(await readFile(file)))},judgments:fixtureJudgments(false),referenceJudgments:fixtureJudgments(false,'conflict'),verdicts:[{note:'conflict'},{note:'conflict'}],referenceVerdicts:[{verdict:'conflict',conflicts:[{n:1,note:'Actually starts at eye'}]},{verdict:'conflict',conflicts:[{n:1,note:'Actually starts at eye'}]}]}
 if(cached)await writeFile(join(cache,'calibration-results.json'),JSON.stringify([record]));const judge=vi.fn(async prompt=>prompt.startsWith('Check only')?{verdict:'conflict',conflicts:[{n:1,note:'Actually starts at eye'}]}:{verdict:'fail',note:'Mismatch',conflicts:[]});await calibrateGenerated([{id:'neon-conflict',expected:'conflict',file,reference}],cache,judge as Parameters<typeof calibrateGenerated>[2])
 if(cached)expect(judge).not.toHaveBeenCalled();else expect(judge).toHaveBeenCalledTimes(4);expect(JSON.parse(await readFile(join(cache,'source-conflicts.json'),'utf8'))).toEqual(ordinary);expect(JSON.parse(await readFile(join(cache,'calibration-conflicts.json'),'utf8')).every((c:{quote:string})=>c.quote===reference.facts[0]!.quote)).toBe(true)
})

test('legacy singles cannot qualify either paired gate, and sub-limit misses must remain reported in the full mark set',()=>{
 expect(calibrationReady({...generatedResults,model:generatedResults.reviewer} as Calibration)).toBe(false)
 const old={version:noTraceVersion(),subLimitMisses:[],cases:markResults.cases.map(x=>({...x,...reviewed.marks.find(f=>f.n===x.n)}))} as NoTraceCalibration
 expect(noTraceCalibrationReady(old)).toBe(false)
 const paired=fixtureMarkCalibration();expect(noTraceCalibrationReady(paired)).toBe(true)
 const missed={...paired,cases:paired.cases.map(x=>x.id==='residue-2-0.03'?{...x,actual:'pass' as const,judgments:fixtureJudgments(true),measurement:{...x.measurement,score:.3903539555209733}}:x)}
 expect(noTraceCalibrationReady(missed)).toBe(false)
 expect(noTraceCalibrationReady({...missed,subLimitMisses:[{id:'residue-2-0.03',strength:.03,score:.3903539555209733}]})).toBe(true)
 expect(noTraceCalibrationReady({...paired,cases:paired.cases.filter(x=>x.id?.startsWith('frozen-'))})).toBe(false)
})


test('a refused label cannot conceal a known-wrong control whose two judges actually pass',()=>{
 const c=fixtureGeneratedCalibration()
 const hiddenPass={...c,cases:c.cases.map(x=>x.id==='lookalike'?{...x,actual:'fail' as const,judgments:fixtureJudgments(true)}:x)}
 expect(calibrationReady(hiddenPass)).toBe(false)
})

test('a control-identifying workspace is refused before judging and cannot preserve a prior approval',async()=>{
 const parent=await dir(),cache=join(parent,'lookalike');await mkdir(cache);await writeFile(join(cache,'calibration.json'),JSON.stringify({previous:'approved'}));const judge=vi.fn()
 const reference:ImageReference={page:'species/fish',scientificName:'Fixture species',facts:[],images:[]}
 await expect(calibrateGenerated([{id:'lookalike',expected:'refuse',file:'/missing',reference}],cache,judge)).rejects.toThrow('must not reveal')
 expect(judge).not.toHaveBeenCalled();expect(JSON.parse(await readFile(join(cache,'calibration.json'),'utf8')).cases).toEqual([])
})

test('malformed paired calibration rows stay closed without throwing',()=>{
 const c=fixtureMarkCalibration();expect(noTraceCalibrationReady({...c,cases:[null,...c.cases.slice(1)]} as unknown as NoTraceCalibration)).toBe(false)
 const broken={...c,cases:c.cases.map((x,i)=>i?x:{...x,judgments:{...x.judgments,judgments:[null,null]}})}
 expect(noTraceCalibrationReady(broken as unknown as NoTraceCalibration)).toBe(false)
})

import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { IMAGE_SWITCHES, loadAll, type Photo } from '@aq/schema'
import generatedResults from '../../../docs/image-calibration-results.json'
import markResults from '../../../docs/mark-calibration-results.json'
import reviewed from '../src/image-controls.json'
import { imagePlan, imageSteps, type ImageStepDeps } from '../src/image-steps'
import { sha256 } from '../src/image-reference'
import { noTraceVersion } from '../src/image-transforms'
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
const save = (file: string, data: unknown) => writeFile(file, JSON.stringify(data))
const real: Photo = { url: 'https://media.aquatome.com/real.webp', width: 100, height: 80, licence: 'CC0', author: 'Source', sourceUrl: 'https://example.org/photo' }
const facts = [{ source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/alpha/', quote: 'The fish has three black stripes along its body.' }]
const passed = { verdict: 'pass', identity: 'pass', anatomy: 'pass', referenceImages: 'pass', person: false, text: false, logo: false, features: [{ n: 1, verdict: 'pass', note: 'visible' }], conflicts: [], note: 'visible' }
const on = { ...IMAGE_SWITCHES, generateMissing: true, publishGenerated: true }
async function fixture() {
 await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true})
 const root = await mkdtemp(join(homedir(), '.cache/aquatome/image-test-')); dirs.push(root)
 await cp(fileURLToPath(new URL('../../schema/test/fixtures/store', import.meta.url)), join(root, 'content'), { recursive: true })
 const cache = join(root, 'private'); await mkdir(join(cache, 'candidates'), { recursive: true }); await mkdir(join(root, 'engine-state'))
 const file = join(root, 'content/species/alpha/entity.json'), e = await read(file)
 e.photos = []; e.scientificName = 'Paracheirodon innesi'; e.sections = [{ ...e.sections[0], ...facts[0], html: `<p>${facts[0]!.quote}</p>` }]; await save(file, e)
 await save(join(cache, 'calibration.json'), { ...generatedResults, model: generatedResults.reviewer })
 await save(join(cache, 'no-trace-calibration.json'), { version: noTraceVersion(), cases: markResults.cases.map(x => ({ ...x, ...reviewed.marks.find(f => f.n === x.n) })) })
 await save(join(cache, 'marked-history-v1.json'), {})
 const bytes = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#abcdef' } }).png().toBuffer()
 const d: ImageStepDeps = { cache, quota: vi.fn(async () => ({ at: new Date().toISOString(), limitId: 'codex', usedPercent: 5, spendControlReached: false })), native: vi.fn(async (prompt, _dir, _ref, admit) => (await admit('image-1'), { bytes, prompt, model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', seconds: 1, receiptHash: sha256('receipt') })), extract: vi.fn(async () => ({ facts })), judge: vi.fn(async () => passed) as ImageStepDeps['judge'], store: vi.fn(async key => `https://media.aquatome.com/${key}`), get: vi.fn(async () => bytes), locateMark: vi.fn(), now: () => new Date() }
 return { root, cache, file, e, d, bytes }
}
const visible = (root: string) => loadAll({ root: join(root, 'content'), lang: 'vi', publicBuild: true, imageSwitches: on })
test('enabled creation, check, publication and later refusal withdraw both records', async () => {
 const f = await fixture(); expect(await imageSteps(f.root, async () => f.d, on)).toMatchObject({ generated: 1, published: 1, failed: [] })
 expect((await visible(f.root)).species[0]!.photos).toHaveLength(1)
 const file = join(f.cache, 'candidates/species-alpha.json'), c = await read(file); delete c.generated.check; await save(file, c)
 f.d.judge = vi.fn(async () => ({ ...passed, verdict: 'fail' })) as ImageStepDeps['judge']; await imageSteps(f.root, async () => f.d, on)
 expect((await visible(f.root)).species[0]!.photos).toHaveLength(0)
 expect((await read(f.file)).photos[0].generated.check).toBeUndefined(); expect((await read(join(f.root, 'content/gallery/alpha.json'))).photos[0].generated.check).toBeUndefined()
})
test.each(['name', 'quote', 'manifest', 'reference-bytes', 'calibration', 'reviewer', 'malformed-calibration', 'missing-calibration'] as const)('withdraws published approval on changed %s', async change => {
 const f = await fixture(); await imageSteps(f.root, async () => f.d, on); const e = await read(f.file)
 if (change === 'name') e.scientificName = 'Another species'
 if (change === 'quote') e.sections[0].html = '<p>A corrected appearance.</p>'
 await save(f.file, e)
 if (change === 'manifest') { await mkdir(join(f.cache, 'references')); await save(join(f.cache, 'references/species-alpha.json'), [{ file: '/missing', sourceUrl: real.sourceUrl, sha256: sha256('new') }]) }
 if (change === 'reference-bytes') { const file = join(f.cache, 'candidates/species-alpha.json'), c = await read(file); c.reference.images = [{ file: '/missing', sourceUrl: real.sourceUrl, sha256: sha256('old') }]; await save(file, c) }
 if(change==='malformed-calibration')await writeFile(join(f.cache,'calibration.json'),'{broken')
 if(change==='missing-calibration')await save(join(f.cache,'calibration.json'),{version:'broken'})
 if (change === 'calibration' || change === 'reviewer') { const file = join(f.cache, 'calibration.json'), c = await read(file); if (change === 'calibration') c.cases = []; else c.model = 'unreviewed-model'; await save(file, c) }
 if (change === 'name' || change === 'quote') expect((await visible(f.root)).species[0]!.photos).toHaveLength(0)
 await imageSteps(f.root, async () => f.d, on); expect((await visible(f.root)).species[0]!.photos).toHaveLength(0)
})
test('planner defers unjudged real entity and album photos, popular too', async () => {
 const f = await fixture(); f.e.photos = [real]; await save(f.file, f.e)
 expect((await imagePlan(f.root))[0]).toMatchObject({ waitingReal: true, popular: true })
 await imageSteps(f.root, async () => f.d, { ...on, generatePopular: true }); expect(f.d.native).not.toHaveBeenCalled()
 await save(join(f.root, 'engine-state/_photo-subjects.json'), { [real.url]: { alpha: { ok: 'yes', person: false, logo: false } } }); expect((await imagePlan(f.root))[0]!.waitingReal).toBe(false)
 f.e.photos = []; await save(f.file, f.e); await mkdir(join(f.root, 'content/gallery'), { recursive: true }); await save(join(f.root, 'content/gallery/alpha.json'), { id: 'alpha', seen: 1, updatedAt: '2026-11-10', photos: [{ ...real, url: real.url + '?second' }] }); expect((await imagePlan(f.root))[0]!.waitingReal).toBe(true)
})
test('absent mark calibration preserves real recovery pending before generation', async () => {
 const f = await fixture(), file = join(f.root, 'content/sources.json'), sources = await read(file)
 sources.seriouslyfish.permission = { date: '2026-11-10', file: 'owner word', scope: ['photos', 'text'], markRemoval: { allowed: true, date: '2026-11-10' } }; await save(file, sources)
 await mkdir(join(f.cache, 'marked')); await save(join(f.cache, 'marked/real.json'), { page: { kind: 'species', id: 'alpha' }, photo: { ...real, source: 'seriouslyfish' } }); await rm(join(f.cache, 'no-trace-calibration.json'))
 const r = await imageSteps(f.root, async () => f.d, { ...on, removeMarks: true }); expect(r.waiting.join()).toContain('not calibrated'); expect(r.failed).toEqual([]); expect(f.d.native).not.toHaveBeenCalled()
})
test.each(['upscaleReal', 'removeMarks', 'publishAltered'] as const)('%s does not judge cached generated candidates', async flag => {
 const f = await fixture(); await imageSteps(f.root, async () => f.d, { ...on, publishGenerated: false }); const candidateFile=join(f.cache,'candidates/species-alpha.json'),candidate=await read(candidateFile);delete candidate.generated.check;await save(candidateFile,candidate); vi.mocked(f.d.judge).mockClear(); vi.mocked(f.d.quota).mockClear()
 await imageSteps(f.root, async () => f.d, { ...IMAGE_SWITCHES, [flag]: true }); expect(f.d.judge).not.toHaveBeenCalled(); expect(f.d.quota).not.toHaveBeenCalled()
})
test('refusal cache frees the next cycle judgment slot', async () => {
 const f = await fixture(); f.d.judge = vi.fn(async () => ({ ...passed, verdict: 'fail' })) as ImageStepDeps['judge']
 await imageSteps(f.root, async () => f.d, on); vi.mocked(f.d.judge).mockClear(); await imageSteps(f.root, async () => f.d, on); expect(f.d.judge).not.toHaveBeenCalled()
})
test('partial entity/gallery write stays hidden and is repaired on the next run', async () => {
 const f = await fixture(); await imageSteps(f.root, async () => f.d, on); await save(join(f.root, 'content/gallery/alpha.json'), { id: 'alpha', photos: [], seen: 0, updatedAt: '2026-11-10' })
 expect((await visible(f.root)).species[0]!.photos).toHaveLength(0); await imageSteps(f.root, async () => f.d, on); expect((await visible(f.root)).species[0]!.photos).toHaveLength(1)
})
test('two all-off cycles preserve every fixture file and the public lead/order', async () => {
 const f = await fixture(); f.e.photos = [real]; await save(f.file, f.e)
 const snapshot = async (dir: string): Promise<unknown> => Promise.all((await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name)).map(async e => [e.name, e.isDirectory() ? await snapshot(join(dir, e.name)) : (await readFile(join(dir, e.name))).toString('base64')]))
 const before = await snapshot(f.root), shown = await visible(f.root), deps = vi.fn(async () => f.d)
 await imageSteps(f.root, deps); await imageSteps(f.root, deps); expect(await snapshot(f.root)).toEqual(before); expect(await visible(f.root)).toEqual(shown); expect(deps).not.toHaveBeenCalled()
})

test.each([false, true])('enabled real recovery precedes generation, strips marked large, permission revoked during upload=%s', async revoke => {
 const f = await fixture(), sourcesFile = join(f.root, 'content/sources.json'), sources = await read(sourcesFile)
 sources.seriouslyfish = { name: 'Seriously Fish', homepage: 'https://www.seriouslyfish.com/', publish: true, permission: { date: '2026-11-10', file: 'owner word', scope: ['photos','text'], markRemoval: { allowed: true, date: '2026-11-10' } } }; await save(sourcesFile, sources)
 const original = Buffer.alloc(100*80*3); for(let i=0;i<original.length;i++) original[i]=(i*37+Math.floor(i/83))%256
 f.d.get = async () => sharp(original, { raw: { width: 100, height:80, channels:3 } }).png().toBuffer()
 f.d.locateMark = async () => ({ owner: 'source', text: 'Seriously Fish', sourceUrl: facts[0]!.sourceUrl, box: { x0:0,y0:0,x1:100,y1:80 } })
 f.d.judge = vi.fn(async (_file,_prompt,schema) => 'photos' in (schema as {properties:object}).properties ? { photos: [{ n:1, ok:'yes', person:false,logo:false }] } : { verdict:'pass',residual:false,newMark:false,note:'clean' }) as ImageStepDeps['judge']
 const photo = { ...real, source:'seriouslyfish',sourceUrl:facts[0]!.sourceUrl,licence:'dùng với sự cho phép',large:{url:'https://media.aquatome.com/marked-large.webp',width:1500,height:1200} }
 await mkdir(join(f.cache,'marked')); await save(join(f.cache,'marked/real.json'),{page:{kind:'species',id:'alpha'},photo})
 if(revoke) f.d.store=async key=>{ sources.seriouslyfish.permission.markRemoval.allowed=false;await save(sourcesFile,sources);return `https://media.aquatome.com/${key}` }
 const result=await imageSteps(f.root,async()=>f.d,{...on,removeMarks:true,publishAltered:true})
 expect(result.failed).toEqual([]); expect(result.generated).toBe(0)
 if(revoke) expect((await read(f.file)).photos).toHaveLength(0)
 else { const p=(await read(f.file)).photos[0]; expect(p.large).toBeUndefined();expect(p.original.large.url).toContain('marked-large');expect(result.published).toBe(1) }
})
test('publication aborts a hung store on the cycle signal and writes no approval',async()=>{
 const f=await fixture(),controller=new AbortController();let uploadSignal:AbortSignal|undefined
 f.d.store=async(_key,_bytes,_type,signal)=>{uploadSignal=signal;controller.abort(Error('cycle deadline reached'));return new Promise(()=>{})}
 const r=await imageSteps(f.root,async()=>f.d,on,1,720000,controller.signal)
 expect(r.failed.join()).toContain('deadline');expect(uploadSignal?.aborted).toBe(true);expect((await read(f.file)).photos).toHaveLength(0);await expect(readFile(join(f.root,'content/image-approvals.json'))).rejects.toThrow()
})
test('a refused first page lets a later page generate and pass under limit one',async()=>{
 const f=await fixture();await cp(join(f.root,'content/species/alpha'),join(f.root,'content/species/delta'),{recursive:true});await save(join(f.root,'content/species/delta/entity.json'),{...f.e,id:'delta',scientificName:'Different species'})
 f.d.judge=vi.fn(async file=>file.includes('species-alpha')||file.includes('/views/')&&vi.mocked(f.d.judge).mock.calls.length===1?{...passed,verdict:'fail'}:passed) as ImageStepDeps['judge']
 const first=await imageSteps(f.root,async()=>f.d,on);expect(first.published).toBe(0)
 const second=await imageSteps(f.root,async()=>f.d,on);expect(second.published).toBe(1);expect((await read(join(f.root,'content/species/delta/entity.json'))).photos).toHaveLength(1)
})
test('withdrawal after publication keeps the existing real album photo as lead',async()=>{
 const f=await fixture();await imageSteps(f.root,async()=>f.d,on);const galleryFile=join(f.root,'content/gallery/alpha.json'),gallery=await read(galleryFile);gallery.photos.unshift(real);await save(galleryFile,gallery)
 await save(join(f.root,'engine-state/_photo-subjects.json'),{[real.url]:{alpha:{ok:'yes',person:false,logo:false,typical:true,note:'fixture'}}})
 expect((await visible(f.root)).species[0]!.photos[0]!.url).toBe(real.url)
 await save(join(f.cache,'calibration.json'),{cases:[]});await imageSteps(f.root,async()=>f.d,on)
 expect((await visible(f.root)).species[0]!.photos[0]!.url).toBe(real.url)
})
test('an already-cancelled image step starts no dependency work',async()=>{
 const c=new AbortController();c.abort(Error('cancelled'));const deps=vi.fn(async()=>{throw Error('must not start')})
 await expect(imageSteps('/unused',deps,on,1,720000,c.signal)).rejects.toThrow('cancelled');expect(deps).not.toHaveBeenCalled()
})

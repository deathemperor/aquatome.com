import { createHash } from 'node:crypto'
import { afterEach, expect, test } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPROVED_GENERATED_GATE, MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION, IMAGE_SWITCHES, loadAll, PhotoSchema, SourceInfoSchema, type GeneratedRecord, type Photo } from '../src/index'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
const hash = 'a'.repeat(64)
const generated: GeneratedRecord = { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', date: '2026-11-10', prompt: 'fish', referenceHash: hash, check: { passes:2,judgments:['a'.repeat(64),'b'.repeat(64)],verdict: 'pass', version: APPROVED_GENERATED_GATE, model: 'gpt-5.6-sol', at: '2026-11-10', referenceHash: hash, pixelHash: hash, calibrationHash: hash } }
const real: Photo = { url: 'https://media.aquatome.com/real.webp', width: 800, height: 600, licence: 'CC0', author: 'Source', sourceUrl: 'https://example.org/photo' }
const ai: Photo = { ...real, url: 'https://media.aquatome.com/ai.webp', licence: 'AI-generated', author: 'AI', generated }
async function fixture(photos: Photo[], gallery: Photo[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'image-policy-')); dirs.push(root)
  await cp(fileURLToPath(new URL('./fixtures/store', import.meta.url)), root, { recursive: true })
  const file = join(root, 'species/alpha/entity.json'), entity = JSON.parse(await readFile(file, 'utf8'))
  entity.photos = photos; await writeFile(file, JSON.stringify(entity))
  await mkdir(join(root, 'gallery'), { recursive: true }); await writeFile(join(root, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', photos: [...gallery, ...photos.filter(p => p.generated)], seen: gallery.length, updatedAt: '2026-11-10' }))
  await writeFile(join(root, 'image-approvals.json'), JSON.stringify({ calibrationHash: hash, photos: Object.fromEntries(photos.filter(p => p.generated).map(p => [p.url, { page: 'species/alpha', recordHash: createHash('sha256').update(JSON.stringify([entity.scientificName, entity.sections])).digest('hex'), check: p.generated!.check }])) }))
  return root
}
const load = (root: string, on = false) => loadAll({ root, lang: 'vi', publicBuild: true, imageSwitches: { ...IMAGE_SWITCHES, publishGenerated: on } })

test('generated pictures stay off in review, and require their own positive reference-based approval', async () => {
  const root = await fixture([ai, real])
  expect((await load(root)).species[0]!.photos).toEqual([real])
  expect((await load(root, true)).species[0]!.photos.map(p => p.url)).toEqual([real.url, ai.url])
  const file = join(root, 'species/alpha/entity.json'), entity = JSON.parse(await readFile(file, 'utf8'))
  entity.photos[0].generated.check.version = 'b'.repeat(64); await writeFile(file, JSON.stringify(entity))
  expect((await load(root, true)).species[0]!.photos).toEqual([real])
  expect(PhotoSchema.safeParse({ ...ai, generated: { ...generated, check: { ...generated.check, verdict: 'unsure' } } }).success).toBe(false)
})

test('a real photograph arriving in the visible album takes the generated head back immediately', async () => {
  const root = await fixture([ai], [real])
  expect((await load(root, true)).species[0]!.photos.map(p => p.url)).toEqual([real.url, ai.url])
})

test('source mark-removal permission is absent/off unless it has a dated explicit approval', () => {
  const source = { name: 'Source', homepage: 'https://example.org/', publish: true, permission: { date: '2026-11-10', file: 'owner statement', scope: ['photos'] } }
  expect(SourceInfoSchema.parse(source).permission?.markRemoval).toBeUndefined()
  expect(SourceInfoSchema.safeParse({ ...source, permission: { ...source.permission, markRemoval: { allowed: true } } }).success).toBe(false)
  expect(SourceInfoSchema.safeParse({ ...source, permission: { ...source.permission, markRemoval: { allowed: true, date: '2026-11-10' } } }).success).toBe(true)
})

test('each source can revoke its altered pictures in one build; Glaser falls back to its original with no altered thumb', async () => {
  const pair:[string,string]=[hash,'b'.repeat(64)]
  const altered = [{ method: 'mark-removal' as const, date: '2026-11-10', permissionDate: '2026-11-10', originalHash: hash, box: { x0: 0, y0: 0, x1: 20, y1: 10 }, outsideChanged: 0 as const, noTrace: 'pass' as const, checks:{species:pair,ownership:pair,noTrace:pair,preservation:pair}, residue: { version: MARK_RESIDUE_VERSION, score: 0.1, limit: MARK_RESIDUE_LIMIT } }]
  const glaser: Photo = { ...real, source: 'glaser', licence: 'dùng với sự cho phép', url: 'https://media.aquatome.com/clean-glaser.webp', thumb: 'https://media.aquatome.com/clean-glaser-480.webp', altered, original: { url: 'https://media.aquatome.com/glaser/original.webp', width: 800, height: 600 } }
  const bw: Photo = { ...glaser, source: 'bwaquatics', url: 'https://media.aquatome.com/clean-bw.webp' }
  const root = await fixture([glaser, bw]), file = join(root, 'sources.json'), sources = JSON.parse(await readFile(file, 'utf8'))
  for (const id of ['glaser', 'bwaquatics']) sources[id] = { name: id, homepage: `https://${id}.example/`, publish: true, permission: { date: '2026-11-10', file: 'owner statement', scope: ['photos'], markRemoval: { allowed: true, date: '2026-11-10' } } }
  await writeFile(file, JSON.stringify(sources))
  const opts = { root, lang: 'vi' as const, publicBuild: true, imageSwitches: { ...IMAGE_SWITCHES, removeMarks: true, publishAltered: true } }
  expect((await loadAll(opts)).species[0]!.photos.map(p => p.url)).toEqual([glaser.url, bw.url])
  sources.glaser.permission.markRemoval = { allowed: false }; await writeFile(file, JSON.stringify(sources))
  const photos = (await loadAll(opts)).species[0]!.photos
  expect(photos.map(p => p.url)).toEqual([glaser.original!.url, bw.url])
  expect(photos[0]!.altered).toBeUndefined(); expect(photos[0]!.thumb).toBeUndefined()
  sources.bwaquatics.permission.markRemoval = { allowed: false }; await writeFile(file, JSON.stringify(sources))
  expect((await loadAll(opts)).species[0]!.photos.map(p => p.url)).toEqual([glaser.original!.url])
})

test('withdrawing a generated head retains its real album lead, including build-time invalidation',async()=>{
 const root=await fixture([ai],[real]);expect((await load(root,true)).species[0]!.photos[0]!.url).toBe(real.url)
 const file=join(root,'species/alpha/entity.json'),entity=JSON.parse(await readFile(file,'utf8'));delete entity.photos[0].generated.check;await writeFile(file,JSON.stringify(entity))
 expect((await load(root,true)).species[0]!.photos.map(p=>p.url)).toEqual([real.url])
 entity.photos[0]=ai;entity.scientificName='Corrected species';await writeFile(file,JSON.stringify(entity));expect((await load(root,true)).species[0]!.photos[0]!.url).toBe(real.url)
})
test('ordinary empty pages keep the pre-feature loader behavior with switches off',async()=>{
 const root=await fixture([],[real]);expect((await load(root)).species[0]!.photos).toEqual([])
})

test('a whole-subject crop leads fitted, remains in its album and prevents an AI lead',async()=>{
 const pair:[string,string]=[hash,'b'.repeat(64)],crop={originalWidth:800,originalHeight:600,window:{x0:0,y0:0,x1:800,y1:520},subject:{x0:30,y0:180,x1:760,y1:420},margin:15}
 const p:Photo={...real,source:'glaser',width:800,height:520,altered:[{method:'mark-crop',date:'2026-11-11',permissionDate:'2026-11-10',originalHash:hash,crop,excludedMarks:[{x0:20,y0:550,x1:780,y1:590}],retainedChanged:0,checks:{species:pair,ownership:pair}}]}
 const root=await fixture([ai,p]),file=join(root,'sources.json'),sources=JSON.parse(await readFile(file,'utf8'));sources.glaser={name:'Fixture source',homepage:'https://example.org/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}};await writeFile(file,JSON.stringify(sources))
 const c=await loadAll({root,lang:'vi',publicBuild:true,imageSwitches:{...IMAGE_SWITCHES,publishGenerated:true,publishAltered:true,removeMarks:true}})
 expect(c.species[0]!.photos).toEqual([{...p,headFit:'contain'}]);expect(c.galleries.alpha?.map(p=>p.url)).toEqual([p.url,ai.url])
})

import { photoFitsHead, photoFitsWholeHead, photoFitsCard } from '../src/image-geometry'
const wholeCrop = ():Photo => ({...real,url:'https://media.aquatome.com/cropped.webp',source:'glaser',width:800,height:520,altered:[{method:'mark-crop',date:'2026-11-11',permissionDate:'2026-11-10',originalHash:hash,crop:{originalWidth:800,originalHeight:600,window:{x0:0,y0:0,x1:800,y1:520},subject:{x0:30,y0:180,x1:760,y1:420},margin:15},excludedMarks:[{x0:20,y0:550,x1:780,y1:590}],retainedChanged:0,checks:{species:[hash,'b'.repeat(64)],ownership:[hash,'b'.repeat(64)]}}]})
async function cropFixture(photos:Photo[],gallery:Photo[]=[]){
 const root=await fixture(photos,gallery),file=join(root,'sources.json'),sources=JSON.parse(await readFile(file,'utf8'))
 sources.glaser={name:'Fixture source',homepage:'https://example.org/',publish:true,permission:{date:'2026-11-10',file:'fixture permission',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}};await writeFile(file,JSON.stringify(sources))
 return {root,opts:{root,lang:'vi' as const,publicBuild:true,imageSwitches:{...IMAGE_SWITCHES,removeMarks:true,publishAltered:true}}}
}
test('a safely framed real head wins before and after a whole-photo crop arrives',async()=>{
 const crop=wholeCrop(),f=await cropFixture([crop],[real])
 let c=await loadAll(f.opts);expect(c.species[0]!.photos[0]).toEqual(real);expect(c.species[0]!.photos[0]!.headFit).toBeUndefined();expect(c.galleries.alpha?.some(p=>p.url===crop.url)).toBe(true)
 const file=join(f.root,'species/alpha/entity.json'),entity=JSON.parse(await readFile(file,'utf8'));entity.photos=[real,crop];await writeFile(file,JSON.stringify(entity))
 c=await loadAll(f.opts);expect(c.species[0]!.photos[0]).toEqual(real)
})
test('an admitted crop in an otherwise headless album can become a whole-photo head without writing its record',async()=>{
 const crop=wholeCrop(),f=await cropFixture([],[crop]),file=join(f.root,'gallery/alpha.json'),before=await readFile(file,'utf8')
 const c=await loadAll(f.opts);expect(c.species[0]!.photos).toEqual([{...crop,headFit:'contain'}]);expect(await readFile(file,'utf8')).toBe(before);expect(c.galleries.alpha?.[0]?.headFit).toBeUndefined()
})
test('whole-photo eligibility still requires native dimensions and the complete subject with its margin',()=>{
 const p=wholeCrop();expect(photoFitsWholeHead(p)).toBe(true);expect(photoFitsHead(p)).toBe(false);const fitted:Photo={...p,headFit:'contain'};expect(photoFitsCard(fitted)).toBe(false)
 expect(photoFitsWholeHead({...p,width:799})).toBe(false)
 expect(photoFitsWholeHead({...p,altered:[{...p.altered![0]!,crop:{...p.altered![0]!.crop!,margin:5}}]})).toBe(false)
 expect(photoFitsWholeHead({...p,altered:[{...p.altered![0]!,crop:{...p.altered![0]!.crop!,subject:{x0:0,y0:0,x1:800,y1:520}}}]})).toBe(false)
 expect(photoFitsWholeHead(real)).toBe(false)
})
test('the placement gate cannot admit a seventh unapproved crop or bypass any off switch',async()=>{
 const p=wholeCrop(),f=await cropFixture([p]);expect((await loadAll(f.opts)).species[0]!.photos[0]?.headFit).toBe('contain')
 const off=await loadAll({...f.opts,imageSwitches:IMAGE_SWITCHES});expect(off.species[0]!.photos).toEqual([]);expect(off.galleries.alpha).toBeUndefined()
})

test('a crop no frame fits heads its page when marked to show whole, and leaves the album',async()=>{
 const pair:[string,string]=[hash,'b'.repeat(64)],crop={originalWidth:800,originalHeight:600,window:{x0:0,y0:0,x1:800,y1:520},subject:{x0:30,y0:180,x1:760,y1:420},margin:15}
 const p:Photo={...real,source:'glaser',width:800,height:520,headFit:'contain',altered:[{method:'mark-crop',date:'2026-11-11',permissionDate:'2026-11-10',originalHash:hash,crop,excludedMarks:[{x0:20,y0:550,x1:780,y1:590}],retainedChanged:0,checks:{species:pair,ownership:pair}}]}
 const root=await fixture([ai,p]),file=join(root,'sources.json'),sources=JSON.parse(await readFile(file,'utf8'));sources.glaser={name:'Fixture source',homepage:'https://example.org/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}};await writeFile(file,JSON.stringify(sources))
 const c=await loadAll({root,lang:'vi',publicBuild:true,imageSwitches:{...IMAGE_SWITCHES,publishGenerated:true,publishAltered:true,removeMarks:true}})
 expect(c.species[0]!.photos[0]!.url).toBe(p.url);expect(c.species[0]!.photos[0]!.headFit).toBe('contain');expect(c.galleries.alpha?.map(p=>p.url)??[]).not.toContain(p.url)
})

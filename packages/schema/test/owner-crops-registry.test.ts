import { expect, test } from 'vitest'
import { OWNER_CROPS, IMAGE_SWITCHES, PhotoSchema } from '../src/index'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { slow } from '../src/test-time'
test('the only activation is 57 individually named crops, with no general switch or source grant',async()=>{
 expect(OWNER_CROPS.filter(a=>a.approved).map(a=>a.scientificName).sort()).toEqual(["Anablepsoides ornatus", "Aphanius farsicus", "Apteronotus macrostomus", "Leptodoras cataniai", "Macrognathus aculeatus", "Ailia coila", "Acestrorhynchus falcirostris", "Acrochordonichthys septentrionalis", "Ageneiosus marmoratus", "Akysis pulvinatus", "Amatitlania nanolutea", "Amblyrhynchichthys micracanthus", "Aphanius asquamatus", "Aphanius vladykovi", "Aphyosemion bualanum", "Aphyosemion celiae", "Aphyosemion cognatum", "Aphyosemion gabunense", "Apistogrammoides pucallpaensis", "Aristochromis christyi", "Badis ruber", "Bangana devdevi", "Barilius bakeri", "Betta pardalotos", "Betta rutilans", "Betta unimaculata", "Brachygobius xanthomelas", "Copella meinkeni", "Crossocheilus burmanicus", "Cyclocheilichthys armatus", "Esmaeilius persicus", "Esomus caudiocellatus", "Hyphessobrycon elachys", "Nemacheilus saravacensis", "Opsarius koratensis", "Opsarius pulchellus", "Parosphromenus parvulus", "Rasbosoma spilocerca", "Tanakia signifer", "Boraras micros", "Carnegiella marthae", "Lobocheilos melanotaenia", "Oryzias songkhramensis", "Carnegiella myersi", "Carnegiella myersi", "Carnegiella myersi", "Anatolichthys transgrediens", "Aphyosemion hanneloreae", "Apistogramma mendezi", "Aulonocara baenschi", "Boulengerella lateristriga", "Caelatoglanis zonatus", "Canthophrys gongota", "Geophagus dicrozoster", "Champsochromis caeruleus", "Apistogramma diplotaenia", "Adontosternarchus nebulosus"].sort())
 expect(new Set(OWNER_CROPS.map(a=>a.id)).size).toBe(57)
 for(const a of OWNER_CROPS)for(const key of ['recordHash','originalHash','pixelHash'] as const)expect(a[key]).toMatch(/^[a-f0-9]{64}$/)
 expect(Object.values(IMAGE_SWITCHES).every(x=>x===false)).toBe(true)
 const sources=JSON.parse(await readFile(fileURLToPath(new URL('../../../content/sources.json',import.meta.url)),'utf8'))
 expect(Object.values(sources).some(s=>(s as {permission?:{markRemoval?:{allowed?:boolean}}}).permission?.markRemoval?.allowed)).toBe(false)
})
test('the schema accepts an optional head-only fitting directive without assigning it by default',()=>{
 const p={url:'https://example.org/photo',width:800,height:600,author:'Fixture source',licence:'CC0',sourceUrl:'https://example.org/'}
 expect(PhotoSchema.parse(p).headFit).toBeUndefined();expect(PhotoSchema.parse({...p,headFit:'contain'}).headFit).toBe('contain');expect(PhotoSchema.safeParse({...p,headFit:'cover'}).success).toBe(false)
})

test('the registry loads through native Node, as the browser-check configuration does',async()=>{
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util')
 const file=new URL('../src/owner-crops.ts',import.meta.url).href
 const {stdout}=await promisify(execFile)('node',['--input-type=module','-e',`const m=await import(${JSON.stringify(file)});console.log(m.OWNER_CROPS.length)`],{timeout:slow(10000)})
 expect(stdout.trim()).toBe('57')
})

import { createHash } from 'node:crypto'
test("the owner's 39 and the chief of staff's eighteen approvals bind exactly these 57 photo identities",()=>{
 expect(createHash('sha256').update(JSON.stringify(OWNER_CROPS)).digest('hex')).toBe('605fd4dcff0f8152e53df0dbd79bb5994b5c677a29ed5bb5187b4b04f2bfb2f8')
})

test('each of the33 returned approvals binds its stage-owned screen record before admission',()=>{
 const batch=OWNER_CROPS.filter(a=>a.authority==='owner approved the 143-page boards')
 expect(batch).toHaveLength(33);expect(batch.filter(a=>a.creditMismatch===true)).toHaveLength(22)
 for(const a of batch)expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)
})


test('the empty-page recovery admits only four byte-bound photos, not another crop of those species',()=>{
 const batch=OWNER_CROPS.filter(a=>a.date==='2026-11-12')
 expect(batch.map(a=>a.id).sort()).toEqual(['owner-crop-20261112-boraras-micros-sf-4','owner-crop-20261112-carnegiella-marthae-sf-1','owner-crop-20261112-lobocheilos-melanotaenia-sf-1','owner-crop-20261112-oryzias-songkhramensis-sf-1'])
 for(const a of batch)expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)
 expect(batch.filter(a=>a.creditMismatch===true)).toHaveLength(3)
})


test('the habitat-page recovery adds exactly the three approved Carnegiella myersi crops, never a fourth',()=>{
 const batch=OWNER_CROPS.filter(a=>a.id.startsWith('owner-crop-20261113-carnegiella-myersi-'))
 expect(batch.map(a=>a.id).sort()).toEqual(['owner-crop-20261113-carnegiella-myersi-commons-1','owner-crop-20261113-carnegiella-myersi-sf-1','owner-crop-20261113-carnegiella-myersi-sf-4'])
 for(const a of batch){expect(a.page).toBe('species/carnegiella-myersi');expect(a.scientificName).toBe('Carnegiella myersi');expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)}
 const old=OWNER_CROPS.filter(a=>a.date<'2026-11-13')
 expect(createHash('sha256').update(JSON.stringify(old)).digest('hex')).toBe('d48e1e8d8a6e17a6ebb55c46e76024249b3b0d959c93f35ab901e7a3ba2916eb')
})


test("the eight named recoveries and accompanying open-licence photo are the only new approvals",()=>{
 const ids=["owner-crop-20261113-anatolichthys-transgrediens-recovery-1", "owner-crop-20261113-aphyosemion-hanneloreae-recovery-1", "owner-crop-20261113-apistogramma-mendezi-recovery-1", "owner-crop-20261113-aulonocara-baenschi-recovery-1", "owner-crop-20261113-boulengerella-lateristriga-recovery-1", "owner-crop-20261113-caelatoglanis-zonatus-recovery-1", "owner-crop-20261113-canthophrys-gongota-recovery-1", "owner-crop-20261113-geophagus-dicrozoster-recovery-1", "owner-crop-20261113-champsochromis-caeruleus-recovery-1"]
 const batch=OWNER_CROPS.filter(a=>ids.includes(a.id))
 expect(batch.map(a=>a.id).sort()).toEqual([...ids].sort())
 expect(batch).toHaveLength(9)
 for(const a of batch)expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)
 const previous=OWNER_CROPS.filter(a=>a.date<'2026-11-14'&&!ids.includes(a.id))
 expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('a565d725f98ee084364713b3eedd90a3bd8c8cd317e2ab76f59fdcb66ee507eb')
 expect(batch.some(a=>a.page==='species/acrochordonichthys-gyrinus')).toBe(false)
 expect(batch.find(a=>a.page==='species/canthophrys-gongota')?.id).toBe('owner-crop-20261113-canthophrys-gongota-recovery-1')
})


test("the two exact Glaser originals approved on 14 November cannot admit a third photo",()=>{
 const batch=OWNER_CROPS.filter(a=>a.date==='2026-11-14')
 expect(batch.map(({id,page,originalHash})=>({id,page,originalHash}))).toEqual([{"id":"owner-crop-20261114-apistogramma-diplotaenia-glaser-1","page":"species/apistogramma-diplotaenia","originalHash":"97ff0a95a92bec608864e54f09fc43f11199dac85a653ce79b00ebe7bf6b03e2"},{"id":"owner-crop-20261114-adontosternarchus-nebulosus-glaser-1","page":"species/adontosternarchus-nebulosus","originalHash":"759686001d00f4cb9c162fe0c2180272f301e726876e6913b90ff3cd8ec4df45"}])
 expect(batch).toHaveLength(2)
 for(const a of batch){expect(a.approved).toBe(true);expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)}
 const previous=OWNER_CROPS.filter(a=>a.date<'2026-11-14')
 expect(previous).toHaveLength(55)
 expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('6895080281c696600be3da6d12cb385efe78b5b0526dba8d53f76ef155771af5')
})

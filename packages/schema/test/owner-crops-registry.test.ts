import { expect, test } from 'vitest'
import { OWNER_CROPS, IMAGE_SWITCHES, PhotoSchema } from '../src/index'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
test('the only activation is 39 individually named crops, with no general switch or source grant',async()=>{
 expect(OWNER_CROPS.filter(a=>a.approved).map(a=>a.scientificName).sort()).toEqual(["Anablepsoides ornatus", "Aphanius farsicus", "Apteronotus macrostomus", "Leptodoras cataniai", "Macrognathus aculeatus", "Ailia coila", "Acestrorhynchus falcirostris", "Acrochordonichthys septentrionalis", "Ageneiosus marmoratus", "Akysis pulvinatus", "Amatitlania nanolutea", "Amblyrhynchichthys micracanthus", "Aphanius asquamatus", "Aphanius vladykovi", "Aphyosemion bualanum", "Aphyosemion celiae", "Aphyosemion cognatum", "Aphyosemion gabunense", "Apistogrammoides pucallpaensis", "Aristochromis christyi", "Badis ruber", "Bangana devdevi", "Barilius bakeri", "Betta pardalotos", "Betta rutilans", "Betta unimaculata", "Brachygobius xanthomelas", "Copella meinkeni", "Crossocheilus burmanicus", "Cyclocheilichthys armatus", "Esmaeilius persicus", "Esomus caudiocellatus", "Hyphessobrycon elachys", "Nemacheilus saravacensis", "Opsarius koratensis", "Opsarius pulchellus", "Parosphromenus parvulus", "Rasbosoma spilocerca", "Tanakia signifer"].sort())
 expect(new Set(OWNER_CROPS.map(a=>a.id)).size).toBe(39)
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
 const {stdout}=await promisify(execFile)('node',['--input-type=module','-e',`const m=await import(${JSON.stringify(file)});console.log(m.OWNER_CROPS.length)`],{timeout:10000})
 expect(stdout.trim()).toBe('39')
})

import { createHash } from 'node:crypto'
test('the owner approved exactly these 39 photo identities, including only the returned 33 additions',()=>{
 expect(createHash('sha256').update(JSON.stringify(OWNER_CROPS)).digest('hex')).toBe('b480a632e957ef778651f8735b978227bb443930197df30a3c8a7ca0306696d4')
})

test('each of the33 returned approvals binds its stage-owned screen record before admission',()=>{
 const batch=OWNER_CROPS.filter(a=>a.authority==='owner approved the 143-page boards')
 expect(batch).toHaveLength(33);expect(batch.filter(a=>a.creditMismatch===true)).toHaveLength(22)
 for(const a of batch)expect(a.screenRecordHash).toMatch(/^[a-f0-9]{64}$/)
})

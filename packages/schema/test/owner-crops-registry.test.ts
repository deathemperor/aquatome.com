import { expect, test } from 'vitest'
import { OWNER_CROPS, IMAGE_SWITCHES, PhotoSchema } from '../src/index'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
test('the only activation is six named crops, with no general switch or source grant',async()=>{
 expect(OWNER_CROPS.filter(a=>a.approved).map(a=>a.scientificName).sort()).toEqual(['Anablepsoides ornatus','Aphanius farsicus','Apteronotus macrostomus','Leptodoras cataniai','Macrognathus aculeatus','Ailia coila'].sort())
 expect(new Set(OWNER_CROPS.map(a=>a.id)).size).toBe(6)
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
 expect(stdout.trim()).toBe('6')
})

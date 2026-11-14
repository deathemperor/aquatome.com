import { afterEach,expect,test,vi } from 'vitest'
import { mkdir,mkdtemp,rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { cleanPhoto,IMAGE_SWITCHES,photoFitsCard,photoFitsHead,type Photo,type SourceInfo } from '@aq/schema'
import { markCropOptions,retainedPixelProof } from '../src/image-crop'
import { cropSourceMarks,type MarkEvidence } from '../src/image-alterations'
import { agreedMarks,originalSpecies,preservedSubject } from '../src/image-real-checks'

const source:SourceInfo={name:'Fixture Source',homepage:'https://source.example.org',publish:true,permission:{date:'2026-11-10',file:'owner statement',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}}
const photo:Photo={url:'https://media.example.org/photo.webp',width:800,height:600,author:'Fixture Source',licence:'dùng với sự cho phép',source:'seriouslyfish',sourceUrl:'https://source.example.org/species/fish/'}
const box={x0:50,y0:80,x1:450,y1:400},mark:MarkEvidence={owner:'source',text:'Fixture Source',sourceUrl:photo.sourceUrl,box:{x0:100,y0:540,x1:650,y1:585},subjectBox:box,wholeSubject:true}
const hashes:[string,string]=['a'.repeat(64),'b'.repeat(64)],checks={species:hashes,ownership:hashes}
const folders:string[]=[]
afterEach(async()=>{await Promise.all(folders.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function pixels(){const data=Buffer.alloc(800*600*3);for(let n=0;n<data.length;n++)data[n]=(n*13+Math.floor(n/81))%256;return sharp(data,{raw:{width:800,height:600,channels:3}}).png().toBuffer()}
test('an edge mark is discarded using original pixels, without a repaint, no-trace call or enlargement',async()=>{
 const original=await pixels(),result=await cropSourceMarks(photo,original,source,[mark],checks,()=>new Date('2026-11-11'),{...IMAGE_SWITCHES,removeMarks:true})
 expect(result).toBeDefined();const altered=result!.altered[0]!
 expect(altered).toMatchObject({method:'mark-crop',retainedChanged:0,excludedMarks:[mark.box],checks})
 expect(altered.noTrace).toBeUndefined();expect(altered.residue).toBeUndefined()
 expect(await retainedPixelProof(original,result!.bytes,altered.crop!.window)).toBe(0)
 const dimensions=await sharp(result!.bytes).metadata();expect(dimensions.width).toBeLessThanOrEqual(800);expect(dimensions.height).toBeLessThan(600)
})
test('native frame windows keep the entire subject and margin; an album-only crop never falls through to a card',()=>{
 const options=markCropOptions(800,600,box,[mark.box]);expect(options.length).toBeGreaterThan(0)
 expect(photoFitsHead({...photo,width:options[0]!.window.x1-options[0]!.window.x0,height:options[0]!.window.y1-options[0]!.window.y0,altered:[{method:'mark-crop',crop:options[0]!}]})).toBe(true)
 const long=markCropOptions(800,600,{x0:30,y0:180,x1:760,y1:420},[mark.box])[0]!
 const p={...photo,width:long.window.x1-long.window.x0,height:long.window.y1-long.window.y0,altered:[{method:'mark-crop' as const,date:'2026-11-11',originalHash:'a'.repeat(64),crop:long}]}
 expect(photoFitsHead(p)).toBe(false);expect(photoFitsCard(p)).toBe(false);expect(cleanPhoto([p])).toBeUndefined()
})
test('overlap, clipped subject, any foreign mark, missing permission and ND licence hold a crop',async()=>{
 const bytes=await pixels(),on={...IMAGE_SWITCHES,removeMarks:true}
 expect(markCropOptions(800,600,box,[{x0:100,y0:100,x1:150,y1:140}])).toEqual([])
 for(const marks of [[{...mark,wholeSubject:false}],[mark,{...mark,owner:'third-party' as const,text:'another.example.org'}]])expect(await cropSourceMarks(photo,bytes,source,marks,checks,()=>new Date(),on)).toBeUndefined()
 expect(await cropSourceMarks({...photo,licence:'CC BY-ND 4.0'},bytes,source,[mark],checks,()=>new Date(),on)).toBeUndefined()
 expect(await cropSourceMarks(photo,bytes,source,[mark],checks,()=>new Date())).toBeUndefined()
})
test('both inventories must agree; their conservative box union cannot conceal a second mark',()=>{
 expect(agreedMarks([mark],[mark,{...mark,text:'another mark'}])).toBeUndefined()
 expect(agreedMarks([mark],[{...mark,owner:'unknown'}])).toBeUndefined()
 expect(agreedMarks([mark],[{...mark,box:{x0:700,y0:0,x1:790,y1:30}}])).toBeUndefined()
 expect(agreedMarks([mark],[{...mark,text:'© Fixture Source'}])).toHaveLength(1)
 expect(agreedMarks([{...mark,owner:'photographer',credit:'Fixture contributor'}],[{...mark,owner:'photographer',credit:'Different contributor'}])).toBeUndefined()
 expect(agreedMarks([mark],[{...mark,box:{...mark.box,x1:700}}])?.[0]?.box.x1).toBe(700)
})
test('one immutable original pair is reused for both edits; yes plus unsure is held, rather than choosing the favorable answer',async()=>{
 await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true});const cache=await mkdtemp(join(homedir(),'.cache/aquatome/crop-original-test-'));folders.push(cache)
 let calls=0;const judge=vi.fn(async()=>({photos:[{n:1,ok:++calls===1?'yes':'unsure',typical:true,person:false,logo:true,note:'Controlled fixture observation.'}]}))
 const args=['same-original',Buffer.from('same immutable pixels'),{id:'fish',kind:'species' as const},'Fixture species',cache,judge as unknown as Parameters<typeof originalSpecies>[5]] as const
 const first=await originalSpecies(...args),second=await originalSpecies(...args)
 expect(first.pair.pass).toBe(false);expect(first.pair.disagreement).toBe(true);expect(second).toEqual(first);expect(judge).toHaveBeenCalledTimes(2)
 expect((judge.mock.calls as unknown[][]).every(c=>c[0]==='same-original')).toBe(true)
})


test.each(['person','newText','logo'] as const)('a repaint preservation pass cannot conceal newly unsafe %s content',async flag=>{
 const judge=vi.fn(async()=>({verdict:'pass',person:false,newText:false,logo:false,[flag]:true}))
 const result=await preservedSubject('original','changed',judge as unknown as Parameters<typeof preservedSubject>[2])
 expect(result.pass).toBe(false);expect(judge).toHaveBeenCalledTimes(2)
})

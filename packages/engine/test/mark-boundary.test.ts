import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, type Photo, type SourceInfo } from '@aq/schema'
import { removeSourceMark } from '../src/image-alterations'
import { composeMarkPatch, pixelHash } from '../src/image-transforms'
const measure=vi.hoisted(()=>vi.fn())
vi.mock('../src/mark-residue',async original=>({...await original<typeof import('../src/mark-residue')>(),measureMarkResidue:measure}))
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
test.each([[0.363169,'pass',true],[0.39,'pass',true],[0.39,'fail',false],[0.39,'unsure',false],[0.4,'pass',false]] as const)('combined removal score %s and vision %s => visible candidate %s',async(score,verdict,allowed)=>{
 await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true})
 const cache=await mkdtemp(join(homedir(),'.cache/aquatome/mark-boundary-'));dirs.push(cache)
 const photo:Photo={url:'https://media.aquatome.com/glaser/one.webp',width:100,height:80,source:'glaser',licence:'dùng với sự cho phép',author:'Aquarium Glaser',sourceUrl:'https://www.aquariumglaser.de/en/fish/'}
 const source:SourceInfo={name:'Aquarium Glaser',homepage:'https://www.aquariumglaser.de/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}}
 const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#abcdef'}}).png().toBuffer()
 measure.mockResolvedValue({version:'box-detail-cosine-v1',limit:0.4,score,originalEnergy:1,candidateEnergy:1})
 const vision=vi.fn(async()=>({verdict,residual:verdict!=='pass',newMark:false,note:'measured boundary control'}))
 const result=await removeSourceMark(photo,bytes,source,{owner:'source',text:'Aquarium Glaser',sourceUrl:photo.sourceUrl,box:{x0:0,y0:0,x1:100,y1:80}},{cache,edit:async()=>bytes,noTrace:vision,now:()=>new Date()},{...IMAGE_SWITCHES,removeMarks:true})
 expect(!!result).toBe(allowed);expect(vision).toHaveBeenCalledTimes(score<0.4?2:0)
})
test('a colour-shifted repaint removes a known mark without leaving the old rectangular seam or changing any outside pixel',async()=>{
 const width=100,height=80,base=Buffer.alloc(width*height*3),marked=Buffer.alloc(base.length),shifted=Buffer.alloc(base.length)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)base[(y*width+x)*3+c]=40+c*20+Math.floor(x/3)+Math.floor(y/4)
 base.copy(marked)
 for(let y=30;y<50;y++)for(const x of [35,43,51])for(let c=0;c<3;c++)marked[(y*width+x)*3+c]=240
 for(let n=0;n<base.length;n++)shifted[n]=base[n]!+30
 const png=(b:Buffer)=>sharp(b,{raw:{width,height,channels:3}}).png().toBuffer(),original=await png(marked),expected=await png(base)
 const result=await composeMarkPatch(original,await png(shifted),{x0:20,y0:20,x1:80,y1:60})
 expect(result.proof.outside).toBe(0);expect(result.proof.inside).toBeGreaterThan(0)
 expect(await pixelHash(result.bytes)).toBe(await pixelHash(expected))
})

test('a transport failure holds the repair and the retry reuses its retained native edit',async()=>{
 await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true});const cache=await mkdtemp(join(homedir(),'.cache/aquatome/mark-retry-'));dirs.push(cache)
 const photo:Photo={url:'https://media.aquatome.com/glaser/retry.webp',width:100,height:80,source:'glaser',licence:'dùng với sự cho phép',author:'Aquarium Glaser',sourceUrl:'https://www.aquariumglaser.de/en/fish/'}
 const source:SourceInfo={name:'Aquarium Glaser',homepage:'https://www.aquariumglaser.de/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}}
 const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#abcdef'}}).png().toBuffer(),edit=vi.fn(async()=>bytes),mark={owner:'source' as const,text:'Aquarium Glaser',sourceUrl:photo.sourceUrl,box:{x0:0,y0:0,x1:100,y1:80}},flags={...IMAGE_SWITCHES,removeMarks:true}
 measure.mockResolvedValue({version:'box-detail-cosine-v1',limit:.4,score:.1,originalEnergy:1,candidateEnergy:1})
 await expect(removeSourceMark(photo,bytes,source,mark,{cache,edit,noTrace:async()=>{throw Error('transport unavailable')},now:()=>new Date()},flags)).rejects.toThrow('incomplete')
 const result=await removeSourceMark(photo,bytes,source,mark,{cache,edit,noTrace:async()=>({verdict:'pass',residual:false,newMark:false,note:'Controlled fixture.'}),now:()=>new Date()},flags)
 expect(result).toBeDefined();expect(edit).toHaveBeenCalledTimes(1)
})

test.each(['corrupt','interrupted'] as const)('a %s retained edit holds recovery without another image attempt',async mode=>{
 await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true});const cache=await mkdtemp(join(homedir(),'.cache/aquatome/mark-atomic-'));dirs.push(cache)
 const photo:Photo={url:'https://media.aquatome.com/glaser/retry.webp',width:100,height:80,source:'glaser',licence:'dùng với sự cho phép',author:'Aquarium Glaser',sourceUrl:'https://www.aquariumglaser.de/en/fish/'}
 const source:SourceInfo={name:'Aquarium Glaser',homepage:'https://www.aquariumglaser.de/',publish:true,permission:{date:'2026-11-10',file:'owner word',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}}
 const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#abcdef'}}).png().toBuffer(),edit=vi.fn(async()=>bytes),mark={owner:'source' as const,text:'Aquarium Glaser',sourceUrl:photo.sourceUrl,box:{x0:0,y0:0,x1:100,y1:80}},flags={...IMAGE_SWITCHES,removeMarks:true}
 measure.mockResolvedValue({version:'box-detail-cosine-v1',limit:.4,score:.1,originalEnergy:1,candidateEnergy:1})
 const deps={cache,edit,noTrace:async()=>{throw Error('transport unavailable')},now:()=>new Date()}
 await expect(removeSourceMark(photo,bytes,source,mark,deps,flags)).rejects.toThrow('incomplete')
 const directories=await readdir(join(cache,'alterations')),directory=join(cache,'alterations',directories[0]!),files=await readdir(directory),native=join(directory,files.find(f=>f.endsWith('.image'))!)
 expect(files.some(f=>f.endsWith('.next'))).toBe(false)
 if(mode==='corrupt')await writeFile(native,bytes.subarray(0,40))
 else{await writeFile(native+'.partial.next',bytes.subarray(0,40));await rm(native)}
 await expect(removeSourceMark(photo,bytes,source,mark,deps,flags)).rejects.toThrow(/held for recovery/)
 expect(edit).toHaveBeenCalledTimes(1)
})

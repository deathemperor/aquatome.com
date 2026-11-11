import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, type Photo, type SourceInfo } from '@aq/schema'
import { removeSourceMark } from '../src/image-alterations'
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
 expect(!!result).toBe(allowed);expect(vision).toHaveBeenCalledTimes(score<0.4?1:0)
})

import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeImageCache } from '../src/image-cache-write'
const interrupted=vi.hoisted(()=>({next:false}))
vi.mock('node:fs/promises',async original=>{
  const fs=await original<typeof import('node:fs/promises')>()
  return {...fs,writeFile:async(...args:Parameters<typeof fs.writeFile>)=>{
    if(interrupted.next){interrupted.next=false;await fs.writeFile(args[0],Buffer.from(args[1] as string).subarray(0,3),args[2]);throw Error('synthetic interrupted write')}
    return fs.writeFile(...args)
  }}
})
const dirs:string[]=[]
afterEach(async()=>{interrupted.next=false;await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
test('a partial cache write cannot replace the final record and its failed temporary file is removed',async()=>{
 const base=join(homedir(),'.cache/aquatome');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'atomic-image-test-'));dirs.push(dir)
 const file=join(dir,'species.json');await writeFile(file,'{"previous":"valid"}')
 interrupted.next=true
 await expect(writeImageCache(file,'{"replacement":"complete"}')).rejects.toThrow('interrupted')
 expect(JSON.parse(await readFile(file,'utf8'))).toEqual({previous:'valid'});expect(await readdir(dir)).toEqual(['species.json'])
 await writeImageCache(file,'{"replacement":"complete"}')
 expect(JSON.parse(await readFile(file,'utf8'))).toEqual({replacement:'complete'});expect(await readdir(dir)).toEqual(['species.json'])
})

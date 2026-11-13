import {afterEach,expect,test,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {unfitPhotos} from '../scripts/unfit-photos'
import {writePhotoState} from '../src/photo-state'
import {compactVerdict} from '../src/photo-observations'
import {artworkObservation} from '../src/photo-artwork'
import {ARTWORK} from '../src/photos'
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
const load=async(f:string)=>JSON.parse(await readFile(f,'utf8'))
test('manual apply preserves the old artwork cue and uses the shared writer, with no network or saved prose',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aq-unfit-'));dirs.push(root)
 for(const k of ['species/a','plants','breeds','gallery'])await mkdir(join(root,'content',k),{recursive:true})
 await mkdir(join(root,'engine-state'))
 const art='https://media.example/art.webp',live='https://media.example/live.webp',trip=['TEST','ONLY','MANUAL','WORDS'].join('_')
 const file=join(root,'content/species/a/entity.json'),rejected=join(root,'engine-state/_photo-rejected.json')
 await writeFile(file,JSON.stringify({photos:[{url:art},{url:live}]}))
 await writeFile(rejected,JSON.stringify({'https://media.example/older.webp':'watermark: '+trip}))
 await writePhotoState(join(root,'engine-state/_dead-screen.json'),{[art]:{dead:false,note:'an illustration '+trip},[live]:{dead:false,note:'a living fish'}})
 const request=vi.fn(()=>{throw Error('No network allowed')}) as unknown as typeof fetch
 const result=await unfitPhotos(root,{apply:true,request,pause:async()=>{}})
 expect(request).not.toHaveBeenCalled();expect(Object.keys(result.found)).toEqual([art])
 expect((await load(file)).photos).toEqual([{url:live}])
 const saved=await load(rejected);expect(Object.keys(saved).sort()).toEqual([art,'https://media.example/older.webp'].sort())
 expect(saved['https://media.example/older.webp']).toMatch(/^watermark: withheld \[sha256:[a-f0-9]{64}\]$/)
 expect(await readFile(rejected,'utf8')).not.toContain(trip);expect(JSON.stringify(result)).not.toContain(trip)
 expect((await load(join(root,'engine-state/_dead-screen.json')))[art]).toMatchObject({dead:false,note:'dead screen clear',hints:{artwork:true}})
})
test('the retained artwork bit matches the exact former manual predicate, including a stamp and a live negative control',()=>{
 for(const note of ['an illustration','a postage stamp','engraved plate IV','a swimming fish','painted betta','drawn-out fins']){
  const stored=compactVerdict({dead:false,note})
  expect(artworkObservation(stored)).toBe(ARTWORK.test(note))
 }
})

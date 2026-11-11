import { afterEach, expect, test, vi } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { codexImageJson, codexNativeImage, meteredImage, readImageQuota, probeCodexVersion, IMAGE_CAP, type QuotaReading } from '../src/codex-images'
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive:true,force:true }))) })
async function fake(body: string) { await mkdir(join(homedir(),'.cache/aquatome'),{recursive:true}); const dir=await mkdtemp(join(homedir(),'.cache/aquatome/fake-image-cli-'));dirs.push(dir);const binary=join(dir,'codex');await writeFile(binary,`#!${process.execPath}\n${body}`);await chmod(binary,0o700);return {dir,binary} }
const q = (): QuotaReading => ({at:new Date().toISOString(),limitId:'codex',usedPercent:5,spendControlReached:false})
test.each(['malformed','refused','hung'] as const)('live quota refuses %s and waits for owned child exit',async mode=>{
 const f=await fake(`if(${JSON.stringify(mode)}==='hung'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000)}else{process.stdin.once('data',()=>{console.log(${JSON.stringify(mode==='malformed'?'broken':JSON.stringify({id:1,error:{message:'refused'}}))});setInterval(()=>{},1000)})}`)
 const start=Date.now();await expect(readImageQuota(f.binary,{timeoutMs:100,graceMs:30})).rejects.toThrow(/quota/);expect(Date.now()-start).toBeLessThan(2000)
})
async function nativeFixture(mode:'success'|'partial'|'second'|'login'|'malformed'|'three'|'late'|'cut-short'|'malformed-tail'){
 const f=await fake(''),output=join(f.dir,'out.png'),bytes=await sharp({create:{width:16,height:16,channels:3,background:'#abcdef'}}).png().toBuffer();await writeFile(output,mode==='partial'?bytes.subarray(0,40):bytes)
 const messages=[{id:1,result:{}},{id:2,result:{thread:{id:'fake-thread'}}},{method:'item/started',params:{item:{type:'imageGeneration',id:'image-1',status:'in_progress'}}},...(['second','three','late'].includes(mode)?[{method:'item/started',params:{item:{type:'imageGeneration',id:'image-2',status:'in_progress'}}}]:[]),{method:'item/completed',params:{item:{type:'imageGeneration',id:'image-1',status:'completed',savedPath:output}}},{method:'turn/completed',params:{turn:{status:'completed'}}}]
 const first={method:'item/started',params:{item:{type:'imageGeneration',id:'image-1',status:'in_progress'}}},second={...first,params:{item:{...first.params.item,id:'image-2'}}},third={...first,params:{item:{...first.params.item,id:'image-3'}}}
 await writeFile(f.binary,`#!${process.execPath}\nif(process.argv.includes('--version'))console.log('codex-cli 0.167.0');else if(${JSON.stringify(mode)}==='login')process.exit(1);else{const msgs=${JSON.stringify(messages)},mode=${JSON.stringify(mode)};process.stdin.resume();if(mode==='late')process.on('SIGTERM',()=>{});if(['three','late','cut-short','malformed-tail'].includes(mode)){setTimeout(()=>{console.log(JSON.stringify(msgs[0])+'\\n'+JSON.stringify(msgs[1]));if(mode==='three')console.log([${JSON.stringify(first)},${JSON.stringify(second)},${JSON.stringify(third)}].map(x=>JSON.stringify(x)).join('\\n'));if(mode==='late'){console.log([${JSON.stringify(first)},${JSON.stringify(second)}].map(x=>JSON.stringify(x)).join('\\n'));setTimeout(()=>console.log(JSON.stringify(${JSON.stringify(third)})),100)}if(mode==='cut-short'){console.log(JSON.stringify(${JSON.stringify(first)}));setTimeout(()=>process.exit(1),30)}if(mode==='malformed-tail'){require('node:fs').utimesSync(${JSON.stringify(output)},new Date(),new Date());console.log(msgs.slice(2).map(x=>JSON.stringify(x)).join('\\n')+'\\nBROKEN')}},20)}else{let i=0;const timer=setInterval(()=>{if(i<msgs.length){if(msgs[i]?.params?.item?.savedPath)require('node:fs').utimesSync(msgs[i].params.item.savedPath,new Date(),new Date());console.log(mode==='malformed'?'broken':JSON.stringify(msgs[i++]));}else clearInterval(timer)},15)}}`)

 return {...f,bytes}
}
test.each(['success','partial','second','login','malformed','three','late','cut-short','malformed-tail'] as const)('native event boundary: %s',async mode=>{
 const f=await nativeFixture(mode)
 if(['second','three','late'].includes(mode))await writeFile(join(f.dir,'ledger.json'),JSON.stringify({version:1,imported:IMAGE_CAP-1,attempts:[]}))
 const run=()=>meteredImage(f.dir,'generated','fish',{quota:async()=>q(),generate:(p,dir,observe)=>codexNativeImage(p,dir,undefined,{observe,binary:f.binary,outputRoot:f.dir})})
 if(mode==='success')expect((await run()).bytes).toEqual(f.bytes);else await expect(run()).rejects.toThrow()
 const ledger=JSON.parse(await readFile(join(f.dir,'ledger.json'),'utf8'));const count=['three','late'].includes(mode)?3:mode==='success'?1:2;expect(ledger.attempts).toHaveLength(count);expect(ledger.attempts[0].status).toBe(mode==='success'?'complete':'uncertain')
 if(['second','three','late'].includes(mode)){expect(ledger.imported+ledger.attempts.length).toBe(IMAGE_CAP-1+count);await expect(run()).rejects.toThrow('cap')}
})
test.each(['unknown','90'] as const)('unsafe %s after-reading withholds output but counts the native attempt',async state=>{
 const f=await fake(''),reads=vi.fn().mockResolvedValueOnce(q()).mockImplementation(async()=>{if(state==='unknown')throw Error('quota unknown');return {...q(),usedPercent:90}})
 await expect(meteredImage(f.dir,'generated','fish',{quota:reads,generate:async(_p,_dir,observe)=>{await observe('image-1');return {bytes:new Uint8Array(),prompt:'fish',model:'gpt-image-2',driverModel:'gpt-5.6-sol',seconds:1,receiptHash:'a'.repeat(64)}}})).rejects.toThrow(/quota/)
 expect(JSON.parse(await readFile(join(f.dir,'ledger.json'),'utf8')).attempts[0].status).toBe('failed')
})

test('a quota child ignoring SIGTERM is gone when the failed read settles',async()=>{
 const f=await fake(''),pidFile=join(f.dir,'owned.pid')
 await writeFile(f.binary,`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});process.stdin.resume();setInterval(()=>{},1000)`)
 const failed=readImageQuota(f.binary,{timeoutMs:15000,graceMs:30});void failed.catch(()=>{});let pid:number|undefined
 try{await vi.waitFor(async()=>{pid=Number(await readFile(pidFile,'utf8'));expect(pid).toBeGreaterThan(0)},{timeout:10000});await expect(failed).rejects.toThrow('timed out');expect(()=>process.kill(pid!,0)).toThrow()}finally{if(pid){try{process.kill(pid,'SIGKILL')}catch{}}}
})

test('an uncertain launch refuses another launch until a fresh live quota reading succeeds',async()=>{
 const f=await nativeFixture('cut-short'),quota=vi.fn(async()=>q()),generate=(p:string,dir:string,observe:Parameters<typeof codexNativeImage>[3]['observe'])=>codexNativeImage(p,dir,undefined,{observe,binary:f.binary,outputRoot:f.dir})
 await expect(meteredImage(f.dir,'generated','fish',{quota,generate})).rejects.toThrow();expect(JSON.parse(await readFile(join(f.dir,'ledger.json'),'utf8')).reconciliationRequired).toBe(true)
 const next=vi.fn();quota.mockRejectedValueOnce(Error('quota unknown'));await expect(meteredImage(f.dir,'generated','fish',{quota,generate:next})).rejects.toThrow('quota unknown');expect(next).not.toHaveBeenCalled()
 quota.mockResolvedValueOnce({...q(),usedPercent:90});await expect(meteredImage(f.dir,'generated','fish',{quota,generate:next})).rejects.toThrow('90%');expect(next).not.toHaveBeenCalled()
 next.mockImplementation(async(_p,_dir,observe)=>{await observe('new-image');return {bytes:new Uint8Array(),prompt:'fish',model:'gpt-image-2',driverModel:'gpt-5.6-sol',seconds:1,receiptHash:'a'.repeat(64)}});await meteredImage(f.dir,'generated','fish',{quota,generate:next});expect(next).toHaveBeenCalledOnce();expect(JSON.parse(await readFile(join(f.dir,'ledger.json'),'utf8')).reconciliationRequired).toBe(false)
})
test('the version probe forcibly stops its ignoring owned child and waits for close',async()=>{
 const f=await fake(''),pidFile=join(f.dir,'probe.pid');await writeFile(f.binary,`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`)
 const failed=probeCodexVersion(f.binary,{timeoutMs:15000,graceMs:30});void failed.catch(()=>{});let pid:number|undefined
 try{await vi.waitFor(async()=>{pid=Number(await readFile(pidFile,'utf8'));expect(pid).toBeGreaterThan(0)},{timeout:10000});await expect(failed).rejects.toThrow('timed out');expect(()=>process.kill(pid!,0)).toThrow()}finally{if(pid){try{process.kill(pid,'SIGKILL')}catch{}}}
})

test('ownership answer lettering stays in memory: ephemeral CLI, no raw answer file, transcript or events on disk',async()=>{
 const f=await fake(''),cache=join(f.dir,'cache'),sentinel='SYNTHETIC_TRANSIENT_CREDIT'
 await writeFile(f.binary,`#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');if(process.argv[2]==='app-server'){const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const r=JSON.parse(line);if(r.id===1)console.log(JSON.stringify({id:1,result:{}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{rateLimits:{limitId:'codex',primary:{usedPercent:5}}}}))})}else{const args=process.argv,dir=args[args.indexOf('--cd')+1],answer={credit:${JSON.stringify(sentinel)}};if(!args.includes('--ephemeral'))fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(answer));if(args.includes('--output-last-message'))fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(answer));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(answer)}}));process.stdin.resume();process.stdin.on('end',()=>process.exit(0))}`)
 const result=await codexImageJson<{credit:string}>('Extract a fixture credit',{type:'object',properties:{credit:{type:'string'}},required:['credit']},cache,[],f.binary)
 expect(result.credit).toBe(sentinel)
 const records=await readdir(cache);expect(records).toHaveLength(1)
 const files=await readdir(join(cache,records[0]!));expect(files.sort()).toEqual(['meter.json','schema.json'])
 for(const file of files)expect(await readFile(join(cache,records[0]!,file),'utf8')).not.toContain(sentinel)
})

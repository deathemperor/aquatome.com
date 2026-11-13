import{expect,test,vi}from'vitest'
import{pairedJudgments,judgmentReceipt}from'../src/image-judgments'
test('only two separately requested positive answers admit the identical input',async()=>{
 const judge=vi.fn(async()=>({verdict:'pass'})),p=await pairedJudgments<{verdict:string;note?:string}>(judge,v=>v.verdict==='pass',v=>v.verdict)
 expect(judge).toHaveBeenCalledTimes(2);expect(p.pass).toBe(true);expect(p.first.id).not.toBe(p.second.id);expect(p.disagreement).toBe(false)
})
test('yes plus unsure is held and recorded as disagreement',async()=>{
 const judge=vi.fn().mockResolvedValueOnce({verdict:'pass',note:'PRIVATE_LETTERING'}).mockResolvedValueOnce({verdict:'unsure',note:'PRIVATE_LETTERING'}),p=await pairedJudgments<{verdict:string;note?:string}>(judge,v=>v.verdict==='pass',v=>v.verdict)
 expect(p.pass).toBe(false);expect(p.disagreement).toBe(true);expect(JSON.stringify(judgmentReceipt(p))).not.toContain('PRIVATE_LETTERING')
})
test('both started judgments settle even when one fails',async()=>{
 let secondFinished=false;const judge=vi.fn().mockRejectedValueOnce(Error('failed')).mockImplementationOnce(async()=>{await new Promise(r=>setTimeout(r,5));secondFinished=true;return true}),p=await pairedJudgments<boolean>(judge,v=>v)
 expect(secondFinished).toBe(true);expect(p.pass).toBe(false);expect(p.incomplete).toBe(true);expect(p.disagreement).toBe(true)
})

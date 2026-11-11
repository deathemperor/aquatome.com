import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import files from './public-image-files.json'
import { containsPrivateLettering, publicImageEvidence, transcribesPhotoLettering } from '../src/public-image-evidence'
test('every added PR file is free of the removed identifying transcriptions',async()=>{
 const root=fileURLToPath(new URL('../../..',import.meta.url))
 for(const name of files){const raw=await readFile(root+'/'+name,'utf8');const text=name.endsWith('.json')?JSON.stringify(JSON.parse(raw)):raw;expect(containsPrivateLettering(text),name).toBe(false)}
})
test('the public recorder never copies no-trace lettering, while verdicts and measurements stay intact',()=>{
 const privateResult={mark:{text:'PRIVATE_SIGNATURE',owner:'photographer'},score:0.415,verdict:{verdict:'fail',residual:true,newMark:false,note:'PRIVATE_SIGNATURE across the lower photograph'}}
 const publicResult=publicImageEvidence(privateResult) as typeof privateResult
 expect(publicResult.score).toBe(privateResult.score);expect(publicResult.verdict).toMatchObject({verdict:'fail',residual:true,newMark:false});expect(JSON.stringify(publicResult)).not.toContain('PRIVATE_SIGNATURE')
})
test('committed no-trace evidence contains only controlled observations, including previously unseen lettering',async()=>{
 const root=fileURLToPath(new URL('../../..',import.meta.url))
 const check=(value:unknown)=>{if(Array.isArray(value)){value.forEach(check);return}if(!value||typeof value!=='object')return;const row=value as Record<string,unknown>;if(typeof row.residual==='boolean'&&typeof row.newMark==='boolean')expect(publicImageEvidence(row)).toEqual(row);Object.values(row).forEach(check)}
 for(const file of ['docs/residue-limit-results.json','docs/mark-calibration-results.json'])check(JSON.parse(await readFile(root+'/'+file,'utf8')))
})
test('generated public evidence describes photographed lettering without quoting it or banning species data',async()=>{
 const root=fileURLToPath(new URL('../../..',import.meta.url)), data=JSON.parse(await readFile(root+'/docs/image-calibration-results.json','utf8'))
 for(const row of data.cases)for(const field of ['reason','note'])expect(transcribesPhotoLettering(row[field]??''),row.id+': '+field).toBe(false)
 expect(transcribesPhotoLettering("The visible sign also identifies 'PRIVATE_SIGN_WORDING', reinforcing the identity mismatch.")).toBe(true)
 expect(transcribesPhotoLettering('The label reads: PRIVATE_SIGN_WORDING')).toBe(true)
 expect(transcribesPhotoLettering('Species: Hydrocotyle tripartita; comparison species: Marsilea hirsuta.')).toBe(false)
})

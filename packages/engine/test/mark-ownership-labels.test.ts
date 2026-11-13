import { expect, test, vi } from 'vitest'
import { IMAGE_SWITCHES, type Photo, type SourceInfo } from '@aq/schema'
import { canRemoveMark, ownsMark, type MarkEvidence } from '../src/image-alterations'
import { inspectMarks, ownershipEvidence } from '../src/image-real-checks'

const source:SourceInfo={name:'Fixture source',homepage:'https://fixture.invalid',publish:true,permission:{date:'2026-11-10',file:'fixture permission',scope:['photos'],markRemoval:{allowed:true,date:'2026-11-10'}}}
const photo:Photo={url:'https://media.fixture.invalid/original.webp',width:800,height:600,author:'Fixture contributor',licence:'dùng với sự cho phép',source:'seriouslyfish',sourceUrl:'https://fixture.invalid/species/fish/'}
const mark:MarkEvidence={owner:'photographer',credit:photo.author,sourceUrl:photo.sourceUrl,box:{x0:600,y0:550,x1:780,y1:590},wholeSubject:true,subjectBox:{x0:100,y0:100,x1:600,y1:450},ownership:{lettering:true,basis:'recorded-author',matchesSource:false,matchesRecordedAuthor:true}}

test.each(['seriouslyfish','scotcat'] as const)('%s accepts the same credited contributor under either ownership label',async sourceId=>{
 const p={...photo,source:sourceId},signature={...mark,ownership:{...mark.ownership!,basis:'contributor-signature' as const}}
 const switches={...IMAGE_SWITCHES,removeMarks:true}
 expect(ownsMark(p,source,mark)).toBe(true)
 expect(canRemoveMark(p,source,mark,switches)).toBe(true)
 const locate=vi.fn().mockResolvedValueOnce(mark).mockResolvedValueOnce(signature)
 const result=await inspectMarks('fixture-original',p,source,locate,switches)
 expect(result.pair.pass).toBe(true)
 expect(result.marks).toHaveLength(1)
 expect(locate).toHaveBeenCalledTimes(2)
 const stored=JSON.stringify(ownershipEvidence(result))
 expect(stored).not.toContain(photo.author)
 expect(stored).not.toContain('credit')
 expect(canRemoveMark(p,source,mark)).toBe(false)
})

test('the recorded-author label still requires a matched real author and never admits foreign, business or unknown ownership',()=>{
 const owns=(p:Photo,m:MarkEvidence)=>ownsMark(p,source,m)
 expect(owns(photo,{...mark,ownership:{...mark.ownership!,matchesRecordedAuthor:false}})).toBe(false)
 for(const author of ['',source.name,source.name+' / '])expect(owns({...photo,author},mark)).toBe(false)
 for(const owner of ['unknown','third-party'] as const)expect(owns(photo,{...mark,owner})).toBe(false)
 for(const basis of ['foreign-mark','uncertain','source-logo'] as const)expect(owns(photo,{...mark,ownership:{...mark.ownership!,basis}})).toBe(false)
 expect(owns(photo,{...mark,credit:''})).toBe(false)
 expect(owns(photo,{...mark,credit:'https://another.invalid/stock.example.com'})).toBe(false)
 expect(owns(photo,{...mark,sourceUrl:'https://another.invalid/photo'})).toBe(false)
 expect(owns({...photo,source:'planetcatfish'},mark)).toBe(false)
})

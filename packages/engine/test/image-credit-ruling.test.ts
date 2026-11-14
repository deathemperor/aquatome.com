import { expect, test } from 'vitest'
import type { Photo, SourceInfo } from '@aq/schema'
import { alteredCredit, ownsMark, type MarkEvidence } from '../src/image-alterations'
const make=(id:Photo['source']='seriouslyfish',name='Fixture Source')=>({photo:{url:'https://media.aquatome.com/fixture.webp',width:1000,height:700,source:id,author:'Earlier credit',authorUrl:'https://earlier.example.org/',licence:'dùng với sự cho phép',sourceUrl:'https://source.example.org/species/fixture/'} as Photo,source:{name,homepage:'https://source.example.org/',publish:true} as SourceInfo})
const mark=(photo:Photo,changes:Partial<MarkEvidence>={}):MarkEvidence=>({owner:'photographer',text:'photographer signature',credit:'Fixture contributor',sourceUrl:photo.sourceUrl,box:{x0:2,y0:2,x1:80,y1:20},...changes})
test('www on the source mark is the same host, without allowing another site',()=>{
 const {photo,source}=make('bwaquatics');expect(ownsMark(photo,source,mark(photo,{owner:'source',text:'www.source.example.org',credit:undefined}))).toBe(true)
 expect(ownsMark(photo,source,mark(photo,{owner:'source',text:'source.example.org www.other.example.org',credit:undefined}))).toBe(false)
 expect(ownsMark({...photo,authorUrl:'https://shop.example.org/'},source,mark(photo,{owner:'source',text:'Fixture Source shop.example.org',credit:undefined}))).toBe(false)
})
test.each(['seriouslyfish','scotcat'] as const)('covered %s signatures adopt a credit and record a mismatch without retaining the wrong author link',id=>{
 const {photo,source}=make(id),m=mark(photo);expect(ownsMark(photo,source,m)).toBe(true)
 expect(alteredCredit(photo,source,[m])).toEqual({author:'Fixture contributor',mismatch:{source:id,photo:photo.url,differs:true}})
 expect(ownsMark(photo,source,mark(photo,{credit:'FC'}))).toBe(true)
 expect(ownsMark({...photo,author:''},source,m)).toBe(true)
})
test('a matching photographer keeps their credit and its link',()=>{
 const {photo,source}=make(),p={...photo,author:'Fixture contributor / Fixture Source'}
 expect(alteredCredit(p,source,[mark(p)])).toEqual({author:'Fixture contributor',authorUrl:photo.authorUrl})
})
test('uncovered contributors and foreign, stock or uncertain marks remain held',()=>{
 for(const id of ['planetcatfish','bwaquatics'] as const){const {photo,source}=make(id);expect(ownsMark(photo,source,mark(photo))).toBe(false)}
 const {photo,source}=make();for(const changes of [{owner:'third-party'},{owner:'unknown'},{text:'stock agency',credit:'Getty'},{credit:'www.shop.example.org'},{credit:'<invalid>'}] as Partial<MarkEvidence>[])expect(ownsMark(photo,source,mark(photo,changes))).toBe(false)
})
test('a signature credit never copies an email or device address into public content',()=>{
 const {photo,source}=make()
 for(const credit of [['fixture','source.example.org'].join('@'),['aa','bb','cc','dd','ee','ff'].join(':'),[192,0,2,1].join('.')])expect(ownsMark(photo,source,mark(photo,{credit}))).toBe(false)
})

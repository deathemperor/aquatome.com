import { createHash } from 'node:crypto'
import digests from './private-lettering-digests.json'
import type { NoTraceVerdict } from './image-transforms'
/** Public evidence describes presence/location, never the lettering or a photographer's signature. */
export const publicNoTraceNote = (v: Pick<NoTraceVerdict, 'verdict' | 'residual' | 'newMark'>) =>
  v.residual ? 'Residual lettering or unnatural patch detail remains in the checked region.' : v.newMark ? 'A new mark is present in the checked region.' : v.verdict === 'pass' ? 'The checked region is clear.' : 'The checked region cannot be confirmed clear.'
export function publicImageEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicImageEvidence)
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>, out = Object.fromEntries(Object.entries(row).filter(([k]) => !['text','lettering','signature','author','authorUrl'].includes(k)).map(([k,v]) => [k, ['note','reason'].includes(k) ? 'Detailed reviewer observations stay in the private evidence.' : publicImageEvidence(v)]))
  if (typeof row.residual === 'boolean' && typeof row.newMark === 'boolean' && 'verdict' in row) out.note = publicNoTraceNote(row as NoTraceVerdict)
  return out
}
/** A regression guard for the removed identifying transcriptions, stored only as one-way digests. */
export function containsPrivateLettering(text: string): boolean {
  const words = text.normalize('NFKC').toLocaleLowerCase('en').match(/[a-z]+/g) ?? [], denied = new Set(digests)
  for (let n=1;n<=4;n++) for(let i=0;i+n<=words.length;i++) if(denied.has(createHash('sha256').update(words.slice(i,i+n).join(' ')).digest('hex'))) return true
  return false
}
/** Check reviewer observations, not species data: a photographed sign must never be quoted. */
export const transcribesPhotoLettering = (text: string): boolean =>
  /\b(?:sign|label|lettering|inscription|signature|watermark)\b[^.!?\n]{0,160}(?:[\s:(]["“‘'][^"”’'\n]+["”’']|\b(?:reads?|says?|spells?|identifies)\s*:\s*\S)/i.test(text)

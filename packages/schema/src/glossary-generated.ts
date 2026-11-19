import { kindsSection } from './glossary-kinds'
import { validImageJudgmentHashes } from './image-policy'
import type { GlossaryEntity, Photo } from './types'

/** Owner's yes, 17 Nov 2026: glossary kinds alone. Enable after the owner approval of the first sheet and Chief review. */
export const GLOSSARY_KIND_IMAGES = Object.freeze({ on: false })
export const GLOSSARY_KIND_REVIEW_POLICY = '6803820c80e7d115ece2ecf2e210cb0ee5514561eec850d9f532a62cc630f485'
export const GLOSSARY_KIND_APPROVALS = 'glossary-kind-image-approvals.json'

export type KindAiLabelCorner = 'top-left' | 'top-right'
export type KindCardCrop = { x0: number; y0: number; x1: number; y1: number }
/** These are two actual independent kind-fact reads, not the fish classifier's calibration. */
export type GlossaryKindApproval = {
  page: string
  kind: string
  recordHash: string
  entryHash: string
  factsHash: string
  referenceHash: string
  pixelHash: string
  policy: string
  noUsableRealPhoto: true
  inputImages: 0
  conflicts: []
  ownerSeen: { date: string }
  ownerApproved: { date: string }
  checks: {
    curation: { verdict: 'pass'; hash: string }
    glossary: { verdict: 'pass'; hash: string }
  }
}

/** Curation uses these same canonical strings when filing the reviewed record; property order is immaterial. */
export function kindCanonical(value: unknown): string {
  const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, ordered(x)])) : v
  const json = JSON.stringify(ordered(value))
  if (json === undefined) throw new Error('kind approval needs a JSON value')
  return json
}
export const kindPhotoCanonical = (photo: Photo, cardCrop?: KindCardCrop, aiLabelCorner?: KindAiLabelCorner): string => kindCanonical({ photo, cardCrop, aiLabelCorner })
/** The kind's own current words and sources, never its generation prompt. Missing kind text cannot qualify. */
export function kindEntryCanonical(entry: Pick<GlossaryEntity, 'id' | 'refs'>, kind: string, body: string): string | undefined {
  const item = kindsSection(body)?.items.find(k => k.id === kind)
  return item ? kindCanonical({ page: `glossary/${entry.id}`, kind, name: item.name, html: item.html, refs: entry.refs ?? [] }) : undefined
}

const HASH = /^[a-f0-9]{64}$/
const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s

export function validKindCardCrop(p: Pick<Photo, 'width' | 'height'>, c: KindCardCrop): boolean {
  return Object.values(c).every(Number.isSafeInteger) && c.x0 >= 0 && c.y0 >= 0 && c.x1 > c.x0 && c.y1 > c.y0
    && c.x1 <= p.width && c.y1 <= p.height && Math.abs((c.x1 - c.x0) / (c.y1 - c.y0) - 4 / 3) < 0.001
}

/** Only the loader's kind-specific call may use this; never add the URL to the general generated-photo set. */
export function glossaryKindApproved(photo: Photo, value: unknown, current: {
  term: string; kind: string; recordHash: string; entryHash?: string; factsHash?: string
  rejected: boolean; screened: boolean; realPhotoAvailable: boolean; cardCrop?: KindCardCrop; aiLabelCorner?: KindAiLabelCorner
}): boolean {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<GlossaryKindApproval>, g = photo.generated
  if (!g || !id.test(current.term) || !id.test(current.kind) || current.rejected || !current.screened || current.realPhotoAvailable) return false
  if (photo.source || photo.sourceCaption || photo.original || photo.ownerCrop || photo.altered?.length || !photo.caption?.trim()) return false
  if (!g.model?.trim() || !g.driverModel?.trim() || /terra/i.test(g.driverModel) || !g.prompt?.trim() || !Number.isFinite(Date.parse(g.date)) || !day(g.date.slice(0, 10))) return false
  if (!g.pixelHash || !HASH.test(g.pixelHash) || !HASH.test(g.referenceHash)) return false
  if (a.page !== `glossary/${current.term}` || a.kind !== current.kind || a.policy !== GLOSSARY_KIND_REVIEW_POLICY || a.noUsableRealPhoto !== true || !day(a.ownerSeen?.date) || !day(a.ownerApproved?.date) || a.ownerApproved!.date < a.ownerSeen!.date) return false
  if (a.inputImages !== 0 || !Array.isArray(a.conflicts) || a.conflicts.length) return false
  if (a.recordHash !== current.recordHash || !HASH.test(a.recordHash) || !current.entryHash || a.entryHash !== current.entryHash || !HASH.test(a.entryHash)) return false
  if (!current.factsHash || a.factsHash !== current.factsHash || !HASH.test(a.factsHash) || a.referenceHash !== g.referenceHash || a.pixelHash !== g.pixelHash) return false
  if (a.checks?.curation?.verdict !== 'pass' || a.checks?.glossary?.verdict !== 'pass' || !validImageJudgmentHashes([a.checks.curation.hash, a.checks.glossary.hash])) return false
  if (current.aiLabelCorner !== undefined && !['top-left', 'top-right'].includes(current.aiLabelCorner)) return false
  if (current.cardCrop && !validKindCardCrop(photo, current.cardCrop)) return false
  try { if (new URL(photo.url).origin !== 'https://media.aquatome.com') return false } catch { return false }
  return true
}

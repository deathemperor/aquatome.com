import approvals from './owner-crops.json' with {type:'json'}
import type { Photo } from './types'
export type OwnerCropApproval = { id: string; approved: boolean; page: string; scientificName: string; date: string; authority: string; originalHash: string; pixelHash: string; recordHash: string }
/** Individually approved files, never a permission for another crop or source. */
export const OWNER_CROPS: readonly OwnerCropApproval[] = approvals
const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])) : v
/** Includes served URLs, original, pixel receipt, licence, complete credit and both judgment pairs. */
export const ownerCropCanonical = (p: Photo, page: string, scientificName: string) => {
  // Gallery administration (best/kind/unchecked) is not part of the photo or its permission.
  const {url,thumb,width,height,large,licence,author,authorUrl,sourceUrl,caption,source,ownerCrop,headFit,generated,altered,original}=p
  return JSON.stringify(ordered({page,scientificName,photo:{url,thumb,width,height,large,licence,author,authorUrl,sourceUrl,caption,source,ownerCrop,headFit,generated,altered,original}}))
}
export function ownerCropApproved(p: Photo, page: string, scientificName: string, recordHash: string, entries = OWNER_CROPS): boolean {
  const a=entries.find(a=>a.approved && a.id===p.ownerCrop?.id && a.page===page && a.scientificName===scientificName)
  const alteration=p.altered?.[0]
  return !!a && !!alteration && a.recordHash===recordHash && a.pixelHash===p.ownerCrop?.pixelHash && !p.generated && p.altered?.length===1 && alteration.method==='mark-crop' && a.originalHash===alteration.originalHash && !!p.original && !p.large
}

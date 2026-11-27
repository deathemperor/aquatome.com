import { createHash } from 'node:crypto'

const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/**
 * A hot-linked Commons, iNaturalist, Flickr or GBIF photo: its R2 key (one per Commons file or iNaturalist photo, whatever size or
 * query string the URL carries) and the URLs to fetch it from, best first. Undefined for photos we serve already.
 */
export function mirrorPlan(url: string): { key: string; fetch: string[] } | undefined {
  const u = new URL(url)
  if (u.host === 'upload.wikimedia.org' || u.host === 'thumb.wikimedia.org') {
    const m = u.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)
    return m ? { key: `commons/${sha16(decodeURIComponent(m[1]!))}.webp`, fetch: [url] } : undefined
  }
  if (u.host === 'inaturalist-open-data.s3.amazonaws.com' || u.host === 'static.inaturalist.org') {
    const m = u.pathname.match(/^\/photos\/(\d+)\/(square|small|medium|large|original)\.\w*$/)
    return m ? { key: `inaturalist/${m[1]}.webp`, fetch: [...new Set([url.replace(/\/(square|small|medium)\./, '/large.'), url])] } : undefined
  }
  // Flickr photos (found through Openverse): one key per photo id, whatever size the URL asks for.
  if (/^(live|farm\d+)\.staticflickr\.com$/.test(u.host)) {
    const m = u.pathname.match(/^\/\d+\/(\d+)_[0-9a-f]+(?:_[a-z0-9])?\.jpg$/)
    return m ? { key: `flickr/${m[1]}.webp`, fetch: [url] } : undefined
  }
  // GBIF's copy of an occurrence photo: one key per occurrence and photo.
  if (u.host === 'api.gbif.org') {
    const m = u.pathname.match(/^\/v1\/image\/cache\/(?:fit-in\/)?[\dx]+\/occurrence\/(\d+)\/media\/([0-9a-f]{32})$/)
    return m ? { key: `gbif/${m[1]}-${m[2]!.slice(0, 16)}.webp`, fetch: [url.replace(/\/fit-in\/[\dx]+\//, '/fit-in/1200x/')] } : undefined
  }
  return undefined
}

/** Our store's address: a photo's key there is the rest of its address. */
const OURS = 'https://media.aquatome.com/'
/**
 * A photo's one key in our store, whichever address names it: our copy's own, or the key a Commons, iNaturalist, Flickr
 * or GBIF address mirrors to at any size (`mirrorPlan`); none for another address.
 */
export function photoKey(url: string): string | undefined {
  if (url.startsWith(OURS)) return url.slice(OURS.length) || undefined
  try { return mirrorPlan(url)?.key } catch { return undefined }
}

const MIRROR_HOSTS: Partial<Record<string, string[]>> = {
  commons: ['upload.wikimedia.org/', 'thumb.wikimedia.org/'],
  inaturalist: ['inaturalist-open-data.s3.amazonaws.com/', 'static.inaturalist.org/'],
  flickr: ['.staticflickr.com/'],
  gbif: ['api.gbif.org/v1/image/cache/'],
}

/** Candidate strings for locating an address or its aliases in committed photo lists. */
export function mirrorSearchTerms(url: string): string[] {
  const key = photoKey(url)
  const hosts = key && MIRROR_HOSTS[key.split('/')[0]!]
  return hosts ? [`${OURS}${key}`, ...hosts] : []
}

/** Test whether a stored or source address belongs to the same set of photos. */
export function photoAddressSet(urls: Iterable<string>): (url: string) => boolean {
  const addresses = new Set(urls)
  const keys = new Set([...addresses].flatMap(url => {
    const key = photoKey(url)
    return key ? [key] : []
  }))
  return url => {
    if (addresses.has(url)) return true
    const key = photoKey(url)
    return key !== undefined && keys.has(key)
  }
}

/** These refusals apply to the version that received the verdict. */
export const isVersionRejection = (reason: string): boolean => /^(?:dead|people|waiting): /.test(reason)

/** Commons mirrors resize the same file. Other source IDs can also name different crops. */
export function photoVersionAddressSet(urls: Iterable<string>): (url: string) => boolean {
  const exact = new Set(urls)
  const resized = new Set([...exact].flatMap(url => {
    const key = photoKey(url)
    return key?.startsWith('commons/') ? [key] : []
  }))
  return url => exact.has(url) || resized.has(photoKey(url) ?? '')
}

/**
 * The entry engine-state/_photo-rejected.json (URL → why) holds for a photo, `[the address it is listed by, why]`: by
 * its own address, or by its one key in our store (photoKey), either way round. A photo listed by its source's address
 * is the same photo once its copy is in our store, and at any other size of that source; one listed by our copy is
 * the same photo at its source's address. On 19 Nov three photos the list named by their Commons address showed on two
 * fish pages as our copies.
 */
export type PhotoRejection = (url: string) => [string, string] | undefined

export function rejectedEntry(rejected: Record<string, string>): PhotoRejection {
  const byKey = new Map<string, string>()
  for (const u of Object.keys(rejected)) {
    const k = photoKey(u)
    if (k && rejected[u] && !byKey.has(k)) byKey.set(k, u)
  }
  return url => {
    if (rejected[url]) return [url, rejected[url]!]
    const k = photoKey(url)
    const u = k === undefined ? undefined : byKey.get(k)
    return u === undefined ? undefined : [u, rejected[u]!]
  }
}

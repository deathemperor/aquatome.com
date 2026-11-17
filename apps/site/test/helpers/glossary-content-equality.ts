import { isDeepStrictEqual } from 'node:util'

/**
 * Keep every data property intact for node's strict comparison (undefined, Maps and Sets included).
 * photoWaits is the sole callable Content field: independent loads create different closures even when equivalent.
 * Compare its presence and observable answers explicitly, never its source text or a JSON serialization.
 */
export function strictLoadedContentEqual<A extends object, B extends object>(before: A, after: B, addresses: Iterable<string>): boolean {
  const hasLeft = Object.hasOwn(before, 'photoWaits'), hasRight = Object.hasOwn(after, 'photoWaits')
  if (hasLeft !== hasRight) return false
  if (!hasLeft) return isDeepStrictEqual(before, after)
  const left = (before as { photoWaits?: unknown }).photoWaits, right = (after as { photoWaits?: unknown }).photoWaits
  const data = (value: object) => {
    const fields: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(value)
    delete fields.photoWaits
    return Object.create(Object.getPrototypeOf(value), fields)
  }
  if (!isDeepStrictEqual(data(before), data(after)) || typeof left !== typeof right) return false
  if (typeof left !== 'function' || typeof right !== 'function') return isDeepStrictEqual(left, right)
  for (const address of addresses) if (!isDeepStrictEqual(left(address), right(address))) return false
  return true
}

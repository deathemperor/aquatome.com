import { expect } from 'vitest'
/** Assert refusal identities and classes independently of the discarded explanation or its fingerprint. */
export function expectControlledRejections(actual:Record<string,unknown>,kinds:Record<string,string>) {
 expect(Object.keys(actual).sort()).toEqual(Object.keys(kinds).sort())
 for(const[url,kind]of Object.entries(kinds)){
  const why=actual[url]
  expect(typeof why).toBe('string')
  if(typeof why!=='string')throw new Error('rejection must have a controlled reason')
  expect(why.split(':')[0]).toBe(kind)
  expect(why).toMatch(/: withheld \[sha256:[a-f0-9]{64}\]$/)
 }
}

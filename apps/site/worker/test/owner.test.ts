import { expect, test } from 'vitest'
import { OWNER_SCRIPT } from '../owner'

test('the owner script is valid JavaScript (a backslash lost in the template literal comments out the rest)', () => {
  expect(() => new Function(OWNER_SCRIPT)).not.toThrow()
  // Its page check: every language's pages, not the admin or other paths.
  const check = /if\(!(\/\^[^;]*?\/)\.test\(p\)\)return/.exec(OWNER_SCRIPT)![1]!
  const re = new Function(`return ${check}`)() as RegExp
  expect(['/vi/ca/x/', '/id/ikan/x/', '/th/fish/x/'].every(p => re.test(p))).toBe(true)
  expect(re.test('/_ab/')).toBe(false)
})

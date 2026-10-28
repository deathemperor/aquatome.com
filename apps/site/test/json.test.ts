import { expect, test } from 'vitest'
import { jsonForScript } from '../src/lib/json'

test('JSON embedded in a script tag cannot close the tag', () => {
  const out = jsonForScript({ name: 'x</script><script>alert(1)</script>' })
  expect(out).not.toContain('</')
  expect(JSON.parse(out)).toEqual({ name: 'x</script><script>alert(1)</script>' })
})

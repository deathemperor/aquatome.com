import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const script = readFileSync(new URL('../../../scripts/video-recheck.sh', import.meta.url), 'utf8')
// The lines that set the accounts, run alone with a home of their own.
const accounts = /^CLAUDE_TOKENS=.*\n^if .*\n.*\n^fi$/m.exec(script)![0]

const order = (file: string) => {
  const home = mkdtempSync(join(tmpdir(), 'aq-recheck-'))
  mkdirSync(join(home, '.config/aquatome'), { recursive: true })
  writeFileSync(join(home, '.config/aquatome/claude-oauth-tokens'), file)
  return execFileSync('bash', ['-c', `${accounts}\nprintf %s "$CLAUDE_CODE_OAUTH_TOKENS"`], { env: { HOME: home, PATH: process.env.PATH }, encoding: 'utf8' }).split('\n')
}

test('the video re-check uses token 2 first, then token 1, so it stays off the account the Mac’s other jobs use up', () => {
  expect(order('tok-1\ntok-2\n')).toEqual(['tok-2', 'tok-1'])
  // The last line without its newline: still one token a line, not the two run together.
  expect(order('tok-1\ntok-2')).toEqual(['tok-2', 'tok-1'])
  expect(order('tok-1\n')).toEqual(['tok-1'])
})

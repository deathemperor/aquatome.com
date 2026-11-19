import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The auto-fix's agent (.github/workflows/fix.yml) runs every command in the CLI's shell sandbox, and from 12 Nov 2026
// none could start on GitHub's runner ("socat not installed"), so every session could only read. The workflow now sets
// the sandbox up and starts one before a session is paid for; the agent is never let outside it.
const ROOT = new URL('../../../', import.meta.url)
const workflow = readFileSync(new URL('.github/workflows/fix.yml', ROOT), 'utf8')
const script = new URL('scripts/sandbox-ready.sh', ROOT).pathname

test('the agent\'s job sets up the sandbox after installing the CLI and before the session, and never opens a way out of it', () => {
  const install = workflow.indexOf('npm install -g @anthropic-ai/claude-code')
  const ready = workflow.indexOf('run: scripts/sandbox-ready.sh')
  const session = workflow.indexOf('claude -p --model')
  expect(install).toBeGreaterThan(0)
  expect(ready).toBeGreaterThan(install)
  expect(session).toBeGreaterThan(ready)
  expect(workflow).not.toMatch(/dangerously|allowUnsandboxed|--no-sandbox|sandbox["']?\s*:\s*false/i)
})

/** Runs the script with stand-ins for sudo, apt-get, socat and bwrap; bwrap starts a sandbox or not. */
function ready(bwrapStarts: boolean) {
  const bin = mkdtempSync(join(tmpdir(), 'sandbox-ready-'))
  const stub = (name: string, body: string) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755) }
  stub('sudo', 'exit 0')
  stub('apt-get', 'exit 0')
  stub('socat', 'exit 0')
  stub('bwrap', `exit ${bwrapStarts ? 0 : 1}`)
  return spawnSync('bash', [script], { env: { PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8' })
}

test('the sandbox check passes when a sandbox starts, and stops the job when one can\'t', () => {
  expect(ready(true).status).toBe(0)
  const no = ready(false)
  expect(no.status).toBe(1)
  expect(no.stderr).toContain("a sandbox can't start on this runner, so the agent isn't started")
})

/** The step's own program, run on a session's output: what the issue and the log are told. */
function outcome(agent: object) {
  const prog = /node -e '(let r=\{\};[^']*)'/.exec(workflow)![1]!
  const dir = mkdtempSync(join(tmpdir(), 'autofix-outcome-'))
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(agent))
  const code = prog.replaceAll('/tmp/agent.json', join(dir, 'agent.json')).replaceAll('/tmp/fix/result.json', join(dir, 'result.json'))
  execFileSync('node', ['-e', code], { encoding: 'utf8' })
  return JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) as { status: string; summary: string }
}

test('a session that did not finish is told in our words, never the CLI\'s: the usage limit with its reset, or an error by a hash', () => {
  expect(outcome({ is_error: true, result: 'You\'ve hit your weekly limit · resets 6am (UTC)' })).toEqual({ status: 'needs-person', summary: 'The agent did not finish: the Claude usage limit, until 6am (UTC). Start it again after that.' })
  expect(outcome({ is_error: true, result: 'You\'ve hit your weekly limit · resets Nov 19, 6am (UTC)' }).summary).toBe('The agent did not finish: the Claude usage limit, until Nov 19, 6am (UTC). Start it again after that.')
  const other = outcome({ is_error: true, result: 'Something the CLI said about the account at example.com' })
  expect(other.summary).toMatch(/^The agent did not finish: an error \([0-9a-f]{8}\)\.$/)
  expect(outcome({}).summary).toBe('The agent did not finish: no output.')
  // A session that finished says what it did, as before.
  expect(outcome({ structured_output: { status: 'fixed', summary: 'x' } })).toEqual({ status: 'fixed', summary: 'x' })
})

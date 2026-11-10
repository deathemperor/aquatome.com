import { execFileSync, spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const scripts = ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh']
const driverLine = 'git config merge.regenerated.driver true'

test('the engine cycle and both video jobs set the regenerated merge driver', async () => {
  for (const name of scripts) {
    const script = await readFile(join(ROOT, 'scripts', name), 'utf8')
    expect(script.split('\n'), name).toContain(driverLine)
  }
})

test('two jobs that rewrite the fit reports pull and rebase cleanly, keeping the upstream reports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'merge-regenerated-'))
  const upstream = join(dir, 'upstream')
  const clone = join(dir, 'clone')
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
  })
  const files = ['docs/review/fit.md', 'engine-state/fit-summary.json']
  const report = (file: string, version: string) => file.endsWith('.json') ? `{"version":"${version}"}\n` : `${version}\n`
  const write = async (cwd: string, version: string) => {
    for (const file of files) await writeFile(join(cwd, file), report(file, version))
  }
  try {
    await mkdir(upstream)
    git(upstream, 'init', '-q', '-b', 'main')
    await copyFile(join(ROOT, '.gitattributes'), join(upstream, '.gitattributes'))
    await mkdir(join(upstream, 'docs/review'), { recursive: true })
    await mkdir(join(upstream, 'engine-state'))
    await write(upstream, 'base')
    git(upstream, 'add', '.')
    git(upstream, 'commit', '-qm', 'base')
    git(dir, 'clone', '-q', upstream, clone)
    git(clone, 'config', 'user.email', 'test@example.invalid'); git(clone, 'config', 'user.name', 'test') // the rebase commits; CI has no identity
    // Use the job's real command so removing its configuration breaks this rebase too.
    const script = await readFile(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
    const line = script.split('\n').find(line => line === driverLine)
    expect(line).toBe(driverLine)
    execFileSync('sh', ['-c', line!], { cwd: clone, stdio: 'pipe' })
    await write(upstream, 'upstream')
    git(upstream, 'commit', '-qam', 'upstream')
    await write(clone, 'local')
    git(clone, 'commit', '-qam', 'local')
    const pull = spawnSync('git', ['pull', '--rebase'], { cwd: clone, encoding: 'utf8' })
    expect(pull.status, pull.stdout + pull.stderr).toBe(0)
    expect(git(clone, 'diff', '--name-only', '--diff-filter=U')).toBe('')
    for (const file of files) expect(await readFile(join(clone, file), 'utf8')).toBe(report(file, 'upstream'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

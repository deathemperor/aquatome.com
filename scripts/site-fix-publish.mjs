#!/usr/bin/env node
// fix.yml's last step (docs/governance.md, layer 4): the agent's verified change → a draft PR that fixes the issue, with
// CI started on it; otherwise a comment on the issue saying why there is no PR. Env: ISSUE, CHANGED, OK (from the verify
// step), GH_TOKEN, and GitHub's GITHUB_* variables. /tmp/result.json: the agent's status and summary.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { ISSUE, CHANGED, OK, GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: server, GITHUB_RUN_ID: runId, GH_TOKEN } = process.env
const run = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const result = JSON.parse(readFileSync('/tmp/result.json', 'utf8'))
const runUrl = `${server}/${repo}/actions/runs/${runId}`
const comment = body => run('gh', 'issue', 'comment', ISSUE, '-R', repo, '--body', body)

if (CHANGED === '1' && OK === '1' && result.status === 'fixed') {
  const title = JSON.parse(run('gh', 'issue', 'view', ISSUE, '-R', repo, '--json', 'title')).title.replace(/^Site check failed: /, '')
  const branch = `fix/issue-${ISSUE}-${runId}`
  run('git', 'config', 'user.name', 'aquatome-fix')
  run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
  run('git', 'checkout', '-b', branch)
  run('git', 'add', '-A')
  run('git', 'commit', '-m', `fix: ${title} (#${ISSUE})\n\n${result.summary}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)
  run('git', 'push', `https://x-access-token:${GH_TOKEN}@github.com/${repo}.git`, `HEAD:refs/heads/${branch}`)
  const body = [
    `Fixes #${ISSUE}`, '', result.summary, '',
    result.check ? `**Check that covers it:** \`${result.check}\`` : '',
    `**Verified by the workflow** (not just the agent): \`pnpm test\`, \`pnpm typecheck\`, \`pnpm --filter site e2e\` passed. [run](${runUrl})`, '',
    'Draft: review before merging (docs/governance.md, layer 4).', '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
  const pr = run('gh', 'pr', 'create', '-R', repo, '--draft', '--base', 'main', '--head', branch, '--title', `fix: ${title}`, '--body', body)
  // A PR opened with this workflow's token starts no workflow: start the checks on the branch.
  run('gh', 'workflow', 'run', 'ci', '-R', repo, '--ref', branch)
  comment(`Draft fix: ${pr}`)
  console.log(`opened ${pr}`)
} else {
  const why = CHANGED === '1' && OK !== '1'
    ? "The agent changed files, but the checks failed afterwards, so nothing was published."
    : result.status === 'not-reproduced' ? 'The agent could not reproduce the problem (the page may be fine now; the next watch run closes the issue if so).'
    : 'The agent did not produce a fix.'
  comment(`**Automatic fix: none.** ${why}\n\n${result.summary}\n\n[run](${runUrl})`)
  if (result.status !== 'not-reproduced') {
    try { run('gh', 'label', 'create', 'needs-person', '-R', repo, '--color', '5319E7', '--description', 'The automatic fix could not handle it') } catch { /* exists */ }
    run('gh', 'issue', 'edit', ISSUE, '-R', repo, '--add-label', 'needs-person')
  }
  console.log(why)
}

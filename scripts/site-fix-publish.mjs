#!/usr/bin/env node
// fix.yml's publish job (docs/governance.md, layer 4): the agent's patch, checked by the verify job, → a draft PR that
// fixes the issue, with CI started on it; otherwise a comment on the issue saying why there is no PR. Runs as copied from
// main, in a job that runs no repository code. Env: ISSUE, OK (verify's result), GH_TOKEN, GitHub's GITHUB_* variables.
// /tmp/fix: result.json (the agent's status and summary) and fix.patch.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

const { ISSUE, OK, GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: server, GITHUB_RUN_ID: runId, GH_TOKEN } = process.env
const run = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const result = JSON.parse(readFileSync('/tmp/fix/result.json', 'utf8'))
const PATCH = '/tmp/fix/fix.patch'
const changed = existsSync(PATCH) && statSync(PATCH).size > 0
const runUrl = `${server}/${repo}/actions/runs/${runId}`
const comment = body => run('gh', 'issue', 'comment', ISSUE, '-R', repo, '--body', body)

// The governance machinery itself is not the automatic fixer's to change.
const files = changed ? run('git', 'apply', '--numstat', PATCH).split('\n').map(l => l.split('\t')[2]) : []
const forbidden = files.filter(f => /^\.github\//.test(f) || /^scripts\/site-(fix|watch)/.test(f))

if (changed && OK === '1' && result.status === 'fixed' && !forbidden.length) {
  const title = JSON.parse(run('gh', 'issue', 'view', ISSUE, '-R', repo, '--json', 'title')).title.replace(/^Site check failed: /, '')
  const branch = `fix/issue-${ISSUE}-${runId}`
  run('git', 'config', 'user.name', 'aquatome-fix')
  run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
  run('git', 'checkout', '-b', branch)
  run('git', 'apply', '--index', PATCH)
  run('git', 'commit', '--no-verify', '-m', `fix: ${title} (#${ISSUE})\n\n${result.summary}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)
  run('git', 'push', `https://x-access-token:${GH_TOKEN}@github.com/${repo}.git`, `HEAD:refs/heads/${branch}`)
  const body = [
    `Fixes #${ISSUE}`, '', result.summary, '',
    ...(result.check ? [`**Check that covers it:** \`${result.check}\``] : []),
    `**Verified in a separate job** (not just by the agent): \`pnpm test\`, \`pnpm typecheck\`, \`pnpm --filter site e2e\` passed. [run](${runUrl})`, '',
    'Draft: review before merging (docs/governance.md, layer 4).', '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n')
  let pr
  try { pr = run('gh', 'pr', 'create', '-R', repo, '--draft', '--base', 'main', '--head', branch, '--title', `fix: ${title}`, '--body', body) } catch (e) {
    // The fix is pushed; say where, so a person can open the PR (e.g. the repository doesn't let Actions open PRs).
    comment(`**Automatic fix: pushed, but no PR.** The change passed every check, on branch \`${branch}\`; opening the PR failed (${String(e.message).split('\n')[0].slice(0, 200)}). [Open it](${server}/${repo}/compare/main...${branch}?expand=1) · [run](${runUrl})`)
    throw e
  }
  run('gh', 'workflow', 'run', 'ci', '-R', repo, '--ref', branch)
  comment(`Draft fix: ${pr}`)
  console.log(`opened ${pr}`)
} else {
  const why = forbidden.length ? `The change touched files the automatic fixer may not change (${forbidden.join(', ')}), so nothing was published.`
    : changed && OK !== '1' ? 'The agent changed files, but the checks failed on its change, so nothing was published.'
    : result.status === 'not-reproduced' ? 'The agent could not reproduce the problem (the page may be fine now; the next watch run closes the issue if so).'
    : 'The agent did not produce a fix.'
  comment(`**Automatic fix: none.** ${why}\n\n${result.summary}\n\n[run](${runUrl})`)
  if (result.status !== 'not-reproduced') {
    try { run('gh', 'label', 'create', 'needs-person', '-R', repo, '--color', '5319E7', '--description', 'The automatic fix could not handle it') } catch { /* exists */ }
    run('gh', 'issue', 'edit', ISSUE, '-R', repo, '--add-label', 'needs-person')
  }
  console.log(why)
}

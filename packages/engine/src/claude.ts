import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ceilingMessage, costLog, inPiece, stepName } from './ceiling'
import { envFor, NotTheAccount, onAccounts, tokenHash } from './claude-accounts'
import { cycleOnlyHosts } from './cycle-only'
import { MARKETPLACE_DOMAINS } from './marketplaces'

// Where a call that reads no files runs: a folder of its own, empty. At its start the CLI lists the files under where it
// runs, tools or none. From /tmp that was every checkout there, 114 listings in 7 minutes, the slowest over 2 minutes
// (2026-11-08).
let emptyDir: string | undefined
const noFiles = () => (emptyDir ??= mkdtempSync(join(tmpdir(), 'aq-claude-')))

/** The model call itself failed (CLI error, usage limit, bad output) — distinct from a page problem. */
export class LlmError extends Error {}

/** model: per-call override of ENGINE_MODEL (default sonnet). */
export const modelOf = (model?: string) => model ?? process.env.ENGINE_MODEL ?? 'sonnet'

/**
 * What a call really ran on (the chief of staff, 2026-11-11): the engine asks for an alias ("sonnet"), which moves with the
 * command's version, so the full model each alias last answered with, from the command's own report (`modelUsage`), and the
 * command's version go beside every logged call and review. Scores that move with either show which.
 */
const ranOn = new Map<string, string>()
export const modelRan = (model?: string) => ranOn.get(modelOf(model)) ?? modelOf(model)
let version: string | undefined
/** The command's version, asked once a process; ENGINE_CLI_VERSION says it instead (the tests set it empty: none logged). */
export function cliVersion(): string {
  if (process.env.ENGINE_CLI_VERSION !== undefined) return process.env.ENGINE_CLI_VERSION
  if (version) return version
  try {
    version = execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 20_000 }).trim().split(/\s+/)[0] || 'unknown'
  } catch {
    version = 'unknown'
  }
  return version
}
/** The model that wrote most of a call's answer, by the command's report of each model it used. */
export const answeredBy = (usage: unknown): string | undefined =>
  Object.entries((usage ?? {}) as Record<string, { outputTokens?: number }>).sort(([, a], [, b]) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0))[0]?.[0]
export type Llm = <T>(args: { system: string; prompt: string; schema: object; model?: string }) => Promise<T>

type RunOpts = { tools: string; deny?: string[]; cwd: string; model?: string; timeoutMs?: number; privateImage?: boolean }

/**
 * One call on the owner's Claude accounts, the next one when an account is out of its limit or rejected (claude-accounts.ts).
 * Before each try, the step's ceiling for the day (ceiling.ts): the engine's own limit, so a step at it fails here with
 * no call made, no account set aside and the next account not tried.
 */
const run = <T>(system: string, prompt: string, schema: object, opts: RunOpts): Promise<T> => onAccounts(token => {
  const capped = ceilingMessage(stepName(), costLog())
  if (capped) return Promise.reject(new NotTheAccount(capped))
  return once<T>(system, prompt, schema, opts, token)
}, m => new LlmError(m))

function once<T>(system: string, prompt: string, schema: object, opts: RunOpts, token?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const args = ['-p', '--model', modelOf(opts.model), '--output-format', 'json', '--tools', opts.tools, ...(opts.tools ? ['--allowedTools', opts.tools] : []), ...(opts.deny?.length ? ['--disallowedTools', opts.deny.join(',')] : []),
      '--setting-sources', '', '--strict-mcp-config', ...(opts.privateImage ? ['--no-session-persistence'] : []), '--system-prompt', system, '--json-schema', JSON.stringify(schema)]
    const started = Date.now()
    const child = spawn('claude', args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: envFor(token) })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 10 * 60_000)
    // Decoded across chunks: the pipe cuts a long answer at any byte, and a chunk decoded by itself turns a character cut
    // in two into U+FFFD (a Thai letter is three bytes: 38 Thai pages had one, 2026-11-10).
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', e => reject(new LlmError(e.message)))
    child.on('close', code => {
      clearTimeout(timer)
      try {
        const r = JSON.parse(out)
        const ran = answeredBy(r.modelUsage)
        if (ran) ranOn.set(modelOf(opts.model), ran)
        // ENGINE_COST_LOG: one line a call (what the CLI reports it would cost on the API, its tokens, the wall time, the CLI
        // command it ran in and the account it went to, by its token's hash), to split a week's use by job and account.
        const log = costLog()
        if (log) {
          const u = r.usage ?? {}
          try {
            appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), step: stepName(), ...(inPiece.getStore() ? { piece: inPiece.getStore() } : {}), account: token ? tokenHash(token) : 'login', model: modelOf(opts.model), ...(ran ? { ran } : {}), ...(cliVersion() ? { cli: cliVersion() } : {}), ms: Date.now() - started, usd: r.total_cost_usd, in: u.input_tokens, cacheWrite: u.cache_creation_input_tokens, cacheRead: u.cache_read_input_tokens, out: u.output_tokens, error: !!r.is_error })}\n`)
          } catch (e) {
            console.warn(`ENGINE_COST_LOG: ${(e as Error).message}`) // a log it can't write never fails the call
          }
        }
        if (r.is_error || code !== 0) return reject(new LlmError(`claude failed (${code}): ${r.result ?? err}`.slice(0, 500)))
        resolve(r.structured_output as T)
      } catch {
        reject(new LlmError(`claude returned non-JSON (${code}): ${(out || err).slice(0, 300)}`))
      }
    })
    child.stdin.end(prompt)
  })
}

/** Headless Claude Code on the owner's subscription, lean context (no tools, settings, MCP or default system prompt). */
export const claudeCli: Llm = <T>({ system, prompt, schema, model }: { system: string; prompt: string; schema: object; model?: string }) => run<T>(system, prompt, schema, { tools: '', cwd: noFiles(), model })

/** Same, but able to look at one image: only the Read tool, run from the image's folder. */
export const claudeVision = <T>({ system, prompt, schema, file, model }: { system: string; prompt: string; schema: object; file: string; model?: string }) =>
  run<T>(system, `${prompt}\n\nNever transcribe lettering, signatures or personal names from a photo.\nThe photo: ${file} (open it with the Read tool).`, schema, { tools: 'Read', cwd: dirname(file), model, privateImage: true })

/**
 * The pages research may not read: the marketplaces', each as its host and every host under it ("www.", a country's), as
 * a WebFetch domain rule matches its host only and "*.host" those under it; and `hosts`' (cycle-only.ts, both forms
 * already).
 */
export const researchDeny = (hosts: readonly string[] = []) => [...MARKETPLACE_DOMAINS.flatMap(d => [d, `*.${d}`]), ...hosts].map(d => `WebFetch(domain:${d})`)
/** This checkout, whose engine-state says which sources the engine has moved to the Archive or found blocked (as cli.ts's ROOT). */
const ENGINE_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Same, able to search and read the web (WebSearch, WebFetch), for `root`'s engine. Never a marketplace's page, nor one of a
 * source the engine reads only at its own pace (cycle-only.ts: through the Archive, or waiting for a person to pass its
 * browser check), read again from the engine's own record before every call, so a source marked since is off at once (the
 * chief of staff, 14 Nov 2026, on the owner's rule that nothing goes round a challenge). Slower, so a longer timeout.
 */
export const researchFor = (root: string): Llm => async <T>({ system, prompt, schema, model }: { system: string; prompt: string; schema: object; model?: string }) =>
  run<T>(system, prompt, schema, { tools: 'WebSearch,WebFetch', deny: researchDeny(await cycleOnlyHosts(root)), cwd: noFiles(), model, timeoutMs: 25 * 60_000 })
/** Web research, the one every step uses. */
export const claudeResearch: Llm = researchFor(ENGINE_ROOT)

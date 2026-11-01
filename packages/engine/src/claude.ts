import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { MARKETPLACE_DOMAINS } from './marketplaces'

/** The model call itself failed (CLI error, usage limit, bad output) — distinct from a page problem. */
export class LlmError extends Error {}

/** model: per-call override of ENGINE_MODEL (default sonnet). */
export type Llm = <T>(args: { system: string; prompt: string; schema: object; model?: string }) => Promise<T>

function run<T>(system: string, prompt: string, schema: object, opts: { tools: string; deny?: string[]; cwd: string; model?: string; timeoutMs?: number }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const args = ['-p', '--model', opts.model ?? process.env.ENGINE_MODEL ?? 'sonnet', '--output-format', 'json', '--tools', opts.tools, ...(opts.tools ? ['--allowedTools', opts.tools] : []), ...(opts.deny?.length ? ['--disallowedTools', opts.deny.join(',')] : []),
      '--setting-sources', '', '--strict-mcp-config', '--system-prompt', system, '--json-schema', JSON.stringify(schema)]
    const started = Date.now()
    const child = spawn('claude', args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 10 * 60_000)
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', e => reject(new LlmError(e.message)))
    child.on('close', code => {
      clearTimeout(timer)
      try {
        const r = JSON.parse(out)
        // ENGINE_COST_LOG: one line a call (what the CLI reports it would cost on the API, its tokens, the wall time), to
        // measure a run such as the reader's backfill.
        if (process.env.ENGINE_COST_LOG) {
          const u = r.usage ?? {}
          appendFileSync(process.env.ENGINE_COST_LOG, `${JSON.stringify({ at: new Date().toISOString(), model: opts.model ?? process.env.ENGINE_MODEL ?? 'sonnet', ms: Date.now() - started, usd: r.total_cost_usd, in: u.input_tokens, cacheWrite: u.cache_creation_input_tokens, cacheRead: u.cache_read_input_tokens, out: u.output_tokens, error: !!r.is_error })}\n`)
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
export const claudeCli: Llm = <T>({ system, prompt, schema, model }: { system: string; prompt: string; schema: object; model?: string }) => run<T>(system, prompt, schema, { tools: '', cwd: '/tmp', model })

/** Same, but able to look at one image: only the Read tool, run from the image's folder. */
export const claudeVision = <T>({ system, prompt, schema, file, model }: { system: string; prompt: string; schema: object; file: string; model?: string }) =>
  run<T>(system, `${prompt}\n\nThe photo: ${file} (open it with the Read tool).`, schema, { tools: 'Read', cwd: dirname(file), model })

/** Same, able to search and read the web (WebSearch, WebFetch; never marketplace pages): product research. Slower, so a longer timeout. */
export const claudeResearch: Llm = <T>({ system, prompt, schema, model }: { system: string; prompt: string; schema: object; model?: string }) =>
  run<T>(system, prompt, schema, { tools: 'WebSearch,WebFetch', deny: MARKETPLACE_DOMAINS.map(d => `WebFetch(domain:${d})`), cwd: '/tmp', model, timeoutMs: 25 * 60_000 })

import { spawn } from 'node:child_process'

/** The model call itself failed (CLI error, usage limit, bad output) — distinct from a page problem. */
export class LlmError extends Error {}

export type Llm = <T>(args: { system: string; prompt: string; schema: object }) => Promise<T>

/** Headless Claude Code on the owner's subscription, lean context (no tools, settings, MCP or default system prompt). */
export const claudeCli: Llm = <T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) =>
  new Promise<T>((resolve, reject) => {
    const args = ['-p', '--model', process.env.ENGINE_MODEL ?? 'sonnet', '--output-format', 'json', '--tools', '', '--setting-sources', '',
      '--strict-mcp-config', '--system-prompt', system, '--json-schema', JSON.stringify(schema)]
    const child = spawn('claude', args, { cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000)
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', e => reject(new LlmError(e.message)))
    child.on('close', code => {
      clearTimeout(timer)
      try {
        const r = JSON.parse(out)
        if (r.is_error || code !== 0) return reject(new LlmError(`claude failed (${code}): ${r.result ?? err}`.slice(0, 500)))
        resolve(r.structured_output as T)
      } catch {
        reject(new LlmError(`claude returned non-JSON (${code}): ${(out || err).slice(0, 300)}`))
      }
    })
    child.stdin.end(prompt)
  })

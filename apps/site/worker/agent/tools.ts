import type Anthropic from '@anthropic-ai/sdk'

/**
 * A tool the agent loop (loop.ts) offers Claude, in the SDK tool runner's shape (name, description, input schema, run),
 * so moving to the runner later is a small change. Its input schema is `strict`: Claude's input always matches it, so
 * no validation here. It knows nothing of the feature using it; `step` is what the reader may be shown while it runs.
 *
 * Plain TypeScript, no Cloudflare types: the accuracy script runs the same tools in Node.
 */
export type ToolOutput = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
/** What the loop tells a tool about the run: how many reference photos it may still return. */
export type ToolContext = { photosLeft: number }
export type Tool<Step = unknown> = {
  name: string
  description: string
  /** JSON Schema with `additionalProperties: false` and every property `required` (strict tool use). */
  input_schema: Anthropic.Tool.InputSchema
  /** The step to show for this input, or undefined to show none. */
  step?: (input: Record<string, unknown>) => Step | undefined
  /** The result Claude reads. A throw becomes an `is_error` result with its message. */
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutput>
}

/** The tool as the API takes it. */
export const definition = (t: Tool): Anthropic.Tool => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true })

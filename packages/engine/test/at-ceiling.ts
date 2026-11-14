import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ceilingMessage, type Place } from '../src/ceiling'

const none: Place = { default: 0, backstop: 100, steps: { gate: null, moderate: null } }

/** What a step at its day's ceiling fails its call with, from the real check: a ceiling of $0 stops the first call. */
export const atCeiling = (step: string) =>
  ceilingMessage(step, join(mkdtempSync(join(tmpdir(), 'at-ceiling-')), 'aquatome-cost-test.jsonl'), { clock: 'test', tables: [{ from: '2026-01-01T00:00:00Z', mac: none, github: none }] }, new Date('2026-11-14T03:00:00Z'))!

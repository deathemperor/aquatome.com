import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { needsGlossaryProof, glossaryProofPassed } from '../../../scripts/glossary-proof.mjs'

for (const path of [
  'packages/schema/src/glossary-generated.ts', 'packages/schema/package.json', 'pnpm-lock.yaml', 'packages/schema/src/load.ts', 'packages/schema/src/schemas.ts',
  'apps/site/src/lib/app-index.ts', 'apps/site/src/lib/app-page.ts', 'apps/site/src/pages/thuat-ngu/[slug].astro',
  'content/glossary/fixture/entity.json', 'content/glossary-kind-image-approvals.json', 'content/captions/id.json',
  'engine-state/glossary/fixture.json', 'engine-state/_photo-watermarks.json', 'engine-state/_photo-rejected.json',
  'apps/site/vitest.config.ts', 'apps/site/test/glossary-generated-real.test.ts', 'scripts/glossary-proof.mjs', '.github/workflows/ci.yml',
]) test(`${path} requires the real-content proof, including a content-only picture release`, () => {
  expect(needsGlossaryProof([path])).toBe(true)
})

test('unrelated work does not pay for the proof, and a missing diff fails closed', () => {
  expect(needsGlossaryProof(['apps/ios/Example.swift', 'README.md', 'content/species/fixture/vi.json'])).toBe(false)
  expect(needsGlossaryProof(null)).toBe(true)
  expect(needsGlossaryProof([null])).toBe(true)
})

test('the required test check refuses a failed, cancelled or skipped required proof', () => {
  expect(glossaryProofPassed(true, 'success')).toBe(true)
  for (const result of ['failure', 'cancelled', 'skipped', undefined]) expect(glossaryProofPassed(true, result)).toBe(false)
  expect(glossaryProofPassed(false, 'skipped')).toBe(true)
  expect(glossaryProofPassed(false, 'failure')).toBe(false)
})

test('the daily full suite and the release-path selector feed a separately required proof job', () => {
  const ci = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  expect(ci).toMatch(/schedule:\n\s+- cron: '\d{1,2} \d{1,2} \* \* \*'/)
  expect(ci).toContain('node scripts/glossary-proof.mjs select')
  expect(ci).toContain('name: Glossary real-content proof')
  expect(ci).toContain("if: needs.changes.outputs.glossary-proof == 'true'")
  expect(ci).toContain('run: pnpm --filter site test:glossary-real')
  expect(ci).toMatch(/needs: \[[^\]]*glossary-proof[^\]]*\]/)
  expect(ci).toContain('node scripts/glossary-proof.mjs gate')
})

test('the exact CI gate command fails when a required proof is missing, failed or cancelled', () => {
  const script = fileURLToPath(new URL('../../../scripts/glossary-proof.mjs', import.meta.url))
  for (const [required, result, expected] of [['true', 'success', 0], ['false', 'skipped', 0], ['true', 'skipped', 1], ['true', 'failure', 1], ['true', 'cancelled', 1], ['unknown', 'success', 1]] as const) {
    const child = spawnSync(process.execPath, [script, 'gate'], { env: { GLOSSARY_PROOF_REQUIRED: required, GLOSSARY_PROOF_RESULT: result }, encoding: 'utf8' })
    expect(child.status).toBe(expected)
    expect(child.stderr).toBe('')
  }
})

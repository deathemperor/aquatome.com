import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A missing file list runs the proof. Releases and approvals cannot avoid it by changing only content. */
export function needsGlossaryProof(files) {
  if (!Array.isArray(files)) return true
  return files.some(file => typeof file !== 'string' || /^(?:packages\/schema\/src\/|apps\/site\/src\/lib\/|apps\/site\/src\/pages\/thuat-ngu\/|content\/glossary\/|content\/captions\/|engine-state\/glossary\/)/.test(file)
    || /^(?:content\/(?:glossary-kind-image-approvals|sources)\.json|engine-state\/_photo-(?:watermarks|rejected)\.json|packages\/schema\/package\.json|pnpm-lock\.yaml|docs\/(?:generated-pictures|governance)\.md|apps\/site\/(?:vitest\.config\.ts|package\.json)|package\.json|scripts\/glossary-proof\.mjs|\.github\/workflows\/ci\.yml)$/.test(file)
    || /^apps\/site\/test\/(?:helpers\/glossary-|glossary-generated|glossary-proof)/.test(file))
}
export const glossaryProofPassed = (required, result) => required ? result === 'success' : result === 'success' || result === 'skipped'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'select') {
    const files = readFileSync(0, 'utf8').split('\n').filter(Boolean)
    process.stdout.write(`${needsGlossaryProof(files)}\n`)
  } else if (process.argv[2] === 'gate') {
    const valid = ['true', 'false'].includes(process.env.GLOSSARY_PROOF_REQUIRED ?? '')
      && glossaryProofPassed(process.env.GLOSSARY_PROOF_REQUIRED === 'true', process.env.GLOSSARY_PROOF_RESULT)
    process.stdout.write(valid ? 'glossary real-content proof passed or was not required\n' : 'glossary real-content proof did not pass\n')
    process.exitCode = valid ? 0 : 1
  } else {
    process.stderr.write('usage: node scripts/glossary-proof.mjs select|gate\n')
    process.exitCode = 2
  }
}

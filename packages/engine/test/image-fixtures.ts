import reviewed from '../src/image-controls.json'
import { generatedGateVersion, GENERATED_CHECK_MODEL, type Calibration } from '../src/image-reference'
import { noTraceVersion, type NoTraceCalibration } from '../src/image-transforms'
import { IMAGE_PAIR_POLICY, type JudgmentPairReceipt } from '../src/image-judgments'

/** Synthetic approvals for fixtures only. These are never evidence that the live gate is qualified. */
export function fixtureJudgments(pass:boolean,decision=pass?'pass':'refuse'):JudgmentPairReceipt {
  return {policy:IMAGE_PAIR_POLICY,pass,disagreement:false,incomplete:false,judgments:[1,2].map(n=>({id:`fixture-${n}`,at:'2026-11-11',seconds:1,failed:false,passes:pass,decision})),seconds:1,codexSeconds:2}
}
export function fixtureGeneratedCalibration():Calibration {
  return {version:generatedGateVersion(),model:GENERATED_CHECK_MODEL,cases:reviewed.generated.map(f=>({...f,expected:f.expected as Calibration['cases'][number]['expected'],actual:f.expected==='pass'?'pass':'unsure',reason:'Synthetic fixture outcome.',conflicts:f.expected==='conflict'?1:0,judgments:fixtureJudgments(f.expected==='pass'),...(f.referenceJudgmentsRequired?{referenceJudgments:fixtureJudgments(f.expected!=='conflict')}:{} )}))}
}
export function fixtureMarkCalibration():NoTraceCalibration {
  const rows=[...reviewed.marks.map(f=>({...f,id:`frozen-${f.n}`})),...reviewed.markSupplement]
  return {version:noTraceVersion(),cases:rows.map(f=>({...f,expected:f.expected as 'pass'|'refuse',actual:f.expected as 'pass'|'refuse',outside:0,judgments:fixtureJudgments(f.expected==='pass'),measurement:{version:'box-detail-cosine-v1',limit:.4,score:f.expected==='pass'?.1:.8,originalEnergy:100,candidateEnergy:100}}))}
}

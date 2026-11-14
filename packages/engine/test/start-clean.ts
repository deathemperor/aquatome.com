// What a live engine run hands the tests it runs (verify's `pnpm test`, scripts/cycle-checks.sh), and so every pretend
// run a test starts from `{ ...process.env }`. vitest.config.ts runs this before any test file, so each starts as on
// GitHub, where no engine run is around. On 13 Nov 2026 every Mac run from 18:20 failed its checks on tests whose pretend
// runs took the live run's sleep reading (AQ_ASLEEP0: "the Mac slept … during this cycle" never said) and its second
// try's worker cap (VITEST_MAX_WORKERS), while GitHub's checks passed. start-clean.test.ts holds this list to what the
// scripts set.
export const LIVE_RUN_SETTINGS = [
  'AQ_ASLEEP0', // engine-cycle.sh: how long the Mac had slept when the run began
  'AQ_SCRIPT_HEAD', // from_main: the commit the run's script started from
  'CLAUDE_CODE_OAUTH_TOKENS', // engine-cycle.sh: the engine's Claude accounts
  'VITEST_MAX_WORKERS', // verify's second try on the Mac
  'pnpm_config_workspace_concurrency', // verify's second try
  'ENGINE_PROFILE', // the Mac's engine schedule (install-engine-schedule.sh)
  'ENGINE_MAX_MINUTES',
  'SKIP_VIDEOS',
] as const

export const startClean = (env: NodeJS.ProcessEnv): void => {
  for (const name of LIVE_RUN_SETTINGS) delete env[name]
}

startClean(process.env)

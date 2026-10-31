# Site governance: catch breakage before readers do

The site changes many times a day: the content engine every 3 hours, and code through pull requests. These checks keep
those changes from breaking pages. Each problem goes through one loop: **detect → record → fix → prevent** (a check
that would have caught it).

## Layers

| # | Layer | Catches | Runs | Status |
| --- | --- | --- | --- | --- |
| 1 | **Gate**: build tests + browser checks | broken pages, journeys that stop working, layout and translation slips, pages that get slower, heavier or less accessible | every PR (`ci.yml`), every deploy (`deploy.yml`, engine content too) | live |
| 2 | **Production watch**: the same checks against aquatome.com | page-specific content problems, deploy surprises | after each deploy and nightly (`watch.yml`); a failure opens or updates an issue | live |
| 3 | **AI page review**: Claude looks at phone and computer screenshots against a rubric | problems no rule describes ("the results are five screens down") | nightly on key pages + 6 a day (`watch.yml`); on PRs that change site code, as a comment | live |
| 4 | **Fix loop**: an agent turns a recorded problem into a failing check, then a fix, as a draft PR | what layers 2 and 3 record | each new `site-check` issue; any issue labelled `autofix` (`fix.yml`) | live |

### 1. Gate (live)

- `pnpm test`: the site built from `apps/site/test/fixture-content`, checked as HTML (vitest).
- `pnpm --filter site e2e`: Playwright on that build, as a phone (Pixel 7) and a computer (`apps/site/e2e/README.md`):
  - **Journeys**: the things readers do (search the fish list, glossary cards, the tank-volume, tank-mates and Chihiros
    tools).
  - **Page checks** on one or two pages of every kind, found from the build (a new kind of page is covered from its first
    build):
    - status 200 and a title
    - one `h1`, on the first screen
    - no sideways scroll
    - every picture has width, height and alt
    - links to this site's pages lead to pages that exist
    - no Vietnamese on Indonesian or Thai pages
    - no script errors
  - **Lighthouse** (`lighthouse.spec.ts`, what PageSpeed Insights runs) on one page of each kind readers open most, as
    PageSpeed's mobile and desktop tests, run alone (`E2E_LIGHTHOUSE=1 … --workers=1`). Each page has a budget:
    - accessibility, best practices and SEO at 100
    - layout shift, the site's own script weight (KB) and page elements: where they are now
    - performance, largest paint and blocking time: with room for run-to-run noise; a miss is measured again twice
      before it fails
    - pages that start below the budget are listed in `KNOWN` with the reason, held where they are until fixed
    - locally nothing from other sites loads (ads, analytics, photos); live, the page as readers get it
- Deploys from GitHub Actions (`deploy.yml`, which engine runs start too) run the page checks and Lighthouse on the
  **real** build before uploading (`deploy.sh` with `E2E_GATE=1`).
- Not gated yet: `deploy.sh` run on the owner's Mac (the video cycle). Layer 2 watches production for what slips through.

### 2. Production watch (live)

- `watch.yml` runs the same browser checks against aquatome.com after every finished deploy and at 05:00 (Vietnam),
  then Lighthouse on the live pages, ads and all: a page that drops below its budget becomes an issue like any other.
  (PageSpeed Insights' own API needs a key from the owner's Google Cloud project for its quota; Lighthouse here is the
  same test.)
- It checks a **different sample each day** (`E2E_SEED` = day of the year, from the sitemap), so in time it covers every
  page, not one or two per kind.
- Every page with an **open problem is checked again each run**, until it passes.
- `scripts/site-watch.mjs` turns results into issues labelled `site-check`, one per problem (a page, or a journey):
  - a new failure opens an issue
  - a repeat failure updates its "Last failed" line (no mail every night)
  - a pass closes the issue with a note
- A **failed deploy** opens a "Deploy failed" issue. Engine runs start deploys with the workflow token, so nobody would
  hear about it otherwise. The next deploy that finishes closes it.
- The watch blocks the site's own visit beacon, so its page loads don't count as readers.
- It runs the checks of the version that is live (the deploy's commit, else the last deploy that succeeded), not main's
  newest: a check merged before its fix is deployed would otherwise fail on the old site (it happened once, #183).

### 3. AI page review (live)

- `apps/site/e2e/review.spec.ts`, only with `E2E_REVIEW=1`, does what a careful reader does:
  - opens a page on a phone (first three screens) and on a computer (first screen)
  - hands the screenshots, the address and the visible headings to Claude (`REVIEW_MODEL`, default opus), which can
    read only those files
  - Claude checks a rubric: does the page do what its address promises, is the layout broken, is anything empty, is any
    text in the wrong language, is anything plainly wrong
- Which pages: the most-read pages and the ones that broke before (the search), plus 6 more each day on aquatome.com.
- What happens to findings:
  - **High** fails the check: a `site-check` issue, closed when a later review passes.
  - **Medium** findings are notes, kept in one `page-review` issue per page and refreshed each review. Close it by hand
    once fixed.
  - On a PR that changes `apps/site/src/`, the same review runs on the fixture build and posts its findings as one PR
    comment (advisory).
- Calibrated on the real bug: with the old `/vi/ca/?q=chach` code back, it reported "search results pushed below an
  unrelated section" as high, with the fix that shipped. On the fixed site, the 11 key pages had no high findings.
- Its first run found 2 small problems on the Chihiros page (fixed with it) and 3 content notes.
- In the screenshots, pictures from other websites (blocked in every check) are grey boxes, as the prompt expects; on a
  PR, the prompt also says the test build has little content.

### 4. Fix loop (live)

- Started by:
  - `site-watch.mjs`, when it opens a `site-check` issue (up to 3 a run)
  - the `autofix` label on any issue, a review note for example
  - running `fix.yml` by hand with an issue number
- `fix.yml` has three jobs, so that the agent's work never runs where a write token is:
  1. **agent** (read-only token, used only to read the issue) builds the fixture site, then gives Claude (`FIX_MODEL`,
     default opus) the issue and `scripts/site-fix-prompt.md`. Claude must reproduce the problem with a check that
     fails, fix the cause (the engine rule too, for content problems), never weaken a check, and run the gate. The issue
     text is a report to verify, not instructions. The job hands over only a patch.
  2. **verify** (no secrets) applies the patch to a fresh checkout and runs `pnpm test`, `pnpm typecheck` and
     `pnpm --filter site e2e`.
  3. **publish** (write token) runs no repository code: `scripts/site-fix-publish.mjs` as it is on main applies the
     patch and acts on the result:
     - verified: a **draft PR** that fixes the issue, with CI started on it
     - otherwise: a comment on the issue saying why, plus the `needs-person` label
     - it refuses patches to `.github/` or to the fix and watch scripts
     - it needs the repository setting "Allow GitHub Actions to create and approve pull requests" (on since
       2026-10-31); if opening the PR fails anyway, the issue gets a link to the pushed branch
- Remaining risk: the agent job holds the Claude token and can run commands. Its input is the bot's own issues, or
  issues a collaborator labelled `autofix`.
- **Merging is a review**, by the owner or an agent working for them, after CI. When the fix is live, the next watch
  run closes the issue.

## Content guards (the engine)

The engine writes and changes pages without a PR, so its own steps guard what it publishes (`scripts/engine-cycle.sh`).
The layers above still check the result.

- **Reviewed writing.** Each translation or guide is scored by a second model call against its source. A low score gets
  one rewrite with the notes; still low, the page is published but kept out of search (`quality.indexable`).
- **On topic.** A guide covers what its title promises. The guide writer and its reviewer are told to leave out a
  video's detours (`prompts/video-guide.md`, `video-review.md`). `pnpm engine topic-check` reads every new or changed
  guide and drops sections about another subject, with their FAQ and summary lines. It never drops more than half a
  guide: such a guide is reported instead. Found by the owner: a lighting-hours guide ended on pre-filters.
- **Photos.** No people (faces dropped), each photo must show its species, open licences or permission only.
- **Merging parallel work.** The four engine jobs run at once. Pages two jobs both write are merged by source
  (`scripts/merge-entity.mjs`), not by whole file: whole-file merging once dropped Seriously Fish's data from 32 species.
- **Sane numbers.** Figures outside plausible bounds (°F given as °C) are dropped. Where sources disagree, every page
  shows the range they all accept.
- **One copy of each figure.** The data card holds a species' figures. Quick facts drop the items the card already has
  for that source, and the family (merge, and the page for older content); a block that states a figure the card shows
  otherwise says above itself which source it follows (`@aq/schema` card-facts). Found in a review: Cá neon vua's text
  said 5 cm and pH 3,5–7,5 where its card said 3,5 cm and pH 4,6–6,2.

## Rules for every change (people and agents)

1. **A page bug comes with a check that fails without the fix**, in the same PR: a journey, a page check or a vitest
   test. Run the check against the unfixed code once to see it fail.
2. **A new kind of page needs nothing**: the page checks pick it up. **A new interactive feature gets a journey** in
   `apps/site/e2e/`.
3. **Never weaken a check to get a green run.** Fix the page. A real exception is written into the check with its
   reason (as `VIETNAMESE_ALLOWED` does for decree numbers).
4. Before merging, the gate must pass. When it can't (a check is wrong), fix the check in the same PR and say why.
5. **A Lighthouse budget only tightens.** A fix that lifts a page past its `KNOWN` entry removes the entry in the same
   PR. Loosening one needs the reason written next to it.

### main's ruleset (GitHub)

- `main` can't be deleted or force-pushed. Changes arrive by pull request, squash-merged, after the `test` check
  (ci.yml) passes. Merged branches are deleted.
- Let through: repository admins (the owner, and the owner's Mac pushing video content), and deploy keys. The engine
  pushes content over its deploy key (`ENGINE_DEPLOY_KEY`, engine.yml), since GitHub Actions' own token can't be let
  through on a personal repository. That push starts deploy.yml like a merge does.
- Secret scanning blocks pushes that contain a known kind of key. Dependabot opens PRs for vulnerable dependencies.

## Mobile apps

The iOS app (`apps/ios`, SwiftUI) is checked by `ios.yml` on every PR and push that touches `apps/ios/**` or
`protocols/**`. Android (`apps/android`) will follow the same pattern.

| Check | Catches | Where |
| --- | --- | --- |
| **Shared vectors**: device frames and replies, and saved-tank records and merges, against `protocols/*-vectors.json`, which the site's tests read too | the app and the site sending different bytes, a reply misread, tanks checked or merged differently | `swift test` in `apps/ios/AquaTomeKit` (job `kit`) |
| **Session tests** against `FakeLight`, a light that answers the way the real one did in hands-on tests | wrong order or pace of commands, overlapping commands, lost read-backs | same |
| **UI flows** (XCUITest) on the simulator, which gets the fake light | journeys that stop working: search the handbook (no accents, other names, one kind, a page opens, the Chihiros tool), find and connect, read the saved schedule and clock into the form, write a preset and put the old one back, a write ending manual levels, set a lost clock, old firmware refused, disconnect (also mid-read) | `xcodebuild test` (job `app`) |
| **Translations**: every string in the code and Info.plist has Indonesian and Thai, with the same placeholders | untranslated or broken strings | `apps/ios/scripts/check-strings.py` (job `app`) |
| **Signing**: the app archived, signed and exported as for the App Store | signing that stopped working (certificates, profiles, entitlements); App Store Connect's own checks run at the upload on main | `testflight.yml`, on a PR that changes the project, `Config/` or the workflow; on main it uploads |

Hands-on, by hand: the simulator has no Bluetooth, so a change to the Bluetooth code or to what the app sends is also run
against a real light from a Mac with `light-harness` (`apps/ios/README.md`), ending with `restore`. What the light
showed goes into the research doc, and into the vectors as captured bytes.

Rules (as for the site):
1. **A bug comes with a check that fails without the fix**: a vector, a session test or a UI flow. Run it against the
   unfixed code once to see it fail.
2. **A new device behaviour seen on hardware goes into `FakeLight` and the vectors**, so the tests know it too.
3. **Never weaken a check to get a green run.**
4. No real device names (they carry the device's address), addresses or IDs, and no signing team ID, in the repository.

Next: layer 3 reviews simulator screenshots against the site's rubric.

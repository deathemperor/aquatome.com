# Site governance: catch breakage before readers do

The site changes many times a day: the content engine every 3 hours, and code through pull requests. These checks keep
those changes from breaking pages. Each problem goes through one loop: **detect → record → fix → prevent** (a check
that would have caught it).

## Layers

| # | Layer | Catches | Runs | Status |
| --- | --- | --- | --- | --- |
| 1 | **Gate**: build tests + browser checks | broken pages, journeys that stop working, layout and translation slips | every PR (`ci.yml`), every deploy (`deploy.yml`, engine content too) | live |
| 2 | **Production watch**: the same checks against aquatome.com | page-specific content problems, deploy surprises | after each deploy and nightly; a failure opens or updates an issue | next |
| 3 | **AI page review**: Claude looks at phone screenshots against a rubric | problems no rule describes ("the results are five screens down") | on PRs for the page kinds they touch; nightly on a rotating sample | next |
| 4 | **Fix loop**: an agent turns a recorded problem into a failing check, then a fix, as a draft PR | the backlog layers 2 and 3 record | for issues with the label | next |

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
- Deploys from GitHub Actions (`deploy.yml`, which engine runs start too) run the page checks on the **real** build
  before uploading (`deploy.sh` with `E2E_GATE=1`).
- Not gated yet: `deploy.sh` run on the owner's Mac (the video cycle). Layer 2 watches production for what slips through.

## Rules for every change (people and agents)

1. **A page bug comes with a check that fails without the fix**, in the same PR: a journey, a page check or a vitest
   test. Run the check against the unfixed code once to see it fail.
2. **A new kind of page needs nothing**: the page checks pick it up. **A new interactive feature gets a journey** in
   `apps/site/e2e/`.
3. **Never weaken a check to get a green run.** Fix the page. A real exception is written into the check with its
   reason (as `VIETNAMESE_ALLOWED` does for decree numbers).
4. Before merging, the gate must pass. When it can't (a check is wrong), fix the check in the same PR and say why.

## Mobile apps (later)

The journeys describe what a reader does, not the page's code, so the same list becomes the app's flows (Maestro or
Detox), and layer 3 reviews simulator screenshots against the same rubric.

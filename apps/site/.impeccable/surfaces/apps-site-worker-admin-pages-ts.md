---
version: 1
slug: "apps-site-worker-admin-pages-ts"
primary_target: "apps/site/worker/admin/pages.ts"
related_targets: ["apps/site/worker/admin/shell.ts","apps/site/worker/admin/chart.ts"]
---

# Owner dashboard (/_ab/ in the code, dashboard.aquatome.com once Access guards it)

Scope: the owner's private dashboard, Operate mode. One reader: the owner, mostly on an iPhone, glancing several times a day, sometimes at a computer. Server-rendered HTML from the Worker (apps/site/worker/admin/*), Vietnamese, no client framework.

Task: see at once what needs doing, how each area is moving, and what happened lately; then open one area for detail. Every part loads on its own and says so in its place when it can't.

Chosen structure (owner, 2026-11-03): all three dealt layouts combined. "Cần bạn" to-dos first, then the area list (number, 30-day sparkline, change chip), then the recent days' log. Area pages keep their detail.

## Direction contract
THESIS: a hobbyist's tank log for the business: what needs you, how each area moves, what happened. It refuses a generic KPI-tile grid.
OWN-WORLD: the site's world. Blackwater bar, paper ground, plate panels, moss and rust as the only signals. Newsreader for figures and headings, Be Vietnam Pro for text, 12px plate radius, hairline rules.
STORY: the owner sees what is wrong first, then which area moves, then the last days in words; one tap opens the detail.
FIRST VIEWPORT: the bar with the date, then "Cần bạn" (count badge and cards, each with one action), then the first area rows. On a computer, areas become a left rail and the log sits beside them.
FORM: dealt structures 5, 2, 4 combined at the owner's request; seed b4742bf3.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

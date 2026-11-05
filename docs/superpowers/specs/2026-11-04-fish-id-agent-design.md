# Fish ID as an agent

Date: 2026-11-04

## Intent

The owner wants fish ID, in the app and on the site, to work as an agent, and wants that agent to be the base for later
AI features. Today it is one Claude call: Claude names the fish from the photo alone, and `match.ts` then looks up the
handbook's pages for the names it gave. The 200-photo test (`docs/review/fish-id-accuracy.md`) has Opus 5.5 right first
time on 54.5% of photos and in its top three on 70%, at 8.6 s median and $13.59 per 1,000 photos. Most misses are
look-alikes (another tetra, another Corydoras). Nothing in the photo-only call lets Claude check a guess against
anything.

The agent can check. It looks up the candidates in the handbook, opens their pages and compares the reader's photo with
their reference photos before it answers.

## Goals

- An agent core in the Worker, `apps/site/worker/agent/`, that knows nothing about fish: a tool registry, a loop with hard
  limits, cost and step accounting, and one way to end (a final answer in a JSON schema).
- Fish ID runs on it with two tools. The answer has the same shape as today, plus optional `steps`.
- Optional progress over SSE, so the app and the page can show "looking at Neon tetra…" while it works.
- The same limits, privacy and model (`claude-opus-5-5`) as today.
- Before and after numbers on the same 200 photos: accuracy, latency, cost.
- Contract changes first, in `protocols/fishid.openapi.json`, additive only.

## Not doing

- The Claude Agent SDK: it brings a CLI process and a file system, and the Worker has neither.
- Managed Agents: later, for background work (the engine's nightly passes), not for a reader waiting on a photo.
- `ask` (the agent asks the reader a question): deferred. The contract leaves room for it (below).
- Any tool that writes, or reaches anything but the handbook's own public data.

## Shape

```text
apps/site/src/pages/app/fish-id/[shard].json.ts  # the facts shards get_entry reads
apps/site/worker/
├── agent/
│   ├── loop.ts        # runAgent(): the loop, limits, usage, steps. Plain TS, no Cloudflare types
│   └── tools.ts       # Tool type: name, description, strict input schema, run()
└── fishid/
    ├── agent-tools.ts # search_handbook, get_entry over the catalog and the facts shards
    ├── claude.ts      # SYSTEM, SCHEMA, askClaude (today's single call, kept as the fallback)
    └── api.ts         # identify(): the agent when FISH_ID_AGENT=1, else today's call
```

The core is plain TypeScript, like `claude.ts` today, so `packages/engine/scripts/fish-id-accuracy.ts` runs the same
loop in Node.

## The loop

A loop we write ourselves over `messages.create`, not the SDK's tool runner. The runner is beta in SDK 1.3.0, and this is
a production path. The loop is about 60 lines: the limits, the forced last turn and the step events all sit in it.
The tool type has the runner's shape (name, description, input schema, run), so switching later is a small change.

```text
runAgent(client, model, system, tools, first message, limits, onStep)
  history = [first message]                      # photo first, then the question; append-only
  loop
    last = turns+1 == limits.turns or tool calls used up or time short or tokens used up
    r = messages.create(history, tools, format: SCHEMA,
                        tool_choice: last ? none : auto,
                        timeout: min(time left, 20 s))
    add r.usage to the totals
    if r.stop_reason is refusal          → return refused
    if r.stop_reason is end_turn         → return r's text (the JSON answer)
    for each tool_use in r (up to the calls left):
      onStep(step); result = tool.run(input), or an is_error result
    append r.content and the tool results to history
```

Checked against Opus 5.5 on 2026-11-04 (two calls, a few cents):

- `output_config.format` (json_schema) works next to `tools`. Claude called the tool, then ended with schema JSON.
- `tool_choice: none`, with the tools still defined, gives a schema answer straight away: that is the forced last turn.
  Forced choice (`any`, `tool`) returns a 400 on Opus 5.5, so `none` is the only way to force a finish.
- An image by URL inside a `tool_result` works. A 960 px photo cost about 1,000 input tokens, so a 480 px catalog thumb
  is about 300.

Settings per call: `effort: 'low'` as today, adaptive thinking (always on for Opus 5.5), `max_tokens` 4096, tools with
`strict: true` (their inputs always match the schema, so no zod). Thinking blocks stay in the history untouched.

### Limits

| Limit | Value | When it's reached |
|---|---|---|
| Model calls | 4 | the 4th call is the forced last turn |
| Tool calls | 6 in all | further `tool_use` blocks get "limit reached" results, then the forced last turn |
| Reference photos | 6 in all | `get_entry` returns facts only after that |
| Input tokens | 40,000 summed over the calls | forced last turn |
| Time | 45 s from the first call | a call never gets past the deadline; under 12 s left, the next call is the last |

Expected run: call 1 guesses and searches (~8 s), call 2 opens two or three pages (~6 s), call 3 answers (~6 s), so
about 20 s. Today's `rotate` budget is 25 s. The app's request timeout should be at least 60 s.

### Keys, the relay, failures

- Calls go through the `FISHID_RELAY` Durable Object, as today.
- Turn 1 rotates over healthy keys as today, since there's no history yet. From turn 2 the key is fixed for the run: a
  run's thinking blocks belong to it, and keys can be in different organisations.
- A call that fails after turn 1 marks its key as today's rotation does. The run then falls back to today's single call
  (`askClaude`) on the next healthy key if 10 s or more are left; otherwise it answers `unavailable`.
- A tool that throws, or an unknown id, returns an `is_error` result with a short message. That counts as a tool call.
- `stop_reason` `refusal` answers `refused`, as today. A final text that isn't the schema is `unreadable`, as today.
- The photo can carry text that tries to steer Claude. The tools read public pages only, so the worst it can do is waste
  turns, and the limits bound that.

### Caching

`cache_control` on the photo's block (the system prompt and tools are before it) and on the newest tool result. Calls
2 to 4 then read the photo and the earlier turns from cache at a tenth of the price. The system prompt plus the tools come
to over 512 tokens, the minimum for Opus 5.5. Across runs, a hit needs the same key's organisation inside 5 minutes,
so most runs won't get one. The estimate below doesn't count on it.

## Tools

**`search_handbook`**: `{ query?: string, genus?: string }`, one of them. It looks over the catalog (`/app/fish-id.json`,
already loaded by the Worker): scientific names, synonyms, every language's names and a breed's other names; `genus`
lists a genus's pages, so there's no separate `list_genus`. It returns up to 12 entries as
`{ id, kind, sci, name, basedOn? }`, text only. `match.ts`'s name normalisation is reused.

**`get_entry`**: `{ id: string }`. It returns the page's facts as short text: scientific name, family, adult size, where
it comes from, the breed's species, and the dimorphism and notes text from the page's sources (English, as the sources
give it) cut to about 600 characters. It adds up to two reference photos as image blocks (the catalog's thumb and the
page's next photo, about 480 px). The facts are a small file built with the site, `/app/fish-id/facts-<n>.json`, sharded
by id with `pageShard` and `shardCount` as the app's pages are (about 8 pages a shard). The Worker reads one shard
through `ASSETS` per call. The app's page shards don't fit: they hold rendered blocks in the reader's language. 355 of
1,315 species have no photo. For those it says "no reference photo" and Claude answers on what it has.

The final answer is today's `SCHEMA`, plus an optional `id` on each guess: the handbook id it looked at. `match.ts` tries
that id first, then the name as today, so a guess it checked links to the page it checked.

## Contract (additive, in `protocols/fishid.openapi.json`)

This change goes in after #455 merges, as the first commit of the build PR. The lead gets the PR number before any Worker
code.

```diff
 Identification:
   required: [verdict, results, model]
   properties:
     verdict, results, model, refused
+    steps:
+      type: array
+      description: What the agent looked at, in order. Missing when it didn't use the handbook.
+      items: { $ref: Step }
+Step:
+  type: object
+  required: [kind]
+  properties:
+    kind: { enum: [search, look] }      # search: it searched the handbook; look: it opened a page
+    query: { type: string }             # search: the name or genus it searched for
+    page: { $ref: Linked }              # look: the page, in the reader's language
+  additionalProperties: false
```

SSE: a request with `Accept: text/event-stream` gets `200 text/event-stream`, but only after admission. Every refusal
before a call (400, 401, 403, 413, 415, 429, 503) stays the JSON error with its status, as today. On the stream:

```text
event: step     data: Step            (zero or more)
event: result   data: Identification  (the same body as the JSON answer, steps included)
event: error    data: Error           (failed | unavailable | resting, after the stream began)
: ping                                (every 10 s, so no proxy closes it)
```

The stream ends after `result` or `error`. The app has one rule: send the header always. With the agent off, the
stream carries no steps, then the result. Without the header, the answer is JSON as today, with `steps` in it.

A ping is sent only while waiting for Claude: the ping timer stops before the result is read, and the result event is
written the moment it is, then the stream closes. A slow connection never holds a finished result behind pings.

Retries and the reader's day (the app's ask):
- An optional `Idempotency-Key` request header (a UUID the app makes per photo it sends). The run goes on even if the
  client goes away (`waitUntil`), and its result is kept for 15 minutes under the reader and that key. A retry with the
  same key gets the kept result, as JSON or as one `result` event, with no new run and no new count.
- The reader's use is taken at admission, as today, so parallel requests can't pass the limit. A run that ends with
  no result (`failed`, `unavailable`, `resting` after admission) gives it back. A run that produced a result counts,
  whether or not the stream delivered it, because the retry can fetch it. The JSON path follows the same rule: today a
  failed call still counts, and after this it doesn't.

`ask` later: one more event (`event: ask`, a question and choices) and a second request that answers it. Nothing above
has to change for it.

## Limits, privacy, cost

- An identification counts once against the reader's day (`perIp`, `perAccount`) and the site's (`FISH_ID_PER_DAY`),
  however many calls it makes.
- The site's daily KV counter (api.ts, one value a day) gains `usd`, the day's spend at list price. Over
  `FISH_ID_USD_PER_DAY` (default $15) it answers `busy`, as for the count. Analytics Engine can't be read back in the
  Worker, so the counter is the cap.
- Privacy is unchanged. The photo goes to Anthropic only and is never stored. The tools read public pages. The log keeps
  counts and the steps' kinds, never the search text.
- Estimated cost: 3 calls with 4k to 6k input tokens each, mostly cached after the first, comes to $40 to $70 per 1,000
  photos (today $13.59). The test below replaces the estimate with a number.

## Log (`log.ts`)

`CallLog` gains `turns` (double8), `tools` (double9), `refs` (double10, reference photos shown) and `stopped` (blob10:
`answer`, `calls`, `tools`, `time`, `tokens`, `fallback`). The dashboard's fish-ID page shows turns and cost per
identification next to today's columns.

## Before and after

`fish-id-accuracy.ts` gains `--agent` and `--max-turns`. It runs the same 200 photos with the same seed and writes a
second table into `docs/review/fish-id-accuracy.md`. Two runs:

- `--agent` (4 calls): the agent.
- `--agent --max-turns 2`: one search and one look, then answer. A fixed check-your-guess workflow, for comparison.

Expected spend: about $15 to $25 in API calls.

The flag `FISH_ID_AGENT` is turned on in production when, on the 200 photos:

- top-1 is at least 5 points better (54.5% → 59.5% or more), and top-3 is no worse;
- median time is 20 s or less, and the 95th percentile 40 s or less;
- cost is $70 per 1,000 photos or less.

Otherwise it stays off, and the numbers go to the lead and the owner.

## Tests

- `worker/agent`: a scripted fake Claude through `deps.fetch` (tool_use, tool_result, final answer). It checks the tool
  inputs, the history order, that the last call has `tool_choice: none`, and that each limit ends the run (calls, tool
  calls, photos, tokens, time with a fake clock). A refusal and a non-schema answer are covered too.
- The facts shards: built from the fixture content, every catalog id in exactly one shard.
- `fishid`: search over the fixture catalog (name, synonym, genus, a breed's other name), `get_entry` for a species, a
  breed and a page without photos, the fallback after a failed turn 2, the `usd` cap, and SSE's event order. Each
  response is checked against the contract, as the photo tests do.

## Order

1. This design, for the native lead's comments.
2. After #455: the contract commit (`steps`, `Step`, SSE), and its PR number to the lead.
3. The Worker code behind `FISH_ID_AGENT` (off), with the tests and the script's agent mode.
4. The 200-photo run, its numbers in `fish-id-accuracy.md`, and the flag decided by the rule above.
5. The site's fish-ID page shows the steps (the site's own PR).

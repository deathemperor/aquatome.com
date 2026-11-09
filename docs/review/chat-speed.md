# Chat: time to the first words

2026-11-08 23:21 UTC, `packages/engine/scripts/chat-speed.ts`, the chat's code at `88c01184f`, claude-haiku-5-5, over https://aquatome.com's handbook, 4 at a time, from this Mac straight to Anthropic's API. Not timed here, as the Worker adds them: each call's hop to the relay in eastern North America, and the Worker's own steps before the first call (the session, the conversation, the ledger) and after the last (saving the turn, which today comes before the first words).

## The hard problems (each post whole, and its short question with the saved tank)

| First words | Median | 90th percentile |
| --- | --- | --- |
| **Today**: with the whole answer (96 turns) | 17.3 s | 20.7 s |
| **Streamed** (96 turns) | 12.7 s | 17.2 s |
| Today's turns, had they streamed (their answer call's first words) | 13.7 s | 17.0 s |

Streamed against today, question by question: ×0.78 at the median (×0.57 to ×1.04, the 10th to the 90th percentile).

Where today's wait goes: each step's share of the time over the 96 turns, its time in an average turn, and its own median and 90th percentile over the turns (those don't add up to the turn's).

| Step | Share | An average turn | Median | 90th percentile |
| --- | --- | --- | --- | --- |
| Reading calls: waiting for each one's first token | 14% | 2.4 s | 2.3 s | 3.2 s |
| Reading calls: the rest (thinking, writing the tool calls) | 23% | 3.9 s | 3.9 s | 5.6 s |
| Tools between calls (the handbook, the tanks) | 1% | 0.2 s | 0.1 s | 0.3 s |
| A key refused, the next one tried | 0% | 0.0 s | 0.0 s | 0.0 s |
| The answer call: waiting for its first token | 5% | 0.8 s | 0.7 s | 1.0 s |
| The answer call: its first token to the first words (thinking) | 37% | 6.2 s | 6.1 s | 9.3 s |
| The answer call: the first words to its end (writing) | 20% | 3.4 s | 3.4 s | 4.3 s |
| Other (before the first call, the blocks filled after) | 0% | 0.0 s | 0.0 s | 0.0 s |
| **The whole run** | 100% | 16.9 s | 17.3 s | 20.7 s |

Calls a turn: median 4, 90th percentile 5. The first call's input: median 5384 tokens, none read from cache. A call's first token: median 0.7 s.

Streamed: 0 of 96 answers had a tool call dropped once their text showed; 0 had a step after their first words. Off topic (its line comes whole): 0.

## Everyday questions (short, from a species page, from fish ID; four languages)

| First words | Median | 90th percentile |
| --- | --- | --- |
| **Today**: with the whole answer (20 turns) | 10.3 s | 14.6 s |
| **Streamed** (20 turns) | 9.4 s | 11.8 s |
| Today's turns, had they streamed (their answer call's first words) | 7.3 s | 10.8 s |

Streamed against today, question by question: ×0.90 at the median (×0.62 to ×1.08, the 10th to the 90th percentile).

Where today's wait goes: each step's share of the time over the 20 turns, its time in an average turn, and its own median and 90th percentile over the turns (those don't add up to the turn's).

| Step | Share | An average turn | Median | 90th percentile |
| --- | --- | --- | --- | --- |
| Reading calls: waiting for each one's first token | 22% | 2.3 s | 2.2 s | 3.0 s |
| Reading calls: the rest (thinking, writing the tool calls) | 21% | 2.2 s | 1.8 s | 2.8 s |
| Tools between calls (the handbook, the tanks) | 0% | 0.0 s | 0.0 s | 0.1 s |
| A key refused, the next one tried | 0% | 0.0 s | 0.0 s | 0.0 s |
| The answer call: waiting for its first token | 7% | 0.8 s | 0.7 s | 0.9 s |
| The answer call: its first token to the first words (thinking) | 25% | 2.6 s | 2.1 s | 4.1 s |
| The answer call: the first words to its end (writing) | 24% | 2.5 s | 2.2 s | 3.5 s |
| Other (before the first call, the blocks filled after) | 0% | 0.0 s | 0.0 s | 0.0 s |
| **The whole run** | 100% | 10.4 s | 10.3 s | 14.6 s |

Calls a turn: median 4, 90th percentile 5. The first call's input: median 5360 tokens, none read from cache. A call's first token: median 0.7 s.

Streamed: 0 of 20 answers had a tool call dropped once their text showed; 0 had a step after their first words. Off topic (its line comes whole): 0.

Cost: $0.913 for 232 turns.
## The network, measured from this Mac (9 Nov)

- To Cloudflare, as a phone in Vietnam reaches it (Singapore): about 50 ms a round trip.
- To Anthropic's API: its own front is in Singapore too (about 32 ms), and its answers come from the United States, so
  about 0.26 s of each call's wait for its first token (0.7 s at the median) is that crossing.
- The Worker's calls cross the same way, through the relay in eastern North America (fishid/relay.ts): estimated about
  the same a call, not measured while chat is off.
- The answer's pieces to the phone: one Singapore leg each, about 25 ms.

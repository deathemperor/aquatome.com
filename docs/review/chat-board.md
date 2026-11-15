# Chat: the troubleshooting board

`packages/engine/scripts/chat-board.ts`. It holds our chat against plain Claude on 75 readers' public forum posts about a
tank in trouble: 15 each on fish dying, sick fish, algae, cycling and stocking. Each post is asked three ways: whole with
no saved tank, whole with the reader's tank saved, and as a short question with the tank saved (the owner's own kind).
The judge reads both answers in both orders, and a side wins a pair only when both orders pick it. A fixed third of the
posts may be tuned on; the other 44 are held out, and a change merges on those. The posts stay out of the repository,
so this page gives counts only.

## Board 1: today's chat against plain Opus (15 Nov 2026)

Our chat as on main on 13 Nov, writing with claude-haiku-5-5 over the live handbook, against claude-opus-5-5 with no
handbook and no tools, given the question and, where a tank is saved, its facts in the reader's words. Our answers were
written on 13 Nov, and plain Opus's then too, but for the few it lacked, written at the start of the run. The judge was
claude-opus-5-5, after midnight on 15 Nov. The run cost $33.87 on the owner's subscription.

| | Posts | Ours better | Theirs better | Tie | Score | Mistakes an answer | Mistakes, ours less theirs (90% range) |
|---|---|---|---|---|---|---|---|
| **All** | 75 | 10 | 201 | 14 | 4.9 v 7.4 | 1.89 v 0.58 | +1.32 (+1.15 to +1.48) |
| Whole post, no saved tank | 75 | 5 | 66 | 4 | 4.9 v 7.3 | 1.93 v 0.61 | +1.31 (+1.07 to +1.55) |
| Whole post, tank saved | 75 | 3 | 68 | 4 | 5.0 v 7.5 | 1.75 v 0.48 | +1.27 (+1.05 to +1.49) |
| Short question, tank saved | 75 | 2 | 67 | 6 | 4.8 v 7.5 | 2.00 v 0.63 | +1.37 (+1.11 to +1.61) |
| Fish dying | 15 | 2 | 39 | 4 | 5.0 v 7.2 | 2.07 v 0.51 | +1.56 (+1.30 to +1.81) |
| Sick fish | 15 | 2 | 42 | 1 | 4.9 v 7.5 | 1.88 v 0.50 | +1.38 (+1.02 to +1.73) |
| Algae | 15 | 1 | 40 | 4 | 5.1 v 7.5 | 1.61 v 0.71 | +0.90 (+0.53 to +1.24) |
| Cycling | 15 | 3 | 39 | 3 | 5.2 v 7.5 | 1.94 v 0.29 | +1.66 (+1.36 to +1.97) |
| Stocking | 15 | 2 | 41 | 2 | 4.3 v 7.5 | 1.97 v 0.87 | +1.10 (+0.63 to +1.54) |
| Held out (never tuned on) | 44 | 5 | 117 | 10 | 4.9 v 7.4 | 1.88 v 0.45 | +1.42 (+1.22 to +1.61) |

Plain Opus is far ahead on every subject and in every form, held-out posts included. Our answers make about three times
the mistakes. Part of the gap is likely the model: the chat writes with Haiku, and plain Claude here is Opus. The next
board tests that, with Haiku, Sonnet and Opus each writing our chat against plain Opus on the 44 held-out posts, asked
the owner's way.

The board ran from a checkout 178 commits behind main, so it read 13 Nov's ceilings and spent $34 that main had given
the engine. A board step that calls a model now runs only when the checkout's ceilings are main's, and main can be
fetched (`ceilingsAsMain`, `packages/engine/test/ceiling.test.ts`).

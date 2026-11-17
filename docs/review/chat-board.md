# Chat: the troubleshooting board

`packages/engine/scripts/chat-board.ts`. It holds our chat against plain Claude on 75 readers' public forum posts about a
tank in trouble: 15 each on fish dying, sick fish, algae, cycling and stocking. Each post is asked three ways: whole with
no saved tank, whole with the reader's tank saved, and as a short question with the tank saved (the owner's own kind).
The judge reads both answers in both orders, and a side wins a pair only when both orders pick it. 31 of the posts,
chosen by a hash of their id, may be tuned on; the other 44 are held out, and a change merges on those. The posts
stay out of the repository, so this page gives counts only.

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

## Board 2: the chat's model, asked the owner's way (16 Nov 2026)

Our chat as on main on 15 Nov, over the live handbook with the reader still on the screen, writing with each of three
models, against board 1's plain claude-opus-5-5. Each of the 44 held-out posts was asked as a short question with the
tank saved. One more arm ran the chat's own prompts and tools through Claude Code on the subscription, writing with Opus
(the chat's copy on the CLI). claude-opus-5-5 judged on 16 Nov. The real chat's answers were billed on the chat's keys:
$7.19 on 15 Nov, then $7.52 on 16 Nov through the billed line for Opus's other 32. The judge and the CLI copy cost $22.50
on the subscription.

| Our chat writing with | Posts | Ours better | Theirs better | Tie | At least as good | Score | Mistakes an answer | Mistakes, ours less theirs (90% range) | First words, median / slowest tenth | Cost an answer | Answers a day at $50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 (on main now) | 44 | 2 | 38 | 4 | 14% | 5.0 v 7.4 | 2.47 v 0.48 | +1.99 (+1.64 to +2.33) | 16.6 / 24.6 s | $0.0064 | about 7,800 |
| Sonnet 5.5 | 44 | 8 | 30 | 6 | 32% | 5.9 v 7.0 | 1.90 v 0.55 | +1.35 (+1.02 to +1.68) | 15.8 / 20.6 s | $0.099 | about 500 |
| **Opus 5.5** | 43 | 21 | 11 | 11 | 74% (63 to 86%) | 7.0 v 6.5 | 1.06 v 0.85 | +0.21 (-0.19 to +0.62) | 19.6 / 28.1 s | $0.228 | about 220 |
| Opus 5.5, the chat's copy on the CLI | 44 | 22 | 11 | 11 | 75% | 7.1 v 6.5 | 1.49 v 0.81 | +0.68 (+0.28 to +1.08) | 16.3 / 21.4 s | $0.148 | about 340 |

Opus in the real chat, by subject:

| | Posts | Ours better | Theirs better | Tie | Score | Mistakes an answer | Mistakes, ours less theirs (90% range) |
|---|---|---|---|---|---|---|---|
| Fish dying | 10 | 7 | 1 | 2 | 7.3 v 6.0 | 0.95 v 0.80 | +0.15 (-0.55 to +0.85) |
| Sick fish | 10 | 1 | 5 | 4 | 6.3 v 7.3 | 1.35 v 0.35 | +1.00 (+0.30 to +1.70) |
| Algae | 11 | 7 | 1 | 3 | 7.6 v 6.1 | 0.27 v 1.41 | -1.14 (-1.55 to -0.77) |
| Cycling | 6 | 4 | 1 | 1 | 7.4 v 6.3 | 1.00 v 0.67 | +0.33 (-0.33 to +1.08) |
| Stocking | 6 | 2 | 3 | 1 | 6.2 v 6.5 | 2.25 v 0.92 | +1.33 (+0.08 to +2.67) |

Most of board 1's gap was the model. Writing with Opus, our chat is at least as good as plain Opus on three posts in
four, and its mistakes are within the board's range of plain Opus's. On algae it makes fewer. Sick fish and stocking
stay behind on every model: there our answers still make more mistakes than plain Opus's, with the range above zero.

How the answers ended: Haiku wrote to its end on 22 of 44, ran out of time on 16 and reached the read cap (60,000 tokens)
on 6. Sonnet: 22, 3 and 19. Opus: 15, 22 and 6, and one sick-fish post got no answer, no key answering for 48
seconds; that post is left out of Opus's pairs. Each out of time still gave an answer, written in the last seconds.

The tank review, one question ("is my tank all right?") on 15 saved tanks: today's chat (Haiku), with the tank, was better
than plain Opus given only the question on all 15, scoring 6.4 v 2.6. It made 1.80 mistakes an answer against 0.30
(+1.50, +1.00 to +2.03).

Which model the chat writes with is the owner's choice.

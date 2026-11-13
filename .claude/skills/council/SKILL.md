---
name: council
description: Use when the owner asks for the council, a council review, or several models to review or score work (a PR, a diff, a design, UI screenshots), or to keep iterating until the council agrees on a score.
---

# The council

One strong model from each of four providers reviews the same work, and each scores it out of 10. Their findings are
summarised together: what they agree on, where they disagree, and what to do next. Asked to "go until the council
agrees", fix and review again, round after round, until every seated member scores at or above the bar the owner set
(9/10 if they named none).

Scores are vibes: the same screenshot can get three different scores from one model. That is why it takes several
models, and why a high score from all of them means something.

## The seats

Fill a seat by putting its provider and model in. Run `orchestrator_capabilities` first: a seat whose provider isn't
available there sits out, and the report says so. Never fill an empty or unavailable seat with another provider's model.

| Seat | Provider (Infinitus `providerInstanceId`) | Model | Options |
|---|---|---|---|
| Anthropic | `claudeAgent` | `claude-opus-5-5` | `effort: xhigh` |
| OpenAI | `codex` | `gpt-6.1-sol` | `reasoningEffort: xhigh` |
| Google | `cursor` | `gemini-4-argon` | `reasoning_effort: high` |
| xAI | `cursor` | `grok-4.7` | `reasoning_effort: xhigh` |
| Muse | (to fill: `muse`) | (to fill) | |
| Jester (below) | empty: Gemini sits as Google's member (2026-11-07) | | |

The `cursor` seats go through the owner's Cursor subscription; if `cursor` isn't signed in, they sit out. Google is out
for now: Cursor still refuses `gemini-4-argon`. OpenAI's seat is Sol on Codex, never Terra. Each model names its own
options (`reasoning`, `reasoning_effort` or `reasoningEffort`): a wrong name is refused, so copy them from here.

## A round

1. **One brief, the same for every member.** Include:
   - what to review: the PR number, branch, worktree path or files; for UI, the screenshots, before and after;
   - what it's for, and the owner's words;
   - the bar;
   - "Read only: change nothing, push nothing, build nothing";
   - what to answer: a score out of 10, the reasons for it, and the findings, most important first, each with where and
     a concrete failing case.
2. **Send it** to each seated member with `delegate_task` (`role: review`, the seat's `target`), all at once, and wait
   for every answer.
3. **Read the answers.** Check each finding against the code before acting on it: a member can be confidently wrong.
4. **Summarise**:
   - each member's score;
   - the findings two or more raised;
   - the ones only one raised that hold up;
   - the disagreements;
   - the next steps.

A full review pass is one round. A fresh review after fixes is a new round, with a new brief naming what changed since
the last round.

**UI.** Members score screenshots, not code. Take them from the simulator (the device tools, `PageShotsFlowTests`'
`shot-…` attachments) or the site's before and after shots, the same set each round, light and dark.

## The record

In the PR's description, under `## Council`, a table: one row per round, one column per seated member, each cell that
member's score. The jester has no column. Leave out empty seats, and say which seats sat out and why.

## The jester

If the Jester seat is filled and available, send it the same brief as the others. Don't tell it it's the jester.

- Ignore its score, and leave it out of the PR.
- Act on a finding of its only if another member raised it too, or the code shows it's right.
- In the final reply only, list anything wrong or funny it said or did, under **Gemini flub**.

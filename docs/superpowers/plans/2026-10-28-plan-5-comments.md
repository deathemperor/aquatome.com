# Plan 5 — Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Name-only comments on species, plant and guide pages.
- **On submit:** a Turnstile check plus instant rules. Clean comments appear immediately; suspicious ones are held and hidden.
- **Daily Claude pass on the home machine:** removes spam and abuse, approves held comments that are fine, and marks helpful answers ("Trả lời hay").
- **Decree 147 hook:** a pluggable user-verification hook, off by default.

**Architecture:**
- **Storage:** D1 table `comments`.
- **Worker routes:**
  - `GET /_c?e=` returns approved comments as JSON (edge-cached 60 s, purged on new approvals).
  - `POST /_c` checks Turnstile, runs the rules and inserts the comment.
  - Admin routes (`/_c/admin/*`, token) serve the moderation queue and accept decisions.
- **Rate limiting:** a KV counter keyed by an HMAC of IP + day with a 24 h TTL. The raw IP is never stored.
- **Site:** `Comments.astro` replaces the placeholder. It has a progressive form, loads the list client-side and includes the Turnstile widget.
- **Moderation:** the `packages/engine` command `pnpm engine moderate` runs on the home machine every day (launchd) through `claude -p` with a lean prompt.

**Spec:** §8.

## Global Constraints

- **Required fields:** name (1–40 chars) and body (2–2000 chars). Email, account and IP are not stored.
- **Instant rules → held:** more than 1 link, any `<`, a duplicate body within 24 h, more than 5 posts per day from the same IP-hash, a blocked-term list hit, or a Turnstile failure (rejected outright).
- **Output:** comments are plain text, rendered escaped, with links not clickable.
- **Moderation actions** are `approve | remove | keep_held` plus `helpful: boolean`. Every decision is logged with its reason, and removed comments are kept 30 days for appeal, then deleted.
- **Decree 147 hook:** `verifyCommenter(req, env): Promise<'ok' | 'verification_required'>` defaults to `ok`. When `COMMENT_VERIFICATION=phone` it returns `verification_required` until a pluggable provider confirms the commenter, and the UI shows a notice. No provider is wired in yet; this is an owner decision.
- **Indexing:** comments load client-side and are not part of the indexed static HTML.

## Review Focus

1. An XSS payload in the name or body renders inert. (Task 3 test.)
2. A held comment is never returned by the public GET. (Task 2 test.)
3. Rate limiting works without storing the IP. (Task 2 test.)
4. Moderation can't run without the admin token, and an unknown comment id is a no-op. (Task 4 test.)

### Task 1: D1 schema
Migration `0002_comments.sql`:
- `comments(id TEXT PK, entity_ref, name, body, status CHECK IN ('approved','held','removed'), helpful INT, reason TEXT, created_at, decided_at)`
- index `(entity_ref, status, created_at)`

### Task 2: Worker API
- `worker/comments/{rules.ts,api.ts}`.
- `checkRules(input, ctx) → {ok} | {held: reason} | {reject: reason}`.
- Turnstile verify through `https://challenges.cloudflare.com/turnstile/v0/siteverify` with secret `TURNSTILE_SECRET`.
- Tests:
  - rules truth table
  - GET filters to approved
  - the rate limit uses the HMAC key
  - a Turnstile failure → 403
  - verification hook in phone mode → 403 with `verification_required`

### Task 3: Site component
- `Comments.astro` contains:
  - a `<section data-comments data-entity="species:…">` element
  - a form (name, body, Turnstile widget with `PUBLIC_TURNSTILE_SITEKEY`)
  - a list rendered with `textContent`
  - a "Trả lời hay" badge
- It shows a held message after submit ("Bình luận đang chờ duyệt"). It works on all skins.
- Tests: the build includes the section on species, plant and guide pages, and the list renderer escapes HTML (unit test of the renderer function).

### Task 4: Daily moderation
- `packages/engine/src/moderate.ts` fetches `/_c/admin/queue` (held, plus approved in the last 48 h), sends batches of 50 to Claude with `prompts/moderate.md` (Vietnamese context; spam, abuse, off-topic ads, personal data → remove; helpful = accurate and answers a question), then POSTs the decisions.
- CLI: `pnpm engine moderate`. The launchd agent `run.thuysinh.moderate` runs daily at 04:00.
- Tests: a fake LLM and fake admin API; invalid output is retried once; unknown ids are ignored.

### Task 5: Deploy
- Create the Turnstile widget (API, or `request_secret` if the token lacks permission), set the secrets, apply migrations, deploy.
- Verify live: post a comment, it appears, a link-spam comment is held, the moderation run approves or removes it.
- PR → merge.

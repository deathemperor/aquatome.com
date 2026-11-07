# Chat, starting from fish ID

Date: 2026-11-07

The brief the owner decided on (2026-11-06), and how the contract (`protocols/chat.openapi.json`) carries it. Phase 1:
the contract first, then the Worker's agent and tools, then the app's and the site's chat screens, one contract for both.

## Job and audience
A hobbyist with a phone, often at the tank, who has just named a fish with fish ID, or is about to buy one, and now has the next question: how do I keep it, will it live with my neons, what tank and filter, what will it cost, why is it hiding. Today the answer is a page away and the reader must know which page. Mode: Operate (a conversation that does things) wrapped around Read (our pages).

## Outcome and proof
- The reader gets an answer they can act on in one or two turns: what to do, with the figures, and a way to do it (save to a tank, open the tool already filled, buy the gear).
- Every figure and claim comes from our handbook: species pages, guides, equipment pages, glossary, tools. A block shows our data, not the model's memory: the model picks which page, section or tool. The app or site then draws the block from our published data. A figure can't be made up because the model never writes figures into a card.
- Proof that it works: a set of real questions with expected pages (an eval like fish ID's), and the transcripts kept for a year, as fish ID's will be.

## Selected direction: answers as rich, interactive blocks
A reply is a short text (two or three sentences, in the reader's language) followed by blocks. The model chooses the blocks and what they point at. The renderer fills them from our content.

| Block | Shows | Interaction |
|---|---|---|
| Species card | photo, names, temperature, pH, size, tank, difficulty, schooling | open the page; "Thêm vào bể"; "So sánh" |
| Comparison | two to four species' figures side by side, the differences marked | swap a species |
| Tank-mates verdict | our tank-check run on the reader's tank (or the fish named), warnings, the tank they need | "Lưu vào bể của tôi"; change the count |
| Guide excerpt | the guide's title and the one section that answers, with its photo | read the whole guide |
| Gear | an equipment kind: what to look for at this tank's size, our picks with shop links (affiliate note as today) | open the kind's page; the shop |
| Tool | the volume calculator, setup budget or tank-mates tool, inline and pre-filled from the conversation | edit in place; save the result |
| Gallery / video | our photos or video for the fish or the setup | full screen |
| Term | a glossary word explained in place | open the term |
| Suggestions | two or three next questions as chips | tap to ask |

Most of these exist already as page blocks the app and site draw (`cards`, `table`, `mates`, `gallery`, `videos`, `faq`, `pages`): the chat reuses them and adds species card, gear, tool and suggestions.

**Entry points:**
- **First:** the fish-ID result gets "Hỏi về loài này", which opens the chat with that species, and the photo's result as context, in the app and on the site. A species page gets the same.
- **Later:** a chat entry on Tìm.

**How it answers:** an agent on the same core as fish ID (`apps/site/worker/agent/`), with tools over our content:
- search the handbook;
- read a page's section;
- read a guide;
- list equipment;
- run tank-check;
- price a setup;
- read the reader's tanks when signed in.

It answers in a schema of text plus blocks, streamed (SSE), as fish ID's steps are.

## Scope and boundaries
- **Phase 1, app and site together (the owner's choice):** the contract (`protocols/chat.openapi.json`) first, then the Worker's agent and tools, the app's chat screen and the site's, both from fish ID and species pages, the blocks above, the eval set, transcripts.
- **Phase 2:** the entry on Tìm, and more tools as they come (dosing).
- **Anti-goals:**
  - no answer without our content behind it;
  - no figures typed by the model into a card;
  - no medical or chemical dosing beyond what a guide says;
  - no chat that forgets the reader's tank once it's been named;
  - not a general chatbot.

## States
- **Account:** signed in (its tanks available) or signed out (the account's sign-in first, as fish ID in the app today).
- **Coverage:** a question our content doesn't cover. The reply says so plainly and offers the nearest page. It's counted as a "wanted" topic, as fish ID counts a fish with no page.
- **Failures and limits:** offline, the daily limit, a slow answer (the text streams first, blocks as they're ready).
- **Languages and display:** long Indonesian and Thai labels, the largest text size, VoiceOver reading the blocks in order.

## Constraints
- **Languages:** vi, id, th.
- **Strings:** checked as today.
- **Model:** the same keys, ledger and daily USD cap as fish ID.
- **Cost:** chat turns are longer than an identification, so the cap and per-reader limits need their own numbers.
- **Privacy:** transcripts kept 365 days as fish ID's (the owner's decision); photos only when kept; the privacy page says so.
- **App:** blocks drawn natively (SwiftUI), as pages are.

## The owner's decisions (2026-11-06)
1. **Our content only.** When we lack it, the reply says so, offers the nearest page, and the question counts as a wanted topic.
2. **Signed-in readers**, with a daily limit per reader and the site's USD cap.
3. **App and site together**, on one contract.
4. **Opus 5.5**, with an eval of real questions deciding whether a cheaper model holds.

## The contract's blocks

The table's nine blocks come as four, so the Worker fills each from data the app and the site already read:

- Species card → `species` (the app index's figures: a species' or breed's `facts`, a plant's `plant` on the plants'
  1–3 scale; the page linked as fish ID links one).
- Comparison → `compare` (two to four `species`; the client marks the differences).
- Guide excerpt, gear, term, gallery or video → `section`: one section of the page as the app's copy of it has it (a
  guide, an equipment kind, a glossary term, a species' photos and videos), every block under its heading to the next,
  those of `protocols/page.schema.json`.
- Tank-mates verdict and tool → `tool`: the tool's own link with its inputs filled, each tool's as its page reads them
  (the volume tool's sizes with `hinh`, the budget tool's with `co=khac`). A tank-mates verdict is the client's tank
  check of the link's fish, as the tool's page draws it.
- Suggestions → the turn's `suggestions`, not a block.

## Decided with the leads (2026-11-07)

- **The Worker fills the blocks** from published data, as fish ID links its guesses: both clients show the same
  figures, and an app with an old index still shows today's. A `section` carries the page's blocks for the app, and the
  site's chat draws it from the web page itself: the element with the heading's id (the heading, to the next one, or
  the `section` or `article` holding it). Every heading the app's copy of a page has is on the web page with the same
  id, and neither copy runs into the next section (`apps/site/test/chat-sections.test.ts`).
- **The Worker keeps a conversation for 24 hours** from its first question, under the account, so a client can't send
  forged earlier turns, and later questions carry no history. It lives in R2, which reads its own writes (KV can show a
  stale conversation for up to a minute at another location, as when a phone changes networks between turns), under its
  own prefix with a 1-day lifecycle rule, so it is deleted a day or two after its last question. The client starts a new
  conversation once the first question is 24 hours old; one the Worker no longer holds is taken as new (`n: 1`). The
  365-day transcripts are kept apart.
- **Signed-in only**, the site's page same-origin with the session cookie and no Turnstile, the app with its bearer;
  counted per account on fish ID's ledger, under the site's dollar cap.
- **A retry with the same `Idempotency-Key` while the run is still answering waits for it** and gets its turn,
  counted once: the phone drops the stream when the reader leaves the app mid-answer, and resends on return.
- **`done` replaces what was streamed**: the app draws the turn again from it.
- **Fish ID hands over its guesses** (`identified`), not the photo.
- **The limits and the 60 s a turn are placeholders** until the eval of real questions sets them.
- **The app** syncs the account before the first question, and starts a new conversation when the account changes.

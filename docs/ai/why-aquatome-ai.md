# Why a hobbyist would ask AquaTome's AI, not a general chatbot

2026-11-07. The owner: "AI can be very helpful in helping hobbyists in solving hard problems like algae … there must be
reasons users choose us instead."

**The bet.** A general chatbot gives a decent generic answer. It doesn't know your tank or see what your lights do. Its
figures have no source behind them, and it forgets you by next week. Algae, setting up a tank, cycling, sick fish and
stocking all depend on the particular tank and take weeks to fix. That is where we can win.

## What sets us apart

| | Today | Saved by the app, not yet read by the chat | To build |
| --- | --- | --- | --- |
| **Grounded in a cited handbook** | About 900 guides: some 70 on algae, 23 on cycling, 54 on disease, over 100 on light, CO₂ and fertiliser. 747 fish, plants and breeds with sourced figures. The chat answers only from them, and a card's figures come from the page, never from the model. | | The source under each claim. |
| **Knows your tank** | Size, and fish with counts, from "Bể của tôi". | Plants, substrate, notes, each light's schedule with on, off, ramp and levels, and what each plug powers. | The chat reads the whole tank. |
| **Tools a chatbot lacks** | The tank-mates check, which is our code and not the model's guess. Volume, budget at Vietnamese shop prices, fish ID from a photo. | | Algae ID from a photo. Changing a light schedule from the answer once the reader confirms. |
| **Local** | Vietnamese hobby names. "Nuôi ở Việt Nam" notes on every fish for the northern winter, southern cool nights and summer heat. Shop price ranges, Shopee links on equipment. | | Tap water by city. Seasonal advice, since summer heat brings algae and low oxygen. |
| **Follows up over weeks** | A conversation lasts 24 hours and is kept under the account. | | A tank journal of water tests, water changes and photos that the chat reads. Check-ins a week later. |
| **What worked for others** | Nothing yet, and we won't invent it. | | Outcomes readers choose to report, once the owner OKs the privacy side. |

**Today's limit on hard problems.** An answer is two or three sentences plus up to five blocks, such as a card, a guide's
section or a tool, within 5 model calls and 27 seconds. That fits "can a betta live with neons?". "My tank is full of
hair algae" needs a plan in steps that fits the tank. The eval will show how much this costs us.

## The five hard problems, and how we solve each

1. **Algae.** Name the algae from a photo, with fish ID's pipeline and an algae catalogue built from our guides. Read the
   tank: light hours from the saved schedule, CO₂ plug times, plants, tank age. Give a step plan from our algae guides
   that fits that tank ("your light runs 10 hours at full power, and the guide says…"), and offer to change the
   schedule. Check back in a week with a new photo.
2. **Setting up a tank.** A planner. Size, budget and style give the kit at Vietnamese price ranges from the budget
   tool, plants and fish that fit by the tank-mates check and climate notes, and a cycling plan. It saves as a tank in
   "Bể của tôi".
3. **Cycling a new tank.** A day-by-day plan from our cycling guides, reminders to test and change water, and readings
   kept in the journal. The chat answers "can I add fish now?" from the reader's own readings.
4. **Sick fish.** Symptoms and a photo lead to the likely causes from our disease guides, then first aid and quarantine.
   Doses only as a guide gives them, never made up. It asks what changed in the tank lately, then checks back.
5. **Stocking.** Our strongest today. The tank-mates check runs on the reader's own tank and says how full it is. Next,
   add adult size and the climate notes, and suggest fish from the handbook that fit.

## Two more of the owner's ideas

**Ask the AI to run the equipment.** "Dim the lights", "feeding mode", "run my master button". Only our app drives the
reader's lights and plugs, so no general chatbot can do this.
- How. The chat proposes an action in its answer. The Worker checks it against the reader's saved devices: the device
  exists, the values are in range, and it marks whether the gear keeps the fish alive. The app shows what changes, from
  what to what. Nothing happens until the reader taps to confirm, and the app's own control code carries it out. The
  next turn hears whether it worked.
- Safety. A heater, filter or air pump never switches off without its own explicit confirmation and a warning. A
  timed action such as feeding mode ends on the plug's own countdown, so the filter comes back on even if the phone is
  gone. Web Bluetooth can't run on an iPhone browser, so there the card says to open the app.
- Cost. No extra model spend: it happens inside the chat turn, about a third of a cent. The work is a new answer block
  in the contract, the Worker's checks, and the app's confirm card. The iOS lead owns the app side.
- Where. Its first use is in the algae doctor, which proposes a shorter light schedule and applies it once the reader
  confirms. Dimming, feeding mode and master-button scenes follow, once the master button exists.

**A tank health review, council style.** Several reviewers read one tank, each through its own lens: water and
cycling, plants and algae, fish and stocking. They read its photos, water tests, fish, light hours, plants and history,
then agree a health score and the top issues, each with its fix from our guides.
- How. It runs weekly or when the reader asks, never on every message. Where reviewers disagree, the review says so
  rather than averaging it away.
- Which models. Readers' traffic runs on our Anthropic keys, so the panel is Anthropic models with different lenses. The
  owner's Cursor plan can't serve readers, and another provider's API would be a new vendor (cost and privacy), which is
  the owner's call.
- Cost. A tank's file is about 20,000 tokens with three photos. Three Sonnet lenses sharing a cached copy, plus a
  summary, cost about $0.13 a review. Opus plus two Sonnet lenses cost about $0.24. A weekly review of 1,000 tanks would
  run about 140 a day, $19–34, most of the $50 cap. So: on request, at most one a tank a week, inside its own slice of
  the cap (say $10 a day, 40–75 reviews).
- Prove it first. The eval runs a panel against one Opus pass on the same tanks, judged blind. If the panel doesn't
  clearly win, one strong model does the review at a third of the cost.
- Where. After the tank journal: without water tests and photos over time there is little for a panel to review.

## How we prove it

About 40 real hard questions, from public Vietnamese hobby forums (reworded, no names), the existing chat eval, and the
owner's own past research if they share it. Our chat and plain Claude each answer every question. Plain Claude is the same
Haiku model with no tools and no handbook. A judge sees the two answers in random order, twice with the order swapped,
and a win counts only when both judgements agree. Two conditions are reported apart. In one, both get the full forum
post. In the other, the reader asks a short question about a saved tank, and only we have the tank. Target: a clear win.
The eval runs again on every change to the chat's brain.

## Order of work

1. The eval, now.
2. Whatever the eval shows first. Already found: the chat's name search puts the wrong fish first ("cá vàng" finds a
   shrimp before the goldfish). Likely next: the chat reads the whole tank, lights and plugs included, then gives
   step-by-step answers for hard problems.
3. The algae doctor, with the first equipment action: a shorter light schedule, applied once the reader confirms.
4. More equipment actions: dimming, feeding mode, master-button scenes.
5. Setup planner, tank journal and check-ins.
6. The tank health review, once the journal gives it something to read, and only if the eval shows a panel beats one
   strong model.
7. A stronger model only for hard-problem flows, and only where the eval shows it pays for itself.

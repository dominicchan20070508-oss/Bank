# Evidence from comparable games (October 2026 research)

This is a condensed version of `reports/外卖大乱送 合作玩法研究.md`, which is about 120 sources across 15+ games; the raw notes are in `research_notes/外卖大乱送 合作玩法研究/`. Cite the full report when a review leans on one of these points. Note that there is still **no playtest data for this game**: everything here is precedent from other games, not proof.

## The reusable review rule
Some ideas need two screens to agree on one moving thing in real time: catching a thrown item, a real rope or tether, NPCs that path toward a player, or picking up shared debris. Shrink every such idea into one of the two patterns this game already proves out:
1. **"Stop in a zone, the server decides."** This is how pickup and delivery work. Examples: a spill-salvage zone instead of picking up debris; a stopped hand-off instead of a mid-air throw.
2. **"Simulate on one device, broadcast an event."** This is how cargo physics works. Examples: a dog that chases only the honker, simulated on the honker's device; balloon snags computed by the carrier.

If an idea can't be shrunk into either pattern, it is expensive and will produce failures nobody can attribute. Rate it 高 and defer it.

## Patterns that work, and why
- **The funny beat has four steps:**
  1. a warning sign (the tower wobbles, the dog's ears go up);
  2. the player triggers it themselves (turned too hard, honked);
  3. a loud, visible result;
  4. someone to blame.
  Sources: benign violation theory (McGraw); Juul on failure; Untitled Goose Game's readable "noticed" states. Players read failures with no visible cause as "the game is broken".
- **Failure should pull the team together. Helping is an opportunity, not an obligation.** Peak, R.E.P.O. and Lethal Company turn one player's mishap into a team event. But if the victim must *wait* to be rescued, "waiting on each other" appears, which is R.E.P.O.'s top negative Steam theme and hits small groups hardest.
- **Overload the tasks, not the controls.** Overcooked always has more tasks than people, and simplified elsewhere whenever it added something; Octodad added invisible assists. Rule: **at most one new failure type per upgrade.**
- **Communication should be small, contextual and language-neutral.**
  - Apex's ping system was built in voice-off playtests; EA released the patent free.
  - A study of 84,489 LoL players found more pings help, but with diminishing returns, so cooldowns are part of the design.
  - Mobile games use 3–7 options; Among Us dropped its radial menu for favourites.
  - Preset phrases get used sarcastically (Rocket League's "What a save!"). Keep presets positive or self-directed, with mute and rate limits.
- **Randomness must be announced before players act, and be the same for everyone.** "Input randomness" (revealed, then you decide) supports strategy; "output randomness" (rolled after you act) feels like being cheated (Kotaku). Overcooked 2's changing kitchens are scripted and learnable. PlateUp! lets the team *choose* the harder modifier.
- **Same city for everyone, with zero friction to replay.** Spelunky's daily challenge and Wordle's share grid both need no accounts.
- **Viral co-op hits are cheap and made by tiny teams, spreading through streamers:**
  - R.E.P.O.: $8, about 7 people, about 3.1M copies in under 3 weeks.
  - Peak: built in a one-month jam, 10M+ copies.
  - MECCHA CHAMELEON (2026): 2 people, 20M copies in 63 days.
  - About 3% of players remain after 30 days (analyst estimate). The first round's laugh, and how easy it is to invite people again, is what matters.

## Pitfalls
- **Lag turns slapstick into injustice** (Gang Beasts online play). Anything latency-sensitive breaks pillar 1.
- **Jokes that are written into the game go stale** on repeat. Awards should come from what actually happened in the round.
- **Joint carrying** is the best comedy and the worst frustration in Moving Out, but every praised example is same-screen with near-zero latency.
- **Explicit commander or dispatcher seats** are stressful and draw blame (Natural Selection 2, Artemis). No successful casual co-op game uses task assignment as a core loop.
- **Totally Reliable Delivery Service**, the closest comparable game, was criticised because its multiplayer "feels like coexisting rather than cooperating". Riders need reasons to converge.
- **The phone thumb budget is full.** Epic's guidance is 5–6 visible controls, and we already have 6. New actions must be contextual or reuse a button, e.g. hold the horn to open a wheel.
- **The free server's cold start** (about a minute after 15 minutes idle) is the first friction friends hit.

## Ranking of the 10 upgrades from 豆包's brief (research verdict)
| # | Idea | Verdict | Shrunk form | Cost |
|---|---|---|---|---|
| 1 | ⑧ quick-chat / ping wheel | do | hold the horn to open a 6-slice wheel; auto "I crashed" marker; "这单我来" claim | 低–中 |
| 2 | ① rescue + cargo pickup | shrink | server-placed timed spill-salvage zone; stopping in it recovers part of the tip; helper award "救汤侠" | 中 |
| 3 | ⑤ moving hazards | dogs only | seed-placed sleeping dogs wake on a honk and chase the honker in a straight line, simulated locally | 中 |
| 4 | ⑦ team streak multiplier | soften | cap at +25%; a weak delivery drops one tier instead of resetting; retune stars from playtest data | 低 |
| 5 | ⑩ random weather | rain first | 0–1 per round, seed-decided, announced, the same for all | 中 |
| 6 | ⑨ balloon drinks | prototype | reuse the pendulum model; a few highlighted snag points | 中 |
| 7 | ④ two-bike giant order | later | "convoy" order: the server checks the bikes stay within 12–15 m | 中高 |
| 8 | ⑥ alleys / roadblocks | fixed only | announced at round start; optional alley shortcuts; no random ones (bikes don't collide, so head-on gags can't happen) | 低–中 |
| 9 | ② dispatcher UI | don't (as proposed) | replaced by the claim ping in ⑧ | — |
| 10 | ③ in-motion throw | don't (as proposed) | stopped hand-off or curbside drop, only if a real need appears | 高 → 中 |

Suggested rollout:
- **Step 0:** a phone + PC playtest with 3–4 friends, recording deliveries, crashes, order-grab complaints, how often people call out, when the laughing stops, and the cold-start wait.
- **Batch 1:** ⑧ + ① + the 救汤侠 award. Together they make one loop: crash → call for help → teammate arrives → credit.
- **Batch 2:** dogs + the softened streak + the daily city.
- **Batch 3:** rain + the between-round card pick.

## Five evidence-backed ideas not in the original list
1. **今日同城 (daily city):** the seed comes from the date; local best score; copyable share line. Precedents: Spelunky daily, Wordle, Peak's daily mountain. Cost 低.
2. **三局一班 (three-round shift) with a two-card pick between rounds**, e.g. lunch rush, soup day, construction day, rain. This also makes weather and roadblocks fair, because the team chose them. Precedents: PlateUp!, Ultimate Chicken Horse, Fall Guys episodes. Cost 低–中.
3. **Event-based joke awards plus a screenshot-friendly results card**, which serves as the game's "clip" in place of voice. Precedent: Content Warning. Cost 低.
4. **Cold-start practice yard plus invite links that land straight in the room:** wake the server on page load, and let players ride a local-only yard while waiting. Precedents: CrazyGames instant multiplayer, Jackbox. Cost 低–中.
5. **Phone assists with no reward penalty**, such as auto-gas, a steadier rack and more time. They free the right thumb for the horn wheel. Precedents: Asphalt 9 TouchDrive, Mario Kart Tour smart steering, Moving Out assist mode. Cost 低.

## Infrastructure notes
- **Discord Activities** run inside friends' voice calls, which provides the voice layer friendslop hits rely on. It needs a separate package and Discord auth, so it is not a near-term priority.
- **Render Singapore** region would cut about 165 ms of US→SEA backbone latency. It needs a new service and a new URL (old invite links break).
- **Latency of 110–250 ms is workable for co-op** (the tipping point is around 400 ms), but only for designs that follow the two patterns above.

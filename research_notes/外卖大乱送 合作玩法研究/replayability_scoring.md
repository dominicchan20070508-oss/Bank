# Session Structure, Replayability and Scoring Hooks in Co-op/Party and Arcade Delivery Games (for 外卖大乱送 / Delivery Chaos)

Research date: 2026-10-02. Many sources are older (2013–2022). Each one carries its date. "Snippet" means the claim came from a search-engine excerpt because the page itself could not be fetched: Fandom, GameFAQs, NamuWiki and some Steam pages returned 403/429/Cloudflare blocks. Treat snippet claims as medium confidence.

Game constants used in the analysis below: 4-minute rounds; 2–4 players online; the team shares one tip pool that gives 1–3 stars; Tip = base × (0.3 + 0.7 × integrity) × time multiplier + request bonus.

---

## 1. Session length norms and "one more round" hooks

### Takeaway
Successful co-op and party games use rounds of about 1–5 minutes. Overcooked's levels are usually 3–4 minutes, with some at 5, and Fall Guys rounds last a few minutes. Sessions are built by chaining 4–5 of these rounds into a 15–20 minute "episode". Delivery Chaos's 4-minute round sits squarely in this norm. The replay hooks that work are a near-miss on a visible star threshold, instant retry, and a daily or shared "same puzzle" framing. Long-form structures such as PlateUp!'s 15-day runs need drop-in/drop-out support to work for friend groups.

### Cited Findings
- Overcooked levels are beaten by delivering as many orders as possible in the kitchen's set time, "usually 3 to 4 minutes". Some levels run 4–5 minutes and some only 3. — [Overcooked Fandom: Levels (snippet)](https://overcooked.fandom.com/wiki/Levels)
- Overcooked (2016) presents "an order which must be completed within a short time window". It uses a 3-star ranking based on coins earned, with bonuses for speed. — [Wikipedia: Overcooked](https://en.wikipedia.org/wiki/Overcooked)
- Overcooked 2 star thresholds are published as separate score tables for 1P, 2P, 3P and 4P, so the targets scale with player count. — [Game Rant, "Overcooked 2: How to get 4 stars" (Mar 27 2022)](https://gamerant.com/overcooked-2-how-to-get-four-stars/)
- Fall Guys rounds take a couple of minutes each, roughly 1–5 minutes; early rounds are short and later rounds longer. An "episode" from 60 players down to 1 is about 4–5 rounds, roughly 15–20 minutes. The short rounds were meant to suit players who want brief sessions they can walk away from. — [Screen Rant: How many rounds per game (snippet)](https://screenrant.com/fall-guys-rounds-each-game-match-mediatonic/); [gamepressure: Fall Guys game length (snippet)](https://guides.gamepressure.com/fall-guys-ultimate-knockout/guide.asp?ID=55220); original developer framing in [Variety (2019), not fetchable](https://variety.com/2019/gaming/features/fall-guys-is-a-party-pack-battle-royale-full-of-fun-bite-sized-game-show-challenges-1203241950/)
- Wordle was deliberately designed to take "three minutes" a day. Josh Wardle said that one puzzle per day "creates a sense of scarcity, leaving players wanting more". — [Wikipedia: Wordle](https://en.wikipedia.org/wiki/Wordle); [TechCrunch interview, Jan 12 2022](https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/)
- In Crazy Taxi the arcade session length is elastic. Time bonuses add seconds to the global clock: Speedy +5 s, Normal +2 s, Slow +0. A late fare ("BAD") pays no money and no time. The "one more fare" loop comes from converting skill into more time. — [Steam guide: Crazy Taxi License and Money Guide (snippet)](https://steamcommunity.com/sharedfiles/filedetails/?id=347041412); [NamuWiki: Crazy Taxi (snippet)](https://en.namu.wiki/w/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%20%ED%83%9D%EC%8B%9C)
- Dean Rands (blog analysis, written Jul 2024, posted Jan 2025) describes the core Crazy Taxi run loop as "collecting customers, delivering them to their destinations quickly, and thus getting more time". He calls its scoring elegant for its "immediacy in getting you to understand your objectives". The score is money, which is diegetic. — [Crowence: "Crazy Taxi's Elegant Scoring"](https://crowence.com/2025/01/03/06-crazy-taxis-elegant-scoring/)
- PlateUp! runs last 15 in-game days, so they are long. The developer built in drop-in co-op: "You don't have to wait for your friends' game to finish because you can just jump in mid-run." — [The Xbox Hub interview with Alastair Janse van Rensburg (Feb 1 2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/); [Wikipedia: PlateUp!](https://en.wikipedia.org/wiki/PlateUp!)
- Near-misses on a star threshold drive repeated retries, and they also cause friction. A Kotaku player essay (2018) says that "each time we barely missed three stars, we re-grouped and determined how we could switch our strategy". — [Kotaku, Keoni Nguyen, Jun 8 2018](https://kotaku.com/playing-overcooked-can-tear-people-apart-and-thankfull-1826672317)
- In Ultimate Chicken Horse Party mode, each round is a pick → place → run cycle. Players pick blocks from a random "Party Box" with roughly 4–7 items, and placed obstacles persist, so the level escalates from round to round. Rounds repeat until someone reaches the point target. — [UCH Fandom: Game Modes (snippet)](https://ultimate-chicken-horse.fandom.com/wiki/Gamemodes); [Clever Endeavour support: game modes](https://cleverendeavourgames.freshdesk.com/support/solutions/articles/32000034046-what-are-the-different-game-modes-)

### Inferences
- A 4-minute round is well within the norm. The bigger opportunity is the between-round loop. Today the game goes round → stars → joke awards → (?). Successful games add a choice or change between rounds (UCH box pick, PlateUp! card) and a visible "next target", such as the gap to the next star. A 3–5 round "shift" of about 15–20 minutes, mirroring a Fall Guys episode, would give friend groups a natural session unit.
- Star thresholds should scale with player count, as in Overcooked 2. Otherwise 2-player teams will chronically near-miss and 4-player teams will coast.
- An instant "retry same seed" option and a "new seed" option should both be one tap. The near-miss retry hook only works if retrying is frictionless.

### Gaps
- No reliable data was found on Jackbox, Pummel Party, Unrailed! or Mario Kart race/session lengths. Pages were blocked or not found within budget, so they are not cited.
- No hard retention data (D1/D7, session counts) was found for any of these games relative to round length. Evidence on round length is descriptive, not causal.

---

## 2. Mutators and variety sources: which are cheap and keep replay value

### Takeaway
The cheapest high-value variety sources are:
- (a) a single gimmick per level, designed around one idea (Overcooked);
- (b) player-chosen modifiers between rounds (PlateUp! cards, UCH Party Box);
- (c) environmental variants of the same layout (Unrailed! biomes with day/night).

Fixed hand-authored levels with fixed objectives (Moving Out) are criticised for low replay value. Player choice of the modifier is a recurring theme: PlateUp!'s developer frames it as "you get to decide how the game becomes harder".

### Cited Findings
- Overcooked's roughly 28 kitchen layouts each use an obstacle. Examples: crosswalks where "pedestrians potentially get in the chef's way", kitchens on "two trucks traveling at different paces", icebergs "requiring players to make more careful movements lest they fall off", and kitchens that "move around". — [Wikipedia: Overcooked](https://en.wikipedia.org/wiki/Overcooked)
- Ghost Town Games built levels around a single element, such as separating players or creating a pinch point. Overcooked 2's dynamic levels change mid-level; in one, a hot-air-balloon restaurant crashes into another, switching the recipes from salad to sushi. The developers added throwing because separated players did not have enough to do. — [Red Bull interview with Ghost Town Games (2018, snippet; full page did not load)](https://www.redbull.com/us-en/overcooked-2-ghost-town-games-interview)
- Phil Duncan of Ghost Town Games on the co-op premise: kitchens are "an occupation where teamwork, time management, spatial awareness and shouting are all vitally important". Levels deliberately make handing items across a barrier faster than walking around it. — [Wikipedia: Overcooked](https://en.wikipedia.org/wiki/Overcooked)
- In PlateUp!, every few days the team picks one of two cards that permanently raise the difficulty: a menu/food card versus a customer-behaviour card. Reviewers note the cards are "never a positive addition—you will always be choosing the lesser of two evils". — [Wikipedia: PlateUp!](https://en.wikipedia.org/wiki/PlateUp!); [TheGamer: best PlateUp! cards (snippet)](https://www.thegamer.com/plateup-best-cards/)
- The PlateUp! developer said: "Every three days you'll have to add a new challenge, usually with the option of making your menu harder or making your customers more problematic"; "You get to decide how the game becomes harder"; and losing clears the stacked challenges, which "is designed to remove the frustration of losing". — [The Xbox Hub interview (Feb 1 2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/)
- Unrailed! (2020) generates its worlds procedurally across biomes: Plains, Desert, Snow, Lava, Space, Mars and Underwater. The first four have a day-night cycle in which "the night is dark". There are also random encounters with inhabitants. — [TV Tropes: Unrailed! (snippet)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Unrailed); [Steam: Unrailed!](https://store.steampowered.com/app/1016920/Unrailed/)
- In UCH Party mode, players choose items from a random Party Box. Items persist and accumulate, so players author the mutators themselves. — [UCH Fandom: Game Modes (snippet)](https://ultimate-chicken-horse.fandom.com/wiki/Gamemodes)
- Moving Out (2020) has hazards that escalate across 30 levels (cars, ghosts, rakes) and per-level bonus objectives such as "not breaking any windows" or "Give a bird a bath". The WellPlayed review's main criticism is that "levels and their objectives are always the same, meaning there's no element of surprise in replaying them". — [WellPlayed review, Kieron Verbrugge, Apr 23 2020](https://www.well-played.com.au/moving-out-review/)

### Inferences
- For Delivery Chaos, the cheapest variety comes from parameters on systems that already exist: order mix, customer request pool, cargo types, time of day, and weather. None of these need new art or levels. A "modifier card" is a few constants in a table plus a card UI.
- Letting the team choose one of two modifiers between rounds gives agency (PlateUp!, UCH) and shifts responsibility for difficulty from the game to the players. That directly supports the pillar "no random punishment".
- The seeded 5×5 city already supports input-randomness variety. A "map variant" can reuse the same seed with a different rule overlay, for example a closed road or a one-way street.

### Gaps
- The GDC talks on Overcooked and PlateUp! were not found within budget.
- No exact Overcooked 2 dynamic-level warning durations were found, i.e. how many seconds before a kitchen shift. The claim that the changes are "scripted and telegraphed" rests on level descriptions, not on measured timings.

---

## 3. Random events and weather: when they feel fun vs. unfair

### Takeaway
The accepted framing in design criticism is input versus output randomness. Randomness revealed before the player acts (input) supports strategy. Randomness resolved after the action (output) feels unfair. "Random but telegraphed" is the practical form of input randomness, and a shared, visible state that everyone experiences equally is the multiplayer form. Overcooked's level gimmicks are fixed per level, so they become learnable. Mario Kart World (2025) runs weather as a regional, shared, synced state.

### Cited Findings
- Input randomness is "when something random happens before the player has any input". Output randomness is when the player acts and "the game then figures out what happens based on a random chance". Output randomness frustrates players most because "humans are just terrible with numbers". Recommendation: provide "enough information and stats to help things feel fair". — [Kotaku, Zack Zwiezen, Jan 18 2020 (summarising GMTK)](https://kotaku.com/randomness-in-video-games-is-not-all-the-same-1841049263)
- The input/output distinction "represents the fundamental difference between randomness that supports strategy and randomness that undercuts strategy". — [Game Developer: Randomness and Game Design (snippet)](https://www.gamedeveloper.com/design/randomness-and-game-design)
- Telegraphing is defined in balance literature as adding "audio and visual cues to communicate when an attack is incoming and what kind of actions can be used in response". The same source lists telegraphing alongside tuning and timing as a tool for a "fair and meaningful gameplay experience". — [Game Design Skills: Game Balance guide (snippet)](https://gamedesignskills.com/game-design/game-balance/)
- Mario Kart World (Switch 2, 2025) has dynamic time of day and weather (rain, snow). Coverage says rain can make tracks more slippery and night limits visibility. — [Game Rant: every Mario Kart World feature (snippet)](https://gamerant.com/mario-kart-world-every-feature-confirmed-24-players-tracks/); [Nintendo: Mario Kart World Direct](https://www.nintendo.com/us/whatsnew/mario-kart-world-direct-revs-up-new-details-on-the-biggest-mario-kart-ever-coming-to-nintendo-switch-2-at-launch/)
- A Nintendo patent reported in Sept 2026 describes splitting the world into regions with their own weather. In multiplayer, weather information is shared between systems "so everyone is racing through the same conditions". — [4sCarrsGaming, Sept 2026 (snippet; secondary reporting of a patent)](https://www.4scarrsgaming.com/2026/09/nintendo-patent-regional-weather-mario-kart-world.html)
- Overcooked 2's dynamic changes, such as the balloon crash that switches the recipes, are built into specific levels. They are the same on every play, so teams can learn them. — [Red Bull interview (snippet)](https://www.redbull.com/us-en/overcooked-2-ghost-town-games-interview); [Wikipedia: Overcooked](https://en.wikipedia.org/wiki/Overcooked)
- Unrailed!'s day-night cycle (dark nights) is a recurring, predictable environmental change rather than a surprise. — [TV Tropes: Unrailed! (snippet)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Unrailed)
- Developers hide extra logic to make randomness feel fair. Civilization makes players who lose two 33%-odds battles in a row win the next one. — [Kotaku (2020)](https://kotaku.com/randomness-in-video-games-is-not-all-the-same-1841049263)

### Inferences
- "Random schedule, telegraphed onset, deterministic effect" is the best-supported pattern. Weather can be chosen randomly per round from the seed, but once announced its strength and direction should be fixed and visible. A random gust that topples a pizza tower without warning is output randomness and violates the pillar "failures visible, predictable, attributable".
- Shared, synced state matters in online co-op. All 2–4 clients must see the same wind direction and onset time. Seeding the weather schedule from the round seed makes it reproducible, which is also needed for a daily-seed mode.
- No source in this research directly addresses Forza Horizon seasons or Risk of Rain events, so those comparisons are omitted.

### Gaps
- No primary data (playtests, surveys) quantifies how long a telegraph warning should be. The 10 s in the proposal is a design guess with no cited benchmark.
- Whether Mario Kart World's weather has a meaningful handling effect or is mostly cosmetic was not verified from a primary source. Coverage is secondary.

---

## 4. Combo/streak scoring and the effect of team-wide streaks on cooperation

### Takeaway
Overcooked 2 confirms the pattern. Each order earns a base score plus a time-based tip, and a tip multiplier grows up to ×4 while the team serves orders in left-to-right sequence without failing any. Serving out of order, a wrong dish, or a timed-out order resets it. Guides say a 4-star score is "virtually" impossible without the multiplier. Crazy Taxi chains stunts into combos that break on collision. Team-wide streaks raise the stakes of every individual mistake. The best-documented social cost is blame after near-misses. Research on Overcooked 2 shows supportive climates produce better communication and performance.

### Cited Findings
- **Overcooked tips.** "Finished orders give you a base score of +20, with a tip depending on the amount of time left on the order marked by the colored bar on the top of the order card." This is a guide statement, probably about Overcooked 1. — [TrueAchievements: Overcooked hints (snippet; page 403)](https://www.trueachievements.com/game/Overcooked/walkthrough/2)
- **Overcooked 2 tip multiplier.** "Keeping the line moving in order will net players with tip bonuses that multiply up to four times." — [Game Rant (Mar 2022)](https://gamerant.com/overcooked-2-how-to-get-four-stars/). The tip combo "maxes out at 4x", while the hidden "Combo" count used for unlocking Kevin levels "is not shown to the player and can go up indefinitely". — [Steam guide: Overcooked 2 General Guide (snippet; page 429)](https://steamcommunity.com/sharedfiles/filedetails/?id=1700450005)
- **What breaks it.** "You earn a tip multiplier from both never failing an order, and from doing orders left to right … never serve out of the left-to-right sequence, never let an order time out, and never get an order wrong!" — [WikiGameGuides: Kevin levels (snippet)](https://wikigameguides.com/6096-how-to-unlock-all-8-secret-kevin-levels-overcooked-2/amp). "If you serve them out of order, you lose your tip multiplier, which will virtually guarantee that you won't make the 4★ score." — [Steam discussion, Overcooked! 2](https://steamcommunity.com/app/728880/discussions/0/1652171126130895739). To keep a combo you must complete recipes in exact order, not fail orders, and not serve dishes that are not on the menu. — [Overcooked Fandom: Combos (snippet; Cloudflare-blocked)](https://overcooked.fandom.com/wiki/Combos)
- **Unresolved detail.** One guide snippet describes the cap as "x4 multiplier to the order's worth" ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1700450005)). Game Rant says the *tip bonuses* multiply ([Game Rant](https://gamerant.com/overcooked-2-how-to-get-four-stars/)). I could not verify from a primary or wiki page whether the multiplier applies to the tip only or to the whole order value, or whether it rises by +1 per consecutive order (x1→x2→x3→x4).
- **Crazy Taxi (1999).** Driving close to cars gives a "Crazy Through" bonus. Linking slides, drifts and dashes gives combo bonuses. The more stunts are chained "without colliding into another car or building the more the tip multiplies". At 10 or more combos the payout per combo grows sharply. — [XBLAFans: Crazy Taxi guide (snippet)](https://xblafans.com/crazy-taxi-guide-how-to-drive-like-a-pro-18658.html); [NamuWiki: Crazy Taxi (snippet)](https://en.namu.wiki/w/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%20%ED%83%9D%EC%8B%9C). Tips pay out only on successful delivery: "you have to be a good taxi driver before being a crazy one matters." — [Crowence (2025)](https://crowence.com/2025/01/03/06-crazy-taxis-elegant-scoring/)
- **Death Stranding (2019).** Each delivery is graded on five components shown as stars, and premium orders can be condition-focused. Guides say Premium usually needs under 20% cargo damage and S rank needs about 0–5%. — [Death Stranding Fandom: Porter Grade (snippet)](https://deathstranding.fandom.com/wiki/Porter_Grade_Titles_and_Badges); [PlayStationTrophies: Growth of a Legend (snippet)](https://www.playstationtrophies.org/game/death-stranding/trophy/285604-growth-of-a-legend.html). This is a direct precedent for integrity-based delivery grading, but it is a single-player game.
- **Blame in co-op.** Kotaku player essay (2018): "Early in the game, we would laugh at our mistakes … after a few sessions of just missing a perfect three-star rating, those mistakes turned from humorous to annoying." With 10 seconds left: "What are you *doing*?" The players ended up playing "in silence". — [Kotaku, Jun 8 2018](https://kotaku.com/playing-overcooked-can-tear-people-apart-and-thankfull-1826672317). Overcooked 2 "has a bit of a reputation for destroying relationships". — [Epilogue Gaming (snippet)](https://epiloguegaming.com/overcooked-2-a-tale-of-friendship-and-interdependence/)
- **Experimental evidence (Overcooked! 2, arXiv, Oct 2025).** 20 teams of 3 (40 participants plus confederates) were compared. Positive-supportive climate teams used more "action-oriented, factual, and emotional/motivational statements" and showed "higher excitement and happiness … lower anxiety, dejection, and anger". They outperformed neutral-climate teams at lower difficulty, though the advantage shrank as difficulty rose, and reported higher collective efficacy throughout. — [Eldadi, Dekimhi & Tenenbaum, arXiv 2511.17513](https://arxiv.org/abs/2511.17513). Small sample; the climate came from a confederate's behaviour, not from a scoring system.
- **Moving Out.** The WellPlayed review contrasts Moving Out with Overcooked: it "isn't the kind of chaotic co-op game to make you want to throat-punch your housemates", trading "the pressure of failure for the aspiration of success". Assist Mode gives longer timers, solo-liftable objects and level skips, "no penalties for using it". — [WellPlayed (Apr 2020)](https://www.well-played.com.au/moving-out-review/)
- **UCH shared-outcome scoring.** "If everyone finishes … no one gets any points as the game reasons the course must have been too easy". No points are given if every player or no player finishes, which pushes players toward traps that are hard but passable. — [Push Square review (snippet)](https://www.pushsquare.com/reviews/ps4/ultimate_chicken_horse); [TheGamer (snippet)](https://www.thegamer.com/ultimate-chicken-horse-is-the-ultimate-party-platformer/). This is a competitive game, but it shows that scoring rules can be shaped to steer group behaviour.

### Inferences
- Shared streaks turn individual mistakes into team-wide losses, so they focus blame on whoever broke the streak. Overcooked is the canonical case, and its reputation for causing arguments is documented anecdotally rather than in controlled studies.
- Crazy Taxi breaks combos on collision, but it is single-player, so nobody else is blamed. In co-op, combo-break rules should key on outcomes the team can see and attribute fairly, and should not punish the game's comedic core, which in Delivery Chaos is crashes and spills.
- The supportive-climate study suggests feedback tone, such as a funny streak-break animation instead of a harsh "COMBO LOST", may change how a team reacts to a reset. This is an extrapolation.

### Gaps
- No reliable sources were gathered on Tony Hawk combo design, Totally Reliable Delivery Service scoring, or Crazy Taxi's official combo amounts.
- The exact increment and target of Overcooked 2's multiplier remain unconfirmed: +1 per order, and whether it applies to the tip or the whole order.
- No quantitative study isolates streak or combo multipliers as a cause of blame in co-op games.

---

## 5. Star ratings and light progression without accounts

### Takeaway
Overcooked uses per-level star thresholds that scale with player count as the main replay goal. Its hidden "Combo" count unlocks bonus "Kevin" levels as local progression. Daily shared-seed challenges (Spelunky, 2013) and one-puzzle-a-day games (Wordle, 2021–22) are proven no-account retention hooks. They work through shared conditions and frictionless sharing (Wordle's spoiler-free emoji grid), not through server-side progression.

### Cited Findings
- Overcooked 2 star thresholds are tabulated separately for 1P/2P/3P/4P teams. — [Game Rant (Mar 2022)](https://gamerant.com/overcooked-2-how-to-get-four-stars/)
- Overcooked 2's hidden Combo score, earned by serving in exact order without failures or off-menu dishes, unlocks the secret Kevin levels, a local unlock tied to skill. — [Overcooked Fandom: Combos (snippet)](https://overcooked.fandom.com/wiki/Combos); [WikiGameGuides (snippet)](https://wikigameguides.com/6096-how-to-unlock-all-8-secret-kevin-levels-overcooked-2/amp)
- **Spelunky Daily Challenge (2013).** Every player gets the same seed and one attempt per day, and the seed and leaderboards reset at 00:00 UTC. Mike Rose (Game Developer, Aug 29 2013): every player is "tumbling and whipping their way through the very same set of levels as everyone else"; "one small slip-up will cost you the entire day … amplifies the risk involved"; a single-player game "suddenly erupted into one of the most exciting multiplayer games". Players formed communities and shared videos of each day's run. — [Game Developer, Mike Rose (2013)](https://www.gamedeveloper.com/design/the-understated-genius-of-the-i-spelunky-i-daily-challenge); [Spelunky Fandom: Daily Challenge (HD) (snippet)](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD))
- **Wordle.** It had 90 players on Nov 1 2021, over 300,000 on Jan 2 2022, and more than 2 million weekly players by Jan 9 2022. 1.2 million results were shared on Twitter between Jan 1 and 13. The emoji grid came from players, and Wardle added sharing in mid-October 2021 before it went viral in late December. The NYT bought it on Jan 31 2022. — [Wikipedia: Wordle](https://en.wikipedia.org/wiki/Wordle). Wardle: it is not "a random words" game because "it's the fact that it's one puzzle and everybody is solving it". — [TechCrunch (Jan 2022)](https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/) (via search excerpt)
- **PlateUp! meta-progression.** The team unlocks new dishes, floor plans and appliances across runs, while challenge cards reset on loss. — [The Xbox Hub interview (Feb 2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/); [Wikipedia: PlateUp!](https://en.wikipedia.org/wiki/PlateUp!)
- **Moving Out.** Assist options do not lock any rewards: "every level and bonus challenge, every trophy and achievement" stays available. — [WellPlayed (2020)](https://www.well-played.com.au/moving-out-review/)
- **Death Stranding.** Per-delivery grades combine into a long-term "Porter Grade". — [Death Stranding Fandom (snippet)](https://deathstranding.fandom.com/wiki/Porter_Grade_Titles_and_Badges)

### Inferences
- A daily seed fits Delivery Chaos's constraints almost perfectly. The city layout is already deterministic per seed. Making the seed `hash(YYYY-MM-DD)`, and seeding the order list, customer requests and weather schedule from it, gives every group worldwide the same day without a server database. Best stars and tips go in localStorage, and a copy-paste emoji result string serves as the Wordle-style sharing mechanism, e.g. `外卖大乱送 #213 ⭐⭐☆ 🍕💥🍜✅🍦💧`.
- Spelunky's one-attempt rule is probably too harsh for a 2–4 player party game where one member's connection drop could waste the day. "First run is ranked, retries are practice" keeps the shared-stakes feeling.
- localStorage unlocks should be cosmetic only (helmet colours, bike horns, box skins) and tied to stars or joke awards. That way losing them through cleared storage or a new device costs nothing functional, and players with mismatched unlocks never get an unfair advantage. An optional export/import code would cover device changes.

### Gaps
- No data on how much daily-seed modes contribute to retention in co-op (as opposed to solo) games.
- No source confirms whether Overcooked's 4th star is gated behind the 3rd.

---

## 6. Assessment of candidate upgrade (7): team streak/combo tip multiplier

Proposal: each consecutive delivery with integrity above 60% adds +5% to team tips, up to +50%. An integrity-0 delivery resets the streak. Crashes do not reset it.

### Takeaway
The streak is well-precedented: Overcooked 2's ×4 tip multiplier and Crazy Taxi's combos both use it. It would add a readable team goal and a reason to drive carefully. As specified, though, it has three risks:
- **Rich-get-richer score inflation.** Skilled teams can gain roughly +30–40% over a round, which distorts the star thresholds.
- **Concentrated blame.** One player's spill wipes the whole team's streak, which is Overcooked's documented failure mode.
- **Rule ambiguity.** Deliveries with integrity between 1% and 60% neither count nor reset.

It is a net positive only if the reset is softened and framed as a joke, the thresholds are retuned, and the streak meter is legible on a phone HUD.

### Cited Findings
- **Precedent, Overcooked 2.** The tip multiplier grows to ×4 with in-order, no-failure serving and resets on out-of-order, wrong or expired orders. Guides say losing it makes 4 stars "virtually" impossible. — [Game Rant](https://gamerant.com/overcooked-2-how-to-get-four-stars/); [Steam discussion](https://steamcommunity.com/app/728880/discussions/0/1652171126130895739); [WikiGameGuides (snippet)](https://wikigameguides.com/6096-how-to-unlock-all-8-secret-kevin-levels-overcooked-2/amp)
- **Precedent, Crazy Taxi.** The combo multiplies tips and breaks on collision. Tips count only if the delivery succeeds. — [XBLAFans (snippet)](https://xblafans.com/crazy-taxi-guide-how-to-drive-like-a-pro-18658.html); [Crowence (2025)](https://crowence.com/2025/01/03/06-crazy-taxis-elegant-scoring/)
- **Precedent, Death Stranding.** Grading by cargo condition, with Premium requiring under 20% damage. — [PlayStationTrophies (snippet)](https://www.playstationtrophies.org/game/death-stranding/trophy/285604-growth-of-a-legend.html)
- **Pitfall, blame from near-misses.** — [Kotaku (2018)](https://kotaku.com/playing-overcooked-can-tear-people-apart-and-thankfull-1826672317)
- **Supportive feedback.** It correlates with better team communication and emotion in Overcooked 2. — [arXiv 2511.17513 (2025)](https://arxiv.org/abs/2511.17513)
- **Lower-pressure alternative.** Moving Out reviewers praised removing "the pressure of failure" with optional assists. — [WellPlayed (2020)](https://www.well-played.com.au/moving-out-review/)

### Inferences (analysis, not sourced)
- **Fun payoff.**
  - A visible shared meter such as "🔥×1.25" gives the team a running goal mid-round and a reason to call out "careful, don't break it!". This is exactly the cooperative talk Overcooked produces.
  - It rewards the skill the game is about, careful cargo handling, and does so without punishing crashes, which keeps the comedy.
  - "Longest streak" is a natural extra joke award.
- **Score inflation, a worked example.** Assume the streak starts at 0, each qualifying delivery adds +5%, and 20 deliveries come per 4-minute round for a 4-player team (a placeholder; measure the real number).
  - Unbroken streak: deliveries 1–10 earn +0% to +45% and deliveries 11–20 earn +50%, an average of about +36% across the round.
  - Typical streak broken twice: about +15–20%.
  - Weak team: near 0%.
  - Result: the spread between good and bad teams widens, so the 1–3 star thresholds must be re-tuned, ideally per player count as Overcooked 2 does. Otherwise good teams' 3 stars become trivial while weak teams see no change.
  - A lower cap (+25%) or a faster build to a lower cap shrinks the distortion.
- **Blame and attribution.**
  - With 2–4 people delivering in parallel, a reset is caused by one identifiable person.
  - Integrity 0 means total spill or full melt, which is the funniest failure in the game. The tip formula already gives it only 30% of base. Adding a team-wide streak reset punishes the comedic moment twice and singles out the player.
  - Mitigations:
    - (a) Halve the streak rather than reset it.
    - (b) Make the break a slapstick team event ("the soup has left the chat") and turn it into a joke award ("Streak Breaker 🏆") so it reads as comedy, not accusation.
    - (c) Allow one "forgiveness" per round.
- **Rule clarity.**
  - Three states (>60% builds, 1–60% holds, 0% resets) are hard to read at a glance. Either show the hold explicitly ("streak paused") or simplify the rule, for example "≥60% builds, <60% drops a tier".
  - Note that ice cream reaches 0 through time-based melting. A slow route could reset the streak through no visible "mistake", which conflicts with "predictable, attributable" unless the melt is clearly shown on the cargo.
- **Readability on phones.** One compact meter next to the tip pool plus a short pop on build or break. Avoid a second number, so show "+25%" or flames, not "×1.25" alongside "$".
- **Verdict.** Worth building after the reset is softened, the thresholds are re-tuned, and the cap is possibly lowered. It is low build cost (a counter plus UI) with real cooperative-goal value. As specified, "integrity-0 resets everything" is the main pillar risk.

### Gaps
- No real delivery-count-per-round data was available to size the inflation precisely.
- No direct study of streak resets causing blame in online co-op exists. The evidence is anecdotal (Kotaku) and indirect (arXiv climate study).

---

## 7. Assessment of candidate upgrade (10): random weather events with a 10 s HUD warning

Proposal: 1–2 events per round, each announced 10 s ahead.
- **Side wind, 30 s:** pushes bikes and makes pizza riskier.
- **Rain, 30 s:** reduces grip but slows ice-cream melting.

### Takeaway
"Randomly scheduled but telegraphed, with fixed and visible effects" is the best-supported pattern, both from the input-versus-output randomness argument and from shared weather in Mario Kart World. The rain's built-in trade-off (less grip, slower melt) is a strong design because it creates a decision rather than pure punishment. The wind is the riskier event. A force that topples a pizza tower is easily perceived as random punishment unless its direction and strength are constant, visible in the world, and identical for all clients. Weather also makes rounds unequal against fixed star thresholds.

### Cited Findings
- Input randomness, meaning information revealed before the decision, supports strategy, while output randomness undercuts it. Give players "enough information … to help things feel fair". — [Kotaku/GMTK (2020)](https://kotaku.com/randomness-in-video-games-is-not-all-the-same-1841049263); [Game Developer (snippet)](https://www.gamedeveloper.com/design/randomness-and-game-design)
- Telegraphing uses audio and visual cues that show what is coming and what responses are possible. — [Game Design Skills (snippet)](https://gamedesignskills.com/game-design/game-balance/)
- **Precedent, Mario Kart World (2025).** Dynamic rain and snow and a day-night cycle; rain reportedly makes roads slippery and night limits visibility. — [Game Rant (snippet)](https://gamerant.com/mario-kart-world-every-feature-confirmed-24-players-tracks/). Its weather system is regional and shared so that all players face the same conditions (reported patent). — [4sCarrsGaming, Sept 2026 (snippet)](https://www.4scarrsgaming.com/2026/09/nintendo-patent-regional-weather-mario-kart-world.html)
- **Precedent, Overcooked.** Movement hazards such as slippery icebergs and moving trucks are fixed per level and learnable. — [Wikipedia: Overcooked](https://en.wikipedia.org/wiki/Overcooked). Dynamic mid-level changes are scripted per level. — [Red Bull (snippet)](https://www.redbull.com/us-en/overcooked-2-ghost-town-games-interview)
- **Precedent, Unrailed!** A day-night cycle with dark nights in several biomes. — [TV Tropes (snippet)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Unrailed)
- **Precedent, PlateUp!** Difficulty is chosen by players, which removes the "the game did this to us" feeling. — [The Xbox Hub (2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/)

### Inferences (analysis, not sourced)
- **Fun payoff.**
  - A 10 s warning creates a team planning moment ("deliver the pizza NOW before the wind" or "save the ice cream for the rain"). That is the kind of input randomness that creates decisions.
  - Weather is visually funny with low-poly primitives: flapping awnings, flying newspapers, puddle splashes.
  - It adds round-to-round variety with no new map art.
- **Wind, unfairness risk.**
  - Pushing wobbly bikes sideways on touch controls may feel like losing control rather than a challenge.
  - To keep failures attributable:
    - one fixed direction per event, shown by world cues (flags, leaves, particles) plus a HUD arrow;
    - constant force, with no random gust spikes;
    - force applied to the pizza tower only through bike motion, so careful riding still beats it;
    - a gentle ramp up and down rather than an instant on/off.
  - Consider making buildings shelter riders from the wind on downwind streets. That rewards route choice and uses the 5×5 grid.
- **Rain.** Less grip combined with slower melt is a good mixed event. Make sure the grip loss is mild on touch input, and show the melt slowdown explicitly, for example a snowflake icon on the ice-cream cargo.
- **Scoring fairness.** With fixed star thresholds, a round with two wind events is harder than a clear round.
  - Options: (a) a small "bad-weather tip bonus" during events, which is diegetic for food delivery and turns weather into a risk/reward window; (b) stars computed against weather-adjusted thresholds; (c) keep effects mild.
  - Option (a) also gives teams a reason to welcome weather.
- **Online consistency.** Derive the weather schedule (type, onset, direction) from the round seed plus server start time so all clients agree. Apply forces in the same physics step as the rest of the cargo simulation to avoid desyncs where one player sees the pizza fall and another does not.
- **Frequency.** Two 30 s events in 240 s puts 25% of the round under weather, plus 20 s of warnings, which is a lot. Starting at 0–1 event per round, or tying events to the modifier choice between rounds, keeps clear rounds as the readable baseline for new players.
- **Verdict.** Moderate build cost (forces, grip parameters, VFX, sync, HUD). Strong variety payoff if the telegraphing is strong. Recommended path:
  1. Ship rain first, since its trade-off is already well designed.
  2. Ship wind with constant direction and visible world cues.
  3. Consider letting the team see or choose the weather between rounds (PlateUp!-style), or seed it into the daily challenge so it is a shared condition rather than bad luck.

### Gaps
- No benchmark was found for how long a telegraph warning should be; 10 s is unvalidated.
- No playtest evidence on wind or push forces in touch-controlled games was found.
- The Forza Horizon seasons, Risk of Rain events and Mario Kart item comparisons requested were not researched within budget.

---

## 8. Cheap replayability ideas missing from Delivery Chaos

### Takeaway
The highest-value, lowest-cost additions are:
- a daily seed challenge with a shareable result string;
- a two-card modifier pick between rounds;
- star thresholds that scale with player count;
- scripted "order events" (lunch rush) that are telegraphed and fixed per seed;
- cosmetic-only localStorage unlocks;
- per-map bonus objectives;
- optional assist settings.

Each has a direct precedent and needs no accounts or database.

### Cited Findings
- **Daily shared seed and one ranked run.** Builds community and stakes. — [Game Developer: Spelunky Daily (2013)](https://www.gamedeveloper.com/design/the-understated-genius-of-the-i-spelunky-i-daily-challenge)
- **Shareable result grid.** Wordle grew from 90 players to over 2 million weekly players in about 10 weeks after adding sharing. — [Wikipedia: Wordle](https://en.wikipedia.org/wiki/Wordle)
- **Pick one of two modifier cards every few days.** "You get to decide how the game becomes harder"; challenges reset on loss "to remove the frustration of losing". — [The Xbox Hub: PlateUp! (2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/)
- **Player-picked items from a random box each round, persisting and escalating.** — [UCH Fandom (snippet)](https://ultimate-chicken-horse.fandom.com/wiki/Gamemodes)
- **Per-player-count star tables.** — [Game Rant: Overcooked 2](https://gamerant.com/overcooked-2-how-to-get-four-stars/)
- **Hidden skill counter unlocking bonus levels (Overcooked 2 Kevin levels).** — [WikiGameGuides (snippet)](https://wikigameguides.com/6096-how-to-unlock-all-8-secret-kevin-levels-overcooked-2/amp)
- **Per-level bonus objectives such as "not breaking any windows".** Fixed objectives limit replay surprise. — [WellPlayed: Moving Out (2020)](https://www.well-played.com.au/moving-out-review/)
- **Assist options with no penalty.** Longer timers, lighter objects, skip level. Reviewed as reducing "argument inducing" pressure. — [WellPlayed (2020)](https://www.well-played.com.au/moving-out-review/); [Can I Play That?: Moving Out 2 assist modes (2023)](https://caniplaythat.com/2023/06/05/moving-out-2-accessibility-and-assist-modes-detailed/)
- **Mid-level scripted changes** such as a recipe switch on a crash. — [Red Bull (snippet)](https://www.redbull.com/us-en/overcooked-2-ghost-town-games-interview)
- **Drop-in mid-run co-op.** — [The Xbox Hub: PlateUp! (2024)](https://www.thexboxhub.com/exclusive-interview-why-its-happening-and-yogscast-games-want-us-to-plateup/)

### Inferences (prioritised for Delivery Chaos, cheapest first)
1. **Player-count star scaling.** A table change only. It fixes chronic 2-player near-misses.
2. **Daily seed ("今日城市").** Seed derived from the date, covering the layout, order list, requests and weather. Best result goes in localStorage. A copy-to-clipboard emoji line such as "⭐⭐⭐ 🍕✅🍜💥🍦💧 ¥1234". Small cost, strongest no-account retention hook.
3. **"Shift" structure.** Three rounds per session, with a two-card modifier pick between rounds. Example cards: "Lunch Rush: +30% orders, +20% tips"; "Soup Day: only liquid cargo"; "Windy City". The team votes by tapping. This reuses existing systems and gives agency over difficulty.
4. **Order events.** A telegraphed "lunch rush" at a fixed minute, for example 2:00 to 2:30 with a burst of orders. It is deterministic per seed, so it is learnable like Overcooked's scripted changes.
5. **Cosmetic unlocks in localStorage.** Helmets, bike colours, horns and delivery-box skins, unlocked by total stars or joke awards. Cosmetic only, so cleared storage hurts nothing. Optionally offer a short export code.
6. **Per-map bonus objectives.** "Deliver 3 soups with no spills", "No crashes into the fountain". Shown as a single checkbox at round end. Cheap text plus a check.
7. **Assist toggles.** Slower melt, a sturdier pizza tower, a longer timer, with no reward lockout. This protects the "funny not annoying" pillar for mixed-skill friend groups.
8. **Instant retry.** "Same city again" and "new city" buttons on the results screen. Supports the near-miss retry hook.

### Gaps
- No evidence was found on how well localStorage-only progression retains players in browser games, and no comparable web co-op games with published metrics were identified.
- No GDC or postmortem sources on "lunch rush" style scripted events in delivery games were found.

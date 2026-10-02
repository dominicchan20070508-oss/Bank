# Mobile & Browser Party-Game Constraints: Touch Controls, Comms Without Voice, Join Friction, Onboarding, Latency, and Fit of Candidate Upgrades (外卖大乱送 / Delivery Chaos)

Research date: 2026-10-02. Items from before 2024 are marked **[older]**. Labels used: **[data]** = number from an official doc, platform, or peer-reviewed study; **[platform rule]** = a requirement in a portal's developer docs; **[opinion]** = reviewer, designer or blogger judgement; **[estimate]** = third-party traffic estimator or aggregator. All "Inferences" are my reasoning for this game, not sourced facts.

Game context assumed: three.js, opened from a link; phones in landscape (left analog steer pad + right gas/brake/drift/horn/reset = **6 always-visible touch controls**) mixed with keyboard PCs; 2–4 co-op; 4-letter codes + invite links; 4-minute rounds; Render free tier in the US, 110–250 ms RTT for Asian players; no accounts, voice or text chat.

---

## 1. Touch control schemes for driving/action games (joystick vs buttons vs tilt; auto-accelerate; ergonomics; button count)

### Takeaway
Mobile hits converge on **few visible controls, assists on by default, and alternatives in settings**. Examples are Mario Kart Tour's Smart Steering, Auto-item and optional tilt; Asphalt's TouchDrive auto-gas/auto-steer; and Hill Climb Racing's two pedals. Epic's own mobile guidance caps a HUD at **5–6 active controls** and says to prefer contextual actions over new buttons. Delivery Chaos already has 6 visible touch controls, so every new feature should replace, merge with or contextually appear in place of an existing button, never simply add one. Tilt is not a safe default: the evidence is mixed, and in the one controlled tilt-vs-touch comparison found, players preferred touch.

### Cited Findings
- **Epic's mobile design guidance (first-party, UEFN docs)** [platform rule/guidance]:
  - "The thumb zone (the bottom corners of the screen) is where primary actions take place."
  - Maps and scores go "at the top center, or should be collapsible".
  - Show "no more than 5–6 active controls visible at once".
  - Prefer "contextual actions over explicit inputs to reduce the number of buttons".
  - Avoid precision and use aim assist, auto-targeting or contextual actions "instead of pixel-perfect inputs".
  - Text and icons should be at least 44×44 pt; "anything under 18pt reads poorly on a phone and causes the player to mis-tap".
  - Aim for 30 fps on mobile.
  - Source: [Epic Developer Docs: Designing for Mobile in Fortnite](https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite) (no date shown).
- **Mario Kart Tour** (Nintendo, 2019) **[older]**:
  - Control options are Manual Drift, Smart Steering, Auto-item and Gyro Handling (tilt).
  - Smart Steering "automatically keeps the player from going off track" but blocks shortcuts. Experienced players turn it off for control (assist-on default, opt-out for mastery).
  - Sources: [Pocket Gamer](https://www.pocketgamer.com/mario-kart-tour/mario-kart-tour-cheats-tips-custom-control-settings-for-victory/); [Shacknews: changing drift mode](https://shacknews.com/article/114224/how-to-change-drift-mode-in-mario-kart-tour).
  - A later update added a dedicated "drift or steer" button option: [GoNintendo](https://gonintendo.com/stories/349534-mario-kart-tour-s-latest-update-adds-in-a-drift-or-steer-button).
- **Asphalt 9 "TouchDrive"** (Gameloft, 2018) **[older]**:
  - Acceleration and steering are automatic. The player swipes to choose a path at forks and times drift and nitro.
  - Tilt and tap-to-steer remain as options.
  - Reviewer opinion [opinion]: TouchDrive is the best way to play; tilt is "inherently flawed" for racing; and TouchDrive "won't just let you sit back", because drift and nitro timing still decide races.
  - Sources: [Pocket Gamer, 25 Jul 2018](https://www.pocketgamer.com/asphalt-9-legends/asphalt-9s-stripped-back-controls-are-the-best-way-to-play-the-game-heres-five-r/); [Beebom](https://beebom.com/asphalt-9-legends-touch-drive-control-thrilling/amp/).
  - TouchDrive is described as an accessibility-oriented scheme: [Wikipedia: Asphalt 9](https://en.wikipedia.com/wiki/Asphalt_9).
- **Hill Climb Racing** (Fingersoft) **[older]**: the whole game uses two on-screen pedals, gas and brake. In mid-air the same pedals rotate the vehicle, so one control has context-dependent meaning instead of an extra button. It is praised for that simplicity [opinion]. Source: [Wikipedia: Hill Climb Racing](https://en.wikipedia.org/wiki/Hill_Climb_Racing).
- **Brawl Stars** (Supercell) **[older, 2017–18]**:
  - In soft launch the game was portrait with tap-to-move.
  - Supercell then offered joystick and tap options, saw players strongly favour the joystick, and moved to landscape plus joystick only, citing retention.
  - The soft launch lasted 522 days.
  - Sources: [Newsweek](https://www.newsweek.com/entertainment/video-games/brawl-stars-update-landscape-controls-upgrade-system-new-mode-838786); [TouchArcade, Mar 2018](https://toucharcade.com/2018/03/21/brawl-stars-landscape-balance-update-attempts-to-improve-long-range-brawlers/).
  - A community-manager quote, "Our decision was not portrait to landscape. Our decision was landscape or kill [the game]", appears in secondary summaries. I could not confirm it in a primary text. Related interview: [PocketGamer.biz](https://www.pocketgamer.biz/news/69624/brawl-stars-we-at-supercell-have-never-prepared-more-for-a-game-launch/).
- **Tilt vs touch, controlled study** [data]:
  - Teather & MacKenzie, IE 2014, 12 participants, Pong-like paddle game. "Order of control is a greater determinant of performance than input method."
  - Position control beat velocity control. Highest level reached: tilt+position 8.6, touch+position 5.7, touch+velocity 4.6, tilt+velocity 4.2. Misses: 16.6% with position control vs 23.5% with velocity control.
  - Participants "almost unanimously preferred touch + position-control".
  - Source: [York U: Comparing Order of Control for Tilt and Touch Games](https://www.yorku.ca/mack/ie2014.html) **[older]**.
  - A companion tilt-pointing study found position control about 2× faster than velocity control (3.3 vs 1.2 bps): [Teather & MacKenzie, GI 2014](https://www.yorku.ca/mack/gi2014.html) **[older]**.
  - Search summaries also mention a Beach Buggy Blitz study favouring tilt for immersion and performance. I could not verify which paper, so it is not cited.
- **Thumb reach and accuracy** [data/review]:
  - de Andrade (AHFE 2024, *Human Factors in Virtual Environments and Game Design* vol. 137, pp. 126–136) summarises Hoober's touch research. Accuracy is best toward the screen centre and worst in the **corners**. Hoober revised minimum target sizes to about **7 mm in the centre and 12 mm in the corners**, and noted that users still missed targets at those sizes.
  - Hard-to-reach corner placement is used deliberately for ad-close buttons, which shows that corners are hard to hit.
  - Source: [de Andrade 2024, doi:10.54941/ahfe1004994](https://openaccess-api.cms-conferences.org/articles/download/978-1-964867-13-7_13).
- **Contextual vs touch-in-world interaction** [opinion]: PUBG Mobile uses context-sensitive pop-up buttons for interacting with items plus auto-pickup when you walk over loot. Fortnite mobile originally required touching chests and doors where they lie, which the reviewer calls awkward when they are not near the thumb. Source: [Pocket Gamer: Fortnite mobile vs PUBG Mobile](https://www.pocketgamer.com/fortnite/fortnite-mobile-vs-pubg-mobile-which-is-best/) **[older, 2018]**.

### Inferences
- **The current HUD is already at Epic's ceiling.** Six always-visible controls (pad, gas, brake, drift, horn, reset) means any new always-visible button breaks the 5–6 guideline. Candidates to fold away:
  - **reset** into a contextual button that appears only when flipped or stuck;
  - **horn** into the quick-chat trigger (tap = honk, hold = wheel).
- **An auto-accelerate option fits the target audience.** The precedents are Asphalt TouchDrive and Mario Kart Tour's assist toggles. For example, gas becomes "hold to brake / release to go". This frees the right thumb for contextual buttons (hand-off, rescue, chat).
  - It also fits the "understandable at a glance" pillar.
  - Keep manual gas as the default for PC parity, or A/B it. Auto-gas on a wobbly bike that spills cargo may be too punishing unless speed is capped while carrying soup-type cargo.
- **Tilt should stay optional at most.** The evidence is mixed. Phones held by SEA commuters or in a group setting make tilt awkward (not sourced). The left analog pad is the Brawl Stars-validated choice.
- **Place new contextual buttons inward of the extreme corners and large** (≥12 mm, ≥44 pt). The right corner is already crowded with gas and brake.

### Gaps
- No primary source found for Mario Kart Tour's auto-acceleration (widely understood to be always-on) or for exact button counts in Asphalt 9 or Brawl Stars HUDs.
- A search snippet claimed specific joystick ergonomics: comfort radius 27.5–41.3 mm, joystick centre 9.8–19.4 mm from screen edges, and 12 mm buttons giving >90% accuracy. I could not verify its source paper, so these numbers are **unverified**.
- No accessibility data (e.g. one-handed play, colour-blind modes) specific to mobile racing was found.

---

## 2. Communication without voice or typing (quick chat, pings, emotes)

### Takeaway
Shipped mobile titles use **very small, fixed vocabularies**: Wild Rift has 3 ping types; Among Us had 7 categories and then added favourites; Pokémon Unite has a user-curated short list. They trigger with **one button that does tap = default message and hold-and-drag = choose**, give each message a **distinct sound plus a world-space marker**, and add **spam cooldowns**. Data from League of Legends shows that pings help team performance but with **diminishing and then negative returns**. Emote systems used between strangers drift toward taunting, which is why Supercell had to add a mute. For a friends-only co-op game with 6 positive or neutral lines, the risk is low, but a cooldown and per-player mute are standard.

### Cited Findings
- **Wild Rift (Riot, mobile MOBA)** [platform doc]:
  - The ping button sits top-right by default. A single tap pings on your own champion.
  - Tap-and-hold opens a minimap; drag to a spot and release to ping there. Dragging off the minimap cancels.
  - **3 ping types**: Engage, Danger and On My Way, each with a **unique audio cue**.
  - Pings show on the minimap, on the terrain, and next to the pinger's health bar.
  - Spamming temporarily disables pinging, shown as a greyed cooldown.
  - Source: [Riot Support: Pings in Wild Rift](https://support.riotgames.com/wild-rift/gameplay/pings-in-wild-rift).
- **Among Us Quick Chat (Innersloth)**:
  - The original was a radial wheel with **7 category spokes**: Accusation, Crew, Systems, Location, Statements, Question and Response. Players compose lines like "I was with X" and "This is a self report": [Among Us Wiki: Quick Chat](https://among-us.fandom.com/wiki/Quick_Chat).
  - Restricted (under-13) accounts get Quick Chat only, so preset chat doubles as a safety system: [TheGamer](https://www.thegamer.com/among-us-adds-quickchat-feature/).
  - In May 2023 Innersloth replaced the radial ("Say bye bye to the old Radial Menu!") with a new interface. It refined categories, added more phrases, and added **favourites** for most-used lines, aiming for "an even better (and quicker)" experience: [Innersloth dev log, 10 May 2023](https://www.innersloth.com/?p=4443).
- **Pokémon Unite**: players choose which quick-chat lines appear in-match under Menu → Settings → Quick Chat Settings. One patch added 19 customisable commands, quick chat in lobbies, and lines that compliment teammates: [TheGamer](https://www.thegamer.com/pokemon-unite-quick-message-improvements/).
- **Brawl Stars**: in-match emote ("pin") slots; the 5 most recently used pins sit behind a shortcut, and pins can be assigned to emote slots 4–5. This is a secondary source and details change by version: [esports.net](https://www.esports.net/news/mobile-games/how-to-change-pins-in-brawl-stars/).
- **Clash Royale emotes (Supercell)** **[older, 2016]**: in June 2016 Supercell refused to add an emote mute, saying "evoking strong emotions" was core: [TouchArcade, 14 Jun 2016](https://toucharcade.com/2016/06/14/supercell-doubles-down-on-never-muting-emotes-in-clash-royale). By September 2016 an update added emote mute: [TouchArcade, 19 Sep 2016](https://toucharcade.com/2016/09/19/clash-royale-update-adds-emote-mutenew-tournaments-cards-and-more/). Spammed taunt emotes are widely seen as "BM" or toxic [opinion].
- **Ping effectiveness, hard data** [data]:
  - Leavitt, Keegan & Clark, CHI '16, analysed **84,489 players across 10,293 League of Legends matches**.
  - Ping volume depends on role and activity. Pings have "a positive but concave relationship with player performance": more pings help up to a point, then hurt, which the authors frame as interruption cost.
  - Source: [ACM DL, doi:10.1145/2858036.2858132](https://dx.doi.org/10.1145/2858036.2858132) **[older]**.
- **Platform rule**: if a game has chat, CrazyGames requires it to be disable-able via the platform setting and filtered (profanity filter or AI moderation): [CrazyGames docs: Multiplayer](https://docs.crazygames.com/requirements/multiplayer/). Preset lines avoid user-generated content entirely.

### Inferences
- **Six lines is within the shipped range**, between Wild Rift's 3 pings and Among Us's 7 categories. A 6-slice radial is also big enough per slice for thumb accuracy on a 6-inch landscape phone (not sourced).
- **Friends vs strangers:** these friend groups mostly sit in the same room or on a Discord or LINE call. In that setting quick chat is less about coordination and more about **funny reactions plus a fallback for remote groups**. Expect "Sorry", "Nice!" and "I crashed" to dominate (consistent with Among Us favourites and Pokémon Unite compliment lines). Coordination lines ("Follow me", "Move!") matter most for remote or stranger groups.
- **Concave returns mean a cooldown is a design feature, not just anti-spam.** One example would be a 3-second cooldown or 3 messages per 10 seconds.
- **Location-bearing pings beat text lines for a driving game.** "Help!" and "I crashed" should automatically drop a world marker at the sender's bike, visible through buildings and on the minimap (Wild Rift shows pings in world, on minimap and on the HUD). This makes the line actionable without reading.

### Gaps
- No public data found on how often quick-chat lines are used with friends vs strangers in Among Us, Brawl Stars or Fortnite mobile.
- No first-party source found for Fortnite mobile's ping or emote wheel slot count. Rocket League's quick-chat structure was not fetched.
- No published study of radial menu slot limits on phones was retrieved in this pass.

---

## 3. Join/invite friction, retention and virality (Jackbox, .io, skribbl/Gartic, Poki/CrazyGames, Discord Activities, WeChat/Telegram)

### Takeaway
The browser-party winners remove every step between the link and play: no app, no account, a code or link, and land in the room. **Portals now enforce this.** CrazyGames requires "Instant Multiplayer": land in a private room, be joinable immediately, keep the group together across rounds. It also caps initial download at **20 MB for mobile-homepage eligibility**. Web players say they come for free, easy entry and quick sessions. Discord Activities is the most relevant new channel for friend groups, because it **supplies the voice chat Delivery Chaos lacks**. The single biggest join-friction risk specific to this game is **Render free-tier cold start (~1 minute after 15 minutes idle)**.

### Cited Findings
- **Jackbox** **[older, 2020 article]**:
  - Players type a room code at jackbox.tv in any browser. No app, no per-player purchase and no peripherals are needed, and phones can show private per-player information.
  - CCO Allard Laban: "If I find it difficult, then my aunt's going to find it very difficult."
  - Games "teach themselves through play". The input vocabulary is limited to drawing, choosing buttons or typing text.
  - Sources: [Built In, 19 Jun 2020](https://builtin.com/media-gaming/jackbox-games-design-party-pack); [Jackbox support: getting started](https://support.jackboxgames.com/hc/en-us/articles/15794771245975-How-do-I-get-started-playing-Jackbox-Games).
- **Gartic Phone / skribbl.io**: Gartic Phone rooms are joined via **link or QR code**, and skribbl private rooms are link-only. Both spread by people pasting links into communities and chats [secondary/opinion; drawn from search summaries, pages not fully fetched]: [It's All Widgets: Gartic Phone](https://itsallwidgets.com/gartic-phone); [Liverpool Univ. guide to Gartic Phone](https://www.liverpool.ac.uk/researcher/postdoc-appreciation-week/npdc/engagement/pre-conference/gartic-telephone/); [Mytour: skribbl private rooms](https://mytour.vn/en/blog/kinh-nghiem-hay/how-to-create-a-private-room-in-skribblio-mytour.html).
- **CrazyGames multiplayer requirements** [platform rule]:
  - Pass room info through the SDK so friends can join from the portal UI. An optional copyable **invite link** carries `inviteParams`.
  - With **Instant Multiplayer** the game must "launch directly into multiplayer mode". It must put the first player "directly into a new private room with default settings", and that player must be "joinable immediately". Intermediate onboarding is skipped or optional.
  - Groups must continue together after a round without returning to the portal.
  - Spectator mode for mid-round joiners is "strongly recommended".
  - Chat must be disable-able.
  - Source: [CrazyGames docs: Multiplayer](https://docs.crazygames.com/requirements/multiplayer/).
- **CrazyGames technical requirements** [platform rule]: initial download ≤ 50 MB, and **≤ 20 MB to be eligible for the mobile homepage**. Games must "land directly in gameplay" and follow PEGI-12 content standards. Sources: [CrazyGames requirements intro](https://docs.crazygames.com/requirements/intro/); [technical](https://docs.crazygames.com/requirements/technical).
- **Poki / web-player behaviour** [data from a sponsored survey]: Atomik Research for Poki, July 2026, surveyed 2,000 weekly US/UK web gamers and 400 developers.
  - A typical session is **11–20 min** (29%), and 49% try 2–3 games per session.
  - 37% play several times a day.
  - Reasons to play: free (58%), **easy entry (56%)**, quick gameplay (52%), no download (34%).
  - **90% multitask** while playing (music 56%, streaming 49%, social media 38%).
  - Caveats: US/UK only, not SEA, and sponsored by Poki.
  - Source: [GameDevReports summary, 9 Jul 2026](https://gamedevreports.substack.com/p/poki-web-gaming-perceptions-in-2026).
- **Poki scale** [data]: 2024 brought 8.1 billion gameplays, about 500 M players and 321 new titles: [Mobidictum, 30 Dec 2024](https://mobidictum.com/pokis-2024-milestones-a-booming-year-for-web-gaming/). Poki says it has 100 M+ monthly players: [Insider Gaming interview](https://insider-gaming.com/interview-entertaining-100-million-gamers-poki-no-charge/).
- **Poki traffic** [estimate]: Semrush, December 2025, estimates poki.com at about 144 M visits per month with an average visit of about 15 min. Mobile share of traffic is about 48% in the US, 53% in Brazil and 54% in India. These are estimates, not Poki data: [Semrush: poki.com](https://www.semrush.com/website/poki.com/overview).
- **Discord Activities**:
  - The Embedded App SDK opened to all developers in 2024. Activities run in an **iframe** inside Discord, and one build ships to desktop, mobile and web Discord.
  - They launch "in channels, DMs, or from the App Launcher", and "players can jump in together with friends already in a voice channel".
  - Sources: [Discord Developer Docs: Activities](https://docs.discord.com/developers/platform/activities); [GamesBeat](https://gamesbeat.com/discord-opens-activities-in-app-games-and-features-to-all-developers/); [PocketGamer.biz](https://www.pocketgamer.biz/discord-activities-opens-up-to-all-developers-to-make-games-on-the-platform).
  - Discord's own figures (Sep 2024) [data, first-party]: 200 M MAU, 90%+ of whom game. 25% of MAU use apps. App Launcher, rich presence, voice-channel launch and "rich embeds" showing who is playing serve as invites.
  - Example: Playroom's *Death by AI* reached "nearly 7 million players" and "over 1 million hours of gameplay in just weeks". Source: [Discord blog: Build where the world plays, 26 Sep 2024](https://discord.com/blog/build-where-the-world-plays).
- **WeChat mini-games** [data/estimates]:
  - About 500 M MAU in mid-2025, with PC usage rising: [TechNode, 26 Jun 2025](https://technode.com/2025/06/26/wechat-mini-program-games-hit-500-million-monthly-users-pc-usage-surges/).
  - 571 M MAU in August 2025, flat for 2–3 years. Over 80% of game launches come from the pull-down menu, social sharing or search (secondary summary): [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/tencent-pivots-wechat-mini-games-to-retain-500m-users).
  - China-only distribution needs a Chinese entity and approvals (not researched here).
- **Telegram Mini Apps** [estimate, aggregator]: reach peaked at about 1.44 B monthly users in September 2024 during the tap-to-earn era (Hamster Kombat) and fell to about 150–190 M by mid-2025. Treat as rough: [VoxBooster Telegram stats 2026](https://voxbooster.com/blog/telegram-statistics-2026).
- **Render free tier, a join-friction fact** [platform doc]:
  - Free web services **spin down after 15 minutes without inbound traffic** (WebSocket messages count) and take **about 1 minute to spin back up**, showing a loading page meanwhile.
  - The allowance is 750 free instance-hours per month per workspace.
  - Free services "might restart" at any time and are single-instance.
  - Source: [Render docs: Free instances](https://render.com/docs/free).

### Inferences
- **Links vs codes: use both, for different situations.**
  - The **link** is the primary invite for remote friends in chat apps; skribbl and Gartic Phone are link-first.
  - The **4-letter code** is for the same room or a streamer reading it aloud (the Jackbox model).
  - A **QR code** on the host's screen is the fastest same-room phone-to-phone join (Gartic Phone precedent).
  - The invite link should land directly in the room with a pre-filled random name. The only allowed step is a single "Join" tap, which is also the user gesture needed to unlock audio and fullscreen or landscape on mobile browsers.
- **The cold start is the top join-friction bug for SEA friend groups.** The first click after 15 idle minutes waits about 60 seconds.
  - Mitigations:
    - pre-warm by pinging the server on page load, before the host taps "Create";
    - show honest "waking the delivery depot… ~40 s" copy;
    - **let players drive a client-only bike in an offline yard while waiting**, which turns dead time into the tutorial.
  - One always-on service needs about 720–744 h/month, just under 750 h. Two services (e.g. US + Singapore) would exceed the free hours. This is arithmetic, not a Render statement.
- **Keep rooms across rounds and allow mid-round spectating.** CrazyGames requires both, and both cut re-join friction between 4-minute rounds.
- **Discord Activities is the natural answer to "no voice chat"**, because friends launch it inside a voice call. Costs: iframe/proxy constraints, Discord auth integration, and a separate build. Not a v1 priority, but the strongest distribution fit for the 18–28 friend-group target.
- **Portal fit:** shipping on CrazyGames or Poki mobile needs a small initial download (≤20 MB for CrazyGames' mobile homepage). three.js plus a small city can fit if assets are compressed (not measured).

### Gaps
- No first-party Poki or CrazyGames figure for **mobile share of plays** or for **multiplayer vs single-player session length** was found. The Semrush figures are estimates.
- No hard data found on .io-game virality mechanics (agar.io, slither.io, krunker), e.g. streamer-driven spikes. Discord Activities technical limits (URL-mapping proxy, WebSocket handling, participant caps) were not confirmed from the full docs.
- No data on which messaging apps SEA friend groups use to share invite links (LINE, WhatsApp, Messenger, Zalo, Telegram); any claim here would be unsourced.
- Jackbox's audience and streamer mode was not researched.

---

## 4. Onboarding without tutorials

### Takeaway
The reference party games (Jackbox, Fall Guys, Overcooked) teach by putting players straight into a low-stakes version of the real task, with a tiny input vocabulary and visual recipe or goal cues. Portals now require landing directly in gameplay. For Delivery Chaos, the first 30 seconds should be a real delivery with an arrow, an icon-only prompt and a forgiving spill, not a text tutorial.

### Cited Findings
- **Jackbox**: games "teach themselves through play". Once you have played one, the interaction model (draw, choose a button, type) transfers to all others. Source: [Built In, 2020](https://builtin.com/media-gaming/jackbox-games-design-party-pack) **[older]**.
- **Fall Guys** **[older, 2020]**: there is no tutorial, by design; players drop straight into round one. Lead designer Joe Walsh wanted "a multiplayer game for people who don't like multiplayer games" (secondary summaries of interviews). Sources: [Creative Review: Behind the scenes of Fall Guys](https://www.creativereview.co.uk/behind-the-scenes-fall-guys-game/); [WayTooManyGames interview with Anthony Pepper](https://waytoomany.games/2020/08/18/interview-with-anthony-pepper-senior-designer-behind-fall-guys/). A reviewer argues its wobbly imprecision is the appeal [opinion]: [Mein-MMO](https://mein-mmo.de/en/fall-guys-is-wobbly-imprecise-and-silly-and-thats-what-makes-it-so-good,538568/).
- **Overcooked** [opinion, designer essay]: the first kitchens show a recipe card (chalkboard) of what the dish needs, then let players fail and figure it out ("Montessori"-style). Each level layers a new hazard. Source: [UX Collective: The UX of Overcooked](https://uxdesign.cc/the-ux-of-overcooked-from-umami-to-unexpected-design-principles-56e9ea146f7e).
- **Portal rules**: CrazyGames requires games to "land directly in gameplay", and in Instant Multiplayer mode intermediate onboarding must be skipped or optional: [CrazyGames requirements](https://docs.crazygames.com/requirements/intro/); [Multiplayer](https://docs.crazygames.com/requirements/multiplayer/).
- **Epic guidance**: "Hook players early" using quick play-throughs and clear visual UI. Source: [Epic: Designing for Mobile](https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite).
- **Player motivation data**: "easy entry" is cited by 56% of weekly web gamers as a reason to play web games, and "quick gameplay" by 52%: [GameDevReports/Poki, Jul 2026](https://gamedevreports.substack.com/p/poki-web-gaming-perceptions-in-2026).

### Inferences
- **First 30 seconds:**
  - Spawn next to a restaurant with one glowing order already in the basket. A big arrow and distance points to the customer. Show only gas and steer at first, fading in drift and horn after the first delivery.
  - The first spill should be **funny and forgiving**, for example a big "SPLAT" with partial tip loss, which teaches by failure as Overcooked does.
- **Contextual buttons double as the tutorial.** A button that appears only when relevant (hand-off, rescue, reset when flipped) teaches itself the first time it pulses. This is the PUBG-Mobile/Epic "contextual over explicit" principle. Each contextual button needs a **world-space cue as well as the HUD button**, so players learn why it appeared.
- **The cold-start wait (section 3) is free tutorial time.** An offline practice yard costs no server resources.

### Gaps
- No primary data (e.g. funnel or retention numbers) on tutorial-less vs tutorial onboarding in party games was found.
- No first-party description of Among Us's or .io games' first-session flow was fetched; Among Us's role-reveal screen and .io "type name → play" flows are commonly cited but unsourced here.

---

## 5. Latency tolerance for co-op physics on free/cheap hosting (and US vs Singapore region)

### Takeaway
Co-op actions that are not twitch-competitive tolerate **hundreds of milliseconds**: one Claypool study found a tipping point around **~400 ms**. 110–250 ms is therefore workable if the game uses the standard recipe:
- **client authority over your own bike**, cooperative games only (Gaffer On Games);
- **interpolate other bikes ~100 ms in the past** (Gambetta);
- **server or host arbitration only for shared objects** such as order claims and cargo hand-offs.

Mechanics that need two players' bikes to be precisely co-located at the same moment are the most latency-sensitive. Singapore hosting would cut SEA latency by roughly the 165 ms US–SG backbone gap, but Render cannot move an existing service.

### Cited Findings
- **Latency tolerance study** [data]: Durnez, Zheleva, Claypool et al., *IEEE Transactions on Games* 14(4), 2022. Performance and QoE degrade with latency, but actions are "fairly tolerant of even hundreds of milliseconds", with "a crucial tipping point at ~400 ms". The study used a desktop exergame with local latency. Source: [WPI: Spaz! paper](https://web.cs.wpi.edu/~claypool/papers/spaz-22).
- **Gambetta, Fast-Paced Multiplayer**:
  - Client-side prediction makes your own entity feel "exactly like a single-player game".
  - Remote entities are interpolated and rendered in the past (e.g. ~100 ms at a 10 Hz server tick), which "usually creates an incredibly seamless experience".
  - The weakness is events needing high spatial and temporal accuracy, such as hitting a moving target, because "every player sees a slightly different rendering of the game world".
  - Sources: [Gambetta: Entity Interpolation](https://gabrielgambetta.com/entity-interpolation.html); [Part II: Client-Side Prediction & Server Reconciliation](https://gabrielgambetta.com/client-side-prediction-server-reconciliation.html).
- **Gaffer On Games (Glenn Fiedler), Networked Physics in VR** (22 Feb 2018) **[older]**:
  - Players "take authority over cubes they interact with and send the state for those cubes to other players". This avoids rollback, and authority cascades through collisions.
  - **Ownership** (holding an object) is stronger than authority. Sequence numbers resolve conflicts, with the host as arbiter, and conflicts are "rare in practice".
  - Fiedler stresses this is "best used for cooperative experiences only", because it lacks server-authoritative cheat protection.
  - Source: [Gaffer On Games: Networked Physics in VR](https://gafferongames.com/post/networked_physics_in_virtual_reality/).
- **Inter-region backbone latency** [data, third-party measurement of AWS]: us-west-2 (Oregon) ↔ ap-southeast-1 (Singapore) is about **165 ms**, before last-mile mobile latency. Source: [Economize: AWS latency us-west-2 vs ap-southeast-1](https://www.economize.cloud/resources/aws/latency/us-west-2-vs-ap-southeast-1/).
- **Render regions** [platform doc]: Oregon, Ohio, Virginia, Frankfurt and **Singapore**. "Render doesn't currently support changing the region for an existing service"; you must create a new service and migrate: [Render docs: Regions](https://render.com/docs/regions).
  - Render's launch post claimed Singapore would cut APAC latency by "almost 90%" [vendor claim]: [Render blog: new regions](https://render.com/blog/new-regions).
  - Free-tier availability in Singapore appears in Render's docs index per search summary but is **not stated on the regions page**, so verify in the dashboard.
- **Render free tier limits**: spin-down after 15 minutes idle, ~1-minute cold start, may restart anytime, single instance: [Render docs: Free](https://render.com/docs/free).

### Inferences
- **For this game**, 110–250 ms RTT is below the ~400 ms tipping point found for non-shooter actions. Driving your own bike with local physics and authority will feel instant. Teammates' bikes will lag visually by about RTT/2 plus the interpolation buffer, roughly 150–250 ms. That is fine for co-op as long as nothing requires frame-exact contact between two bikes.
- **Latency-sensitive candidates are hand-off (3) and rescue (1)**, because both depend on two bikes' relative positions. At hand-off speeds (slow, under ~3 m/s), a 250 ms discrepancy is under ~0.75 m of position error, well inside a 3 m radius (arithmetic, not sourced).
  - Use server- or host-arbitrated *ownership transfer* of the cargo item: request → grant → both clients play the animation. This is Gaffer's ownership pattern.
  - Let the requesting client play an optimistic "toss" animation to hide the round trip.
- **Region choice**: the target players are SEA friend groups, so a Singapore service would roughly remove the ~165 ms trans-Pacific leg. The cost is that US/EU players then pay it, and the region change means a new Render service (new URL, so old invite links break unless a stable domain fronts it).
  - Running both US and SG services exceeds the free 750 h/month if both stay warm.
- **Cold starts and random restarts matter more than RTT** on the free tier for "funny not annoying". Rooms should survive a reconnect (rejoin by code, resume round), and the client should handle a server restart gracefully.

### Gaps
- Claypool & Claypool's 2006 CACM "Latency and Player Actions" thresholds by perspective were not verified. The PDF could not be text-extracted, so they are not cited. The commonly quoted figures are ~100 ms first-person, ~500 ms third-person, ~1000 ms omnipresent.
- Valve's "Source Multiplayer Networking" page returned HTTP 403, so its default 100 ms interpolation figure is not cited from source.
- No measured SEA→Render-Singapore RTTs found. Measuring from players' real networks is recommended.

---

## 6. Fit of candidate upgrades on phones: (2) dispatcher map, (8) quick-chat wheel, (3) contextual cargo hand-off, (1) rescue button

### Takeaway
Ranked by phone fit:
1. **(1) Rescue contextual button: best.** It appears only when needed, the precedent is mobile contextual or auto actions, and it is latency-tolerant.
2. **(3) Hand-off: good if contextual and arbitrated**, with world-space cues for discoverability. Consider making it automatic.
3. **(8) Quick-chat: fine** if it reuses an existing button (horn hold) and has a cooldown, but its value is lower for same-room or voice-call friends.
4. **(2) Full-screen dispatcher map: worst fit.** It takes both thumbs off driving, violates "maps collapsible / top-center", and has no direct mobile precedent in real-time driving. Its best form is a Wild Rift-style hold-drag-release gesture on a mini-map, or a non-full-screen order list.

### Cited Findings (evidence base reused from sections 1–5)
- Cap of "no more than 5–6 active controls visible at once"; prefer "contextual actions over explicit inputs"; primary actions in the bottom-corner thumb zones; maps "top center, or … collapsible"; minimum 44×44 pt targets: [Epic: Designing for Mobile](https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite).
- Contextual pop-up buttons plus auto-pickup (PUBG Mobile) vs touching objects in the world (Fortnite mobile, criticised) [opinion]: [Pocket Gamer](https://www.pocketgamer.com/fortnite/fortnite-mobile-vs-pubg-mobile-which-is-best/).
- One-thumb map targeting: Wild Rift's tap = self-ping and hold → minimap → drag → release, with cancel by dragging off: [Riot Support](https://support.riotgames.com/wild-rift/gameplay/pings-in-wild-rift).
- Quick-chat precedent: 3 types (Wild Rift), 7 categories plus favourites (Among Us), user-curated list (Pokémon Unite), and pings' concave returns: [Riot](https://support.riotgames.com/wild-rift/gameplay/pings-in-wild-rift); [Among Us Wiki](https://among-us.fandom.com/wiki/Quick_Chat); [Innersloth 2023](https://www.innersloth.com/?p=4443); [TheGamer: Unite](https://www.thegamer.com/pokemon-unite-quick-message-improvements/); [Leavitt et al. CHI '16](https://dx.doi.org/10.1145/2858036.2858132).
- Emote mute was added after toxicity complaints: [TouchArcade Sep 2016](https://toucharcade.com/2016/09/19/clash-royale-update-adds-emote-mutenew-tournaments-cards-and-more/).
- Co-op ownership transfer with host arbitration: [Gaffer On Games](https://gafferongames.com/post/networked_physics_in_virtual_reality/). Remote entities render ~100 ms in the past: [Gambetta](https://gabrielgambetta.com/entity-interpolation.html). Latency tipping point ~400 ms: [Claypool et al. 2022](https://web.cs.wpi.edu/~claypool/papers/spaz-22).
- Corners are the least accurate touch region; targets ≥12 mm in corners: [de Andrade 2024](https://openaccess-api.cms-conferences.org/articles/download/978-1-964867-13-7_13).

### Inferences (per upgrade)

**(1) Rescue/pickup contextual button near a crashed teammate**
- **Touch-UI cost: low.** The button exists only while a crashed teammate is within range, so the steady-state HUD stays at 6 controls.
  - Place it **above the gas button**, inward from the corner (≥12 mm, ≥44 pt), so the right thumb slides up from gas.
  - When players are stopped near a crash, the thumb is free.
- **Discoverability: high.** The crashed teammate is a visible event: ragdoll, spilled food, and an "I crashed" auto-ping with a world marker. The button pulses with the same icon floating over the crashed bike.
  - Better still on phones: **make rescue automatic when you stop next to the teammate for ~1 s**, like PUBG auto-pickup, and keep the button only for PC/keyboard parity or as a visible confirmation.
- **Latency: tolerant.** A rescue is not frame-critical; server-confirm and play an optimistic animation.
- **Precedent:** contextual interaction buttons in mobile shooters (PUBG Mobile); Epic's "contextual over explicit". Direct mobile revive-button documentation was not fetched (see Gaps).
- **Pillar fit:** co-op over competition, and funny when the rescue is slapstick.

**(3) In-motion cargo hand-off when two bikes are within 3 m and slow**
- **Touch-UI cost: low to moderate.** It is contextual, so it does not occupy space permanently. However it appears while **both thumbs are busy** (steering and holding gas or brake at low speed).
  - Pressing it means lifting the right thumb off gas. At "slow" speeds that is acceptable, and could even be required: hand-off only when not accelerating.
  - Share the slot with the rescue button. Both are "teammate-adjacent contextual" actions; never show two contextual buttons at once.
- **Discoverability: medium to low.** The trigger (≤3 m and slow) rarely happens by accident in a 4-minute round, so players may never see it.
  - Add a **world-space cue**: a dotted line or ring between the two bikes when hand-off is possible, plus the button.
  - Seed it with a natural situation, e.g. when one bike's basket is full and a teammate is adjacent.
  - Consider an **automatic version** (drive alongside for 1 s → cargo hops over, with a cancel by braking). This removes the button and matches the "contextual/auto over explicit" guidance.
- **Latency: the most sensitive of the four.** It needs two players' views to agree that the bikes are close.
  - Server-arbitrated ownership transfer (Gaffer) plus a generous radius (3 m vs ~0.75 m worst-case error at slow speed) makes 250 ms RTT acceptable.
  - Use a tossed-food arc animation that "flies" for ~300 ms to mask confirmation delay; a toss that misses is itself funny.
- **Precedent:** no direct mobile driving-game precedent was found. The closest analogues are Overcooked-style passing (console) and contextual interact buttons (PUBG Mobile).

**(8) Quick-chat wheel with 6 preset lines ("Move!", "Follow me", "Help!", "Sorry", "Nice!", "I crashed")**
- **Touch-UI cost: moderate if it adds a button, low if it reuses horn.** A new always-visible button would make 7 controls, above Epic's 5–6. Recommended: **tap horn = honk, hold horn = 6-slice radial, drag + release = send**, and release in the centre to cancel. This mirrors Wild Rift, where you cancel by dragging off the minimap.
  - The horn already lives on the right side, so the right thumb leaves gas for ~0.5–1 s. Acceptable, since the bike coasts.
  - On PC, map the lines to number keys 1–6 or a key-hold wheel.
- **Discoverability: medium.** Hold-to-open is not obvious. Teach it once with a tiny "hold" hint on the horn after the first honk, and auto-send "I crashed" (with marker) on crash so players see quick-chat bubbles from round one.
- **Content:**
  - "I crashed" and "Help!" should **auto-attach a location marker** (Wild Rift style). "Follow me" should attach the sender's position trail.
  - Six lines matches shipped vocabularies (3–7).
  - The two positive lines ("Sorry", "Nice!") fit Pokémon Unite's compliment lines and the "funny not annoying" pillar.
  - No taunts; per-player mute plus a cooldown (Clash Royale lesson; concave-returns data).
  - Distinct sound per line, and a speech bubble above the sender's bike, visible off-screen as an edge arrow.
- **Value caveat:** for same-room or Discord-call friend groups the coordination value is low; it serves remote friends, streamers and portal strangers. It also satisfies portal "chat disable-able" rules trivially, because there is no user-generated text.
- **Precedent:** strong (Among Us, Wild Rift, Pokémon Unite, Brawl Stars, Clash Royale).

**(2) Full-screen dispatcher map: tap an order, then tap a teammate to assign it**
- **Touch-UI cost: high.** A full-screen overlay means both thumbs leave the controls. In a physics driving game the bike keeps wobbling and can crash or spill while the map is open, which risks breaking "funny not annoying".
  - It conflicts with Epic's "maps top center or collapsible".
  - Two sequential precise taps on small moving markers are exactly the "precision" input Epic advises against.
- **Discoverability: medium.** Needs a map button (7th control) or a gesture; the assign-by-tap mechanic needs explanation.
- **Latency: tolerant.** Assignments are not frame-critical, so 250 ms is fine.
- **Precedent:** no real-time mobile driving or co-op precedent found for a full-screen assignment map. The closest mobile pattern is Wild Rift's **one-gesture hold → minimap → drag → release**.
- **Phone-friendly redesign:**
  - (a) Only allow the full map while stopped, with auto-brake while open; or
  - (b) replace it with a **drag gesture on a compact order list**: drag an order card onto a teammate's portrait at the top of the screen; or
  - (c) replace "assign" with **"claim" pings**: tap an order card to mark it "mine", which is co-op-friendly and one tap.
  - On PC, keep full map plus mouse as a richer view; asymmetric UI across platforms is acceptable if outcomes match.

### Gaps
- No first-party documentation fetched for mobile revive/rescue buttons (PUBG Mobile, Fortnite mobile, Apex Legends Mobile, Call of Duty Mobile). The rescue-button precedent rests on general contextual-button evidence.
- No playtest or telemetry data exists yet for this game on actual phone thumb conflicts. All UI-cost judgements above are design inferences and should be validated by a 4-player phone playtest, for example by measuring how often the right thumb leaves gas and crash rate while the map or wheel is open.
- No precedent found for in-motion item hand-off between vehicles in any mobile game.

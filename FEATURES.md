# Features

This is the list of what must still be in the game. Each line is one behavior a player can see or trigger, with the file that owns it.

Rules:
- Every PR that adds or changes a feature updates this file in the same PR, ending the line with its issue `(#N)`.
- Never delete a line unless an issue asks for that feature to go. In that case move it to **Removed on purpose** and name the issue.
- The `id` in front of each line is stable. Tests reference it (e.g. `it('presence.lunch-rush', …)`). Once a test guards a line, add the test file after the path (`test:` for Vitest, `e2e:` for Playwright).
- `url:` is where a dev sees the line in the running app: a path for the dev server, without host and port (`/?seed=1&time=11&event=coffee`). Use `?seed=1&time=…` for a repeatable start and `?event=<dev event id>` (`dev.list()` in the console) for a state the sim only reaches by chance; register a dev event if none fits. Add one to every line you add or change where a URL can show it. `e2e/feature-urls.spec.ts` opens each of them.

## Views and camera
- `view.orbit` Orbit view (default, `2`): drag rotates, right-drag pans, wheel zooms — `src/render/Views.ts`, e2e: `e2e/smoke.spec.ts`, url: `/#orbit` (#34, #38)
- `view.iso` Iso view (`1`): orthographic, drag pans, eased wheel zoom, drag people to move them, follows a steered person — `src/render/IsoCamera.ts`, e2e: `e2e/smoke.spec.ts`, url: `/#iso` (#34, #38)
- `view.plan` Plan view (`3`): top-down, pan/zoom, touch pan/pinch — `src/render/Views.ts`, e2e: `e2e/smoke.spec.ts`, url: `/#plan` (#34, #38)
- `view.walk` Walk view (`4`): first person, WASD/arrows, Shift runs (FOV widens), head bob, nav-grid collision, click captures the mouse, `Esc` back to orbit — `src/render/Views.ts`, e2e: `e2e/smoke.spec.ts`, url: `/#walk` (#34, #38)
- `view.walk-reticle` Walk mode crosshair with prompt; `E` or click opens/closes doors and talks to people — `src/ui/Overlay.ts`, `src/game/Game.ts`, url: `/#walk` (#38)
- `view.third` Over-the-shoulder camera for day mode: mouse turns, wheel zooms 2.2–9 m, no view-bar button — `src/render/Views.ts`, url: `/?day` (#38)
- `view.deeplinks` Hash deep links `#iso` `#orbit` `#plan` `#walk` `#walk@x,z,yaw`; the hash wins over the saved view — `src/render/Views.ts`, e2e: `e2e/smoke.spec.ts`, url: `/#walk@20,7,1.57` (#34, #38)
- `view.persist` Camera of all views, view mode, time and selection are restored next visit (`saftladen.state`) — `src/ui/persist.ts`
- `view.help` Collapsible controls panel, hints grouped per mode with mouse icons and keycaps — `src/render/Views.ts`

## Keys (outside day mode)
- `keys.names` `N` toggles name labels — `src/game/Game.ts`, e2e: `e2e/smoke.spec.ts` (#34)
- `keys.roof` `R` toggles the sawtooth roof (iso/orbit only) — `src/game/Game.ts`, e2e: `e2e/smoke.spec.ts` (#34)
- `keys.home` `H` sends the selected person to home office / back — `src/game/Game.ts`, `src/game/Presence.ts`, e2e: `e2e/office.spec.ts` (#34)
- `keys.follow` `F` toggles camera follow of the selected walker — `src/game/Game.ts`
- `keys.steer` `C` steers the selected person (WASD/arrows relative to camera, Shift runs 5.4 vs 2.2 m/s); one person at a time, only if in the office — `src/game/Game.ts`
- `keys.escape` `Esc` ends the day and clears selection, follow and steering — `src/game/Game.ts`
- `keys.dev` Backtick toggles the dev panel — `src/ui/DevPanel.ts`
- `keys.guard` Keys are ignored while typing in inputs; held keys are released on blur — `src/game/Game.ts`

## Selection and dragging
- `select.click` Clicking a person or pet selects and follows it; clicking again deselects; a drag isn't a click — `src/game/Game.ts`
- `select.tooltip` Hover/click tooltip with name, role, portrait — `src/ui/Overlay.ts`
- `select.actions` Action card: follow, steer, send home (disabled with "Alle Homeoffices sind besetzt"), send out — `src/ui/Actions.ts`, e2e: `e2e/office.spec.ts` (#34)
- `drag.person` People can be dragged; dropping inside a wall/desk moves them to the nearest free floor — `src/game/Game.ts`
- `drag.chair` Dragging near a free chair snaps them on; they stay seated when dropped — `src/game/Game.ts`
- `drag.meeting-chat` Dropping someone in the meeting room next to a person, or 2+ people on meeting chairs, starts a chat — `src/game/Meeting.ts`
- `drag.booth` Dropping someone on the phone-booth stool makes them sit and take a call — `src/game/PhoneBooth.ts`

## Presence
- `presence.share` About 36% of the team is out at any time, 45% of those in home office — `src/game/Presence.ts`, test: `src/game/Presence.test.ts`
- `presence.errand` Errands (25–70 s) and home office (90–220 s) go through the front door and porch; away people are hidden and not clickable — `src/game/Presence.ts`, `src/game/Door.ts`, url: `/?seed=1&time=11&event=errand` (#38)
- `presence.hours` Office hours per person: habitual arrive / leave / lunch hour (`schedule` in team data, fallback core hours 08:00–17:30); every day at 04:00 each person gets a fresh plan with jitter, so arrivals and departures are staggered — `src/game/Presence.ts`, `src/data/team.ts`, test: `src/game/Presence.test.ts`, url: `/?seed=1&time=8` (#5, #38)
- `presence.lunch` Lunch at each person's own hour (short errand); some skip it or eat at the desk; 4+ out at once counts as the lunch break — `src/game/Presence.ts`, test: `src/game/Presence.test.ts`, url: `/?seed=1&time=12` (#5, #38)
- `presence.errand-window` Errands and home office spells only between 07:30 and 18:00, not shortly before going home — `src/game/Presence.ts` (#5)
- `presence.night-shift` Night owls: per-person chance to stay on into the night (desk lamp on; `nightHome` people from the home office, e.g. marco-rieser); some days a crunch keeps 2–4 more in — `src/game/Presence.ts`, `src/data/team.ts`, test: `src/game/Presence.test.ts`, url: `/?seed=1&time=22` (#5, #38)
- `presence.door-flow` Arrivals and departures don't jam the front door: people walk in one after another (at most 2 on their way in at once, 1.5–3.5 s apart), at most 3 on the way out at once, nobody enters while someone is leaving through it — `src/game/Presence.ts`, test: `src/game/Presence.test.ts`, url: `/?seed=1&time=8` (#5, #41)
- `presence.rain` Rain keeps people in: fewer leave, longer errands, more home office — `src/game/Presence.ts`
- `presence.caps` Max 15 in the office, max 8 in home office (one per room); nobody returns while the office is full — `src/game/Presence.ts`, test: `src/game/Presence.test.ts`
- `presence.homebodies` Homebodies are picked 6× more often, stay 2× longer, likely home at start — `src/game/Presence.ts`
- `presence.schedule-debug` Today's plans in the console: `__game.presence.schedule` (with `?time=…`) — `src/game/Presence.ts`, url: `/?seed=1&time=11` (#5, #38)
- `presence.strings` All presence wording (leave vs return labels, roster status, action buttons) comes from one table; going out and coming back have separate labels — `src/i18n/strings.ts` (#8)
- `presence.manual` Sending someone out/home by hand keeps them away until called back (max 10 min); hand-moved people are left alone by the night shift — `src/game/Presence.ts`
- `presence.homes-hash` `#homes` fills all 8 home offices at start — `src/game/Presence.ts`, e2e: `e2e/office.spec.ts`, url: `/#homes` (#34, #38)
- `presence.roster` Away roster: out / on the way / "zurück in …" countdown / Homeoffice; clicking a home-office person opens their feed — `src/ui/Roster.ts`, url: `/?seed=1&time=11&event=home` (#38)

## Desks and work
- `desk.ownership` Every model desk is a numbered workplace with one owner; the owner asks a squatter to leave; others take a free desk nearby, preferring unowned ones — `src/game/Office.ts`, test: `src/game/Office.test.ts`
- `desk.work` People mostly go sit and work (90–240 s), type with jittering hands, glance at the screen — `src/game/Person.ts`, `src/game/Game.ts`
- `desk.mug` Desk mug appears with the sitter, people sip, fill level visible — `src/game/Person.ts`, `src/render/officeModel.ts`
- `desk.chair-call-vape` Phone people take calls and vapers take drags in the chair — `src/game/Person.ts`, url: `/?seed=1&time=11&event=vape-fabian-bucher` (#38)
- `desk.gestures` Idle gestures every 12–38 s: yawn, stretch, head scratch, look around — `src/game/Game.ts`
- `desk.screens` Monitors show role-based content (code, design, data, sheet, docs, media), stable per person — `src/render/screens.ts`, `src/data/screens.ts`
- `desk.lights` At night a warm lamp fades in over each occupied desk — `src/game/DeskLights.ts`, url: `/?seed=1&time=21` (#38)
- `desk.seats` Fixed seat per person; seats panel with numbered labels and a per-person select; saved to localStorage, or to `src/data/seats.json` on the dev server — `src/ui/Seats.ts`, `src/game/Game.ts`

## Errands and places in the office
- `place.printer` Printer in the archive: one person at a time, paper shows while printing — `src/game/Person.ts`, `src/render/officeModel.ts`, e2e: `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=printer` (#38)
- `place.foosball` Foosball: challenge a free opponent, animated rods — `src/game/Person.ts`, `src/game/Game.ts`
- `place.phone-walk` Phone calls while walking: pacing a path or wandering — `src/game/Person.ts`, url: `/?seed=1&time=11&event=phone-jan-hasler` (#38)
- `place.vape` Vape drags: raise, inhale, hold, exhale with puffs — `src/game/Person.ts`, url: `/?seed=1&time=11&event=vape-fabian-bucher` (#38)
- `place.coffee-run` Coffee run: brew at the espresso machine, carry the cup back; desk stays reserved — `src/game/Person.ts`, `src/game/Coffee.ts`
- `place.energy-drink` Janosch hates coffee: skips coffee runs, energy drink instead — `src/game/Person.ts`, `src/data/team.ts`
- `place.chips` Snackers grab chips in the kitchen and stroll eating them, giving up the desk — `src/game/Person.ts`, url: `/?snack&time=14&follow` (#38)
- `place.coffee-break` Kitchen coffee break: group circle with cups, staggered sips, leave together — `src/game/Coffee.ts`, e2e: `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=coffee` (#38)
- `place.dining-table` Dining table: 1–3 people sit on adjacent bench seats — `src/game/Coffee.ts`
- `place.pod` Wooden pod: two people now and then sit on the benches together — `src/game/Pod.ts`, e2e: `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=pod` (#38)
- `place.booth` Phone booth: one person on the stool, door shut during the call — `src/game/PhoneBooth.ts`, e2e: `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=phone-booth` (#38)
- `place.meeting` Meetings in the glass room (2/4/6): seats side chairs first, door shut and doorway blocked, stragglers give up, leave together; speaker gestures, listeners nod — `src/game/Meeting.ts`, `src/game/Game.ts`, e2e: `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=meeting-room` (#38)

## Social
- `social.start` Groups may start talking: pairs rarely, bigger groups almost always; friends more readily; at a quiet spot, not in a crowd — `src/game/Social.ts`
- `social.join` Others join running talks; turn-taking with pauses and a wrap-up line — `src/game/Social.ts`
- `social.leave` Newcomer greets, a bored member says bye (least close first), topic drifts, the group closes the gap — `src/game/Social.ts`
- `social.friendship` Friendship grows per talk and fades slowly; seeded by same job or both owning a dog; friends talk longer and seek each other out — `src/game/Social.ts`
- `social.bubbles` Wordless bubbles (… 😄 ? ! !? ♪, 👋 join/leave, 💡 new topic) with matching body reaction; discussions show more ! / !? — `src/game/Chatter.ts`, `src/ui/Overlay.ts`
- `social.crowd` Too many people in one spot: no chat starts, they clear out — `src/game/Social.ts`, `src/game/Walker.ts`
- `social.walk-talk` Walk mode talk: person stops, faces the player and replies, unless busy — `src/game/Game.ts`, `src/game/Person.ts`

## Movement
- `move.astar` A* on an 8-way grid, no corner cutting, no spawns in sealed pockets — `src/game/NavGrid.ts`, test: `src/game/NavGrid.test.ts`
- `move.traffic` Routes bend around crowds; wander spots go to quiet places — `src/game/Traffic.ts`
- `move.passages` Narrow passages (doorways, corridors, gaps between desks, found from the nav grid) carry one direction at a time: oncoming walkers wait beside the entrance, sides take turns, head-on inside → one backs out; deadlock fallback detour → give way → push through; nobody loiters inside — `src/game/Passages.ts` (#3)
- `move.passing` Keep right head-on, slow when close, back off nose to nose, re-plan or give up when stuck; idle people shuffle aside — `src/game/Walker.ts`
- `move.collision` Overlapping walkers are pushed apart; walls and furniture are solid — `src/game/Game.ts`, `src/game/NavGrid.ts`

## Doors
- `door.auto` Interior doors swing open within 1.25 m and stay open 0.9 s after — `src/game/Doors.ts`
- `door.rest` At rest closed / ajar / propped, rerolled every 30–120 s — `src/game/Doors.ts`
- `door.player` Walk-mode player can toggle the door they face; the choice holds a while — `src/game/Doors.ts`
- `door.lock` Doors locked during a meeting or booth call — `src/game/Doors.ts`, url: `/?seed=1&time=11&event=meeting-room` (#38)

## Pets
- `pet.roster` Dogs Tala (Ramon), Ellie (Janosch), Harry (Nina), Mira (terrier, Fabian); cats Angus and Binx (Donata) — `src/data/team.ts`
- `pet.owner` Pets stay beside their owner, lie down when the owner sits, sleep after 12 s, sometimes switch sides; leave and return with the owner: they arrive and vanish together with the owner (materialise effect), not walking ahead — `src/game/Dog.ts`, `src/game/Presence.ts`, url: `/?seed=1&time=11&event=errand` (#41)
- `pet.petting` Passers-by within 1.5 m may stop and pet a pet (trots over, wags, happy hops); cooldowns per pet and per person — `src/game/PetCare.ts`
- `pet.announce` Awake pets bark/meow when someone comes in the front door — `src/game/PetCare.ts`
- `pet.player` The player's person can pet a pet — `src/game/Person.ts`
- `pet.pose-reset` Petting leaves no distortion: rig resets to neutral each frame, bends at the hips, pose ends when picked up or pulled into a chat — `src/game/Person.ts`, `src/game/Game.ts` (#1)
- `pet.portrait` Pets get rendered low-poly head portraits — `src/render/petPortrait.ts`

## Time, weather, lights
- `time.cycle` 24 h cycle in 600 real seconds, starts 10:00, night compressed; slider + clock + auto toggle (`saftladen.time.auto`) — `src/game/TimeOfDay.ts`, `src/ui/TimeControl.ts`
- `time.light` Sun moves 06–20, warm when low, moonlight at night, sky fades dark — `src/game/TimeOfDay.ts`, url: `/?time=19#orbit` (#38)
- `time.tired` Tiredness rises toward night — `src/game/TimeOfDay.ts`
- `weather.auto` Auto weather: dry spells and showers, rain fades in/out; settings force Auto/Sonne/Regen — `src/game/Weather.ts`, `src/ui/Settings.ts`
- `xmas.mode` Christmas mode: settings switch (`saftladen.settings.xmas`, default on in December); snowfall fading in/out, colder sky — `src/game/Christmas.ts`, `src/render/snowFx.ts`, `src/ui/Settings.ts`, e2e: `e2e/modes.spec.ts` (#34)
- `xmas.decor` Christmas trees with presents, blinking light strands along the walls, wreaths — `src/render/xmasDecor.ts`
- `xmas.wear` Santa hats (variety by look) and scarves on everyone, tiny hats on pets — `src/render/xmasWear.ts`
- `weather.fx` Rain streaks ending at roof height, dimmer at night; greyer light and overcast sky — `src/render/rainFx.ts`, `src/game/Game.ts`

## Office model
- `office.scale` Real office 41×15 m; `EXACT` switches exact vs scaled plan — `src/render/officeModel.ts`
- `office.rooms` Rooms: GL Sizi annex, storage/craft room, kitchen, washroom, archive/printer room, photo studio/dark room, phone booth "PSST!", glass meeting room, lounge with pod + foosball + reception, east room — `src/render/officeModel.ts`
- `office.photo-studio` Photo studio (east end, behind the hallway): no wall on the east side, a black curtain closes it instead; the curtain hangs in folds — `src/render/officeModel.ts`, url: `/?seed=1&time=11#iso` (#42)
- `office.teams` Team desk areas: Wassermelonen, Hashtag-Himbeeren, Kreative Kiwis, Digitale Birnen — `src/render/officeModel.ts`
- `office.lettering` Wall lettering "FRISCHE IDEEN, DIE WIRKEN" (also on door leaves) — `src/render/officeModel.ts`
- `office.entrance` Two-wing double entrance door in the front wall, right of the annex wall: each wing opens on its own, people use one of two lanes (one per wing); stone porch in front, wall corners close flush, the logo hangs above the door, softer sun shadows — `src/render/officeModel.ts`, `src/game/Door.ts`, `src/render/World.ts`, url: `/#walk@6.25,19.5,0` (#41)
- `fx.materialise` People and pets materialise on the porch when they arrive and dissolve when they leave (sparkle column), the door stays quiet — `src/render/spawnFx.ts`, `src/game/Walker.ts`, url: `/?seed=1&time=11&event=errand#walk@6.25,18.5,0` (#41)
- `office.glass-door` Glass wall and glass door across the hallway; frames and panes don't flicker (no coplanar faces) — `src/render/officeModel.ts` (#7)
- `office.kiwi-birnen-wall` Divider wall between Kreative Kiwis and Digitale Birnen: corridor line to window wall in both plan scales, stops at the window pane, no overlap with the column — `src/render/officeModel.ts` (#6)
- `office.coat-stands` Freestanding coat stands (round base, pole, hook arms; room-editor item `coat-rack`); no stand in the entrance. A person's long draped coat hangs on a hook exactly while they are in, on the stand nearest their desk, same hook again when free — `src/render/officeModel.ts`, `src/game/CoatRacks.ts`, `src/render/jacketBuilder.ts`, e2e: `e2e/office.spec.ts` (#4, #34)
- `office.deco` Bunting and string lights under the sawtooth roof — `src/render/officeModel.ts`
- `office.mosquito` Easter egg: framed dead mosquito next to the meeting-room screen — `src/render/officeModel.ts`
- `office.desk-props` Per desk: Apple keyboard/mouse, mesh chair, seeded plant — `src/render/officeModel.ts`
- `office.labels` Settings panel toggles row/table labels, seat numbers, room numbers (`saftladen.settings`) — `src/ui/Settings.ts`
- `office.parquet` Mosaic parquet slab — `src/render/World.ts`

## Room editor
- `editor.toggle` `E` or "Raum" button toggles the editor; click selects (hover/selection outlines), drag snaps to 0.25 m, `Alt` moves freely — `src/game/RoomEditor.ts`
- `editor.keys` `Esc` deselect/exit, `R` quarter turn, `Delete`/`Backspace` remove (except items the sim needs), arrows nudge 0.05 m (Shift 0.25 m) — `src/game/RoomEditor.ts`
- `editor.panel` Panel: X/Z, rotate, reset item/all, removed list with restore, snap toggle, JSON export/import (import validates ids) — `src/ui/EditorPanel.ts`
- `editor.persist` Layout in `saftladen.layout`; "In Repo speichern" writes `src/data/layout.json` via the dev server; changes rebuild nav grid, desks, seats, printer and foosball spots — `src/game/RoomEditor.ts`, `vite.config.ts`

## Home offices
- `home.rooms` 8 webcam rooms: Schlafzimmer, Küchentisch, Wohnzimmer-Sofa, Balkon, Arbeitszimmer, Dachstock, Skandi-Studio, Gamer-Höhle — `src/render/homeOffice.ts`, url: `/#homes` (#38)
- `home.beach` Marco Hefti's own room "Liegestuhl, Thailand": deck chair, laptop on lap, cocktail, sea, palms, longtail boat; he swims — `src/render/homeOffice.ts`
- `home.activities` Activity loop: typing, sip, dumbbell stretch, think, call, wave, away, yawn, controller; arrival wave (35%) — `src/render/homeOffice.ts`
- `home.signatures` Signature moves: Marco swims, Donata's desk cats walk past the lens (catwalk), Devin curls — `src/render/homeOffice.ts`, `src/data/team.ts`
- `home.adhd` ADHD extras (Delya, Sandro): fidget spinner, chair spin, snack run, pacing — `src/render/homeOffice.ts`
- `home.coffee-hater` Coffee haters spit the coffee out and drink a can — `src/render/homeOffice.ts`
- `home.vape` Vapers: glowing tip, puffs, room hazes over — `src/render/homeOffice.ts`
- `home.feeds` Feed tiles: count, activity caption, click to enlarge (FLIP); office labels kept off the feeds; collapsible (`saftladen.feeds.collapsed`) — `src/ui/Feeds.ts`, `src/game/Game.ts`, url: `/#homes` (#38)
- `home.assign` Room assignment per person in the character view (`saftladen.homes`), one owner per regular room, own rooms fixed — `src/data/homeAssignments.ts`, `src/ui/CharacterPicker.ts`

## Characters
- `char.look` Low-poly look per person: hair styles, cap, beard, glasses, brows, mouth, build, height — `src/render/characterBuilder.ts`, `src/data/team.ts`
- `char.clothes` Blazer, shirt, vest, tank, print/logo, flower print, necklace, wristbands, shorts, flip-flops; Sandro's "Sparklys" tank at home — `src/render/characterBuilder.ts`
- `char.tattoos` Arm tattoos (vine, script, dark) — `src/render/tattoo.ts`
- `char.speed` Faster walkers: Sandro, Delya — `src/data/team.ts`
- `char.picker` Character picker: list, turntable (drag, wheel zoom, auto-spin), counter, owner's pets, live home-office preview; keys `Esc` `↑↓` `←→` `Space` — `src/ui/CharacterPicker.ts`

## Day mode ("Ein Tag im Leben")
- `day.menu` Menu: playable people on pedestals, chosen steps forward, figures look at the cursor, idle gestures, name tags, pets; keys `Esc`, `←→`/`A D`, `Enter`/`Space` — `src/ui/DayMenu.ts`, e2e: `e2e/modes.spec.ts` (#34)
- `day.characters` Playable: Jan Hasler (SnackHunt → PhoneRush), Jeerapat Wang (HideGameboy), Sandro Hagen (no story yet) — `src/data/dayCharacters.ts`, `src/data/dayStories.ts`
- `day.flow` Start brings the person in if away, third-person camera; leaving restores the previous view; desk tasks clear the person's own desk — `src/game/Game.ts`, e2e: `e2e/modes.spec.ts`, url: `/?day` (#34, #38)
- `day.hud` HUD: name, status, stopwatch (waits during task setup), task list, target marker / edge arrow with metres, meter with traffic-light mood, exit — `src/ui/DayHud.ts`, `src/game/Day.ts`, url: `/?day` (#38)
- `day.result` Result card with splits, total, best time (localStorage), new record; fail card with reason and retry; scene freezes on fail — `src/ui/DayHud.ts`, `src/game/Game.ts`
- `day.snack-hunt` "Snacks besorgen": 8 spinning chip bags under green beams, grab within 0.7 m, eat + quip — `src/game/tasks/SnackHunt.ts`, url: `/?day=jan-hasler` (#38)
- `day.phone-rush` "Telefone abnehmen": 6 phones, 3 ringing at once, red beams + floor rings, 3.5 s call each, ring louder when near — `src/game/tasks/PhoneRush.ts`
- `day.gameboy` "Gameboy spielen": hold `Space` to play (24 s goal) while Larissa works facing away; hint, turn and stare phases shorten with progress; caught if playing in her view cone; floor ring/cone green/yellow/red — `src/game/tasks/HideGameboy.ts`, url: `/?day=jeerapat-wang` (#38)
- `day.spots` Task targets spread far from the player and each other — `src/game/tasks/spots.ts`
- `day.space` `Space` doesn't scroll the page during a day — `src/game/Game.ts`

## Easter eggs
- `egg.konami` Konami code: 14 s office disco, dancing at 124 BPM, colour lights, dimmed daylight — `src/game/Easter.ts`, e2e: `e2e/modes.spec.ts` (#34)
- `egg.angry` Clicking a person 7× quickly: angry bubble, then they storm out — `src/game/Easter.ts`
- `egg.backflip` Clicking a pet 5×: bark and backflip — `src/game/Easter.ts`

## Dev tools
- `dev.events` Dev events registry + panel (meetings 2/4/6, errand, home office, vape, printer, rain …) with status / "nicht möglich"; console `dev.list()`, `dev.trigger(id)` — `src/game/DevEvents.ts`, `src/ui/DevPanel.ts`
- `dev.params` Dev-only query params: `?day[=id]`, `?snack[=id]`, `&time=14`, `&follow`, `?seed=<n>`, `?event=<id>` (runs a dev event at start, retried until it can run; unknown id warns), `?test`; any of them exposes `window.__game` (the read-only hook of the Playwright tests; not in the production bundle) — `src/game/debugParams.ts`, e2e: `e2e/game.ts`, `e2e/events.spec.ts`, url: `/?seed=1&time=11&event=meeting-room` (#34, #38)
- `dev.seed` One seedable random source for the simulation: same `?seed` → same start (plans, speeds, who is out); the console logs each page's seed. Per-frame visuals use their own stream — `src/game/rng.ts`, test: `src/game/rng.test.ts`, `src/game/Presence.test.ts`, url: `/?seed=1&time=11` (#29, #38)
- `ui.panels` Side panels (settings, seats, dev, editor) close each other; dock panels (feeds, roster) behave as an accordion, honour reduced motion — `src/ui/exclusive.ts`, `src/ui/collapsible.ts`

## Removed on purpose
Replaced by later commits. Don't bring these back without an issue.
- German speech-bubble lines ("Genau!", "Krass!") → wordless symbols + body language (07c40eb)
- Hammock in the beach room → deck chair, sea, boat (fb3bdbf)
- Portrait reference image in the picker → live home-office preview (56d9e98)
- Picker hint line → keys still work, hint text gone (b354622)
- Clock on the home-office feeds (fc6631e)
- Old archive shelving, standing tables, crates, toilet cistern → photo-based office rebuild
- Fixed lunch rush (11:45–13:15), shared closing time 17:15, sandro/fabian-only night shift, dawn arrival drip → per-person office hours (#25)
- Coat pole stands → wall-mounted wardrobes → freestanding coat stands with draped coats (#23); entrance coat stand removed (325a039)

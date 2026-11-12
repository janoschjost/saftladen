# Saftladen

Isometric low-poly agency office game (Three.js + TypeScript + Vite).
Current state: the real office (reconstructed from walkthrough photos, 41 x 15 m; R toggles the roof, `EXACT` in `officeModel.ts` switches between the exact standalone model and the scaled game version) with all team members and two dogs wandering around, sitting at desks and chatting.

## Run

```
nvm use                # Node version from .nvmrc
npm install
npm run dev            # http://localhost:5173
npm run build
npm run fetch-team     # re-scrape https://vitamin2.ch/agentur (names, roles, portraits -> public/team, src/data/team.raw.json)
```

## Structure

- `src/data/team.ts` – hand-annotated look per person (hair, glasses, beard, clothes) derived from the portraits
- `src/render/characterBuilder.ts` – builds the low-poly character from a `Look`
- `src/render/officeModel.ts` – the office itself (walls, rooms, desks, furniture, roof), ported from `office-model/index.html`; also yields the desk placements and walking blockers
- `src/render/Views.ts` – view modes: Orbit (2, default), Iso (1), Plan (3), Walk (4, WASD + drag to look, collides with the nav grid; roof shown); deep links `#orbit`, `#plan`, `#walk@x,z,yaw`
- `src/render/World.ts`, `IsoCamera.ts` – parquet slab, light, iso camera (drag = pan, wheel = zoom)
- `office-model/index.html` – standalone first-person 3D viewer of the same office (reference)
- `src/render/officeBuilder.ts` – monitor screen textures
- `src/game/Office.ts` – every desk of the model is a workplace, desk claim/release
- `src/game/` – fixed-step loop, A* nav grid, wandering people and dogs; people sometimes claim a desk, sit down, work, then stand up and wander again (`Person.ts`)
- `src/game/Traffic.ts`, `Passages.ts` – crowd-aware routing; doorways, corridors and gaps between desks (found from the nav grid) carry one direction at a time: oncoming walkers wait beside the entrance, the two sides take turns, and whoever waits too long detours, gives way or finally pushes through
- `src/game/Presence.ts`, `Door.ts` – office hours: core time is 08:00 - 17:30, but everybody has their own habitual `arrive` / `leave` / `lunch` hour and `nightOwlChance` (`schedule` per person in `src/data/team.ts`, missing values fall back to `CORE_HOURS`). Every day at 04:00 each person gets a fresh plan with some jitter around those times; now and then somebody stays for a night shift (desk lamp on, `nightHome` = from the home office) and on some days a crunch keeps a few more in. During their hours people still pop out: lunch at their own hour, errands (25-70 s) or home office (90-220 s); at most 15 are in the office at once. `H` sends the selected person home / back, `#homes` in the URL fills all 8 home offices. Today's plans: `__game.presence.schedule` in the console (with `?time=…`)
- `src/data/homeAssignments.ts` – who owns which home office room (set per person in the character view, saved in localStorage; Marco has his own special room)
- `src/render/homeOffice.ts` – 8 home office rooms seen through a webcam; drawn into the main canvas behind the feed tiles (`ui/Feeds.ts`); `ui/Roster.ts` lists who is not in the office
- `src/ui/Overlay.ts` – tooltip (hover/click) and name labels (N)

New team members: run `fetch-team`, then add a look for the new id in `src/data/team.ts`.

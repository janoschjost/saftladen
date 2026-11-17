---
name: create-issue
description: Turn a dev's rough description into a GitHub issue of this repo that an agent can implement from A to Z - check for duplicates first, interview the dev for everything missing, write acceptance criteria, estimate the complexity and set the matching model label. Use when asked to create, write, open or file an issue, bug or feature request.
argument-hint: "<rough description of the bug or feature>"
---

# Create issue

Interactive only: a dev answers the questions. Never invent product decisions; ask.

Invoking this skill authorizes searching issues and PRs, and opening one issue (or, after the dev confirms a split, several) with `scripts/issue.sh new`. It does not authorize code changes, branches, PRs or merges, and it never claims the issue.

Description: `$ARGUMENTS`. Empty → ask the dev for it first.

## Steps

1. **Take the description as is.** Restate it in one or two lines so the dev sees it was understood. Don't ask anything yet.
2. **Look for duplicates**, following the rules in `AGENTS.md` step 1. Search open and closed issues and PRs with a few different keyword sets (nouns from the description, synonyms, the feature area):
   ```sh
   scripts/issue.sh similar "<words>" "<other words>" "<feature area>"
   ```
   Also grep `FEATURES.md` for the area: the behavior may already exist, or be listed under "Removed on purpose".
   - Similar issue or PR found → tell the dev with number, title, state and link, and how it overlaps (same, partial, related). For one closed as not planned, add why (the `why:` line, or read the issue). Ask with `AskUserQuestion`: add a comment to the existing issue instead (recommended when it is the same and open), refine the existing one, or open a new one anyway. A `question` or `blocked` issue belongs to `/refine-issues`.
   - A new one anyway → it gets a `Related: #M (<state, why closed>)` line in its body for each hit the dev called related (step 6).
   - Nothing found → say so in one line and continue.
3. **Read before asking.** Read the `FEATURES.md` lines of the areas it touches and the code involved (`Game.ts`, `Person.ts`, `officeModel.ts`, `src/game/`, `src/render/`, `src/ui/`, existing tests, whatever applies). Don't ask what the code or `FEATURES.md` already answers.
4. **Interview.** Ask with `AskUserQuestion`, at most 4 questions per round, your recommendation first and marked `(Recommended)`, each question understandable on its own. Repeat until an agent could implement the issue without asking anything. Cover what is still unknown of:
   - **Type:** bug or enhancement.
   - **Bug:** steps to reproduce (a URL if one shows it, e.g. `/?seed=1&time=11&event=coffee`), actual vs. expected behavior, since when, how often.
   - **Enhancement:** what the player sees or triggers, and why.
   - **Behavior details:** exact numbers, timings, keys, texts, visuals; what happens at the edges (nobody in the room, steered person, home office, night, day mode, touch input).
   - **Scope:** what is explicitly not part of it. Too broad for one PR → propose a split into concrete issues and ask the dev to confirm.
   - **Interactions** with existing `FEATURES.md` lines that must keep working.
   - **How to see it:** the `url:` for the new or changed `FEATURES.md` line (`?seed=…&time=…`, `?event=<dev event id>`, hash view). A new dev event that a player would want to watch (not one that only sets up a situation for testing) also gets a card in the Aktionen sheet (`AGENTS.md`, "Done means"): put it in the criteria, with the card's label and who.
   - **Tests:** which logic needs Vitest, which interaction needs Playwright, what is only checked visually (see `AGENTS.md`, "Done means").
   - **Dependencies:** other issues or PRs that must land first. If one is open, block the new issue after creating it: on an issue `scripts/issue.sh block N "<reason>" M` (native "blocked by #M" link), on a PR `scripts/issue.sh block N "<reason, naming #M>"` (label `blocked`).
5. **Estimate the complexity** from what you read, not from the description alone, and pick the model label:
   | Label | When |
   |-------|------|
   | `model:haiku` | Trivial and mechanical: copy/text, a constant, a color, one file, no new logic, no new test beyond updating one |
   | `model:sonnet` | Normal: a bounded feature or bug in a few files, follows existing patterns, clear criteria, a few new tests |
   | `model:opus` | Hard: touches shared core (`Game.ts`, `Person.ts`, `officeModel.ts`), animation/pathing/camera math, new subsystem, many files, subtle edge cases, a vague root cause to find |
   Unsure between two → take the higher one. Tell the dev the estimate with a two-line reason (files, risk) and let them overrule it.
6. **Draft and confirm.** Show the dev the full title and body. Title: short imperative, like the `git log` subjects. Body:
   ```md
   <the request in the dev's words, cleaned up: what and why>

   ## Context
   Where it lives: files, `FEATURES.md` ids. Reproduction steps for a bug.
   Related: #M (<state; why it was closed, if not planned>), one line per issue or PR from step 2.

   ## Acceptance criteria
   - [ ] Each one observable and checkable in the running app, with the URL where it shows
   - [ ] Edge cases from the interview
   - [ ] Dev event `<id>` follows `actions.force`: returns `null` when it cannot run (the game clears the way); `asIs` if it ends or reads something; a new place or scene that keeps people busy is cleared by `makePossible.ts`
   - [ ] Aktionen card `<label>` for the dev event `<id>` (`src/data/actions.ts`, `actions.preview`), if players would want to watch it (not for test setups)
   - [ ] Tests: Vitest for <logic>, Playwright for <interaction> (named after the `FEATURES.md` id)
   - [ ] `FEATURES.md` line(s) added or changed, each with a `url:`

   ## Out of scope
   - ...

   ## Decisions
   What the dev decided in this session, so nobody asks again.

   ## Complexity
   `model:<x>`: one-line reason.
   ```
   Drop a section that would be empty. The body must be complete without any chat context: an agent in a fresh worktree reads only this. Ask the dev to confirm or change it before creating.
7. **Create.** Write the body to a file in the scratchpad directory, then:
   ```sh
   scripts/issue.sh new "<title>" <bug|enhancement> "$(cat <body file>)" <haiku|sonnet|opus>
   ```
   It prints the number and leaves the issue unassigned, so every dev's `/tackle-issues` can take it; a dev who wants it for themselves assigns it (`gh issue edit N --add-assignee @me`). Several issues from a confirmed split → one call each; a part that builds on another gets `scripts/issue.sh block B "<reason>" A`. If the dev wants an umbrella issue for the whole (a goal that only the parts together reach), open it too and link the parts: `scripts/issue.sh sub P A B`.
8. **Report:** issue link, labels, the model and why. `/tackle-issues` picks it up from here.

## Rules

- Never create the issue before the dev confirmed the draft.
- Never skip the duplicate search, and never create an issue the dev decided to put on an existing one.
- Don't write implementation steps into the issue unless the dev gave them; the acceptance criteria say what, the agent decides how.
- Docs, tooling and typo fixes need no issue (`AGENTS.md`): say so and offer a direct PR instead.

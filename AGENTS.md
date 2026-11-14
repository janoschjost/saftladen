# Agents

These rules apply to every agent session, local or automated (`/tackle-issues`). The per-change workflow below is the single source of truth. Skills only add to it.

## Every change: issue → worktree → PR

1. **Issue.** A change to behavior (feature or bug) needs an issue, and its acceptance criteria are the definition of done.
   - Ask from a dev without an issue → search the open issues first (`gh issue list --search "<words>"`). If none fits, open one with `scripts/issue.sh new "<title>" <bug|enhancement> "<body with acceptance criteria>"`.
   - Docs, tooling and typo fixes may skip the issue and go straight to a PR.
2. **Claim.** `scripts/issue.sh claim N`. Exit code 2 means another session owns the issue: don't touch it. Never take over an issue that is labeled `in progress`, assigned, or has an open PR. Giving up → `scripts/issue.sh release N "<reason>"`.
   - Open questions or a product decision needed → `scripts/issue.sh ask N "<questions>"` (label `question`). Waiting on another PR or issue → `scripts/issue.sh block N "<reason>"` (label `blocked`). Agents don't work `question` issues; a dev answers in a comment and removes the label, or works through them with an agent via `/refine-issues`. `gh issue list --label question` is the devs' inbox.
3. **Worktree.** Never work in the main checkout. Other sessions and the dev's own dev server use it.
   ```sh
   git fetch origin
   git worktree add ../saftladen-issue-N -b fix/issue-N-<slug> origin/main   # feat/ for enhancements
   cd ../saftladen-issue-N && npm ci
   ```
   Worktrees live next to the repo (`../saftladen-<name>`), the same place PhpStorm's "New Worktree…" puts them.
   `npm run dev` in a worktree picks the next free port from 5174 (the main checkout keeps 5173). `npm run test:e2e` serves its bundle on the first port from 5199 that no other e2e run holds, so runs in parallel worktrees don't collide; `E2E_PORT` overrides it. A second run in the same checkout stops with "another e2e run in this checkout": wait for the first one.
4. **Implement.** Read the issue and all of its comments. Follow `README.md` and the existing code. Keep the change scoped to the issue.
5. **Done means:**
   - `npm run lint` and `npm run build` pass. CI (`.github/workflows/ci.yml`) runs lint, build and Vitest on every PR; a red check is not done. The e2e tests run on CI only with the `e2e` label (Actions minutes are limited), so run them locally and note the result in the PR body. A failing local run is not done, whatever the load on the machine: the waits count game time, not seconds. A test that also fails on `main` → say so in the PR body and link its issue (open one if there is none). Add the label (`gh pr edit --add-label e2e`) whenever the PR adds or changes a file under `e2e/`, `playwright.config.ts`, the `?test` hook or the CI workflow: a spec must have run on CI before it reaches `main`. Other PRs get it from the reviewer (`/review-pr`).
   - `npm test` and `npm run test:e2e` pass, and new or changed behavior has a test. Which kind: **Writing tests** below; how: the `write-tests` skill.
   - Every criterion has been checked in the running app.
   - `FEATURES.md` is updated: add or change the lines for this issue, ending with `(#N)`. Every line you touched still works. Each line you add or change gets a `url:` where a URL can show it (see the rules at the top of `FEATURES.md`).
   - The diff has been through one pass of `/simplify` and one of `/code-review` (medium), in that order, both limited to this branch's diff:
     1. `/simplify`, apply what keeps the change inside the issue's scope.
     2. `npm run lint && npm run build && npm test && npm run test:e2e`.
     3. `/code-review`. Fix the confirmed correctness findings only. Everything else (style, taste, things outside the issue) goes under `## Notes` in the PR body or into a new issue.
     4. Step 3 changed code → tests again, then one more `/code-review`. Two rounds at most: after the second, open the PR and list what is still open under `## Notes`. Never loop until a review comes back empty; it won't.

     Docs-only changes skip this.
6. **PR.** Rebase first. On conflicts keep both sides' behavior, never just yours, then re-check the affected `FEATURES.md` lines.
   A rebase also brings in the rules as they are on `main` now. After every rebase read what changed in them (`git diff ORIG_HEAD HEAD --stat -- AGENTS.md README.md .claude/skills e2e/game.ts playwright.config.ts`) and bring the branch's own work in line: a test written the old way is rewritten, a new check (`npm run …`) is run. The branch follows the rules of the `main` it lands on, not of the day it was started.
   ```sh
   git fetch origin && git rebase origin/main && npm run lint && npm run build && npm test && npm run test:e2e
   git push -u origin HEAD
   gh pr create --base main --assignee @me --title "<imperative summary>" --body "<see below>"
   ```
   `--assignee @me` assigns the PR to the dev whose `gh` login runs the session.
   The PR body starts with `Closes #N` on its own line, so merging closes the issue. Then come `## What changed`, `## Try it`, `## Acceptance criteria` (checked, with how each was verified) and optionally `## Notes`. `## Try it` has one clickable link per added or changed `FEATURES.md` line: its id and `http://localhost:5173` + its `url:`, e.g. `- place.meeting: http://localhost:5173/?seed=1&time=11&event=meeting-room`. Lines without a URL: say how to see them. See `gh pr view 23`.
7. **Watch CI.** Wait for the PR's checks, then clean up only once they are green.
   ```sh
   gh pr checks --watch --fail-fast
   cd ../saftladen && git worktree remove ../saftladen-issue-N
   ```
   Red → read the log (`gh run view --log-failed`), fix in the worktree, push, watch again. Keep the worktree until the checks pass. "no checks reported" right after the push: wait a few seconds and retry. A PR that only changes `*.md` files gets no checks at all (`paths-ignore` in `ci.yml`), so remove its worktree right away.

## Writing tests

**Before writing or changing a test, load the `write-tests` skill** (`.claude/skills/write-tests/SKILL.md`). The rules that always hold:

| What changes | Test | Where |
|---|---|---|
| Logic, and what the simulation does over time (who walks where, what a meeting, a door or a pet does) | Vitest | `*.test.ts` next to the code |
| What only a browser can show: keys, clicks, hashes, panels, the DOM, a URL starting the right thing | Playwright | `e2e/*.spec.ts` |
| Purely visual: no change to state, timing, input handling or URLs | by eye, in the running app | none |

- A test's title starts with the exact `FEATURES.md` id it guards (a smoke test that guards no single line: `load`).
- Playwright tests open the game with `?test`: time stands still until the test fast-forwards it, the office is not drawn, seed, hour and date are pinned. So never wait in wall time for the game (`waitForTimeout`, `expect.poll` or `toPass` on game state): use `until()`.
- Import `test`, `expect` and the helpers from `e2e/game.ts`, never `test` from `@playwright/test`.
- A spec reads the game through the typed hook (`g` in `read` / `until`, `TestHook` in `src/game/Game.ts`) and changes it only like a player or with `scene(…)`. The specs are type-checked (`npm run build`): no `any` for the game.
- A failing test is not done, whatever the load on the machine.
- `npm run lint` (oxlint, `.oxlintrc.json`) enforces part of this: the imports, `waitForTimeout`, `test.only`, a forgotten `await`, `Math.random()` outside `src/game/rng.ts`.

## Review

Devs review a PR in the running app with `/review-pr N`. It claims the PR (`in review`), so only one dev reviews it at a time. Findings go on the PR as review comments plus the label `changes requested`, which `/tackle-issues` fixes before new issues; findings outside the PR's issue become new issues.

## Commits

- Commit only when a dev tells you to, never on your own initiative. Working an issue through this workflow (e.g. `/tackle-issues`) counts as that instruction for the issue's branch.
- Split the work into meaningful, logical commits.
- Short, precise imperative subject in the style of `git log`. Add a body only when the subject alone isn't enough.
- No `Co-Authored-By` line and no other attribution line in commit messages.
- Commit, push and open PRs only on a branch, never on `main`.
- Merge only when a dev explicitly tells you to, for that PR, and only what was tested on top of `main`: the branch is up to date with `main` (rebase first if not) and `Build and test` and `E2E (Playwright)` are green on that last commit (label `e2e` makes the second one run). Then `gh pr merge N --squash --delete-branch`. Never merge on your own initiative, and not from the GitHub page without those checks: nothing there stops a red merge.

## FEATURES.md

The list of everything that must stay in the game. Read the lines for the areas you touch before changing shared files (`Game.ts`, `Person.ts`, `officeModel.ts`). Never delete a line unless an issue asks for it; in that case move it to "Removed on purpose".

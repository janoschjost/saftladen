---
name: review-pr
description: Guide a dev through reviewing a PR of this repo in the running app - check out the PR in a worktree, start its dev server, walk through each feature URL step by step with what to look for, collect the dev's findings and post them on the PR (or as new issues), then offer to merge. Use when asked to review, test or check a PR.
argument-hint: "<PR number>"
---

# Review a PR

Interactive: the dev looks at the app and judges, you prepare, guide and write. Never post, label or merge without the dev having seen it.

Invoking this skill authorizes a worktree for the PR, `npm ci`, a dev server, claiming and releasing the PR, labels, review comments and new issues the dev confirmed. It merges only after the dev answers yes to the merge question. It never changes what the PR does: fixes for findings are `/tackle-issues`' job. The one thing it changes is the rebase onto `main` before the review starts (step 1): resolving its conflicts and bringing the branch in line with the rules of `main`, then pushing it, so the dev reviews exactly what gets merged.

PR: `$ARGUMENTS` (no number → list `gh pr list` and ask which one).

## 1. Claim and set up

```sh
scripts/issue.sh claim N "in review"     # exit 2 → someone reviews or fixes it right now: tell the dev who, stop
git fetch origin
b=$(gh pr view N --json headRefName -q .headRefName)
git worktree add ../saftladen-pr-N "origin/$b" --detach   # exists already → cd there and `git checkout --detach origin/$b`
cd ../saftladen-pr-N
```

**Rebase before anything is reviewed.** The dev must test the state that lands on `main`, so the branch is up to date with `main` first:

- `baseRefName` is not `main` (stacked PR) → no rebase (it would bring the base PR's commits along). Say so, review as is, and the gate in step 5 handles the merge order.
- Up to date with `main` → nothing to do, `npm ci`.
- Behind `main` (`git rev-list --count origin/$b..origin/main` is not 0) → rebase it here, the way `AGENTS.md` step 6 says (the same rebase `/tackle-issues` does before a PR):
  1. `git checkout -B $b origin/$b && git rebase origin/main`.
  2. Conflicts → resolve them, keeping both sides' behavior, never just the PR's. Code `main` removed or moved stays removed or moved (a test that moved to Vitest gets the PR's change ported there, it does not come back), the PR's change goes on top. Re-check the affected `FEATURES.md` lines. A conflict that needs a product decision (both behaviors can't hold together) → `git rebase --abort`, no review: post "rebase onto main needed (conflicts in <files>: <why>)" as a finding (step 4), label `changes requested`, release the PR, stop.
  3. Read what changed in the rules (`git diff ORIG_HEAD HEAD -- AGENTS.md README.md .claude/skills e2e/game.ts playwright.config.ts`) and bring the PR's own work in line: a test written the old way is rewritten (load the `write-tests` skill first), a new check is run. One commit for that, subject in the style of `git log`.
  4. `npm ci && npm run lint && npm run build && npm test && npm run test:e2e`. All green → `git push --force-with-lease origin HEAD:$b`, `gh pr edit N --add-label e2e`; CI runs on the new commit while the dev reviews. Red because of the rebase → fix it like step 2/3. Red in the PR's own behavior → a finding (step 4), review anyway.
  5. In the overview (step 2) say what was resolved and adapted, and repeat it in the review comment (step 4).
- e2e says its port is in use → another session runs its e2e tests on the same port (the main checkout, or a worktree whose path maps to the same one). Wait until the port is free (never kill it), then run again, or set another `E2E_PORT`.

Run `npm ci` before the dev server starts. A later `npm ci` (or a rebase that changes `package-lock.json`) while it runs → stop the server, `rm -rf node_modules/.vite`, start it again: otherwise the browser gets `504 (Outdated Optimize Dep)`.

Start `npm run dev` in the worktree with the Bash tool's `run_in_background`, and read the port from its output (`Local: http://localhost:<port>/`, 5174 or the next free one). Every link below uses that port, never 5173 (that is the dev's main checkout).

## 2. Overview

Read the PR (`gh pr view N --json title,body,files,statusCheckRollup,mergeable,baseRefName`), its diff, the linked issue (`Closes #M`) with all comments, and the `FEATURES.md` lines the PR adds or changes. Tell the dev in a few lines: what the issue asked for, what changed, CI status, conflicts with `main`.

**Stacked PR:** `baseRefName` is not `main` → the PR builds on another open PR (`gh pr list --head <baseRefName>`). Say so first, with the order of the stack (the PR body names it). It can be reviewed now, but its diff is only against that base, and it is merged only after the base PR (step 5).

## 3. Walk through

Build the steps from the issue's acceptance criteria, the PR's `## Try it` links and its `FEATURES.md` changes. One step per thing to check, in a sensible order. Each step:

- the link: `http://localhost:<port>` + the `url:` (or how to get there without one)
- what to do: keys, clicks, how long to wait, where to look
- what to look for: the expected result, taken from the criterion, plus what would count as broken

Ask each step with `AskUserQuestion`, and put the whole step into the `question` text itself: the full link, what to do and what to look for, one per line. The open dialog covers the chat, so text written before it is not visible while the dev tests; don't rely on it. Options: `OK`, `Problem` (the dev describes it under "Other" or in the follow-up) or `Skip`. On a problem, ask enough to make it actionable (what was seen, expected, how to reproduce), and note whether it is part of this issue (→ PR) or something else (→ new issue). One step per question so the dev can test in between.

Then one **regression** step: the existing `FEATURES.md` lines whose files the PR touches, each with its link, checked together, again with every link and what to look for in the question text.

## 4. Feedback

Show the dev every finding as it will be posted and let them edit or drop each.

- **Part of this PR** → one review with event `COMMENT` (the dev can't approve or request changes on PRs opened from their own account). Attach a finding to a file and line when the diff shows where it comes from, otherwise put it in the review body:
  ```sh
  gh api repos/{owner}/{repo}/pulls/N/reviews --input review.json
  # {"event":"COMMENT","body":"...","comments":[{"path":"src/...","line":42,"side":"RIGHT","body":"..."}]}
  ```
  Then `gh pr edit N --add-label "changes requested"` (create the label once if missing: `gh label create "changes requested" --color D93F0B --description "Review found problems; /tackle-issues fixes them"`). `/tackle-issues` picks the PR up from there.
- **Not part of this PR** → `scripts/issue.sh new "<title>" <bug|enhancement> "<body with acceptance criteria, found while reviewing #N>"`, and mention the new issues in the review body.
- **Nothing found** → `gh pr review N --comment --body "Reviewed in the app: all criteria OK. <steps checked>"` and remove `changes requested` if it is set.

## 5. Finish

1. `scripts/issue.sh release N "reviewed"` (removes `in review`).
2. **Gate: up to date with `main`, e2e green on that state.** `main` must only ever get what was tested on top of it; GitHub cannot enforce that on this repo (no branch protection on the plan), so this step does.
   - Base is not `main` (stacked PR) → stop here: no merge. Tell the dev to review and merge the base PR first; merging it with `--delete-branch` retargets this PR to `main`, then run `/review-pr N` again: step 1 rebases, the gate and the merge follow (the review itself need not be repeated).
   - `main` moved since the rebase in step 1 (`git fetch origin && git rev-list --count origin/<branch>..origin/main` is not 0) → rebase again as in step 1, with its tests; the checks below then run on the new commit. Normally the branch is already current and this is a no-op.
   - `gh pr edit N --add-label e2e` if the label is missing, then `gh pr checks N --watch`: `Build and test` and `E2E (Playwright)` must both have run green on the PR's last commit. Red → a finding (step 4), no merge. Entries marked skipped come from label events (`in review`, `changes requested`): they start no run and say nothing; what counts is the run of the last push, or of adding `e2e`.
   - Also a finding: new or changed behavior without a test, a spec that breaks the rules of the `write-tests` skill (waits in wall time, imports `test` from `@playwright/test`), or a Playwright test that only watches the simulation (no key, click, hash, panel, DOM or URL): it belongs in a Vitest test on `Sim`.
3. All OK and the gate passed → ask "Merge PR #N?". Yes → `gh pr merge N --squash --delete-branch`. Never merge without that yes. If `main` moved while the checks ran, the gate starts over.
4. Stop the dev server (`lsof -ti tcp:<port> | xargs kill`) and `cd ../saftladen && git worktree remove ../saftladen-pr-N`, unless the dev wants to keep testing.

The dev wants to stop early → still post what was found so far (with their OK) and release the PR. Never leave it claimed.

---
name: tackle-issues
description: Work through open GitHub issues of this repo in a loop - pick the next eligible one, run the AGENTS.md workflow (claim, worktree, implement, PR closing it), then take the next. Use when asked to tackle/work on/fix open issues, or a list of issue numbers.
argument-hint: "[issue numbers or label, e.g. '3 5' or 'bug'] (default: all eligible, oldest first)"
---

# Tackle issues

Invoking this skill authorizes everything the `AGENTS.md` workflow does for the issues it claims: branches, commits, pushes, PRs, and issue labels/comments/assignees. It does not authorize merging, pushing to `main` or closing issues by hand.

Args: `$ARGUMENTS`. Issue numbers restrict the run to those issues; a label filters by that label. Empty = every eligible issue, oldest first.

## Clean up first

Once per run, from the main checkout, drop leftovers of earlier sessions: records of deleted worktrees, and local branches whose PR is merged. A branch is only deleted if no worktree uses it and its tip is still the merged PR's head, so unpushed work survives.

```sh
git fetch --prune origin && git worktree prune
gh pr list --state merged --limit 100 --json headRefName,headRefOid -q '.[] | "\(.headRefName) \(.headRefOid)"' |
while read -r b oid; do
  [ "$(git rev-parse -q --verify "refs/heads/$b")" = "$oid" ] || continue
  git worktree list --porcelain | grep -qx "branch refs/heads/$b" && continue
  git branch -D "$b"
done
```

Leftover worktree folders of abandoned sessions are not removed automatically: list them with `git worktree list` in the report.

## Loop

Repeat until no eligible issue is left:

1. **Pick** the next eligible issue (see below).
2. Run the **`AGENTS.md` workflow** for it, steps 2–7: claim → worktree → implement → done → PR → CI green. Claim exits 2 → go back to 1. A `model:*` label hands this step to a subagent (see **Model labels**).
3. Once the PR's checks are green and its worktree is removed, go straight back to 1. Don't wait for review or merge.

Park an issue instead of working it when it is unclear or needs a product decision (`scripts/issue.sh ask N "<questions>"`), or depends on an unmerged PR or open issue (`scripts/issue.sh block N "<reason, naming #M>"`). Both work before or after claiming; they release a claim. For any other reason to give up after claiming, release it (`scripts/issue.sh release`).

At the end, report: issue → PR link (plus the model, if a label picked one), and the skipped issues and why.

## Model labels

Without a label you work the issue yourself, on the session model. With `model:haiku`, `model:sonnet` or `model:opus`, hand loop step 2 to a subagent on that model: `Agent` tool, `subagent_type: "general-purpose"`, `model` taken from the label, no `isolation` (the workflow makes its own worktree). Brief it with:

> Work issue #N of this repo through the `AGENTS.md` workflow, steps 2–7: claim → worktree → implement → done → PR → CI green. Read `AGENTS.md`, `README.md`, the issue and all of its comments first. You are authorized to branch, commit, push, open the PR and label, comment on and assign the issue. Never merge, push to `main` or close issues by hand. If the issue is unclear, park it with `scripts/issue.sh ask N "<questions>"`; if it waits on another PR or issue, with `scripts/issue.sh block N "<reason>"`. Then stop. Report the PR link, or why there is none.

Wait for its report, then go back to loop step 1. Devs set the label when they know an issue is trivial or hard: `gh issue edit N --add-label model:opus`, or as the last argument of `scripts/issue.sh new`. Add or change these labels only when a dev asks for that model, never on your own judgment.

## Pick

Eligible: open, no `in progress` label, unassigned **or assigned to you** (issues you opened with `scripts/issue.sh new` are assigned to you right away), no open PR linked to it, not labeled `question`, `wontfix`, `duplicate` or `invalid`. Issues assigned to other devs are theirs: skip them.

```sh
F='sort:created-asc -label:"in progress" -label:question -label:wontfix -label:duplicate -label:invalid'
{ gh issue list --state open --limit 100 --search "$F no:assignee" --json number,createdAt
  gh issue list --state open --limit 100 --search "$F assignee:@me" --json number,createdAt
} | jq -s 'add | sort_by(.createdAt) | map(.number)'
# per candidate, must print 0 (no PR already closes it):
gh issue view N --json closedByPullRequestsReferences -q '[.closedByPullRequestsReferences[]] | length'
```

A `blocked` issue is eligible only once what it waits on is in: read its latest `⏸ Blocked` comment. Merged or closed → `gh issue edit N --remove-label blocked` and work it. Still open → skip it without a new comment.

Issue numbers given as args are taken even if they are assigned to someone. Only a claim by another session (`scripts/issue.sh claim` exits 2), a linked open PR or a closed issue stops them.

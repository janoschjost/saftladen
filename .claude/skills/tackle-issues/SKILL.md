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
2. Run the **`AGENTS.md` workflow** for it, steps 2–6: claim → worktree → implement → done → PR. Claim exits 2 → go back to 1.
3. Once the PR is open, go straight back to 1. Don't wait for review or merge.

Skip an issue without claiming it if it is unclear, needs a product decision, or depends on an unmerged PR. Leave a short comment with the open question instead. If you have to give up after claiming, release it (`scripts/issue.sh release`).

At the end, report: issue → PR link, plus the skipped issues and why.

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

Issue numbers given as args are taken even if they are assigned to someone. Only a claim by another session (`scripts/issue.sh claim` exits 2), a linked open PR or a closed issue stops them.

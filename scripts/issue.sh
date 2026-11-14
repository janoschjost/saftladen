#!/usr/bin/env bash
# Claim protocol for GitHub issues and PRs, shared by every agent session (and humans). N may be a PR number.
#
#   scripts/issue.sh new "<title>" <bug|enhancement> [body] [haiku|sonnet|opus]
#                                   open an issue assigned to you, print its number; a model adds the model:<x> label
#   scripts/issue.sh claim N [label]   claim N, label `in progress` (or `in review`), assign an issue to you;
#                                   exit 0 = ours, exit 2 = taken by someone else
#   scripts/issue.sh release N "<reason>"   hand a claimed issue or PR back
#   scripts/issue.sh ask N "<questions>"     park N until a dev answers: comment + `question` label (releases a claim)
#   scripts/issue.sh block N "<reason>" [M]  park N until M (issue or PR) is done; M an issue: native "blocked by #M"
#                                   link + comment, else comment + `blocked` label (releases a claim either way)
#   scripts/issue.sh sub P C...       make C... sub-issues of P (a split: P stays open as the parent)
#   scripts/issue.sh refined N "<summary>"   N is ready for agents: comment, drop `question`/`blocked` (releases a claim)
#
# Label + assignee make a claim visible. The lock is the claim comment: GitHub orders comments by creation
# time, so the earliest claim comment after the last release wins a race between two sessions.
set -euo pipefail

LABEL="in progress"
CLAIM="🔒 claim"
RELEASE="🔓 release"

REVIEW="in review"

ensure_label() {
  gh label create "$LABEL" --color FBCA04 --description "Claimed by an agent session, PR coming" >/dev/null 2>&1 || true
  gh label create "$REVIEW" --color 0E8A16 --description "A dev is reviewing this PR (/review-pr)" >/dev/null 2>&1 || true
}

# `issue` or `pr`: the gh subcommand for number $1
kind() {
  gh api "repos/{owner}/{repo}/issues/$1" -q 'if .pull_request then "pr" else "issue" end'
}

# park issue $1 under label $2 with comment $3; a claim held on it is released
park() {
  gh label create question --color D876E3 --description "Waiting on a dev's answer; remove the label once answered" >/dev/null 2>&1 || true
  gh label create blocked --color B60205 --description "Waits on another issue or PR; agents re-check it each run" >/dev/null 2>&1 || true
  gh issue comment "$1" --body "$3" >/dev/null
  gh issue edit "$1" --add-label "$2" >/dev/null
  unclaim "$1" "parked as $2"
}

# GitHub's internal id of issue $1 (the dependency and sub-issue APIs take it, not the number)
issue_id() {
  gh api "repos/{owner}/{repo}/issues/$1" -q .id
}

# release a claim held on issue $1 (if any), with reason $2
unclaim() {
  if [ -n "$(winner "$1")" ]; then
    gh issue comment "$1" --body "$RELEASE — $2" >/dev/null
    gh issue edit "$1" --remove-label "$LABEL" --remove-assignee @me >/dev/null
  fi
}

# who holds the claim on $1, for the "taken" message: claim label and author of the latest claim comment
holder() {
  gh "$(kind "$1")" view "$1" --json labels,comments -q "
    [(.labels[].name | select(. == \"$LABEL\" or . == \"$REVIEW\")),
     ([.comments[] | select(.body | startswith(\"$CLAIM \"))] | last | .author.login // empty)] | join(\" by \")"
}

# token of the first claim comment after the latest release (empty if none)
winner() {
  gh "$(kind "$1")" view "$1" --json comments -q "
    [.comments[].body | select(startswith(\"$CLAIM \") or startswith(\"$RELEASE\"))]
    | (map(startswith(\"$RELEASE\")) | rindex(true)) as \$r
    | .[(if \$r == null then 0 else \$r + 1 end):]
    | map(select(startswith(\"$CLAIM \")))[0] // \"\"
    | split(\" \")[2] // \"\""
}

cmd=${1:-}
case "$cmd" in
  new)
    title=${2:?title}; label=${3:?label (bug|enhancement)}; body=${4:-}; model=${5:-}
    labels=(--label "$label")
    case "$model" in
      "") ;;
      haiku|sonnet|opus) labels+=(--label "model:$model") ;;
      *) echo "model must be haiku, sonnet or opus" >&2; exit 1 ;;
    esac
    url=$(gh issue create --title "$title" "${labels[@]}" --assignee @me --body "${body:-Opened by an agent session.}")
    echo "${url##*/}"
    ;;
  claim)
    n=${2:?issue or PR number}; label=${3:-$LABEL}
    ensure_label
    k=$(kind "$n")
    if [ "$(gh "$k" view "$n" --json state -q .state)" != "OPEN" ]; then echo "#$n is not open" >&2; exit 2; fi
    held=$(winner "$n")
    if [ -n "$held" ]; then echo "#$n is already claimed: $(holder "$n")" >&2; exit 2; fi
    token=$(uuidgen)
    gh "$k" comment "$n" --body "$CLAIM $token — $label." >/dev/null
    if [ "$(winner "$n")" != "$token" ]; then
      # lost the race: drop our comment, leave label/assignee to the winner
      id=$(gh api "repos/{owner}/{repo}/issues/$n/comments" --paginate -q ".[] | select(.body | startswith(\"$CLAIM $token\")) | .id")
      [ -n "$id" ] && gh api -X DELETE "repos/{owner}/{repo}/issues/comments/$id" >/dev/null
      echo "#$n was claimed by another session" >&2
      exit 2
    fi
    # a PR keeps its assignee (the dev who owns it); the lock and the label show who works on it
    if [ "$k" = pr ]; then gh pr edit "$n" --add-label "$label" >/dev/null
    else gh issue edit "$n" --add-label "$label" --add-assignee @me >/dev/null; fi
    echo "claimed #$n"
    ;;
  release)
    n=${2:?issue or PR number}; reason=${3:?reason}
    k=$(kind "$n")
    gh "$k" comment "$n" --body "$RELEASE — $reason" >/dev/null
    for l in "$LABEL" "$REVIEW"; do
      if gh "$k" view "$n" --json labels -q '.labels[].name' | grep -qx "$l"; then
        gh "$k" edit "$n" --remove-label "$l" >/dev/null
      fi
    done
    [ "$k" = pr ] || gh issue edit "$n" --remove-assignee @me >/dev/null
    echo "released #$n"
    ;;
  ask)
    n=${2:?issue number}; q=${3:?questions}
    park "$n" question "❓ Open questions, waiting on a dev (answer here, then remove the \`question\` label):

$q"
    echo "#$n waits on a dev answer"
    ;;
  block)
    n=${2:?issue number}; reason=${3:?reason}; m=${4:-}; m=${m#\#}
    if [ -n "$m" ] && [ "$(kind "$m")" = issue ]; then
      # native link: /tackle-issues reads it, GitHub clears it when #m closes, so no label to clean up
      gh api -X POST "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by" -F issue_id="$(issue_id "$m")" >/dev/null
      gh issue comment "$n" --body "⏸ Blocked by #$m: $reason" >/dev/null
      unclaim "$n" "blocked by #$m"
    else
      park "$n" blocked "⏸ Blocked: $reason"
    fi
    echo "#$n is blocked"
    ;;
  sub)
    p=${2:?parent issue number}; shift 2
    [ $# -gt 0 ] || { echo "sub-issue numbers missing" >&2; exit 1; }
    for c in "$@"; do
      gh api -X POST "repos/{owner}/{repo}/issues/$p/sub_issues" -F sub_issue_id="$(issue_id "${c#\#}")" >/dev/null
    done
    echo "#$p has sub-issues $*"
    ;;
  refined)
    n=${2:?issue number}; summary=${3:?summary}
    gh issue comment "$n" --body "✅ Refined, ready for agents:

$summary" >/dev/null
    for l in question blocked; do
      if gh issue view "$n" --json labels -q '.labels[].name' | grep -qx "$l"; then
        gh issue edit "$n" --remove-label "$l" >/dev/null
      fi
    done
    unclaim "$n" "refined"
    echo "#$n is ready"
    ;;
  *)
    sed -n '2,16p' "$0" >&2
    exit 1
    ;;
esac

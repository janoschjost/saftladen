#!/usr/bin/env bash
# Claim protocol for GitHub issues, shared by every agent session (and humans).
#
#   scripts/issue.sh new "<title>" <bug|enhancement> [body] [haiku|sonnet|opus]
#                                   open an issue assigned to you, print its number; a model adds the model:<x> label
#   scripts/issue.sh claim N        claim issue N and assign it to you; exit 0 = ours, exit 2 = taken by someone else
#   scripts/issue.sh release N "<reason>"   hand a claimed issue back
#   scripts/issue.sh ask N "<questions>"     park N until a dev answers: comment + `question` label (releases a claim)
#   scripts/issue.sh block N "<reason>"      park N until a dependency (e.g. a PR) is merged: comment + `blocked` label
#
# Label + assignee make a claim visible. The lock is the claim comment: GitHub orders comments by creation
# time, so the earliest claim comment after the last release wins a race between two sessions.
set -euo pipefail

LABEL="in progress"
CLAIM="🔒 claim"
RELEASE="🔓 release"

ensure_label() {
  gh label create "$LABEL" --color FBCA04 --description "Claimed by an agent session, PR coming" >/dev/null 2>&1 || true
}

# park issue $1 under label $2 with comment $3; a claim held on it is released
park() {
  gh label create question --color D876E3 --description "Waiting on a dev's answer; remove the label once answered" >/dev/null 2>&1 || true
  gh label create blocked --color B60205 --description "Waits on another issue or PR; agents re-check it each run" >/dev/null 2>&1 || true
  gh issue comment "$1" --body "$3" >/dev/null
  gh issue edit "$1" --add-label "$2" >/dev/null
  if [ -n "$(winner "$1")" ]; then
    gh issue comment "$1" --body "$RELEASE — parked as $2" >/dev/null
    gh issue edit "$1" --remove-label "$LABEL" --remove-assignee @me >/dev/null
  fi
}

# token of the first claim comment after the latest release (empty if none)
winner() {
  gh issue view "$1" --json comments -q "
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
    n=${2:?issue number}
    ensure_label
    if [ "$(gh issue view "$n" --json state -q .state)" != "OPEN" ]; then echo "#$n is not open" >&2; exit 2; fi
    held=$(winner "$n")
    if [ -n "$held" ]; then echo "#$n is already claimed" >&2; exit 2; fi
    token=$(uuidgen)
    gh issue comment "$n" --body "$CLAIM $token — working on this, PR follows." >/dev/null
    if [ "$(winner "$n")" != "$token" ]; then
      # lost the race: drop our comment, leave label/assignee to the winner
      id=$(gh api "repos/{owner}/{repo}/issues/$n/comments" --paginate -q ".[] | select(.body | startswith(\"$CLAIM $token\")) | .id")
      [ -n "$id" ] && gh api -X DELETE "repos/{owner}/{repo}/issues/comments/$id" >/dev/null
      echo "#$n was claimed by another session" >&2
      exit 2
    fi
    gh issue edit "$n" --add-label "$LABEL" --add-assignee @me >/dev/null
    echo "claimed #$n"
    ;;
  release)
    n=${2:?issue number}; reason=${3:?reason}
    gh issue comment "$n" --body "$RELEASE — $reason" >/dev/null
    gh issue edit "$n" --remove-label "$LABEL" --remove-assignee @me >/dev/null
    echo "released #$n"
    ;;
  ask)
    n=${2:?issue number}; q=${3:?questions}
    park "$n" question "❓ Open questions, waiting on a dev (answer here, then remove the \`question\` label):

$q"
    echo "#$n waits on a dev answer"
    ;;
  block)
    n=${2:?issue number}; reason=${3:?reason}
    park "$n" blocked "⏸ Blocked: $reason"
    echo "#$n is blocked"
    ;;
  *)
    sed -n '2,13p' "$0" >&2
    exit 1
    ;;
esac

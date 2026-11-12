#!/usr/bin/env bash
# Claim protocol for GitHub issues, shared by every agent session (and humans).
#
#   scripts/issue.sh new "<title>" <bug|enhancement> [body]   open an issue assigned to you, print its number
#   scripts/issue.sh claim N        claim issue N and assign it to you; exit 0 = ours, exit 2 = taken by someone else
#   scripts/issue.sh release N "<reason>"   hand a claimed issue back
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
    title=${2:?title}; label=${3:?label (bug|enhancement)}; body=${4:-}
    url=$(gh issue create --title "$title" --label "$label" --assignee @me --body "${body:-Opened by an agent session.}")
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
  *)
    sed -n '2,10p' "$0" >&2
    exit 1
    ;;
esac

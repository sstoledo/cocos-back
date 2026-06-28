#!/usr/bin/env bash
set -euo pipefail

# prune-branches.sh
# Safely deletes local and remote branches whose PRs are already merged or closed.
# Designed for stacked PR workflows where intermediate branches must NOT be deleted
# until the whole stack is merged.
#
# Usage:
#   ./scripts/prune-branches.sh              # interactive, dry-run preview first
#   ./scripts/prune-branches.sh --dry-run    # preview only, no deletions
#   ./scripts/prune-branches.sh --force      # delete without prompting

DRY_RUN=false
FORCE=false
LOCAL_ONLY=false
REMOTE_ONLY=false
DEFAULT_BRANCH="main"
PROTECTED_BRANCHES=("main" "master" "develop")

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --dry-run       Preview branches that would be deleted without deleting them
  --force         Delete branches without prompting (use with caution)
  --local-only    Only delete local branches
  --remote-only   Only delete remote branches
  -h, --help      Show this help message

Behavior:
  - Skips protected branches (${PROTECTED_BRANCHES[*]}).
  - Skips branches with open PRs.
  - Skips branches not merged into ${DEFAULT_BRANCH}.
  - Prefers deleting the local branch after its PR was merged via GitHub.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    --local-only) LOCAL_ONLY=true; shift ;;
    --remote-only) REMOTE_ONLY=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ "$LOCAL_ONLY" == true && "$REMOTE_ONLY" == true ]]; then
  echo "Error: --local-only and --remote-only cannot be used together."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is required. Install it from https://cli.github.com/"
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: Not inside a git repository."
  exit 1
fi

REPO_INFO=$(gh repo view --json defaultBranchRef,mergeCommitAllowed 2>/dev/null || true)
if [[ -n "$REPO_INFO" ]]; then
  DEFAULT_BRANCH=$(echo "$REPO_INFO" | gh api --cache 0 /repos/{owner}/{repo} -q .default_branch 2>/dev/null || echo "main")
fi

echo "Default branch: $DEFAULT_BRANCH"

is_protected() {
  local branch="$1"
  for protected in "${PROTECTED_BRANCHES[@]}"; do
    if [[ "$branch" == "$protected" ]]; then
      return 0
    fi
  done
  return 1
}

pr_state() {
  local branch="$1"
  gh pr list --head "$branch" --state all --json state,mergedAt --jq '.[0] | if . == null then "NO_PR" elif .mergedAt != null then "MERGED" else .state end' 2>/dev/null || echo "UNKNOWN"
}

is_merged_into_default() {
  local branch="$1"
  git merge-base --is-ancestor "$branch" "$DEFAULT_BRANCH" 2>/dev/null
}

declare -a TO_DELETE_LOCAL=()
declare -a TO_DELETE_REMOTE=()

# Gather local branches
if [[ "$REMOTE_ONLY" == false ]]; then
  while IFS= read -r branch; do
    branch="${branch//\*/}"
    branch="$(echo -e "$branch" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$branch" ]] && continue
    is_protected "$branch" && continue
    if is_merged_into_default "$branch"; then
      state=$(pr_state "$branch")
      if [[ "$state" == "MERGED" || "$state" == "CLOSED" ]]; then
        TO_DELETE_LOCAL+=("$branch")
      fi
    fi
  done < <(git branch --format='%(refname:short)')
fi

# Gather remote branches
if [[ "$LOCAL_ONLY" == false ]]; then
  REMOTE=$(git remote | head -n 1)
  if [[ -n "$REMOTE" ]]; then
    while IFS= read -r branch; do
      branch="${branch#"$REMOTE/"}"
      is_protected "$branch" && continue
      if git merge-base --is-ancestor "$REMOTE/$branch" "$DEFAULT_BRANCH" 2>/dev/null; then
        state=$(pr_state "$branch")
        if [[ "$state" == "MERGED" || "$state" == "CLOSED" ]]; then
          TO_DELETE_REMOTE+=("$branch")
        fi
      fi
    done < <(git branch -r --format='%(refname:short)' | grep "^$REMOTE/" | grep -v "^$REMOTE/$DEFAULT_BRANCH$")
  fi
fi

# Preview
echo ""
echo "Branches to delete:"
if [[ ${#TO_DELETE_LOCAL[@]} -eq 0 && ${#TO_DELETE_REMOTE[@]} -eq 0 ]]; then
  echo "  (none)"
  exit 0
fi

for branch in "${TO_DELETE_LOCAL[@]}"; do
  echo "  [local]  $branch"
done
for branch in "${TO_DELETE_REMOTE[@]}"; do
  echo "  [remote] $REMOTE/$branch"
done

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "Dry-run mode: no branches were deleted."
  exit 0
fi

# Confirm
if [[ "$FORCE" == false ]]; then
  echo ""
  read -rp "Delete these branches? [y/N] " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# Delete
for branch in "${TO_DELETE_LOCAL[@]}"; do
  echo "Deleting local branch: $branch"
  git branch -D "$branch" || echo "  Failed to delete local branch: $branch"
done

for branch in "${TO_DELETE_REMOTE[@]}"; do
  echo "Deleting remote branch: $REMOTE/$branch"
  git push "$REMOTE" --delete "$branch" || echo "  Failed to delete remote branch: $REMOTE/$branch"
done

echo ""
echo "Cleanup complete."

#!/usr/bin/env bash
# Usage: reset-example-to.sh <clean|list|checkpoint-name>
#
# Rewritten for 008: tag-aware replay. Fixture branches deleted; use
# the checkpoint tree to reset to any named save point.
#
#   reset-example-to.sh clean
#     → git reset --hard, checkout main, full clean (destructive — authorized
#       only for dex-ecommerce per .claude/rules/06-testing.md §4c.1)
#   reset-example-to.sh list
#     → print all checkpoint/* tags
#   reset-example-to.sh <name>
#     → resolve to checkpoint/<name> (or use the exact name if it already
#       starts with checkpoint/), create a fresh attempt-* branch from it
#       with the working tree restored to exactly that checkpoint's state.
set -euo pipefail

TARGET=/home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce
ARG="${1:-clean}"

cd "$TARGET"

case "$ARG" in
  list)
    git tag --list 'checkpoint/*' | sort
    exit 0
    ;;
  clean)
    git reset --hard HEAD
    # -fdx wipes gitignored files too; clean-slate desired here (only for clean target).
    git clean -fdx
    git checkout main
    ;;
  *)
    case "$ARG" in
      checkpoint/*) TAG="$ARG" ;;
      *)            TAG="checkpoint/$ARG" ;;
    esac
    if ! git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1; then
      echo "unknown checkpoint: $TAG" >&2
      echo "use 'list' to see available checkpoints" >&2
      exit 2
    fi

    # Dirty-tree check — safety net. Do NOT force onto dirty state.
    if [ -n "$(git status --porcelain)" ]; then
      echo "uncommitted changes present; aborting. Use 'clean' first." >&2
      exit 3
    fi

    # Create a fresh attempt branch from the tag.
    STAMP=$(date -u +%Y%m%dT%H%M%S)
    BRANCH="attempt-${STAMP}"
    git checkout -B "$BRANCH" "$TAG"
    # -fd preserves gitignored files (.env, build output, editor state). Never -fdx here.
    git clean -fd -e .dex/state.lock
    echo "reset to $TAG; new branch: $BRANCH"
    ;;
esac

git status --short

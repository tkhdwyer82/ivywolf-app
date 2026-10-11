#!/usr/bin/env bash
# scripts/prebuild-check.sh — run before every build (CLAUDE.md, "Branches and builds"). Fails unless:
#   1. the current branch is main (skipped with --preview, for a preview build Tim asked for);
#   2. there are no uncommitted or untracked changes;
#   3. the branch matches its remote: main = origin/main (a preview: the branch = origin/<branch>, so it's pushed);
#   4. the typecheck and the tests pass.
# Then it points at the polish checklist (docs/polish-checklist.md), to be run and reported before the build.
#
# Called by scripts/build-ios.sh (npm run build:testflight / build:preview); run it on its own to check without building.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

preview=false
[[ "${1:-}" == "--preview" ]] && preview=true

fail() { echo "✗ prebuild check: $1" >&2; exit 1; }
ok() { echo "✓ $1"; }

branch=$(git branch --show-current)
[[ -n "$branch" ]] || fail "HEAD is detached; check out main (or the feature branch for a preview)"

# 1. Branch
if $preview; then
  [[ "$branch" != "main" ]] || fail "--preview is for a feature branch; on main use npm run build:testflight"
  ok "preview build from $branch"
else
  [[ "$branch" == "main" ]] || fail "TestFlight builds come only from main (on $branch). For a preview Tim asked for: npm run build:preview"
  ok "on main"
fi

# 2. Clean working tree
[[ -z "$(git status --porcelain)" ]] || { git status --short >&2; fail "uncommitted or untracked changes"; }
ok "working tree clean"

# 3. Up to date with the remote
git fetch --quiet origin "$branch" || fail "couldn't fetch origin/$branch (is the branch pushed?)"
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$branch")
[[ "$local_sha" == "$remote_sha" ]] || fail "$branch ($(git rev-parse --short HEAD)) doesn't match origin/$branch ($(git rev-parse --short "origin/$branch")); pull or push first"
ok "$branch = origin/$branch ($(git rev-parse --short HEAD))"

# 4. Typecheck and tests
npm run --silent typecheck >/dev/null || fail "typecheck failed (npm run typecheck)"
ok "typecheck"
npm test --silent --workspace @ivywolf/mobile -- --silent >/dev/null 2>&1 || fail "mobile tests failed (npm test -w @ivywolf/mobile)"
ok "mobile tests"
npx tsx scripts/test-directions.ts >/dev/null || fail "directions tests failed (npx tsx scripts/test-directions.ts)"
ok "directions tests"

echo
echo "Before building: run docs/polish-checklist.md on this build and report anything missing."

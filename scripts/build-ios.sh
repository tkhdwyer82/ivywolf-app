#!/usr/bin/env bash
# scripts/build-ios.sh — the only way to cut an iOS build (CLAUDE.md, "Branches and builds"). Three steps, and it
# stops loudly, non-zero, at the first that fails:
#   1. scripts/prebuild-check.sh (with --preview for a feature branch);
#   2. eas build --wait — the build, waited for;
#   3. eas submit --latest — a separate step, so a refused submission fails the script instead of passing silently
#      (eas build --auto-submit exits 0 when its submission can't be scheduled: build 14).
# It ends with the line to add to docs/polish-checklist.md → Builds.
#
#   npm run build:testflight      # main
#   npm run build:preview         # a feature branch, when Tim asks; build message "PREVIEW: <branch>"

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

preview=false
[[ "${1:-}" == "--preview" ]] && preview=true

stop() {
  echo >&2
  echo "✗ build-ios: $1" >&2
  exit 1
}

# 1. Check
if $preview; then
  bash scripts/prebuild-check.sh --preview || stop "prebuild check failed; nothing was built"
else
  bash scripts/prebuild-check.sh || stop "prebuild check failed; nothing was built"
fi

branch=$(git branch --show-current)
commit=$(git rev-parse --short HEAD)
if $preview; then message="PREVIEW: $branch"; else message="main $commit"; fi
label=$($preview && echo "PREVIEW: $branch" || echo "$branch")

cd apps/mobile

# 2. Build, and wait for it
echo "Building ($message)…"
out=$(mktemp)
npx eas-cli build --platform ios --profile preview --non-interactive --wait --json --message "$message" > "$out" \
  || stop "eas build failed; nothing was submitted ($message)"
number=$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0]; if (b.status !== "FINISHED") process.exit(1); console.log(b.appBuildVersion)' "$out") \
  || stop "eas build didn't finish; nothing was submitted ($message). Details: $out"
echo "✓ build $number built ($message)"

# 3. Submit, as its own step
npx eas-cli submit --platform ios --profile preview --latest --non-interactive \
  || stop "SUBMISSION FAILED: build $number ($message) built but is NOT on TestFlight. Retry: cd apps/mobile && npx eas-cli submit --platform ios --profile preview --latest"
echo "✓ build $number submitted to TestFlight"

echo
echo "Add to docs/polish-checklist.md → Builds:"
echo "| $number | $label | $commit |"

#!/usr/bin/env bash
# scripts/build-ios.sh — the only way to cut an iOS build (CLAUDE.md, "Branches and builds"). Three steps, and it
# stops loudly, non-zero, at the first that fails:
#   1. scripts/prebuild-check.sh (with --preview for a feature branch);
#   2. eas build --wait — the build, waited for (or, with --local, eas build --local on this Mac → an .ipa);
#   3. eas submit — a separate step, so a refused submission fails the script instead of passing silently
#      (eas build --auto-submit exits 0 when its submission can't be scheduled: build 14). --latest for a cloud
#      build; the .ipa it just made for a local one.
# It ends with the line to add to docs/polish-checklist.md → Builds.
#
#   npm run build:testflight            # main
#   npm run build:preview               # a feature branch, when Tim asks; build message "PREVIEW: <branch>"
#   npm run build:preview -- --local    # the same, built on this Mac (Xcode, CocoaPods, fastlane): no EAS build
#                                       # minutes — for when the plan's cloud builds have run out. Signing
#                                       # credentials still come from EAS (remote credentials).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

preview=false
local_build=false
for arg in "$@"; do
  case "$arg" in
    --preview) preview=true ;;
    --local) local_build=true ;;
    *) echo "✗ build-ios: unknown option $arg (use --preview, --local)" >&2; exit 1 ;;
  esac
done

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
if $local_build; then
  for tool in xcodebuild pod fastlane; do
    command -v "$tool" > /dev/null || stop "--local needs $tool on this Mac; nothing was built"
  done
fi

branch=$(git branch --show-current)
commit=$(git rev-parse --short HEAD)
if $preview; then message="PREVIEW: $branch"; else message="main $commit"; fi
label=$($preview && echo "PREVIEW: $branch" || echo "$branch")
$local_build && message="$message (local)"

cd apps/mobile

if $local_build; then
  # 2. Build on this Mac, into an .ipa
  echo "Building locally ($message)…"
  ipa="$(mktemp -d)/ivywolf.ipa"
  npx eas-cli build --platform ios --profile preview --local --non-interactive --output "$ipa" \
    || stop "local eas build failed; nothing was submitted ($message)"
  [[ -s "$ipa" ]] || stop "local eas build made no .ipa; nothing was submitted ($message)"
  number=$(unzip -p "$ipa" 'Payload/*.app/Info.plist' | plutil -extract CFBundleVersion raw -o - -) \
    || stop "can't read the build number from $ipa; nothing was submitted ($message)"
  echo "✓ build $number built ($message): $ipa"

  # 3. Submit that .ipa, as its own step
  npx eas-cli submit --platform ios --profile preview --path "$ipa" --non-interactive \
    || stop "SUBMISSION FAILED: build $number ($message) built but is NOT on TestFlight. Retry: cd apps/mobile && npx eas-cli submit --platform ios --profile preview --path $ipa"
  echo "✓ build $number submitted to TestFlight"
else
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
fi

echo
echo "Add to docs/polish-checklist.md → Builds:"
echo "| $number | $label | $commit |"

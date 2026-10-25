#!/usr/bin/env bash
# Builds the STAGING debug APK (com.agroconnect.app.staging, "AgroConnect Staging") that talks to Supabase staging
# (ahkgvuewgbjyahbiehrx) and installs next to the production app. Production build settings are untouched: the
# staging values only apply with -PagroStaging.
#   scripts/staging/build-staging-apk.sh
# Output: android/app/build/staging-apk/app-staging-debug.apk
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

STAGING_REF=ahkgvuewgbjyahbiehrx
PROD_REF=mgreapakfchcxcrauheq
[ -f .env.staging ] || { echo ".env.staging missing" >&2; exit 1; }
grep -q "^VITE_SUPABASE_URL=https://$STAGING_REF.supabase.co$" .env.staging || { echo ".env.staging does not point at staging" >&2; exit 1; }

# 1. staging web bundle
# push notifications only when Firebase is configured for this app id (registering without it crashes the plugin)
PUSH=0; [ -f android/app/google-services.json ] && grep -q '"com.agroconnect.app.staging"' android/app/google-services.json && PUSH=1
echo "push notifications in this build: $([ $PUSH = 1 ] && echo enabled || echo 'disabled (no google-services.json for com.agroconnect.app.staging)')"
VITE_PUSH_ENABLED=$PUSH npx vite build --mode staging --outDir dist-staging >/dev/null
grep -lq "$STAGING_REF" dist-staging/assets/*.js || { echo "staging bundle lacks staging ref" >&2; exit 1; }
if grep -lq "$PROD_REF" dist-staging/assets/*.js; then echo "staging bundle references production" >&2; exit 1; fi

# 2. assemble the asset directory the -PagroStaging build packages (git-ignored build dir)
cap_cfg=android/app/src/main/assets
if [ ! -f "$cap_cfg/capacitor.config.json" ] || [ ! -f "$cap_cfg/capacitor.plugins.json" ]; then
  npx cap sync android >/dev/null   # generates the two Capacitor config files
fi
stage=android/app/build/staging-assets
rm -rf "$stage" && mkdir -p "$stage/public"
cp -R dist-staging/. "$stage/public/"
cp "$cap_cfg/capacitor.config.json" "$cap_cfg/capacitor.plugins.json" "$stage/"

# 3. build (gradlew expects the JDK at ../jdk17 relative to android/)
linked_jdk=""
if [ ! -e "$root/jdk17" ] && [ -d "$root/../../../jdk17" ]; then ln -s "$(cd "$root/../../../jdk17" && pwd)" "$root/jdk17"; linked_jdk=1; fi
trap '[ -n "$linked_jdk" ] && rm -f "$root/jdk17"' EXIT
(cd android && ./gradlew assembleDebug -PagroStaging --no-daemon -q)
# copy out of Gradle's outputs dir: a later normal build wipes files it does not own there
out=android/app/build/staging-apk
mkdir -p "$out" && cp android/app/build/outputs/apk/debug/app-debug.apk "$out/app-staging-debug.apk"

# 4. verify package id and bundled backend
aapt2="$(ls -d "$HOME"/Library/Android/sdk/build-tools/*/aapt2 | tail -1)"
pkg="$("$aapt2" dump badging "$out/app-staging-debug.apk" | sed -nE "s/^package: name='([^']+)'.*/\1/p")"
[ "$pkg" = "com.agroconnect.app.staging" ] || { echo "unexpected package $pkg" >&2; exit 1; }
# extract first: piping unzip into grep -q under pipefail reports SIGPIPE as failure
js="$(mktemp -d)"; unzip -q -o "$out/app-staging-debug.apk" 'assets/public/assets/*.js' -d "$js"
if grep -rlq "$PROD_REF" "$js"; then echo "APK references production" >&2; exit 1; fi
grep -rlq "$STAGING_REF" "$js" || { echo "APK lacks staging ref" >&2; exit 1; }
rm -rf "$js"
echo "OK $pkg -> $out/app-staging-debug.apk (backend: $STAGING_REF)"

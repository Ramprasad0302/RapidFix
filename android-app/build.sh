#!/usr/bin/env bash
# Builds the signed RapidFix Play Store bundle (native app).
#   ./build.sh <versionCode> <versionName>     e.g. ./build.sh 7 1.1.0
# Version codes must always go up (Play rejects a code it has seen before).
# Signs with the upload key in ~/Desktop/RapidFix-Android (password from KEYSTORE-PASSWORD.txt)
# and copies the .aab there as UPLOAD-THIS-RapidFix-<name>-code<code>.aab.
set -euo pipefail
cd "$(dirname "$0")"
CODE=${1:?version code}; NAME=${2:?version name}
KEYDIR="$HOME/Desktop/RapidFix-Android"
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties
export RAPIDFIX_KEYSTORE="$KEYDIR/rapidfix-upload.keystore"
RAPIDFIX_KEYSTORE_PASSWORD=$(sed -n 's/^Keystore password: //p' "$KEYDIR/KEYSTORE-PASSWORD.txt")
export RAPIDFIX_KEYSTORE_PASSWORD RAPIDFIX_VERSION_CODE=$CODE RAPIDFIX_VERSION_NAME=$NAME
unset RAPIDFIX_DEBUG_URL

# The whole website inside the app (same files as rapidfix-frontend.zip) + every service,
# so it opens and shows services even on the first launch without internet.
( cd .. && npm run --silent package:hostinger >/dev/null )
WEB=app/src/main/assets/web
rm -rf "${WEB:?}"; mkdir -p "$WEB"
rsync -a --exclude '.htaccess' --exclude '*.map' ../build/hostinger-frontend/public/ "$WEB/"
node ../scripts/catalog-snapshot.mjs > "$WEB/catalog-snapshot.json"
./gradlew --quiet clean bundleRelease assembleRelease
AAB=app/build/outputs/bundle/release/app-release.aab
"$JAVA_HOME/bin/jarsigner" -verify "$AAB" >/dev/null
mkdir -p "$KEYDIR/old-already-uploaded"
for f in "$KEYDIR"/UPLOAD-THIS-*.aab; do [ -e "$f" ] && mv "$f" "$KEYDIR/old-already-uploaded/"; done
cp "$AAB" "$KEYDIR/UPLOAD-THIS-RapidFix-$NAME-code$CODE.aab"
cp app/build/outputs/apk/release/app-release.apk "$KEYDIR/RapidFix-$NAME-test-install.apk"
echo "✔ $KEYDIR/UPLOAD-THIS-RapidFix-$NAME-code$CODE.aab"

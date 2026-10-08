#!/usr/bin/env bash
# Builds the RapidFix iPhone app.
#   ./build.sh sim                      → build + install on the booted iPhone simulator
#   ./build.sh release <build> <version> → App Store archive, e.g. ./build.sh release 1 1.0.0
#                                          (needs Xcode signed in to the Apple Developer account,
#                                           and RAPIDFIX_TEAM_ID=<10-character Team ID>)
# Build numbers must always go up for the same version (App Store Connect rejects a repeat).
set -euo pipefail
cd "$(dirname "$0")"
MODE=${1:-sim}
OUT="$HOME/Desktop/RapidFix-iOS"
mkdir -p "$OUT"

# 1. The whole website inside the app (same files as rapidfix-frontend.zip) + every service,
#    so it opens and shows services even on the first launch without internet.
( cd .. && npm run --silent package:hostinger >/dev/null )
WEB=Resources/web
rm -rf "${WEB:?}"; mkdir -p "$WEB"
rsync -a --exclude '.htaccess' --exclude '*.map' ../build/hostinger-frontend/public/ "$WEB/"
node ../scripts/catalog-snapshot.mjs > "$WEB/catalog-snapshot.json"

# 2. Job-alert tones: the Android pack, cut to 29 s (Apple plays notification sounds up to 30 s) as IMA4 .caf.
python3 ../android-app/tools/make_ringtones.py >/dev/null
mkdir -p Resources/Sounds
TMP=$(mktemp -d)
for wav in ../android-app/app/src/main/res/raw/*.wav; do
  name=$(basename "$wav" .wav)
  caf="Resources/Sounds/$name.caf"
  [ -f "$caf" ] && [ "$caf" -nt "$wav" ] && continue
  python3 - "$wav" "$TMP/$name.wav" <<'PY'
import sys, wave
src, dst = sys.argv[1], sys.argv[2]
with wave.open(src) as r, wave.open(dst, 'wb') as w:
    w.setparams(r.getparams())
    n = min(r.getnframes(), int(r.getframerate() * 29))
    w.writeframes(r.readframes(n))
PY
  afconvert -f caff -d ima4 "$TMP/$name.wav" "$caf"
done
rm -rf "$TMP"

# 3. App icon + launch logo from the website's mascot.
ICONS=RapidFix/Assets.xcassets
mkdir -p "$ICONS/AppIcon.appiconset" "$ICONS/LaunchLogo.imageset" "$ICONS/LaunchBackground.colorset"
swift tools/make_icon.swift ../apps/web/public/icons/maskable-512.png "$ICONS/AppIcon.appiconset/AppIcon.png" "$ICONS/LaunchLogo.imageset/LaunchLogo.png"

# 4. Xcode project from project.yml.
xcodegen generate --quiet

if [ "$MODE" = "sim" ]; then
  xcodebuild -project RapidFix.xcodeproj -scheme RapidFix -configuration Debug \
    -destination "${RAPIDFIX_SIM:-generic/platform=iOS Simulator}" -derivedDataPath build \
    CODE_SIGNING_ALLOWED=NO -quiet build
  APP=build/Build/Products/Debug-iphonesimulator/RapidFix.app
  if xcrun simctl list devices booted | grep -q Booted; then
    xcrun simctl install booted "$APP"
    xcrun simctl launch booted in.rapidfix.app >/dev/null
  fi
  echo "✔ $APP"
  exit 0
fi

BUILD=${2:?build number}; VERSION=${3:?version}
TEAM=${RAPIDFIX_TEAM_ID:?set RAPIDFIX_TEAM_ID to your Apple Developer Team ID}
ARCHIVE="build/RapidFix-$VERSION-$BUILD.xcarchive"
xcodebuild -project RapidFix.xcodeproj -scheme RapidFix -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" -derivedDataPath build \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" -quiet archive
cat > build/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
EOF
[ "${RAPIDFIX_ARCHIVE_ONLY:-}" = "1" ] && { echo "✔ $ARCHIVE"; exit 0; }
# Uploads straight to App Store Connect (TestFlight → submit for review there).
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist build/ExportOptions.plist \
  -exportPath "build/export-$BUILD" -allowProvisioningUpdates
cp -R "$ARCHIVE" "$OUT/"
echo "✔ Uploaded RapidFix $VERSION ($BUILD) to App Store Connect; archive in $OUT"

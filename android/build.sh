#!/bin/bash
# Builds the signed Play Store bundle (.aab) and a test .apk for RapidFix.
#
#   ./build.sh <versionCode> <versionName>      e.g.  ./build.sh 4 1.0.3
#
# 1. sets the version in twa-manifest.json
# 2. regenerates the Bubblewrap project (icons served from apps/web/public, because
#    the host's firewall sometimes blocks Bubblewrap's downloads)
# 3. re-applies RapidFix customisations (ringing job-request channel + alert tone)
# 4. builds and signs with the upload key (password from ~/Desktop/RapidFix-Android/KEYSTORE-PASSWORD.txt)
set -euo pipefail
cd "$(dirname "$0")"
CODE=${1:?versionCode}
NAME=${2:?versionName}
KEYDIR="$HOME/Desktop/RapidFix-Android"
PW=$(sed -n 's/^Keystore password: //p' "$KEYDIR/KEYSTORE-PASSWORD.txt")
PORT=4455

python3 - "$CODE" "$NAME" <<'PY'
import json, sys
p = 'twa-manifest.json'; d = json.load(open(p))
d['appVersionCode'] = int(sys.argv[1]); d['appVersionName'] = sys.argv[2]; d['appVersion'] = sys.argv[2]
s = json.dumps(d, indent=2).replace('https://rapidfix.in/icons/', 'http://localhost:4455/icons/').replace('https://rapidfix.in/manifest.webmanifest', 'http://localhost:4455/manifest.webmanifest')
open(p, 'w').write(s + '\n')
PY

(cd ../apps/web/public && python3 -m http.server $PORT >/dev/null 2>&1) &
SERVER=$!
restore() {
  kill $SERVER 2>/dev/null || true
  sed -i '' "s#http://localhost:$PORT/#https://rapidfix.in/#g" twa-manifest.json
}
trap restore EXIT
sleep 1

bubblewrap update --skipVersionUpgrade </dev/null

# RapidFix customisations on top of the generated project.
cp customizations/java/DelegationService.java app/src/main/java/in/rapidfix/app/DelegationService.java
mkdir -p app/src/main/res/raw
cp customizations/res/raw/* app/src/main/res/raw/

BUBBLEWRAP_KEYSTORE_PASSWORD="$PW" BUBBLEWRAP_KEY_PASSWORD="$PW" bubblewrap build --skipPwaValidation </dev/null

cp app-release-bundle.aab "$KEYDIR/RapidFix-$NAME-playstore.aab"
cp app-release-signed.apk "$KEYDIR/RapidFix-$NAME-test-install.apk"
echo "Built $KEYDIR/RapidFix-$NAME-playstore.aab (versionCode $CODE)"

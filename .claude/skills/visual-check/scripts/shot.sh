#!/usr/bin/env bash
# Headless-Chrome screenshot of a local page, optionally cropped — cheap, reliable visual checks.
#   shot.sh <path-or-url> <out.png> [WxH=1440x860] [scale=1] [crop=W,H,X,Y]
# Examples:
#   shot.sh "index.html" /tmp/over.png
#   shot.sh "index.html?f=3&at=1500,300" /tmp/wakhan.png 1440x860 2
#   shot.sh "spike/map-lab.html" /tmp/crop.png 1500x860 2 1000,700,400,900
# Needs the dev server: python3 -m http.server 5173 (started automatically if missing).
set -euo pipefail
PAGE="$1"; OUT="$2"; SIZE="${3:-1440x860}"; SCALE="${4:-1}"; CROP="${5:-}"
# headless Chrome drops the Leaflet map layer at device scale < 1 — never go below 1
awk "BEGIN{exit !($SCALE < 1)}" && { echo "scale must be >= 1 (below 1 the map layer is dropped)"; exit 1; }
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[[ "$PAGE" == http* ]] || PAGE="http://localhost:5173/${PAGE#/}"
# still=1 turns off animations (Leaflet tile fades never finish in headless → blank map)
[[ "$PAGE" == *\?* ]] && PAGE="$PAGE&still=1" || PAGE="$PAGE?still=1"

if ! curl -s -o /dev/null localhost:5173; then
  (cd "$ROOT" && nohup python3 -m http.server 5173 >/dev/null 2>&1 &) ; sleep 1
fi

# virtual-time-budget lets Leaflet finish loading tiles/fonts before the capture
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="${SIZE/x/,}" \
  --force-device-scale-factor="$SCALE" --virtual-time-budget=30000 \
  --screenshot="$OUT" "$PAGE" >/dev/null 2>&1 || true
[ -s "$OUT" ] || { echo "no screenshot produced — is the page erroring? try it in the browser"; exit 1; }

if [ -n "$CROP" ]; then
  IFS=, read -r W H X Y <<< "$CROP"
  sips -c "$H" "$W" --cropOffset "$Y" "$X" "$OUT" --out "$OUT" >/dev/null
fi
echo "$OUT"

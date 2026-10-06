#!/usr/bin/env bash
# Rebuild the sketch map's baked tiles + label data (and optionally the source data).
#   .claude/skills/map-build/scripts/rebuild.sh          # tiles + labels (~40 s)
#   .claude/skills/map-build/scripts/rebuild.sh --data   # also re-derive data/*.json first
# Fails loudly: every step's errors are shown, nothing is piped to /dev/null.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
[ -f package.json ] || { echo "run from the repo (package.json not found)"; exit 1; }

if [[ "${1:-}" == "--data" ]]; then
  python3 tools/build-map-data.py
  python3 tools/build-elevation.py
fi

for f in js/map/*.js; do node --input-type=module --check < "$f" || { echo "syntax error in $f"; exit 1; }; done
node tests/geo.test.mjs | tail -1
node tools/build-tiles.mjs | tail -4
rm -rf tiles/t0 tiles/t1 tiles/t2 tiles/t3
python3 tools/slice-tiles.py | tail -1
echo "done — reload the site root (index.html) (tiles are cached by URL; add ?v=N if the browser holds old ones)"

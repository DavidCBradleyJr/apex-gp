#!/bin/sh
# Build .preview/: the canvas files plus the canvas runtime as support.js, so Main.dc.html renders locally.
# Usage: test/preview.sh /path/to/dc-runtime.js   (fetch it with the Artifact tool: read path "artifact-type/dc-runtime.js")
set -e
cd "$(dirname "$0")/.."
rm -rf .preview && mkdir -p .preview
cp "$1" .preview/support.js
ln -s ../design/project/vendor .preview/vendor
ln -s ../design/project/game.js .preview/game.js
cp test/canvas-pose.js .preview/
for f in design/project/*.dc.html; do
  sed 's#<script src="./game.js"></script>#<script src="./game.js"></script><script src="./canvas-pose.js"></script>#' "$f" > ".preview/$(basename "$f")"
done

#!/bin/sh
# Build the GitHub Pages site in docs/ from src/ and vendor/. Run after changing the engine or the page, then commit and push.
set -e
cd "$(dirname "$0")"
python3 tools/prepare-f1-package.py
mkdir -p docs/vendor/f1-models docs/audio design/project/audio design/project/vendor/f1-models
cp src/index.html src/game.js src/rig.js src/overlay.js src/webhid-ffb.js docs/
cp vendor/*.js docs/vendor/
cp vendor/f1-models/*.glb docs/vendor/f1-models/
cp vendor/f1-models/*.glb design/project/vendor/f1-models/
cp src/audio/* docs/audio/
cp src/audio/* design/project/audio/
touch docs/.nojekyll
cp src/game.js src/overlay.js design/project/   # the canvas keeps its own copy
cp vendor/monza-tree.js vendor/driver-hands.js vendor/f1-cars.js design/project/vendor/
echo "docs/ built: $(du -sh docs | cut -f1)"

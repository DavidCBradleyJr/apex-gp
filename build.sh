#!/bin/sh
# Build the GitHub Pages site in docs/ from src/ and vendor/. Run after changing the engine or the page, then commit and push.
set -e
cd "$(dirname "$0")"
mkdir -p docs/vendor
cp src/index.html src/game.js docs/
cp vendor/*.js docs/vendor/
touch docs/.nojekyll
cp src/game.js design/project/game.js   # the canvas keeps its own copy
echo "docs/ built: $(du -sh docs | cut -f1)"

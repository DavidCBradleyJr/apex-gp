#!/bin/sh
# Headless screenshot of a page served from the project root on :8765, inside a memory-limited scope.
# Usage: test/shot.sh 'src/play.html?pose=brake&s=930' out.png [width height]
# Serve first: python3 -m http.server 8765 --bind 127.0.0.1   (from the project root)
exec systemd-run --user --scope --quiet --slice=background.slice -p MemoryMax=3G -p MemoryHigh=2500M \
  timeout 150 chromium --headless=new --no-sandbox --disable-dev-shm-usage --use-gl=swiftshader --enable-unsafe-swiftshader \
  --disable-gpu-compositing --hide-scrollbars --window-size="${3:-1440},${4:-810}" --virtual-time-budget=40000 \
  --screenshot="$2" "http://127.0.0.1:8765/$1"

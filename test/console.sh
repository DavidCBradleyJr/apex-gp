#!/bin/sh
# Load a page headlessly and print its console output, minus the template-placeholder noise the canvas runtime
# causes before it mounts ("{{ hole }}" in SVG attributes). Usage: test/console.sh '.preview/Main.dc.html?pose=race'
systemd-run --user --scope --quiet --slice=background.slice -p MemoryMax=3G -p MemoryHigh=2500M \
  timeout 150 chromium --headless=new --no-sandbox --disable-dev-shm-usage --use-gl=swiftshader --enable-unsafe-swiftshader \
  --disable-gpu-compositing --autoplay-policy=no-user-gesture-required --enable-logging=stderr --window-size=960,540 \
  --virtual-time-budget=40000 --dump-dom "http://127.0.0.1:8765/$1" 2>&1 >/dev/null | grep "CONSOLE" | grep -v 'Expected .*{{' | sed 's/^.*CONSOLE:[0-9]*\] //' | cut -c1-240

#!/bin/sh
# Headless Chromium with the DevTools port open, for cdp.js. WebGL runs on the software renderer,
# so the match draws correctly without a GPU (slowly, which the virtual clock makes irrelevant).
CHROME="${CHROME_BIN:-}"
if [ -z "$CHROME" ]; then
  for c in chromium chromium-browser google-chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then echo "No Chromium found: set CHROME_BIN to a Chromium or Chrome binary." >&2; exit 1; fi
PORT="${CDP_PORT:-9333}"
PROFILE="${CAPTURE_PROFILE:-${TMPDIR:-/tmp}/bucket-squad-capture-profile}"
exec "$CHROME" --headless=new --no-sandbox --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-webgl --hide-scrollbars --mute-audio --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" --window-size=1280,640 --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows about:blank

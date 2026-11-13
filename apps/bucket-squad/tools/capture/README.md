# Capture tools

Looking at the game, and filming it, without a phone. Everything here drives the
web build in headless Chromium over the DevTools protocol. None of it ships in
the app.

```sh
# 1. the web build (from apps/bucket-squad)
npx expo start --web --port 8081

# 2. the browser
tools/capture/chrome.sh

# 3a. look at a screen
cd tools/capture
node cdp.js size:844x390@2 nav:http://localhost:8081/ 'until:!!globalThis.__save' wait:2000 shot:home.png
node cdp.js size:844x390@2 tap:PLAY wait:600 shot:play.png

# 3b. photograph every screen at one size, from a save that is a few days in
node screens.js 844x390@2 shots         # a current phone
node screens.js 640x360@2 shots-small   # the smallest screen the layout supports
node screens.js 1180x820@1 shots-pad    # a tablet

# 3c. film the walkthrough: first launch, first pack, a tour game, results, shelf, shop
node trailer.js 30 2 take          # 30 frames a second at double resolution into ./take
python3 assemble.py take 30 walkthrough.mp4
```

## How the filming works

Screen recording a headless browser gives uneven frames, and the match runs
slowly on a software renderer. So `vt.js` replaces the page's clock before the
app loads: timers, animation frames, `performance.now` and `Date.now` all follow
one virtual clock that only moves when the recorder steps it. Each video frame
is exactly 1/30 s of game time however long it took to draw, at any resolution.

The browser has no sound card. In development the app notes every sound it
plays in `__soundLog` (see `src/audio/sound.ts`), and `mix.py` lays those same
sound files under the video afterwards, with the same pool sizes and volumes
the app uses.

`trailer.js` is the script of the walkthrough. It plays a real game with real
taps; the match runs with `demo: true` so the person's team plays itself, and
the seed makes it the same game every time. `reveals.js` films the pack opening
with one card of each rarity.

### Black blocks in a film

While the clock is stopped, a layer that has just slid into view can come out
as a black rectangle: its new tiles are only painted when the browser draws a
frame. Three settings deal with it:

- `VT_TWICE=1` takes every picture twice and keeps the second (about 4 s a
  frame instead of 1.4 s). `VT_GAP` sets the pause between the two in ms
  (default 120); a busy machine needs more.
- Even then a few frames can come out with a block. Find them with
  `python3 darkframes.py take` (frames with large black areas; a scene that is
  dark on purpose shows up too, so look at what it lists).
- `VT_ONLY=170-177,473` films the whole script again but only pictures those
  frames; the clock still runs through every frame, so the page is exactly where
  it was. Picture a window of about 30 frames before each bad frame as well, or
  the jump makes the blocks worse, and take two or three tries if needed:
  `VT_TWICE=1 VT_GAP=200 VT_ONLY=140-180 node reveals.js 30 2 retake`.

## Needs

Node 22 or newer, Python 3 with numpy and Pillow, ffmpeg, and a Chromium binary
(`chrome.sh` looks for `chromium`, `chromium-browser`, `google-chrome` and Chrome
on a Mac; set `CHROME_BIN` to use another).

## Good to know

- Sizes come from the theme once, when the page loads (`src/theme/tokens.ts`), so
  give `size:` before `nav:` and load the page again after changing the size.
- The dev server reloads the page when a file under `src` changes. Leave `src`
  alone while a run or a take is going.
- `nav:` clears the tab's back list first. A tab that has been driven for hours
  fills the browser's list of 50, the browser then drops entries the app's router
  still counts on, and "go home" can land in an older page load with an older save.

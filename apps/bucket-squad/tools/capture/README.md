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

## Frame costs on a slow device

`perfmatch.js` plays a whole demo match under a slowed CPU (CDP CPU throttling) and times each frame's
JavaScript: the simulation, the animator, three.js submitting the scene, and the rest. The page clock is the
virtual clock, stepped exactly 1/60 s a frame. The software GPU cannot draw a big screen 60 times a second, so
the draw calls are dropped at the WebGL boundary after three.js has done all its own work for them. Give a tiny
device scale (`@0.25`) so the page itself stays cheap: the JavaScript of a frame does not depend on its pixels.

```sh
node perfmatch.js --size 1024x768@0.25 --throttle 6 --out t6.json          # an older iPad's CPU, roughly
node perfmatch.js --size 1024x768@0.25 --throttle 6 --tier 5 --out l5.json  # held at a graphics level (src/game/quality.ts)
# the same moment at a level, drawn for real at iPad size: a picture, and the software GPU's time per frame
node perfmatch.js --size 1024x768@2 --throttle 1 --tier 0 --shot l0.png --shotAt 20 --fill 6
```

On a phone, start the bundler with `EXPO_PUBLIC_BS_PERF=1` and look for the `BSPERF match` lines at the end of
a match (see `src/game/perf.ts`): frame gaps, frames over 20 and 33 ms, the time in each part and the graphics
level with each change of it.

## Checking sizes, touch, slow lines and slow devices

Four tools walk the game the way a tester would. All of them drive the headless browser from `chrome.sh`, and
share their helpers in `lib.js`. Nothing here ships in the app.

```sh
# every screen at one size, pressed with a finger, with a ruler held to each: things past the edge, words cut
# short, buttons too small, buttons on top of each other or in the phone's home-bar strip. Writes the pictures
# and report.json (the faults, and how long each page took to come up)
node qa.js --size 844x390@1 --touch --out qa/844
node qa.js --size 874x402@1 --touch --insets iphone --out qa/874-notch
node qa.js --size 844x390@1 --touch --cpu 6 --only home,play,shelf --out qa/slow

# the account while the account service takes its time (or never answers, or fails). The page talks to a
# pretend account answered by this tool: nothing leaves the machine and no real account is touched. Start the
# web build with EXPO_PUBLIC_SUPABASE_URL=https://bucket-squad-test.invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test
node slowapi.js --scenario launch  --delay 8000 --out slow     # also: signout, delete, choose; --hang, --fail

# two devices playing each other over a slow line, in real time (a second and third browser:
# CDP_PORT=9334 and 9335 with their own CAPTURE_PROFILE). Starts the room relay itself, with the delay
node slowline.js --delay 250 --jitter 60 --seconds 25

# how heavy each menu page is on a slow processor. Needs a production web build (npx expo export -p web, served
# from a folder, its address in APP_URL) and a save to start from (the text of the bucket-squad-save entry)
APP_URL=http://127.0.0.1:8090/ node perfmenu.js --size 1024x768@1 --cpu 6 --save save.json --out menu.json
```

What the numbers do and do not say:

- A phone with a notch gets a smaller scale than the browser gives the same screen (`usableScreen` in
  `src/theme/tokens.ts` takes the notch and home bar off before it works the scale out, and the browser has
  neither). `--insets iphone` shows where the notch and the bar sit, but keeps the browser's bigger scale, so it
  is harsher on width than the phone is. To see a notch phone's real room, give its usable screen as a plain
  size instead: 780x376 for an iPhone 13 to 15, 763x379 for an iPhone 16, 779x388 for a 16 Pro, 865x427 for a
  Pro Max.
- `hitSlop` (the invisible room round a small button) does not exist in the browser, so `small` faults
  overstate a little: a 36 point button with 4 points of slop is a 44 point target on a phone.
- The home page's 3D stage is drawn by the software GPU here. Making and freeing its WebGL context takes about
  a second in the browser and next to nothing on a device, so "back to home" looks far slower than it is.
- The slow-line match cannot run faster than the software GPU lets it (about half speed). Compare a slow line
  with a fast one on the same machine, not with 60.

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

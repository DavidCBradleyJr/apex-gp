You're taking over **Apex GP**, a browser F1 time-trial simulator I'm building. I want the next version to genuinely impress me, so it should feel like a real sim, not a demo. Make bold, high-impact improvements, verify them properly, and ship them to the live canvas.

## Where everything is
- Project: `/run/media/deej/8TB Linux/Projects/apex-gp` (read `README.md` first)
- Live game: a Claude Design canvas at https://claude.ai/artifact/38LXq1g63zdz5hrGHHrHb5
  - `Main.dc.html` is the playable game: setup menu, start lights, HUD and pause screen.
  - `Garage.dc.html` is the car spec sheet.
- `src/game.js` is the engine and the single source of truth. It is a classic script that uses the global `THREE` (three.js r147, the last release with classic `examples/js` loaders). It contains:
  - **Track:** `buildTrack()` builds the fictional 4.21 km Kestrel Valley circuit from Catmull-Rom control points, sampled every 2 m. It also produces curvature, kerbs, runoff, gravel, barriers, two DRS zones and three sectors.
  - **Racing line:** `racingLine()` relaxes each point to the least-bent path through its four neighbours, coarse strides first (minimum curvature). `speedProfile()` computes corner-limit speed, then forward and backward acceleration/braking passes that trade cornering grip against braking and traction. How much of the tyres it asks for, and the rest of the calibration (power, tyre heating), is the `TUNE` block; 1.65 is the highest lateral value checked with margin (1.7 still laps every circuit cleanly). `brakeDecel()` gives the deceleration limit and `aeroCoeffs()` the aero numbers.
  - **Physics:** `Sim` steps at a fixed 240 Hz. It models per-wheel loads (static, aero, longitudinal and lateral transfer) and Pacejka-style lateral tyres with load sensitivity. ABS and TC are friction-circle assists where cornering grip takes priority. Without them you get lock-ups and wheelspin. It also covers tyre temperature windows and wear per compound (soft/medium/hard), an 8-speed seamless gearbox (auto or manual), 120 kW ERS with a 4 MJ store plus an overtake mode, DRS, wall collisions, track limits that invalidate laps, sectors, and a live delta to the best lap.
  - **Autopilot:** `autopilot()` follows the racing line and speed profile. It is used by the test.
  - **`create(canvas, {onTelemetry})`** is the renderer and game shell:
    - Scene: Sky shader with PMREM image-based lighting, shadows following the car, procedural canvas textures, grandstands, pit building, a start gantry with real start lights, instanced trees and hills.
    - The Tripo car model, which arrives as base64 in `vendor/car.js`. `splitWheels()` cuts the four wheels out of the single mesh so the fronts steer and all four roll. The hub numbers in `WHEEL_DEFS` were measured from this specific mesh.
    - The racing-line ribbon. Its vertex colours update every frame (red brake / yellow lift / green flat out) and react to the player's speed within 300 m.
    - Three cameras, tyre smoke, Web Audio (synthesized V6 harmonics, turbo, squeal, wind, kerb rumble), keyboard and gamepad input, and telemetry sent to the UI at 15 Hz.
- `design/project/` is the canvas's own files. `game.js` and `vendor/*.js` there are **copies**, so run `cp src/game.js design/project/game.js` before publishing.
- `test/sim-test.js` is the physics check. Run `node test/sim-test.js`: the autopilot drives 3 laps and the test asserts lap time, top speed and g-loads are plausible. Current baseline on Kestrel: about 1:03.3 laps, 344 km/h, 4.6 g cornering and braking, tyres 63–104 °C. Real layouts: Monza 1:25.0, Silverstone 1:38.3, Bahrain 1:40.5 (real race laps are roughly 1:22, 1:29 and 1:33). The car itself holds 2.1 g at 80 km/h, 3.9 g at 200 and 5.4 g at 300 on a skidpad.
- `src/play.html` is a bare local test page. Serve it with `python3 -m http.server 8765 --bind 127.0.0.1` from the project root. It accepts these URL parameters:
  - `?pose=orbit&d=0.45`: wheels steered, menu orbit camera
  - `?pose=steer&cam=0|1|2`: paused, with the chosen camera
  - `?pose=brake&s=930`: 300 km/h at the given distance into the lap
  - `?drive=1&t=ms&steer=ms`: start a run, then press throttle and steer at the given times
  - `&log=1`: write telemetry to the console
- `assets/` holds the Higgsfield concept image and Tripo GLB. About 4.85 Higgsfield credits remain. Tripo H3.1 image→3D costs 9 credits, so you can't afford another car without asking me.

## Hard-won gotchas (don't relearn these)
- **Headless testing:** headless Chromium only works with Swiftshader, and it renders roughly 3 frames per run. You can't drive a lap there. Pose the car through `game.sim` and `game.state` (both exposed) and screenshot instead. The car's GLB takes several seconds to decode, so use `--virtual-time-budget=40000`.
- **Memory:** this host has 31 GiB and systemd-oomd has killed things before. Run Chromium inside `systemd-run --user --scope --slice=background.slice -p MemoryMax=3G`, one heavy job at a time.
- **Layered surfaces:** the renderer uses `logarithmicDepthBuffer`, and ground, mow stripes, road and kerbs are vertically separated (ground at −0.12). Layers 1–2 cm apart z-fought and made the road vanish.
- **Frame timing:** the frame `dtF` must stay clamped to ≥0, because the rAF timestamp can be earlier than creation time.
- **`Sim.delta()` is the lap-delta method.** The steering angle lives in `sim.roadAngle`. Reusing the name `delta` once froze the HUD.
- **Car orientation:** the car's front/back is detected automatically (the rear wing is the tallest point), and the car is scaled to 5.6 m long. The model is tall (about 1.55 m including the T-cam pod), which is why the cameras sit high.
- **Canvas format rules:**
  - Keep the `<script src="./support.js">` head line.
  - All UI must be `<x-dc>` markup driven by `renderVals()`.
  - Holes are simple lookups only.
  - No global keydown handlers: keys go through `onKeyDown` on the focusable root.
  - No network calls apart from Google Fonts and the project's own files.
  - Uploaded images go through the Artifact asset upload and are referenced as `/_blob/<id>`.
- **Publishing:**
  - Use the Artifact tool with `url` = the canvas link, `root` = `/run/media/deej/8TB Linux/Projects/apex-gp/design`, `file_path` set to one changed file and `files` listing the others.
  - I edit the canvas in its editor too. If a publish is refused, read the newer version, merge my edits (I once nudged the canvas `top: -5px`, which was kept), and publish again. Never overwrite my changes.
  - Only send `canvas.json` if you add or move artboards.
- **GitHub Pages:** public repo https://github.com/DavidCBradleyJr/apex-gp, live at https://davidcbradleyjr.github.io/apex-gp/ (branch `main`, folder `/docs`, same set-up as tiny-kaiju). `docs/` is build output: edit `src/`, run `./build.sh`, commit and push. This file used to live in `docs/` and moved to the repo root for that reason.
  - The Pages UI is `src/index.html`, a standalone page. The canvas UI (`design/project/Main.dc.html`) needs the Claude Design runtime, which is not ours to redistribute, so `.preview/` is git-ignored. Features only the canvas has: wing and brake-bias sliders, the lap telemetry screen (the T key is not forwarded on the web page).
- **Runoff:** barriers stand `RUNOFF` metres from the centre line (21 on straights, 56 outside corners), pulled in where another part of the circuit is alongside. Outside corners there is a gravel trap, or sand at slow corners (`gravP`/`gravM`: 1 gravel, 2 sand). Grass, gravel and sand are in `SURF`: low grip, rough, and a drag that grows with speed, so a trap stops a car arriving fast but can be driven out of.
- **Surroundings:** each circuit names a `world` in `WORLDS` (alpine, park, farmland, heath, desert): ground and verge colours, how much the land rolls, how wooded it is, which trees (conifer, broadleaf, palm), scrub, boulders, crop fields and far mountains. A circuit can also have a `city` (town, village or skyline at a world position) and `peaks` (mountains to one side only). Trees are instanced per kind and halved on the LOW graphics level.
- **Circuits:** `TRACKS` at the top of `src/game.js` (Kestrel Valley, Virel Park, Callow Heath). `create(canvas, { track })` builds one circuit and its scenery; the canvas menu calls `destroy()` and `create()` again to switch, so `destroy()` must keep freeing the scene.
  - Every layout must begin `[-500,0],[0,0],[450,0]` and end `[-640,45],[-600,-5]` (or close to it). Other endings made the Catmull-Rom curve bulge 8 m off the start straight, which bent it against the pit building and put a no-steer car in the wall.
  - Straights under 300 m get no DRS zone (they used to produce an inverted zone that was open nearly all lap).
  - The race AI is tuned on Kestrel. On the other two it finishes races but is scrappier: seen one elite-AI recovery on Virel and about 70 contact steps in a pro race on Callow, both over the Kestrel thresholds in `test/race-test.js`.
  - Best laps are stored per circuit (`apexgp.best.v1` for Kestrel, `.virel` / `.callow` suffixes).
  - `test/preview.sh` deletes `.preview/` first, so never pass it `.preview/support.js`; fetch the runtime again (Artifact read, path `artifact-type/dc-runtime.js`).
  - Pose parameters added: `&track=virel|callow`, `&steer=0.5` (turns the cockpit wheel), `?menu=track` (switches circuit twice in the menu).
- **Cockpit view (camera 2):** the camera is at the model's helmet (`EYE`, 0.72 m ahead of centre, 0.92 m up), inside the real halo line.
  - Up close the Tripo body is a blur, so for the main render only its geometry is swapped for an empty one and `rig` (chassis top, halo, mirrors, front tyres, suspension, steering wheel, gloves, arms) stands in. It is swapped back straight after the render: opponents and the ghost are `car.clone()` and must never inherit a hidden body.
  - The body mesh is the parent of the split wheels, so `visible = false` would take the wheels with it. The wheel split also keeps only the outer half of each tyre, which is why the rig has its own front tyres.
  - Mirrors are one 640x128 render looking back from mirror height, every third frame, quality 1 and up, with the player's car hidden and shadow updates off. Each mirror face shows half of it, flipped.
  - The wheel face is a canvas texture redrawn at about 12 Hz (`drawDash`). The canvas HUD's centre panel is hidden in this view (`dashDisplay`).
  - Rig colours are set far darker than they should look: the sky lighting and exposure lift them a lot (navy 0x15224d rendered pale blue).
  - Cockpit audio: engine low-pass at 0.7x and wind at 1.5x. Not checked by ear.
- **Performance** (measured with `&perf=1` on any pose: draw calls and triangles over a frame, largest meshes):
  - The drawing buffer follows a pixel budget (`PIXELS`: 1.2 / 2.2 / 3.7 MP by quality), not a device-pixel ratio. The old 1.75 cap meant up to 25 MP through 4x MSAA and bloom on a 4K screen.
  - Trees are 15-triangle crowns and cast no shadows: an instanced mesh is drawn whole into the shadow map, and no tree is within its 45 m reach. Three closed 7-sided tiers with shadows cost 330k triangles a frame.
  - The cockpit rig is baked into vertex-coloured meshes per material and moving part (`put` / `bake`), about 12 draw calls. As separate meshes it was 45. Cockpit frame went from 281 calls / 1.33M triangles to 164 / 0.48M; chase from 1.2M triangles to 0.63M.
  - The 50k-triangle car body is the next cost: six in a race, drawn again for any inside the shadow box. A low-detail body for distant cars would be the next step.
  - Physics is not a factor: 4.4 ms per second of a six-car race.
  - The HUD shows FPS (top right) so frame rate can be reported from a real GPU; headless Swiftshader numbers mean nothing.
  - A cockpit dash cowl placed at 0.62 m ahead of the eye poked through the steering wheel's screen; it is at 0.76 now.
- **Wheel split (`WHEEL_DEFS`):** measured from the GLB with a radius histogram. Tyre radius is 81.5 mm front and 85.5 mm rear in model units; nothing sits above the tyres. Three faults came from the old numbers, reported by the user as "wheel wells moving with the tyres":
  - cut radii of 84 / 88 took slivers of bodywork beside each wheel, which span with it (now 82 / 86);
  - the rear tread starts at z = 97 mm but the cut started at 125, so the inner 16 cm of the tyre stayed on the body while the rest span (the tyre band now has its own inner z);
  - in the cockpit the model's front wheel shells span over the rig's own tyres (they are hidden for that render now).
- **Graphics auto-detect:** `create(canvas, { quality })` takes `'auto'` (default) or 0 / 1 / 2. Auto starts at 2 and times 60 menu frames once the car has loaded (skipping the first 20); under 48 fps it steps down and times again. A software renderer (Swiftshader, llvmpipe) goes straight to 0, so the headless pose script passes `quality: 2` (`&q=` overrides). A hand-picked level (menu or the B key) is never changed. It cannot see headroom above the display's refresh rate, and it does not step back up.
- **Menu 3D circuit map:** `game.overview(on, shift)` shows `mapGroup` (the track as a 30 m band in sector colours, DRS in green, a post at the line) from an orbiting camera. `shift` slides the circuit sideways to clear the menu panel. At radius 0.78 of the circuit's size the track ran off screen; 1.05 fits.
- **Web page quality of life (`src/index.html` only):** settings saved in `localStorage` (`apexgp.settings.v1`), graphics and km/h / mph options, fullscreen (F), restart and race-again buttons, clear best lap, loading and graphics status, best lap shown in the menu, the view picked with C is remembered. The canvas got only the map toggle.
- **Scenery:** the dark rubber groove is two transparent ribbons on the racing line at y 0.006 and 0.008; tree crowns are three cones merged into one instanced geometry.
- **Physics tuning lessons:**
  - Tyre heat coefficients: 0.2 heating / 6 cooling. 0.12 left tyres cold and slow; 0.3 overheated them.
  - Speed-profile grip is calibrated at μ 1.35 / braking 1.3. 1.43 made the autopilot crash.
  - The car understeers if the front slip angle goes past about 0.085 rad.
  - `REAR_GRIP` (1.12) is the rear tyres' grip margin over the fronts. At 1.0 the car is neutral at the limit and holding a steer key spun it in 17 of 24 skidpad cases (lift, brake, flick, throttle pickup); the stability block in `test/sim-test.js` guards this. With assists off it still spins, by design.

## What I want from you
1. **Read the code first,** then draft a short plan ranked by impact. Choose 3–5 big upgrades and do them properly. Ideas, roughly in my order of interest, though you can push back:
   - **A ghost car of my best lap,** plus a post-lap telemetry screen: speed trace and throttle/brake against my best, overlaid by distance.
   - **AI opponents and a short race mode:** cars driving the racing line with varied pace, slipstream that actually affects drag, and position tracking.
   - **Visual realism:**
     - Skid marks that persist on the asphalt, brake discs that glow under heavy braking, and heat haze or sparks.
     - Bloom and a subtle motion blur at speed.
     - A better crowd texture: it currently aliases into noise.
     - Track-side detail: marshal posts, 100/200/300 m braking boards, advertising hoardings with fictional brands.
     - Some terrain elevation.
   - **Physics depth:** a proper longitudinal slip model (wheel spin dynamics), a differential, fuel load, brake temperature, track rubbering in over a session, and kerb and bump response.
   - **Sound:** richer engine harmonics on downshift (blips), gear-change cracks, ERS whine, and doppler on the start straight.
   - **Weather:** a wet track with lower grip and rain visuals as a setup option.
2. **Keep the physics test passing,** and extend it for new physics. Add one small runnable check for each non-trivial new system. Don't build frameworks.
3. **Verify visually** with posed headless screenshots and look at them yourself before claiming something works. If you can't verify something, say so plainly.
4. **Performance matters:** it has to stay smooth on a normal laptop GPU. Watch draw calls (use instancing), shadow cost and per-frame allocations.
5. **Ship increments** to the live canvas as each upgrade lands.
6. **Finish with:**
   - A short summary of what changed, what you measured, and what's still unverified.
   - An updated `README.md`.
   - Updated gotchas in this file, `docs/HANDOVER.md`, for the next session.

Constraints:
- Everything stays fictional: no real team, driver, sponsor or circuit names or liveries.
- No new paid generations without asking me.
- Don't commit or push unless I ask.

## Sim rigs (2026-11-11)

- `src/rig.js` owns standalone-page wheel calibration, browser input and same-origin SDL bridge polling. `src/index.html` passes it as `create(canvas, { controls })`. It maps wheel/pedals across USB devices, optional paddle/action buttons, and persists `apexgp.rig.v1`. The Design canvas and bare play page have no calibration UI; the engine's optional controls hook leaves their keyboard/standard-pad input intact.
- `tools/rig-bridge.py` is a Python-stdlib ctypes SDL2 adapter for desktop Linux/Windows. It serves **only `docs/`** on 127.0.0.1:8766, with same-origin JSON hardware commands under `/api/rig`, exact Host/Origin validation, input-size limits and a short socket timeout. No system configuration changes or Python dependencies. Windows needs a matching SDL2.dll (README). Linux SDL initialization/detection succeeded on the host, but returned no devices. Sandbox SDL startup fails with `Could not initialize UDEV` because input/udev are hidden; that does not establish host driver failure.
- `Sim.step` accepts `wheel: true` for linear full-lock steering without gamepad speed scaling/slew. It exports `aligningTorque`, derived from front-tyre force and approximate slip-dependent pneumatic trail. Existing keyboard/pad physics are unchanged. `readPad()` now only assumes Xbox bindings for `mapping === 'standard'`, preventing a raw wheel/pedal from becoming a rogue gamepad trigger.
- FFB is **constant directional force**, not rumble. Default request strength is 25% of the bridge's fixed 20% base-output cap (5% base output). Effects have a 120 ms hardware lifetime; the bridge watchdog also stops stale requests, and the client rejects stale simulation output. Pause/finish/focus loss/disconnect disarm FFB. The pause overlay has an explicit FFB-resume button. Losing mapped hardware pauses the run.
- Calibration must capture all endpoints; never infer pedal polarity from vendor names. Browser and SDL mappings have separate keys. Identical-device occurrence keys assume stable reconnect order. Wheelbase rotation is configured externally to 360° for the current fixed steering ratio. Physical FFB direction and strength need calibration on the user's rig; Windows/native-hardware execution is unverified. Native library ABI prefix/union allocation was checked against this host's SDL2 C header (direction 16 bytes, constant 40, level offset 30, effect union 72; Python reserves 128 aligned bytes).
- `build.sh` includes `rig.js` and still syncs the shared engine to the canvas. Preserve pre-existing uncommitted team/livery and other changes. Nothing was committed or published for this task.
- Tests: `node test/rig-test.js` (mapping, polarity, range, missing devices, paddle edges, expiry/gating, linear steering and torque sign), `python3 test/rig-bridge-test.py` (fake SDL detection, limits, effect expiry, unplug, driver failure, Host/Origin), existing sim/race tests. Browser flow lives in `test/rig-ui-test.js`; it mocks hardware responses and never sends force to a real rig. Software-rendered headless frames can be slow: allow a 1 s HTTP connection timeout while retaining short effect lifetimes/freshness checks.

- Final checks passed: both rig checks, existing sim/race suites, and the simulated-device browser flow (calibration, saved profile, explicit FFB resume, unplug pause, 390 px layout). Desktop and mobile screenshots were inspected. The browser lifecycle portion disables software WebGL drawing after its desktop screenshot to avoid GPU stalls; real-time rendering/FFB feel is not established by that test.

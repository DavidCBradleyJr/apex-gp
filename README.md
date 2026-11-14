# Apex GP

**Play it:** https://davidcbradleyjr.github.io/apex-gp/

A browser F1 sim (time trial and short races) on three made-up circuits: Kestrel Valley (4.2 km, flowing), Virel Park Autodrome (5.0 km, long straights and big stops) and Callow Heath (4.0 km, tight and technical). Three views, including a first-person cockpit with a working steering-wheel display and mirrors. It uses three.js r147, with synthesized audio and a hybrid recorded V12 voice.

- `src/game.js` is the engine. It holds the track builder, the vehicle physics, timing, the renderer and audio. The physics covers per-wheel loads, aero, Pacejka-style tyres with temperature and wear, ABS/TC, an 8-speed gearbox, and ERS/DRS. This file is the source of truth.
- `design/project/` holds the Claude Design canvas. `Main.dc.html` is the playable game UI and `Garage.dc.html` is the car sheet. The `game.js` in that folder is a copy, so run `cp src/game.js design/project/game.js` before republishing.
- `assets/` holds the car concept image (Higgsfield GPT Image 2.6) and its 3D mesh (Tripo H3.1). `vendor/car.js` is that GLB encoded as base64.
- Three real layouts are included as well: Autodromo Nazionale Monza, Silverstone Circuit and Bahrain International Circuit. They are flat copies of the centre lines in the [TUM racetrack database](https://github.com/TUMFTM/racetrack-database) (LGPL-3.0, traced from OpenStreetMap), with a constant 13 m road width and auto-placed DRS zones; `node tools/import-track.js Track.csv [startShiftMetres]` prints the control points for another one. The autopilot laps them 3 to 10 s off real race pace (Monza 1:25, Silverstone 1:38, Bahrain 1:40).
- Teams are the `TEAMS` list in `src/game.js`. Each of the eleven real teams loads its own preserved reference-led GLB through `vendor/f1-cars.js`; the original Apex car remains available. `create(canvas, { team })` or `game.team(id)` selects the player model, opponents use their own teams, and the ghost matches the player. All cars retain the same physics. These local exterior prototypes still need final appearance and active-aero qualification; the cockpit remains provisional.
- Circuits are the `TRACKS` list at the top of `src/game.js`; the engine builds one per `create(canvas, { track: id })`, and the menu re-creates the game to change circuit.
- Monza now has reference-led trackside scenery: its pit frontage and podium, roofed main grandstands, corner stands, narrower guardrail corridors, chicane escape lanes, gravel, bridges and leafy park woodland. A Tripo Studio tree is preserved in `assets/tracks/monza/`, with a compact local derivative in `vendor/monza-tree.js`. The circuit is still an approximate flat reconstruction, not a scan. Sources, the 30-credit receipt and qualification are in [the Monza asset record](assets/tracks/monza/QUALIFICATION.md). Check with `node test/monza-test.js`; the local harness accepts `?track=monza&pose=steer&s=3200&cam=2&d=0&line=off&check=1` for rendered asset/road-clearance checks.
- `src/index.html` is the standalone web page (menu and HUD in plain HTML and JS). `./build.sh` copies it, the engine and `vendor/` into `docs/`, which GitHub Pages serves from `main`. Update loop: edit, `./build.sh`, commit, push. It takes `?track=virel|callow&mode=race&cam=2&start=1` as a deep link.
- `src/play.html` is a bare local test page. Run `python3 -m http.server` in this folder, open `/src/play.html` (add `?track=virel` or `?track=callow`), and press Enter to start.
- `test/sim-test.js` is the physics check. Run `node test/sim-test.js`: an autopilot drives 3 laps, and the test asserts that lap time, speed and g-loads are plausible, that the car does not spin with assists on, and that every circuit laps cleanly. `node test/race-test.js` checks races.

**Engine sound:** choose **Car setup → Engine sound** for a modern V6 turbo hybrid (2014–present), V8 (2006–2013), V10 (late 1990s–2005), or early-1990s V12. The standalone page remembers the choice across visits and circuit changes; the canvas has a cycling button. Each voice has its own firing harmonics, audible rev range, exhaust tone and intake texture. Turbo and electric whine accompany the V6; shifts, overrun crackle, helmet filtering and nearby rivals follow the selected sound. This changes audio only, with identical performance and gearing. The V12 blends two loops from [Pe's real Ferrari F93A recording](https://www.youtube.com/watch?v=gpY0oKp3YC4) at upper revs under throttle; low revs, coasting and nearby rivals retain synthesis. Its apparent RPM references are estimated from trackside pitch, not a tachometer. The other eras are synthesized impressions. Missing/corrupt recordings retain the playable synth. Credits and edits ship in `audio/credits.html`; provenance and loop hashes are in [assets/audio/runtime.json](assets/audio/runtime.json). Rebuild loops with `python tools/prepare-v12-audio.py`, then `./build.sh`.

Audio check: serve the project root and open `/test/engine-audio-test.html`. It renders all four voices through real `OfflineAudioContext`, checks recorded V12 pitch across the upper range, sample-only levels, synthetic idle/coasting, delayed/failed loading, throttle/helmet dynamics, Doppler, turbo/ERS gating, shifts, mute/pause and saved menu settings/credits. The settings portion stubs WebGL and rig hardware; it sends no wheel forces.

The cockpit now uses textured gripping gloves derived locally from the preserved
Tripo Ferrari anatomy revision, with curved cloth sleeves, fabric/carbon detail,
clearcoated paint and retuned lighting. Both front ends and the built site load
`vendor/driver-hands.js`; loading failures retain the old capsule hands.
This remains a provisional static grip with mirrored markings and approximate
full-lock arm motion. It does not implement DLSS 5. Provenance, zero new generation
cost and limitations are in [the driver asset record](assets/driver-pov/production.json).
Run `node test/driver-assets-test.js`; use
`/src/play.html?track=monza&pose=steer&cam=2&d=0&line=off&quality=2&check=driver`
for the rendered steering/sleeve check. The harness also accepts `time=7` and `wet=1`.

Canvas: https://claude.ai/artifact/38LXq1g63zdz5hrGHHrHb5

Team-model production is tracked in [assets/f1-2026/BRIEF.md](assets/f1-2026/BRIEF.md)
and its `production.json` inventory. Official reference images are being collected
there for eleven distinct team cars and detailed first-person cockpits with arms
and hands, using Tripo Studio in the browser. All eleven distinct geometry and
textured sources are preserved, with compact local atlases; see
[exterior qualification](assets/f1-2026/EXTERIOR-QUALIFICATION.md). Cadillac's
generated blue cast has a local black/white correction. All eleven teams now have
prototypes with separate steering/rolling wheels and sampled Blender/actual-engine
checks; see their `QUALIFICATION.md` files. Cadillac uses its neutral atlas and
includes the separate rear rim pieces. The
[eleven-team checkpoint](assets/f1-2026/evidence/eleven-prototype-checkpoint.json)
reconciles model/evidence hashes and preserved sources, maps and references.
These are sampled mechanics checks; no new team car or accurate articulated POV
is production accepted. Geometry/branding corrections, active aero and articulated
POV assets remain in progress. The exterior budget was 990 Studio credits; a
separately approved Ferrari steering-wheel pilot used another 90. A Ferrari glove
pilot adds90. Further wheel/glove revisions bring total F1 spend to1,590. The user
authorized up to3,000 further Studio credits;510 spent,2,490 remains. No new
credits were spent on local integration. Older asset checkpoints below retain
their historical figures.
The latest partial-grip glove colour pass failed from collapsed UVs; the failure is
preserved. The fully unwrapped reference texture retry is exported and verified;
the preferred inverse-edge-weighted rig reduces sampled curl stretch from21.24×
to2.46× and passes actual-engine clip checks. A held-pose derivative now clears
the actual wheel after export; a separate seam repair closes refinement holes.
A local surface repair reduces221 hand self crossings to4 thumb pairs. Local
stretch, full POV framing, right hand and arms remain unaccepted;
see the glove's `grip-pose/QUALIFICATION.md` for evidence and limits.
All eleven exteriors are now integrated locally in the game, built `docs/` site
and Design files. The cockpit is still the shared provisional driver. Source/
package, eleven-team browser, built/canvas UI, race and physics checks pass. One
visible eight-second six-team race in actual Chrome on RTX 3090 Ti measured
41.5 FPS (p95 frame interval34.3ms) at high quality and3146×1176; this is a short
sample, not sustained or every-track qualification. Evidence and current hashes
are in [the local integration record](assets/f1-2026/evidence/local-integration/README.md).
No commit, push or publication. To inspect McLaren with the current integrated
loader, run `python3 tools/preview-f1-car.py`, serve the project root,
and open `/.preview/mclaren.html`. Use `--team ferrari` and
`/.preview/ferrari.html` for Ferrari. These include sampled wheel-motion checks
and do not alter the shipped engine.
Red Bull uses `--team redbull` and `/.preview/redbull.html` in the same tool.
Ferrari's wheel-only pilot uses `--team ferrari --wheel-pilot` and the Ferrari
page: sampled steering, camera framing and the live dashboard pass. It has no
hands/arms and uses the existing generic cockpit; see
[wheel qualification](assets/f1-2026/models/ferrari/pov/QUALIFICATION.md).
The left-glove calibration rig has 17 bones and three clips verified in Blender
and Three.js r147. Thumb/web deformation still fails usable-grip qualification;
see [glove qualification](assets/f1-2026/models/ferrari/pov/glove/QUALIFICATION.md).
Use `python3 tools/preview-f1-glove.py` and `/.preview/ferrari-glove.html` to inspect it.
The [fitted-glove revision](assets/f1-2026/models/ferrari/pov/glove/revision/QUALIFICATION.md)
has a separate rounded thumb and a one-mesh/17-bone rig verified in Blender and
Three.js. Use `--revision` and `/.preview/ferrari-glove-revision.html`. Its thumb
stress pose and actual wheel grip remain unaccepted.

## Sim rigs: Linux and Windows

Open **Controls → SIM RIG · WHEELS, PEDALS & FFB → Start input walkthrough** in the standalone game. It asks you to move one control at a time, detects the axis or button, and waits for your confirmation. Calibrate left/right/center, then released/full throttle and brake; optional steps assign paddles, DRS, overtake and pause. A turning wheel model, animated pedals, live 0–100% bars and button indicators let you verify each assignment. Pedal percentages represent pressure on load-cell pedals or travel on position sensors. Existing settings are kept until **Save rig setup**; Cancel or Escape discards the draft. **Advanced manual bindings** retains direct axis/button selection. Pedals may be separate USB devices, inverted, or share opposite halves of an axis. Calibration is saved locally. Wheel input is linear at every speed; configure the base for **360° total rotation (180° each way)** in Boxflat or Pit House, then recalibrate steering if the range changed. The cockpit wheel and calibration preview use the same ±180° travel. Standard gamepads and keyboard controls remain available; turn wheel input off to use them while a calibrated rig is attached.

Browser input works wherever the browser exposes the device through its Gamepad API; move a control after connecting it. **Moza R3 steering FFB can run directly in desktop Chrome/Edge through [WebHID](https://developer.chrome.com/docs/capabilities/hid)** on HTTPS or localhost. In SIM RIG, click **Connect browser FFB**, select the R3 in the browser picker, calibrate its inputs if needed, then explicitly enable **Steering FFB**. No Apex GP bridge, Python or SDL2 is needed for this path. Connecting sends zero force; it never starts playback. Other wheel layouts still use the local SDL2 bridge below. Controller vibration is not steering FFB.

The direct path currently accepts only the R3 (`346e:0005`) with the report layout verified from this machine's device. Firmware layouts are checked before writing; unrecognized layouts stay unsupported rather than receiving guessed commands. Keep other wheel games closed. If multiple identical R3s appear as gamepads, native FFB stays disabled because pairing would be ambiguous. Windows/browser physical force behavior still needs testing.

On Linux, Chrome also needs user read/write access to the wheel's **hidraw** interface. Boxflat's serial-device rules may not grant this. A narrowly scoped active-desktop-user rule is supplied in `tools/70-apexgp-moza-r3.rules`; install it to `/etc/udev/rules.d/70-apexgp-moza-r3.rules`, reload udev rules and reconnect the wheel. The rule targets only Moza R3 HID nodes and uses `TAG+="uaccess"`; no broad USB permissions or new user groups are needed. The OS FFB driver is still used by the bridge; the direct path uses HID reports through Chrome.

For other wheels, or a browser/OS that cannot open the R3 interface, use the bridge:

1. Install Python 3 and an SDL2 runtime. On Linux, install your distribution's SDL2 package (Arch: `sdl2-compat`, Debian/Ubuntu: `libsdl2-2.0-0`). On Windows, get the x64 SDL2 runtime DLL from the [official SDL2 releases](https://github.com/libsdl-org/SDL/releases?q=release-2), use 64-bit Python, and place `SDL2.dll` beside `tools/rig-bridge.py`. Alternatively pass `--sdl /path/to/library`. No Python packages are required.
2. Install/configure your wheel's normal OS driver. Windows Moza rigs use Moza's driver/Pit House; disable Steam Input for the wheel if it changes the device into a standard pad. Linux needs input-device read/write permission and a driver exposing constant-force effects; check the [Linux wheel support list](https://github.com/JacKeTUs/linux-steering-wheels) and [universal-pidff](https://github.com/JacKeTUs/universal-pidff) for your base/kernel. The bridge never installs drivers, changes permissions or claims unsupported hardware works.
3. From this repository run `python3 tools/rig-bridge.py` (Windows: `py -3 tools/rig-bridge.py`), then open **http://127.0.0.1:8766**. The bridge serves the built game from `docs/`; run `./build.sh` after source edits on Linux. This keeps game and hardware on one local origin. Browser and SDL axis numbering can differ, so calibrate again when switching between hosted and bridge play.
4. Calibrate, then explicitly enable **Steering FFB**. It starts off each visit. **Maximum FFB output** defaults to the previous 20% limit and can now be raised to 100%; changing this limit disarms FFB. **FFB strength** (default 60%) scales steering, damping and friction; **Steering gain** (default 100%, range 0–300%) adjusts cornering load before mixing in **Road texture** (default 60%). At the unchanged defaults, maximum steering output is still 12% of base output. **Damping** resists fast wheel movement; **Friction** adds movement resistance. Both default to zero and are enabled only when the selected backend advertises support. All effects share one output budget. Settings are saved with the rig profile, and saving or clearing input bindings keeps tuning. Start low and check that the wheel resists steering. If it pulls into a turn, disable FFB and toggle **Reverse FFB direction**. Keep the base's emergency stop available. Restart an older running bridge to use adjustable output and condition effects.

Rig calibration, button bindings, wheel-input on/off and all FFB tuning are saved automatically across browser restarts. **Save rig settings** explicitly saves the current setup and confirms the result. The status shows when a saved setup was restored or browser storage could not be read/written; hardware connection messages do not hide storage failures. Use the same browser profile and site address. Private browsing, clearing site data or switching between hosted/local URLs can remove or separate settings. Browser FFB connection and the FFB ON state are session-only.

Steering direction was corrected after the initial damping update: a small left/right deflection should be opposed while driving straight, rather than amplified. Hard-refresh and reconnect browser FFB after updating, or restart the local bridge. Moza R3 normally uses **Reverse FFB direction OFF**. If it was previously enabled to compensate for the old direction bug, turn it OFF and check at low output. Saved direction preferences are preserved; damping/friction polarity is unchanged.

FFB blends front-tyre aligning torque with the left/right difference in front-wheel surface load variation. Asphalt has subtle world-anchored grain and changing patch roughness; kerbs use the physics model's 1.5 m teeth; grass, gravel and sand use their existing roughness model. **Road smoothing** sets each of two filter stages from 0–50 ms; its default (about 13 ms per stage) preserves the previous 12 Hz filter. Lower values sharpen texture but may buzz or alias as frame rate changes. Texture fades at low speed and stops at standstill. **FFB output request** shows requested steering output, front surface and the upper bound for all game effects; it is not measured motor torque. **Signal clipping** warns when the steering/road mix saturates before the output limit: reduce steering gain or texture to recover detail. Damping/friction depend on actual wheel movement and are independent of direction reversal. Base software can add its own resistance. This is procedural surface feedback, not scan-accurate pavement; the steering model and render-rate delivery are unchanged.

Torque stops in menus, on pause/finish, explicit OFF, loss of focus, missing mapped devices, stale simulation updates and bridge failure. Each effect expires after 120 ms without renewal. Changing the mix stops the old effects before starting the new budget. Pause disarms FFB; **Resume with wheel FFB** explicitly re-enables it. Unplugging a mapped wheel or pedal pauses the session. Ctrl+C stops the bridge and releases every effect. Automatic centering is disabled when creating the bridge's first effect; use your base software to restore preferred centering afterward if needed.

Devices reporting no constant-force capability stay input-only in bridge mode. Browser FFB is limited to the R3 layout described above. Calibration keys use device names/vendor/product and an occurrence number for identical devices; reconnect identical devices in the same order or recalibrate. This bridge targets desktop Linux and Windows; physical Moza/other-rig behavior and Windows execution remain unverified. Linux SDL startup and the local HTTP connection were verified with no connected rig.

Checks: `node test/rig-storage-test.js` covers saved calibration/tuning/input state, legacy/corrupt/blocked storage and session-only FFB. `node test/ffb-road-test.js` covers surface contrasts, reproducibility, speed fade, gain, smoothing and tuning restore; `node test/rig-test.js` covers calibration and gating. `node test/webhid-ffb-test.js` checks the real R3 descriptor (including condition report 3), combined output budgets, finite effects, capability fallback, partial allocation cleanup, device matching, in-flight stop, errors and disconnect. `python3 test/rig-bridge-test.py` verifies the equivalent SDL path and request validation with fake hardware. `test/ffb-settings-ui-test.js` and `test/webhid-settings-ui-test.js` run through Playwright's `browser_run_code_unsafe` with a project-root static server on :8767. Both are DOM-only and mock all hardware: controls, clipping, persistence, narrow layout, old-bridge compatibility, native conditions at zero steering torque, OFF/blur and cleanup. Existing `test/webhid-ui-test.js`, `test/rig-wizard-ui-test.js` and `test/rig-ui-test.js` exercise the full game UI and guided calibration. No automated test sends real wheel force. The bridge listens only on loopback and checks Host/Origin on hardware commands.


## 2026-11-13: Ferrari wheel rear revision checkpoint

Tripo Studio front/back job `5ff5705a-1429-4a19-9be8-362dafe45321` is completed
and exported: Private H3.1 Ultra, 76 parts /47,383 triangles, geometry60 +
reference texture30 credits. Originals, all76 colour maps,2K atlas and rigid
derivative are preserved. See `assets/f1-2026/models/ferrari/pov/wheel-rear-revision/QUALIFICATION.md`
and `production.json`. Additional3,000 allowance:240 spent /2,760 remains;
no paid jobs pending. Total F1 spend1,320; separate Monza tree30.

The isolated preview `/.preview/ferrari-wheel-revision.html` passes sampled
Three.js r147/RTX3090Ti steering at0/±90/±180 degrees, camera framing and live
display updates/visibility. New wheel geometry hid the old display location;
the revision moves it to localX=-0.064m and checks nine sight rays per pose.
The original wheel preview also passes. These are sampled checks, not full
visual acceptance or a performance benchmark. Production engine/build assets
were not changed by this stage; concurrent work is preserved.

The revised-wheel left-glove fit still fails: visible folded thumb/web and
intersections. Linear and volume-preserving attempts are retained as failed
evidence; volume preservation was rejected and the linear trial restored.
No accepted right hand, suited arms, full cockpit or11-team integration.
Next: repair the glove anatomy/weights or justify a reference-led gripping-pose
revision before further spending. Keep the full production goal active.


Ferrari partial-grip glove checkpoint: the failed black texture is preserved, and
Studio asset `7b81a45f-220b-4549-b1e5-7f1fb8caf4be` supplies the corrected8K
colour master and2K derivative. Its17-bone curved rig passes sampled Blender and
Three.js r147/RTX3090Ti clip checks; stronger curl deformation and both actual
wheel-fit trials remain unaccepted. Reproduce with
`python3 tools/preview-f1-glove.py --grip-pose`; see
[grip qualification](assets/f1-2026/models/ferrari/pov/glove/grip-pose/QUALIFICATION.md).
Current additional allowance:330/3,000 spent,2,670 remaining; total F1 spend1,410;
wallet23,560, no paid jobs pending. Earlier checkpoint totals above are historical.


The latest wheel checkpoint completes Haas (51,373 triangles), Audi (47,744) and
Cadillac (49,968), each with five meshes and one 2K atlas. All three pass sampled
steering/rolling on RTX 3090 Ti/Three.js r147, with fixed body stable; their exported
tyres are closed/manifold and sampled radial variation stays below 1.356 mm.
Per-team notes preserve assignment details, failed trials and provisional fits.
One Cadillac validation hit the intermittent Python comparison anomaly seen on
Williams; the unchanged cross-check passed and tyre export bytes matched.
Full appearance, measured upright/brake fit, continuous clearance, active aero,
accurate driver POV and integration/performance are still open. No credits spent
on this checkpoint; additional allowance remains 330/3,000 used, 2,670 remaining.


## 2026-11-13: Ferrari left sleeve and held-grip steering trial

The original arm geometry,8K colour export and2K atlas are preserved. Local cuff
construction and rigging now produce a separate left-arm/glove/wheel trial:
146,719 triangles, three meshes,85 bones and one synchronized steering clip.
145 exported integer/half-frame samples show zero sleeve self/hand/wheel and
hand/wheel crossings; cuff drift<0.092mm. Chrome/r147 on RTX3090Ti matches the
Blender import at15 times within0.128µm. Five browser screenshots, JSON, hashes,
rejected trials and reproduction instructions are recorded in
`assets/f1-2026/models/ferrari/pov/arm/QUALIFICATION.md` and `production.json`.
The inserted cuff is locally constructed; proportions, anatomy, generated
markings, both sides, actual cockpit/camera fit, live dashboard, continuous
clearance, performance and production integration remain unaccepted. No shipped
engine/build files changed by this stage. Additional Studio allowance390/3000
used,2610 remains; wallet23500; no paid jobs pending. All local work used zero
credits. The full eleven-team/POV task remains incomplete.

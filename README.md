# Apex GP

**Play it:** https://davidcbradleyjr.github.io/apex-gp/

A browser F1 sim (time trial and short races) on three made-up circuits: Kestrel Valley (4.2 km, flowing), Virel Park Autodrome (5.0 km, long straights and big stops) and Callow Heath (4.0 km, tight and technical). Three views, including a first-person cockpit with a working steering-wheel display and mirrors. It uses three.js r147, and all of the audio is synthesized.

- `src/game.js` is the engine. It holds the track builder, the vehicle physics, timing, the renderer and audio. The physics covers per-wheel loads, aero, Pacejka-style tyres with temperature and wear, ABS/TC, an 8-speed gearbox, and ERS/DRS. This file is the source of truth.
- `design/project/` holds the Claude Design canvas. `Main.dc.html` is the playable game UI and `Garage.dc.html` is the car sheet. The `game.js` in that folder is a copy, so run `cp src/game.js design/project/game.js` before republishing.
- `assets/` holds the car concept image (Higgsfield GPT Image 2.6) and its 3D mesh (Tripo H3.1). `vendor/car.js` is that GLB encoded as base64.
- Three real layouts are included as well: Monza, Silverstone and Bahrain. They are flat copies of the centre lines in the [TUM racetrack database](https://github.com/TUMFTM/racetrack-database) (LGPL-3.0, traced from OpenStreetMap), with a constant 13 m road width and auto-placed DRS zones; `node tools/import-track.js Track.csv [startShiftMetres]` prints the control points for another one. The autopilot laps them 3 to 10 s off real race pace (Monza 1:25, Silverstone 1:38, Bahrain 1:40).
- Circuits are the `TRACKS` list at the top of `src/game.js`; the engine builds one per `create(canvas, { track: id })`, and the menu re-creates the game to change circuit.
- `src/index.html` is the standalone web page (menu and HUD in plain HTML and JS). `./build.sh` copies it, the engine and `vendor/` into `docs/`, which GitHub Pages serves from `main`. Update loop: edit, `./build.sh`, commit, push. It takes `?track=virel|callow&mode=race&cam=2&start=1` as a deep link.
- `src/play.html` is a bare local test page. Run `python3 -m http.server` in this folder, open `/src/play.html` (add `?track=virel` or `?track=callow`), and press Enter to start.
- `test/sim-test.js` is the physics check. Run `node test/sim-test.js`: an autopilot drives 3 laps, and the test asserts that lap time, speed and g-loads are plausible, that the car does not spin with assists on, and that every circuit laps cleanly. `node test/race-test.js` checks races.

Canvas: https://claude.ai/artifact/38LXq1g63zdz5hrGHHrHb5

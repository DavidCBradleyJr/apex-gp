"""Prepare an isolated car preview using the current game renderer/poseCar.

Use --team with a ledger runtime prototype; stage files and open /.preview/<team>.html.
No shipped files change.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
ledger = json.loads((root / 'assets/f1-2026/production.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--team', choices=[t['id'] for t in ledger['teams'] if 'runtime_prototype' in t], default='mclaren')
parser.add_argument('--wheel-pilot', action='store_true', help='Ferrari wheel only in the existing generic cockpit; no driver fit acceptance')
parser.add_argument('--wheel-revision', action='store_true', help='Use the preserved front/back wheel revision in a separate preview')
parser.add_argument('--left-grip', action='store_true', help='Include the latest unaccepted Ferrari held left glove')
args = parser.parse_args()
assert not args.wheel_revision or args.wheel_pilot, '--wheel-revision requires --wheel-pilot'
assert not args.left_grip or (args.wheel_pilot and args.wheel_revision), '--left-grip requires the revised wheel pilot'
team = args.team
page = team + ('-wheel-revision' if args.wheel_revision else '')
if args.left_grip:
    page=team+'-left-grip'
assert not args.wheel_pilot or team == 'ferrari', 'Only Ferrari has a preserved cockpit-wheel pilot'
entry=next(t for t in ledger['teams'] if t['id']==team)
label,model_root=entry['name']+' '+entry['car'],entry['runtime_prototype']['root_name']
triangles = entry['runtime_prototype']['triangle_count']
preview = root / ".preview"
preview.mkdir(exist_ok=True)
asset = root / 'assets/f1-2026' / entry['runtime_prototype']['file']
source = (root / "src/game.js").read_text()
# Use the integrated loader and public team API directly.
engine = source
wheel_script = ''
wheel_sha = ''
grip_check = {}
if args.wheel_pilot:
    wheel_directory = root / 'assets/f1-2026/models/ferrari/pov'
    if args.wheel_revision:
        wheel_directory /= 'wheel-rear-revision'
    wheel_asset = wheel_directory / 'derivatives/ferrari-wheel-runtime.glb'
    if args.left_grip:
        grip=entry['pov_glove_grip_pose_revision']['self_repaired_held_grip']
        wheel_asset=root/'assets/f1-2026'/grip['file']
        grip_check=json.loads((root/'assets/f1-2026'/grip['export_contact_check']).read_text())
        assert grip_check['hand_wheel_intersection_pairs']==0 and hashlib.sha256(wheel_asset.read_bytes()).hexdigest()==grip_check['sha256']
    wheel_sha = hashlib.sha256(wheel_asset.read_bytes()).hexdigest()
    (preview / f'{page}-wheel.js').write_text("window.APEX_POV_WHEEL_B64='" + base64.b64encode(wheel_asset.read_bytes()).decode() + "';\n")
    wheel_script = f'<script src="{page}-wheel.js"></script>'
    start = engine.index('    // steering wheel: raked hub,')
    end = engine.index('    rig.traverse(o =>', start)
    engine = engine[:start] + """    // Isolated wheel qualification; no generic hands are attached to the new grips.
    const hub = new THREE.Group(); hub.position.copy(V(0.47, -0.14, 0)); hub.rotation.z = -0.28; rig.add(hub); hub.add(wheelSpin);
    const binary = atob(root.APEX_POV_WHEEL_B64), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    new THREE.GLTFLoader().parse(bytes.buffer, '', gltf => {
      const wheel = gltf.scene; wheel.name = 'Ferrari_SF26_WHEEL_PILOT';
      // shortcut: hub and live display fit are provisional, replace with measured cockpit data before acceptance.
      wheel.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); wheelSpin.add(wheel);
    }, error => console.error('Ferrari wheel pilot failed', error));
    const fg = new THREE.PlaneGeometry(.100, .058); fg.rotateY(-Math.PI / 2);
    const face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }));
    face.name = 'ferrari_wheel_live_display'; face.position.set(__DISPLAY_X__, .031, 0); wheelSpin.add(face);
""".replace('__DISPLAY_X__', '-.064' if args.wheel_revision else '-.037') + engine[end:]
(preview / f"{page}-game.js").write_text(engine)
(preview / f"{page}.html").write_text("""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>__LABEL__ prototype qualification</title>
<style>
body {margin:0;background:#111;color:white;font:14px system-ui} canvas {width:100vw;height:100vh;display:block}
aside {position:fixed;left:12px;top:12px;padding:12px;background:#111d;max-width:500px}
button {padding:8px;margin:3px} pre {white-space:pre-wrap;font-size:12px;max-height:34vh;overflow:auto}
</style>
<body data-model-root="__ROOT__" data-team="__TEAM__" data-triangles="__TRIANGLES__" data-wheel-triangles="__WHEEL_TRIANGLES__" data-wheel-pilot="__WHEEL_PILOT__" data-left-grip="__LEFT_GRIP__" data-hand-triangles="__HAND_TRIANGLES__" data-hand-bounds='__HAND_BOUNDS__' data-engine-sha="__ENGINE_SHA__" data-asset-sha="__ASSET_SHA__" data-wheel-sha="__WHEEL_SHA__">
<canvas id="c"></canvas><aside><b>__LABEL__ — unaccepted prototype</b>
<p>__DESCRIPTION__</p>
<div id="poses"><button data-steer="0">Centre</button><button data-steer="0.16">Left half</button><button data-steer="0.32">Left lock</button><button data-steer="-0.16">Right half</button><button data-steer="-0.32">Right lock</button><button id="roll">Roll quarter turn</button></div>
<div id="views"><button data-view="0.7,8,2.7">Front oblique</button><button data-view="1.5708,8,1.5">Right side</button><button data-view="-1.5708,8,1.5">Left side</button><button data-view="2.45,8,2.7">Rear oblique</button><button data-view="0,0.1,9">Top</button><button data-cam="1">T-cam</button><button data-cam="0">Chase</button><button data-cam="2">Existing cockpit</button></div>
<button id="check">Run motion checks</button><button id="save">Save evidence JSON</button><pre id="result">Loading…</pre></aside>
<script src="../vendor/three.min.js"></script><script src="../vendor/GLTFLoader.js"></script>
<script src="../vendor/Sky.js"></script><script src="../vendor/postfx.js"></script>
<script src="../vendor/f1-cars.js"></script>__WHEEL_SCRIPT__<script src="__PAGE__-game.js"></script>
<script src="../test/f1-car-preview.js"></script></body></html>
""".replace('__TEAM__', team).replace('__PAGE__', page).replace('__LABEL__', label).replace('__ROOT__', model_root)
    .replace('__TRIANGLES__', str(triangles)).replace('__WHEEL_PILOT__', '1' if args.wheel_pilot else '0')
    .replace('__WHEEL_TRIANGLES__', str(47383 if args.wheel_revision else 46878))
    .replace('__LEFT_GRIP__','1' if args.left_grip else '0').replace('__HAND_TRIANGLES__',str(grip_check.get('hand_triangles',0)))
    .replace('__HAND_BOUNDS__',json.dumps(grip_check.get('hand_bounds_game',{})))
    .replace('__ENGINE_SHA__', hashlib.sha256(source.encode()).hexdigest())
    .replace('__ASSET_SHA__', hashlib.sha256(asset.read_bytes()).hexdigest()).replace('__WHEEL_SHA__', wheel_sha)
    .replace('__WHEEL_SCRIPT__', wheel_script).replace('__DESCRIPTION__',
        'Ferrari left-grip trial: one hand, no arms/right hand. Wheel clearance and closed seams pass; four thumb self-crossings, local stretch and cockpit fit remain unaccepted.' if args.left_grip else
        'Ferrari wheel pilot in the existing generic cockpit. No hands/arms or accepted cockpit fit; dimensions and display placement provisional.'
        if args.wheel_pilot else 'Integrated per-team loader, game rendering and wheel motion. No accurate POV yet.'))
print("PREVIEW_READY", preview / f"{page}.html")
print("game_sha256", hashlib.sha256(source.encode()).hexdigest())
print("asset_sha256", hashlib.sha256(asset.read_bytes()).hexdigest())

"""Generate an isolated Three.js r147 glove rig check page; serve root on localhost."""
import hashlib
import argparse
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--revision', action='store_true')
parser.add_argument('--grip-pose', action='store_true')
parser.add_argument('--repaired-weights', action='store_true')
args = parser.parse_args()
revision, grip_pose = args.revision, args.grip_pose
assert not (revision and grip_pose)
assert not args.repaired_weights or grip_pose
asset_path = 'assets/f1-2026/models/ferrari/pov/glove/' + ('grip-pose/' if grip_pose else 'revision/' if revision else '') + 'derivatives/ferrari-left-glove-rig-trial.glb'
if args.repaired_weights:
    asset_path=asset_path.replace('rig-trial.glb','weights-repaired.glb')
asset = root / asset_path
page = 'ferrari-glove-grip.html' if grip_pose else 'ferrari-glove-revision.html' if revision else 'ferrari-glove.html'
if args.repaired_weights:
    page=page.replace('.html','-repaired.html')
triangles = 50604 if grip_pose else 49174 if revision else 47722
preview = root / '.preview'
preview.mkdir(exist_ok=True)
(preview / page).write_text('''<!doctype html><html lang="en">
<meta charset="utf-8"><title>Ferrari glove deformation trial</title>
<style>body{margin:0;background:#202630;color:white;font:13px system-ui}canvas{display:block}aside{position:absolute;left:12px;top:12px;background:#111c;padding:12px;max-width:470px}pre{max-height:40vh;overflow:auto}button{padding:6px;margin:3px}</style>
<body data-check-strain="''' + ('1' if args.repaired_weights else '0') + '" data-asset-sha="' + hashlib.sha256(asset.read_bytes()).hexdigest() + '" data-triangles="' + str(triangles) + '" data-asset-path="../' + asset_path + '''">
<canvas></canvas><aside><b>Ferrari glove — unaccepted deformation trial</b>
<p>17 bones, five digits and wrist. Provisional scale; thumb/web anatomy, markings and wheel contact still require work. No arms or production integration.</p>
<button id="rest">Rest</button><span id="clips"></span><pre>Loading…</pre></aside>
<script src="../vendor/three.min.js"></script><script src="../vendor/GLTFLoader.js"></script>
<script src="../test/f1-glove-preview.js"></script></body></html>''')
print('GLOVE_PREVIEW_READY', preview / page)

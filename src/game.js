/* Apex GP — browser F1 sim. Classic script; needs global THREE (r147) + THREE.GLTFLoader + THREE.Sky.
   window.ApexGP.create(canvas, {onTelemetry}) -> game. Sim + track are pure and run in Node for tests. */
(function (root) {
'use strict';
const G = 9.81, RHO = 1.225, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ENGINE_URL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';

// ---------------- Tracks: three fictional, three real layouts ----------------
// Control points of a closed centripetal Catmull-Rom, clockwise, in metres. Every layout shares the same start straight
// (z = 0, x from -500 to 450, entered through [-640,45],[-600,-5] so it comes out straight) so the pit building, grandstands and gantry fit; keep other track 120 m clear of it and
// keep unrelated sections at least 80 m apart (test/sim-test.js checks the straight and that facing barriers never meet).
// The real layouts are flat copies of the centre lines in the TUM racetrack database (LGPL-3.0, from OpenStreetMap), made by
// tools/import-track.js: start line at [-500,0] heading +x like the rest, but with their own, shorter start straights.
const TRACKS = [
  { id: 'kestrel', name: 'Kestrel Valley Circuit', note: 'Flowing mid-speed layout', world: 'alpine',
    pts: [[-500,0],[0,0],[450,0],[570,40],[605,160],[585,320],[650,450],[780,500],[860,620],[810,760],[650,825],[450,805],[100,820],[-180,830],[-320,800],[-355,690],[-350,570],[-318,500],[-388,430],[-360,360],[-400,250],[-560,130],[-640,45],[-600,-5]] },
  { id: 'virel', name: 'Virel Park Autodrome', note: 'Power circuit: long straights, big stops', world: 'park', city: { kind: 'skyline', x: 2100, z: -700, r: 520 },
    pts: [[-500,0],[0,0],[450,0],[720,10],[850,90],[870,230],[800,330],[560,380],[470,440],[480,530],[560,580],[800,620],[870,720],[820,830],[680,870],[200,850],[-150,830],[-250,770],[-230,690],[-310,630],[-480,640],[-620,570],[-690,420],[-660,250],[-680,130],[-640,45],[-600,-5]] },
  { id: 'callow', name: 'Callow Heath', note: 'Tight and technical: hairpins and esses', world: 'heath',
    pts: [[-500,0],[0,0],[450,0],[540,30],[560,110],[500,170],[380,180],[330,250],[400,330],[520,340],[600,420],[580,540],[480,600],[330,580],[250,480],[160,440],[80,500],[90,620],[0,700],[-140,690],[-220,600],[-200,480],[-280,400],[-420,420],[-520,360],[-560,240],[-600,130],[-640,45],[-600,-5]] },
  // the circuit lies in a walled royal park with the town against its southern edge (south is -x here) and the Alps to the north
  { id: 'monza', name: 'Autodromo Nazionale Monza', short: 'Monza', note: 'Real layout, 5.79 km: flat out between three chicanes', world: 'park', peaks: { at: 0, arc: 1.5 }, city: { kind: 'town', x: -1900, z: 420, r: 640 },
    pts: [[-500,0],[-385,0.2],[-270.1,0.6],[-155.2,1],[-40.2,0.6],[74.7,-0.5],[189.7,-1.9],[304.6,-3.1],[379.6,-3.9],[394.5,-4.1],[404.5,-4.2],[419.2,-3.5],[430.2,2.3],[434.2,14.7],[438.2,27.9],[448.6,35.2],[462.3,34.5],[481.2,28.2],[556.5,1.5],[635.5,-9.5],[740.4,-11.5],[809.8,-5.1],[871.1,16.1],[926.4,49.8],[991.5,118.5],[1035.8,202],[1066.7,312.5],[1086.7,425.7],[1106.6,538.9],[1117.1,613],[1119.1,627.9],[1120.6,637.8],[1122.3,647.8],[1126.4,661.7],[1135.3,671.6],[1149,676.7],[1162.5,681.6],[1171.6,691.5],[1176.4,705.3],[1206.3,784.7],[1253.4,889.5],[1275.6,939.8],[1285,962.9],[1290.9,987],[1288.8,1011.5],[1281.3,1029.7],[1269.2,1045.5],[1253.4,1057.2],[1230.1,1065.3],[1151.7,1081],[1043.7,1101.7],[1024.1,1105.4],[1009.3,1108.1],[994.5,1109.3],[980.4,1106.4],[968.2,1098.7],[955.6,1083.4],[910,1017.7],[844.5,923.3],[779,828.8],[704.5,741.6],[620.6,663],[536.9,584.2],[453.1,505.5],[369.3,426.8],[300.2,361.8],[285.6,348.1],[274.5,338],[262.5,329.6],[248.8,325.9],[234.1,327.2],[199.7,333.3],[165.1,331.5],[132.7,319],[116.6,307.5],[105.8,297.1],[95.1,286.6],[82.9,279.1],[68.7,275.9],[38.6,274.1],[-76.2,271.4],[-191.2,269.5],[-306.1,269.1],[-421.1,268.7],[-536,268.1],[-651,267.6],[-765.9,267.2],[-850.9,266.9],[-875.9,266.5],[-900.6,264.4],[-923.7,255.7],[-942.9,240.2],[-957.1,219.9],[-964.9,196.5],[-964.8,171.9],[-955,138.5],[-928.2,96.7],[-886.3,61.5],[-827.3,35.1],[-734,18.1],[-619.7,5.9],[-505,0]] },
  // a wartime airfield in open Northamptonshire farmland; the village is a kilometre to the north (north is +x, -z here)
  { id: 'silverstone', name: 'Silverstone Circuit', short: 'Silverstone', note: 'Real layout, 5.89 km: fast sweepers all lap', world: 'farmland', city: { kind: 'village', x: 1180, z: -820, r: 230 },
    pts: [[-500,0],[-390,0],[-280,-0.1],[-240,-0.3],[-220,-0.4],[-200.3,1.2],[-182.6,9.2],[-163.6,25.2],[-139.5,56.9],[-98.6,119.7],[-70.7,161],[-45.5,185.1],[-15.1,202],[42.3,219.1],[134.7,241.2],[154.2,245.8],[168.7,249.5],[182.4,255],[192.9,264.3],[196.9,277.5],[193.9,291.3],[186.5,304.1],[160.3,340.8],[151.6,352.9],[143.2,365.3],[136.7,378.5],[136.2,391.8],[144.5,401.4],[158.3,405.4],[173,405.3],[197.2,399.6],[266.3,371],[283.5,360.7],[295.8,352.3],[307.2,342.6],[315.9,330.9],[320.8,317.1],[324.8,287.4],[334.1,177.8],[343.2,68.2],[352.5,-41.4],[361.7,-151],[370.2,-260.7],[373,-295.6],[374.2,-320.5],[370.3,-344.9],[362.1,-362.9],[353.6,-375.1],[342.9,-385.3],[330,-392.3],[315.7,-394.6],[301.4,-392],[283.7,-383.2],[258.3,-367.3],[241,-357.2],[222.7,-349.6],[203.3,-347.4],[188.8,-350.3],[175.7,-356.8],[165.2,-366.9],[158.4,-379.8],[155.6,-399.1],[159.6,-418.2],[169.8,-435],[185.1,-447.2],[203.6,-454.1],[247.6,-463.1],[311.4,-475.9],[360.8,-482],[410.5,-477],[440,-471.4],[467.7,-461],[508.2,-432.1],[567.7,-371.4],[646.2,-287.4],[720.4,-206.1],[763.5,-157.5],[786.5,-131.1],[802.7,-100.5],[811,-71.8],[813.3,-47],[809.3,-22.7],[798,-0.6],[754.5,60.4],[678.8,146.9],[597.1,220.5],[528,278.1],[491.1,311.7],[463.5,353.1],[453.7,376],[445.9,394.3],[434,410],[417.8,421.1],[389.7,431.5],[342.2,446.8],[314.6,458.4],[289.8,475],[271.3,498.1],[260.4,525.9],[254,550],[243.6,572.4],[226.5,590.2],[204.5,600.9],[179.9,603.7],[150.6,598.2],[104.1,580.3],[76.1,570],[46.7,565.9],[12,569.8],[-101.6,587.7],[-210.2,605.2],[-318.9,622.3],[-427.6,639.5],[-541,658],[-655.6,666.9],[-695.6,669.2],[-720.5,669.2],[-744.8,664.4],[-766.6,652.8],[-784.8,635.9],[-798.2,615.1],[-804.3,591.2],[-802.4,561.6],[-791.5,533.9],[-752.2,447.6],[-726.3,335.8],[-710.4,252.3],[-707,237.7],[-704.7,227.9],[-701.9,213.3],[-702.6,199.4],[-710.4,188.1],[-723.1,181.4],[-737.5,177.7],[-751.5,173.1],[-763.6,165.1],[-771.4,153.2],[-773.5,139],[-770.8,119.3],[-753,67.5],[-734.9,37.6],[-725.7,25.8],[-715.5,14.9],[-703.6,6.2],[-689.8,1.5],[-670,0.1],[-565,0]] },
  // desert at Sakhir; Manama's towers are to the north-east (really 25 km off, brought in to where the haze still shows them)
  { id: 'bahrain', name: 'Bahrain International Circuit', short: 'Bahrain', note: 'Real layout, 5.41 km: long straights into hairpins', world: 'desert', city: { kind: 'skyline', x: 1250, z: 2150, r: 480 },
    pts: [[-500,0],[-390,0],[-280,-0.1],[-170,-0.1],[-60,-0.1],[50.1,-0.2],[160.1,-0.9],[185.1,-1.1],[195.1,-1.2],[205.1,-1.3],[219.8,-0.7],[231.5,4.5],[234.1,15.8],[227.5,27.9],[214.4,43],[204.5,54.2],[194.5,65.4],[185.7,77.3],[181.8,90.7],[184.1,104.9],[192.5,128.4],[204.7,161.2],[213.9,189.6],[215.1,219.3],[206.7,278.7],[190.4,387.5],[174.1,496.3],[157.7,605.1],[142.9,704],[140.6,718.8],[138.4,733.6],[135.4,748.1],[128.7,760],[116.3,765.8],[101.7,766.7],[87.1,764.7],[74.4,758.3],[63.8,748.1],[20.4,699.7],[-42.3,635.3],[-77.6,607.6],[-109,592.3],[-123,586.9],[-136.6,581],[-148.4,572.5],[-157.1,560.8],[-163.3,542.2],[-164.3,517.4],[-162.6,492.5],[-161.6,467.6],[-167,443.7],[-180.4,423],[-203.1,403.8],[-292.5,339.5],[-312.7,324.9],[-320.9,319.1],[-332.9,310.1],[-342.5,299.7],[-345.7,286.5],[-342.2,273],[-332.5,264.1],[-318.5,261.5],[-298.7,262.8],[-184.4,275.9],[-75.1,288.4],[-40.3,291.9],[-10.6,290.6],[13.3,283.6],[34.2,270.6],[47.9,256.3],[57.1,244.4],[64.7,231.9],[65.7,219.6],[56.5,211.5],[42.3,208.4],[-2.5,204.4],[-117.1,196.5],[-227.2,196.5],[-337.2,196.5],[-447.2,196.8],[-557.2,197.1],[-592.2,197.2],[-607.1,197.2],[-622.1,197.7],[-635.9,201.1],[-645.4,210.7],[-650.8,224.3],[-654.3,248.8],[-649.9,288.3],[-637.8,321],[-617.2,348.8],[-589.3,369.7],[-543.5,389.2],[-510.3,400.3],[-482.7,411.8],[-459.1,430],[-439.2,452.3],[-424.9,478.3],[-418.6,507.4],[-421.5,547],[-436.3,589.3],[-455.9,635.3],[-463.7,653.7],[-473,671.2],[-490.2,688.7],[-502.6,697.1],[-515.5,704.5],[-529.4,709.5],[-543.8,710],[-557.2,705],[-568.7,695.8],[-584.3,676.4],[-614.7,624.7],[-672.5,531.1],[-730.3,437.5],[-788.3,344],[-846.1,250.5],[-904.4,157.2],[-940.2,97],[-947.7,84],[-955.2,71],[-961.4,57.9],[-961.2,44.5],[-952.9,33.9],[-940.1,26.6],[-917.5,16.1],[-894.5,6.5],[-865,2.8],[-755,1],[-645,0],[-535,0]] },
];
for (const t of TRACKS) { t.halfW = 6.5; t.kerbW = 1.2; }
const CIRCUIT = TRACKS[0];
const trackDef = (id) => TRACKS.find(t => t.id === id) || CIRCUIT;

// What surrounds a circuit. ground / mow: the land and the mown verge. relief: how much the land rolls. forest: 0 open … 1 wooded.
// trees: kinds and their shares. bush: scrub along the fences [amount, hue, saturation, lightness]. rocks: boulders.
// fields: a patchwork of crops. peaks: the ring of far mountains [how many, lowest, highest, colour, snow caps]; a circuit's own
// `peaks: { at, arc }` keeps them to one side.
const WORLDS = {
  alpine:   { ground: '#4d6b2c', mow: ['#577a30', '#4a6828'], relief: 1,    forest: 0.6,  trees: { conifer: 1 }, bush: [0.5, 0.27, 0.45, 0.1], peaks: [30, 160, 420, 0x5f7350, true] },
  park:     { ground: '#486a2a', mow: ['#56792f', '#496727'], relief: 0.22, forest: 0.86, trees: { broadleaf: 0.88, conifer: 0.12 }, bush: [0.7, 0.28, 0.5, 0.1], peaks: [22, 380, 760, 0x66758a, true] },
  farmland: { ground: '#5e8236', mow: ['#638a38', '#58792f'], relief: 0.16, forest: 0.2,  trees: { broadleaf: 1 }, bush: [1, 0.26, 0.5, 0.1], fields: true },
  heath:    { ground: '#66773a', mow: ['#6c7f3c', '#5e6f33'], relief: 0.55, forest: 0.3,  trees: { conifer: 0.55, broadleaf: 0.45 }, bush: [1.6, 0.16, 0.65, 0.17], peaks: [18, 60, 150, 0x6c7a4a, false] },
  desert:   { ground: '#c9ae79', mow: ['#cfb580', '#c4a871'], relief: 0.32, forest: 0.07, trees: { palm: 1 }, bush: [0.9, 0.15, 0.35, 0.2], rocks: 420, peaks: [14, 50, 130, 0xb39a70, false] },
};
const RUNOFF = [21, 56]; // barrier distance from the centre line: along the straights, and on the outside of corners
function buildTrack(def = CIRCUIT) {
  const c = new THREE.CatmullRomCurve3(def.pts.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'centripetal');
  c.arcLengthDivisions = 4000; // the default 200 left the '2 m' samples up to 40% unevenly spaced, which skewed distances
  const L = c.getLength(), N = Math.round(L / 2), ds = L / N;
  const sp = c.getSpacedPoints(N);
  const px = new Float32Array(N), pz = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N);
  for (let i = 0; i < N; i++) { px[i] = sp[i].x; pz[i] = sp[i].z; }
  for (let i = 0; i < N; i++) {
    const a = (i + 1) % N, b = (i - 1 + N) % N, dx = px[a] - px[b], dz = pz[a] - pz[b], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // signed curvature (+: turns toward +n, n = (-tz, tx) = driver's right)
  let k = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N, b = (i + 3) % N;
    const cr = tx[a] * tz[b] - tz[a] * tx[b];
    k[i] = Math.asin(clamp(cr, -1, 1)) / (6 * ds);
  }
  const smooth = (arr, w) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let j = -w; j <= w; j++) s += arr[(i + j + N) % N]; o[i] = s / (2 * w + 1); } return o; };
  k = smooth(k, 6);
  const corner = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(k[i]) > 1 / 280) for (let j = -10; j <= 10; j++) corner[(i + j + N) % N] = 1;
  // runoff: a grass verge along the straights, and on the outside of corners a deep trap before the barrier
  let wallP = new Float32Array(N), wallM = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const big = Math.abs(k[i]) > 1 / 250;
    wallP[i] = big && k[i] < 0 ? RUNOFF[1] : RUNOFF[0];   // outside of a left-hander is +n
    wallM[i] = big && k[i] > 0 ? RUNOFF[1] : RUNOFF[0];
  }
  wallP = smooth(wallP, 30); wallM = smooth(wallM, 30);
  // where another part of the circuit runs alongside, the two share the ground between them: each barrier stops 4 m short of halfway
  for (let i = 0; i < N; i++) for (let j = i + 16; j < N; j++) {
    if (N - j + i < 16) break;
    const dx = px[j] - px[i], dz = pz[j] - pz[i], d2 = dx * dx + dz * dz; if (d2 > 4 * RUNOFF[1] * RUNOFF[1]) continue;
    const cap = Math.max(Math.sqrt(d2) / 2 - 4, 9), sI = dz * tx[i] - dx * tz[i], sJ = dx * tz[j] - dz * tx[j]; // which side of each the other lies on
    // only when the other really is abeam (more to the side than ahead or behind), not just further round the same bend
    if (Math.abs(sI) > Math.abs(dx * tx[i] + dz * tz[i])) { if (sI > 0) wallP[i] = Math.min(wallP[i], cap); else wallM[i] = Math.min(wallM[i], cap); }
    if (Math.abs(sJ) > Math.abs(dx * tx[j] + dz * tz[j])) { if (sJ > 0) wallP[j] = Math.min(wallP[j], cap); else wallM[j] = Math.min(wallM[j], cap); }
  }
  // traps: 1 gravel on the outside of quick corners, 2 sand at the slow ones (hairpins and chicanes)
  const gravP = new Uint8Array(N), gravM = new Uint8Array(N);
  let slow = new Float32Array(N); for (let i = 0; i < N; i++) slow[i] = Math.abs(k[i]) > 1 / 45 ? 1 : 0;
  slow = smooth(slow, 40);
  for (let i = 0; i < N; i++) {
    const kind = slow[i] > 0.12 ? 2 : 1;
    gravP[i] = wallP[i] > RUNOFF[0] + 9 ? kind : 0; gravM[i] = wallM[i] > RUNOFF[0] + 9 ? kind : 0;
    // never let an offset curve fold over itself on the inside of a tight corner
    const r = 1 / Math.max(Math.abs(k[i]), 1e-6);
    if (k[i] > 0) wallP[i] = Math.min(wallP[i], 0.8 * r); else wallM[i] = Math.min(wallM[i], 0.8 * r);
  }
  // those limits leave steps in the barrier line: round them off, only ever moving the barrier inwards
  for (const w of [wallP, wallM]) for (let n = 0; n < 4; n++) { const sm = smooth(w, 5); for (let i = 0; i < N; i++) w[i] = Math.min(w[i], sm[i]); }
  // DRS zones: the two longest straights (from 60 m after corner exit to 80 m before next corner)
  const runs = [];
  for (let i = 0; i < N; i++) {
    if (corner[i] || !corner[(i - 1 + N) % N]) continue;
    let j = i; while (!corner[j % N] && j - i < N) j++;
    runs.push([i, j - i]);
  }
  runs.sort((a, b) => b[1] - a[1]);
  const drs = runs.slice(0, 2).filter(r => r[1] > 150).map(([i, n]) => [((i + 30) % N) * ds, ((i + n - 40) % N) * ds]);
  // turns: stretches of real cornering (tighter than 150 m radius), split where the direction changes
  let turns = 0;
  for (let i = 0, was = 0; i < N; i++) { const now = Math.abs(k[i]) > 1 / 150 ? Math.sign(k[i]) : 0; if (now && now !== was) turns++; was = now; }
  const tr = { id: def.id, name: def.name, world: def.world, city: def.city, peaks: def.peaks, turns, N, L, ds, px, pz, tx, tz, k, corner, wallP, wallM, gravP, gravM, halfW: def.halfW, kerbW: def.kerbW, drs, sectors: [L / 3, 2 * L / 3] };
  tr.rubber = new Float32Array(N).fill(RUBBER0);
  tr.locate = (x, z, hint) => locate(tr, x, z, hint);
  tr.line = racingLine(tr);
  speedProfile(tr, DEFAULT_SETUP);
  return tr;
}

// Racing line: the least-bent path inside the track limits (minimum curvature: outside-apex-outside). Each point moves to
// where the bend through its four neighbours is smallest; coarse strides first so whole corners open up, then finer ones.
const LINE_STRIDES = [24, 12, 6, 3, 1], LINE_ITERS = 160;
function racingLine(tr) {
  const { N, px, pz, tx, tz } = tr, lim = tr.halfW - 1.1;
  const off = new Float32Array(N), x = new Float32Array(N), z = new Float32Array(N);
  const upd = (i) => { x[i] = px[i] - tz[i] * off[i]; z[i] = pz[i] + tx[i] * off[i]; };
  for (let i = 0; i < N; i++) upd(i);
  for (const k of LINE_STRIDES) for (let it = 0; it < LINE_ITERS; it++) {
    for (let i = 0; i < N; i++) {
      const a = (i - k + N) % N, b = (i + k) % N, a2 = (i - 2 * k + 2 * N) % N, b2 = (i + 2 * k) % N;
      const mx = (4 * (x[a] + x[b]) - x[a2] - x[b2]) / 6 - px[i], mz = (4 * (z[a] + z[b]) - z[a2] - z[b2]) / 6 - pz[i];
      const t = -mx * tz[i] + mz * tx[i];
      off[i] = clamp(off[i] + 0.6 * (t - off[i]), -lim, lim); upd(i);
    }
  }
  const ds = new Float32Array(N), k = new Float32Array(N);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; ds[i] = Math.hypot(x[j] - x[i], z[j] - z[i]); }
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N, b = (i + 3) % N;
    const ax = x[i] - x[a], az = z[i] - z[a], bx = x[b] - x[i], bz = z[b] - z[i];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    k[i] = Math.asin(clamp((ax * bz - az * bx) / (la * lb), -1, 1)) / ((la + lb) / 2);
  }
  // where the line runs along a track limit it copies every wobble of the edge; a car cannot follow 2 m features anyway
  const ks = k.slice(); for (let i = 0; i < N; i++) k[i] = (ks[(i - 2 + N) % N] + ks[(i - 1 + N) % N] + ks[i] + ks[(i + 1) % N] + ks[(i + 2) % N]) / 5;
  return { off, x, z, ds, k, v: new Float32Array(N), vb: new Float32Array(N) };
}

const compoundK = (set) => (COMPOUNDS[set.compound] || COMPOUNDS.soft).mu / COMPOUNDS.soft.mu;
function aeroCoeffs(set, drs) {
  const fw = set.frontWing, rw = set.rearWing;
  return { clF: 1.80 + 0.11 * fw, clR: (2.20 + 0.13 * rw) * (drs ? 0.72 : 1), cdA: 1.02 + 0.018 * fw + 0.032 * rw - (drs ? 0.21 : 0) };
}
// Calibration, all in one place.
//  lat, brk: how much of the tyres the speed profile (racing line colours, autopilot, AI) asks for. The car itself holds about
//            1.75 laterally at low speed; lk loads the profile's tyre the way the outside wheels are loaded in a corner.
//  look:     autopilot look-ahead, seconds of travel.    kw, vmax: power and top speed the profile assumes on the straights.
//  heat, fheat: tyre heating per watt of sliding, and the front tyres' share (they are smaller, and have no drive to warm them).
//  ls: tyre load sensitivity.    pow: engine torque scale (1.2 puts engine + ERS at about 720 kW, a current F1 car).
const TUNE = { lat: 1.65, brk: 1.5, lk: 1.5, look: 0.3, kw: 690, vmax: 100, heat: 0.14, fheat: 1.3, ls: 0.075, pow: 1.2 };
const loadSens = (Fz) => clamp(1 - TUNE.ls * (Fz / 4500 - 1), 0.75, 1.1); // tyres grip a little less per newton as they are loaded up
// Peak deceleration the car can hold at speed v (grip incl. downforce, plus drag), with a little margin. `used` is the share
// of the grip already spent on cornering; drag is not tyre grip, so it always counts in full. The trade is linear, which is
// gentler than the tyres' friction circle: braking hard at full cornering load unloads the rear tyres and spins the car.
function brakeDecel(set, v, used = 0) {
  const a = aeroCoeffs(set, false);
  const m = carMass(set);
  return TUNE.brk * compoundK(set) * (G + 0.5 * RHO * (a.clF + a.clR) * v * v / m) * (1 - used) + 0.5 * RHO * a.cdA * v * v / m;
}
// Fastest speed at every point of the racing line: corner limit, then an acceleration pass and a braking pass.
function speedProfile(tr, set) {
  const L = tr.line, N = tr.N, m = carMass(set), a = aeroCoeffs(set, false);
  const mu = TUNE.lat * compoundK(set), kD = 0.5 * RHO * (a.clF + a.clR) / m, kDrag = 0.5 * RHO * a.cdA / m;
  const v = L.v, vb = L.vb;
  const aLat = (u) => mu * (G + kD * u * u) * loadSens(TUNE.lk * m * (G + kD * u * u) / 4); // cornering limit at speed u
  const used = (i, u) => Math.min(1, u * u * Math.abs(L.k[i]) / aLat(u)); // share of the grip the corner takes at speed u
  for (let i = 0; i < N; i++) {
    let u = Math.sqrt(mu * G / Math.max(Math.abs(L.k[i]) - mu * kD, 1e-5));
    for (let n = 0; n < 4 && u < 200; n++) u = Math.sqrt(aLat(u) / Math.max(Math.abs(L.k[i]), 1e-5)); // settle on the load-sensitive limit
    vb[i] = Math.min(115, u); v[i] = Math.min(TUNE.vmax, vb[i]);
  }
  for (let n = 1; n < 2 * N; n++) {
    const i = n % N, p = (n - 1) % N, vp = Math.max(v[p], 3);
    const u = used(p, vp), acc = Math.min(mu * (0.54 * G + 0.55 * kD * vp * vp) * Math.sqrt(1 - u * u), TUNE.kw * 1000 / (m * vp)) - kDrag * vp * vp;
    v[i] = Math.min(v[i], Math.sqrt(vp * vp + 2 * Math.max(acc, 0) * L.ds[p]));
  }
  for (let n = 2 * N - 1; n >= 0; n--) {
    const i = n % N, q = (n + 1) % N, vq = v[q];
    v[i] = Math.min(v[i], Math.sqrt(vq * vq + 2 * brakeDecel(set, vq, used(q, vq)) * L.ds[i]));
    const wq = vb[q]; vb[i] = Math.min(vb[i], Math.sqrt(wq * wq + 2 * brakeDecel(set, wq, used(q, wq)) * L.ds[i]));
  }
}

function locate(tr, x, z, hint) {
  const { N, px, pz } = tr;
  let best = 1e18, bi = 0;
  const scan = (i) => { const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } };
  if (hint >= 0) for (let j = -40; j <= 40; j++) scan((hint + j + N) % N);
  if (hint < 0 || best > 900) for (let i = 0; i < N; i++) scan(i);
  const dx = x - tr.px[bi], dz = z - tr.pz[bi];
  const along = dx * tr.tx[bi] + dz * tr.tz[bi];
  const d = -dx * tr.tz[bi] + dz * tr.tx[bi];
  let s = bi * tr.ds + along; s = ((s % tr.L) + tr.L) % tr.L;
  return { i: bi, d, s };
}

const RUBBER0 = 0.4; // how rubbered-in the line is when a session starts (0 green … 1 fully rubbered)
const SURF = {
  asphalt: { mu: 1.0, drag: 0.012 },
  kerb:    { mu: 0.92, drag: 0.016 },
  // Off the road. dragV: the faster a wheel ploughs through a loose surface the harder it is held back, so a trap stops a
  // car arriving at speed but lets one crawl out again. bump: how much the wheel loads jump about.
  grass:   { mu: 0.55, drag: 0.06, dragV: 0,     bump: 0.12 },
  gravel:  { mu: 0.50, drag: 0.13, dragV: 0.012, bump: 0.2 },
  sand:    { mu: 0.44, drag: 0.16, dragV: 0.007, bump: 0.1 },
};
const LOOSE = { grass: 1, gravel: 1, sand: 1 };
function surfaceAt(tr, i, d) {
  const ad = Math.abs(d), plus = d > 0;
  if (ad <= tr.halfW) return 'asphalt';
  if (tr.corner[i] && ad <= tr.halfW + tr.kerbW) return 'kerb';
  const trap = plus ? tr.gravP[i] : tr.gravM[i];
  if (trap && ad > tr.halfW + 3) return trap === 2 ? 'sand' : 'gravel';
  return 'grass';
}

// The same world-anchored surface ripple drives wheel loads and steering texture.
function surfaceRipple(sim, wheel) {
  const name = sim.surf[wheel];
  if (name === 'kerb') return 0.22 * Math.sin(sim.s * TAU / 1.5 + wheel);
  if (LOOSE[name]) return SURF[name].bump * Math.sin(sim.x * 1.9 + wheel * 2.1) * Math.sin(sim.z * 2.3 + wheel);
  if (name !== 'asphalt') return 0;
  const cf = Math.cos(sim.psi), sf = Math.sin(sim.psi);
  const x = sim.x + cf * XW[wheel] - sf * YW[wheel], z = sim.z + sf * XW[wheel] + cf * YW[wheel];
  const patch = 0.7 + 0.3 * Math.sin(x * 0.025 + z * 0.017);
  return 0.018 * patch * (0.65 * Math.sin(x * 2.7 + z * 0.31) + 0.35 * Math.sin(x * 9.1 - z * 4.7));
}

// ---------------- Car ----------------
const CAR = {
  m: 850, Iz: 1150, wb: 3.6, b: 0.46 * 3.6, a: 0.54 * 3.6, h: 0.3, tw: 1.6, R: 0.36,
  ratios: [24.24, 16.15, 12.12, 9.98, 8.28, 6.92, 5.85, 4.92],
  idle: 4000, limiter: 12800, maxLock: 0.32, brakeMax: 46000,
  ersPower: 120000, ersOvertake: 60000, ersCap: 4e6,
};
const BASE_FUEL = 10, FUEL_FLOW = 100 / 3600; // kg in CAR.m; kg/s burned at full throttle
const carMass = (set) => CAR.m - BASE_FUEL + (set.fuel === undefined ? BASE_FUEL : set.fuel);
const TQ_RPM = [0, 4000, 6000, 8000, 10000, 11000, 12000, 12500, 13000];
const TQ_NM  = [200, 260, 380, 470, 520, 515, 480, 440, 300];
function engineTorque(rpm) {
  for (let i = 1; i < TQ_RPM.length; i++) if (rpm <= TQ_RPM[i]) return lerp(TQ_NM[i - 1], TQ_NM[i], (rpm - TQ_RPM[i - 1]) / (TQ_RPM[i] - TQ_RPM[i - 1]));
  return 300;
}
const COMPOUNDS = {
  soft:   { mu: 1.80, opt: 95,  win: 70, wear: 3.0e-8, label: 'SOFT' },
  medium: { mu: 1.72, opt: 100, win: 80, wear: 1.9e-8, label: 'MEDIUM' },
  hard:   { mu: 1.65, opt: 105, win: 92, wear: 1.2e-8, label: 'HARD' },
  wet:    { mu: 1.36, opt: 62,  win: 62, wear: 2.4e-8, label: 'WET' }, // grooved: the only tyre that works on a wet track
};
const DEFAULT_SETUP = { compound: 'soft', frontWing: 6, rearWing: 6, brakeBias: 57, tc: true, abs: true, autoGear: true, ambient: 26, fuel: BASE_FUEL, engineEra: 'v6' };
const REAR_GRIP = 1.12; // rear grip margin over the fronts. At 1.0 the car is neutral at the limit, so any lift, brake or throttle mid-corner spun it; with the margin it pushes wide instead.
const XW = [CAR.a, CAR.a, -CAR.b, -CAR.b], YW = [CAR.tw / 2, -CAR.tw / 2, CAR.tw / 2, -CAR.tw / 2];

// Lap recorder: one sample per REC_DS metres of lap distance. Drives the live delta, the ghost car and the telemetry screen.
const REC_DS = 4, REC_KEYS = ['t', 'x', 'z', 'psi', 'v', 'thr', 'brk'];
function newRec(track) {
  const n = Math.floor(track.L / REC_DS) + 1, r = { n };
  for (const k of REC_KEYS) r[k] = new Float32Array(n);
  r.t.fill(-1);
  return r;
}
// Where a recorded lap was `lapT` seconds after crossing the line (loops, so a ghost keeps lapping). Writes x, z, psi into out.
function ghostPose(rec, lapT, out) {
  const n = rec.n, T = rec.lapTime, t = ((lapT % T) + T) % T;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rec.t[m] <= t) lo = m; else hi = m - 1; }
  const b = (lo + 1) % n, t0 = rec.t[lo], t1 = b ? rec.t[b] : T + rec.t[0]; // sample 0 is taken a step after the line, not on it
  const f = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 0;
  let dp = (rec.psi[b] - rec.psi[lo]) % TAU; if (dp > Math.PI) dp -= TAU; else if (dp < -Math.PI) dp += TAU;
  out.x = lerp(rec.x[lo], rec.x[b], f); out.z = lerp(rec.z[lo], rec.z[b], f); out.psi = rec.psi[lo] + dp * f; out.v = lerp(rec.v[lo], rec.v[b], f);
  return out;
}

// Carbon-carbon disc friction against temperature (°C): barely bites cold, works from about 400, fades past 1000.
const brakeMu = (T) => { const x = clamp((T - 20) / 430, 0, 1); return 0.5 + 0.5 * x * x * (3 - 2 * x) - 0.4 * clamp((T - 1000) / 400, 0, 1); };
const ABS_LOSS = 0.88; // share of the threshold-braking force ABS holds when it intervenes

function pacejka(alpha) { const x = 16 * alpha; return Math.sin(1.6 * Math.atan(x)); }

class Sim {
  constructor(track, setup) { this.track = track; this.setup = Object.assign({}, DEFAULT_SETUP, setup); this.resetSession(); }
  resetSession() {
    this.placeAt(this.track.L - 16, -2.5); // grid slot behind the gantry
    const blanket = 80;
    this.tyreT = [blanket, blanket, blanket, blanket]; this.wear = [0, 0, 0, 0];
    this.brakeT = [350, 350, 350, 350]; this.fuel = this.setup.fuel;
    this.ers = CAR.ersCap; this.t = 0; this.lap = 0; this.lapStart = 0; this.lastLap = null; this.bestLap = null;
    this.sectorTimes = [null, null, null]; this.bestSectors = [null, null, null]; this.lastSectors = [null, null, null];
    this.invalid = false; this.rec = newRec(this.track); this.bestRec = null; this.lastRec = null; this.refRec = null;
    this.message = ''; this.messageT = 0; this.lapsDone = [];
  }
  placeAt(s, d) {
    const tr = this.track, i = Math.round(s / tr.ds) % tr.N;
    this.x = tr.px[i] - tr.tz[i] * d; this.z = tr.pz[i] + tr.tx[i] * d; this.psi = Math.atan2(tr.tz[i], tr.tx[i]);
    this.vx = 0; this.vz = 0; this.r = 0; this.gear = 1; this.rpm = CAR.idle; this.shiftT = 0;
    this.thr = 0; this.brk = 0; this.steer = 0; this.aligningTorque = 0; this.roadFeedback = 0; this.roadFilter = 0; this.alpha = [0, 0, 0, 0]; this.ax = 0; this.ay = 0;
    this.idx = i; this.s = s; this.d = d; this.drsOpen = false; this.overtake = false;
    this.lock = [0, 0, 0, 0]; this.spin = [0, 0, 0, 0]; this.surf = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];
    this.tcActive = false; this.absActive = false; this.slipMax = 0; this.revT = 0; this.impact = 0; this.speed = 0; this.Fz = [0, 0, 0, 0]; this.tow = 0; this.gripK = 1;
  }
  flash(msg, t = 3) { this.message = msg; this.messageT = t; }
  inDrsZone() { const s = this.s; return this.track.drs.some(([a, b]) => a < b ? s > a && s < b : s > a || s < b); }
  shift(dir) {
    if (this.shiftT > 0) return;
    if (dir > 0 && this.gear >= 1 && this.gear < 8) { this.gear++; this.shiftT = 0.045; this.shifted = 1; }
    else if (dir > 0 && this.gear <= 0) { this.gear = 1; this.shiftT = 0.1; }
    else if (dir < 0 && this.gear > 1) {
      const nr = this.rpm * CAR.ratios[this.gear - 2] / CAR.ratios[this.gear - 1];
      if (nr < 13300) { this.gear--; this.shiftT = 0.06; this.shifted = -1; }
    }
  }
  step(dt, inp) {
    const c = CAR, set = this.setup, tr = this.track, cmp = COMPOUNDS[set.compound] || COMPOUNDS.soft;
    const cf = Math.cos(this.psi), sf = Math.sin(this.psi);
    let vx = this.vx * cf + this.vz * sf, vy = -this.vx * sf + this.vz * cf;
    const v = Math.hypot(this.vx, this.vz);
    this.speed = v;

    // --- inputs (keyboard is digital: ramp it; pads come in analogue) ---
    const rate = inp.analog ? 30 : 7;
    this.thr += clamp(inp.throttle - this.thr, -rate * dt * 1.6, rate * dt);
    this.brk += clamp(inp.brake - this.brk, -rate * dt * 2, rate * dt * 1.4);
    const sRate = inp.analog ? 12 : (Math.sign(inp.steer) !== Math.sign(this.steer) || inp.steer === 0 ? 5 : 2.6);
    this.steer = inp.wheel ? clamp(inp.steer, -1, 1) : this.steer + clamp(inp.steer - this.steer, -sRate * dt, sRate * dt);
    // A key is all or nothing, so a full press asks for the lock that just saturates the front tyres at this speed: the
    // angle of the tightest arc the grip allows, plus the slip the tyres need to get there. A pad's stick is scaled by speed.
    const aero0 = aeroCoeffs(set, false), kDf = 0.5 * RHO * (aero0.clF + aero0.clR) / c.m;
    const lock = inp.wheel ? c.maxLock : inp.analog ? c.maxLock * Math.max(1 / (1 + v * v / 4900), 0.08) : Math.min(c.maxLock, c.wb * 1.75 * (G / Math.max(v * v, 1) + kDf) + 0.02);
    const delta = this.steer * lock;
    this.roadAngle = delta;
    let thr = this.thr, brk = this.brk;

    // reverse: hold brake at standstill
    if (this.gear !== -1 && v < 0.8 && brk > 0.6 && thr < 0.05) { this.revT += dt; if (this.revT > 0.6) { this.gear = -1; this.revT = 0; } } else this.revT = 0;
    if (this.gear === -1) { if (thr > 0.1 && v < 1) this.gear = 1; else { const t = thr; thr = brk; brk = t; } }

    // --- gearbox ---
    if (this.shiftT > 0) this.shiftT -= dt;
    const gi = Math.max(this.gear, 1) - 1;
    const wheelRpm = Math.abs(vx) / c.R * 60 / TAU;
    let rpm = wheelRpm * c.ratios[gi];
    if (this.gear >= 1 && rpm < 5500) rpm = Math.max(rpm, c.idle + thr * 6500); // clutch slip at launch
    if (this.gear === -1) rpm = c.idle + thr * 3000;
    this.rpm = lerp(this.rpm, rpm, Math.min(1, dt * 30));
    if (set.autoGear && this.gear >= 1 && this.shiftT <= 0) {
      if (this.rpm > 12150 && this.gear < 8) this.shift(1);
      else if (this.gear > 1 && wheelRpm * c.ratios[gi] < 7600) this.shift(-1);
    }

    // --- aero ---
    const { clF, clR, cdA } = aeroCoeffs(set, this.drsOpen);
    const q = 0.5 * RHO * v * v;
    let offFloor = 0; for (let w = 0; w < 4; w++) if (LOOSE[this.surf[w]]) offFloor++;
    const floorK = 1 - offFloor * 0.05;
    // slipstream: a car in another's wake has less drag, and less downforce (most of it off the front wing)
    const tow = this.tow;
    const dfF = q * clF * floorK * (1 - 0.14 * tow), dfR = q * clR * floorK * (1 - 0.07 * tow), drag = q * cdA * (1 - 0.3 * tow);

    // --- loads ---
    const Fz = this.Fz; let roadInput = 0;
    const m = c.m - BASE_FUEL + this.fuel;
    const lonT = m * this.ax * c.h / c.wb, latT = m * this.ay * c.h / c.tw;
    for (let w = 0; w < 4; w++) {
      const front = w < 2;
      let f = m * G * (front ? c.b : c.a) / c.wb / 2 + (front ? dfF : dfR) / 2 + (front ? -lonT : lonT) / 2;
      f += (YW[w] > 0 ? -1 : 1) * latT * (front ? 0.5 : 0.5);
      f = Math.max(f, 0);
      const ripple = f * surfaceRipple(this, w);
      if (front) roadInput += (w === 0 ? 1 : -1) * ripple;
      Fz[w] = Math.max(f + ripple, 0);
    }
    // Two adjustable poles; the default retains the original 12 Hz road filter.
    const smoothMs=Number.isFinite(this.roadSmoothing)?clamp(this.roadSmoothing,0,50):1000/(TAU*12);
    const roadTarget = clamp(roadInput / 300, -1.5, 1.5) * Math.min(v / 6, 1), roadBlend = smoothMs>0?1-Math.exp(-dt*1000/smoothMs):1;
    this.roadFilter += (roadTarget - this.roadFilter) * roadBlend;
    this.roadFeedback += (this.roadFilter - this.roadFeedback) * roadBlend;

    // --- engine/ERS drive force ---
    let drive = 0;
    this.tcActive = false; this.absActive = false;
    if (this.gear >= 1) {
      let T = engineTorque(this.rpm) * TUNE.pow * thr;
      if (this.rpm > c.limiter || this.fuel <= 0) T = 0;
      if (this.inRace) this.fuel = Math.max(0, this.fuel - FUEL_FLOW * thr * (this.rpm / 12000) * dt); // time trial runs at a fixed load
      if (thr < 0.05) T = -(25 + this.rpm * 0.0035) * (1 - brk * 0.5);
      drive = T * c.ratios[gi] * 0.92 / c.R;
      if (this.shiftT > 0) drive *= 0.55;
      if (thr > 0.85 && this.ers > 0 && v > 8 && this.gear >= 2) {
        const P = c.ersPower + (this.overtake ? c.ersOvertake : 0);
        drive += Math.min(P / v, 9000); this.ers = Math.max(0, this.ers - P * dt);
      }
    } else if (this.gear === -1) drive = -thr * 5000;
    if (brk > 0 && v > 5) this.ers = Math.min(c.ersCap, this.ers + c.ersPower * brk * dt);
    if (this.ers <= 0) this.overtake = false;

    // --- tyres ---
    this.aligningTorque = 0;
    let Fx = 0, Fy = 0, Mz = 0, heatAll = 0, slipMax = 0, gripK = 1;
    const loc = tr.locate(this.x, this.z, this.idx);
    const ti = loc.i, ntx = -tr.tz[ti], ntz = tr.tx[ti];
    const bias = set.brakeBias / 100, Fb = brk * c.brakeMax;
    // track evolution: rubber on the racing line adds grip, the marbles thrown off it cost grip
    const rub = tr.rubber[ti], offLine = Math.abs(loc.d - tr.line.off[ti]);
    const rubK = set.wet ? 1 : offLine < 1.6 ? 1 + 0.035 * (rub - RUBBER0) : offLine > 2.6 ? 1 - 0.03 * rub : 1;
    if (ti !== this.rubI && offLine < 1.6 && v > 20 && !set.wet) tr.rubber[ti] = Math.min(1, rub + 0.012);
    this.rubI = ti;
    const vsign = vx / (Math.abs(vx) + 0.4);
    for (let w = 0; w < 4; w++) {
      const front = w < 2;
      const owx = cf * XW[w] - sf * YW[w], owz = sf * XW[w] + cf * YW[w];
      const dw = loc.d + owx * ntx + owz * ntz;
      const sname = surfaceAt(tr, ti, dw); this.surf[w] = sname;
      const surf = SURF[sname];
      const T = this.tyreT[w];
      const tempF = clamp(1 - ((T - cmp.opt) / cmp.win) ** 2, 0.7, 1);
      const loadS = loadSens(Fz[w]);
      gripK = Math.min(gripK, (T > cmp.opt ? tempF : 1) * (1 - 0.2 * this.wear[w])); // overheated or worn (cold tyres warm up by being pushed)
      // rain: slicks aquaplane, and paint and kerbs turn to ice for everyone
      const wetK = set.wet ? (cmp === COMPOUNDS.wet ? 1 : 0.5) * (sname === 'kerb' ? 0.72 : 1) : 1;
      const Fmax = cmp.mu * tempF * (1 - 0.2 * this.wear[w]) * surf.mu * wetK * (sname === 'asphalt' ? rubK : 1) * loadS * Fz[w] * (front ? 1 : REAR_GRIP);

      // wheel-frame velocities
      const vxw = vx - this.r * YW[w], vyw = vy + this.r * XW[w];
      const st = front ? delta : 0, cs = Math.cos(st), sn = Math.sin(st);
      const lx = vxw * cs + vyw * sn, ly = -vxw * sn + vyw * cs;
      const aRaw = Math.atan2(ly, Math.max(Math.abs(lx), 3));
      this.alpha[w] += (aRaw - this.alpha[w]) * Math.min(1, (Math.abs(lx) + 2) * dt / 0.35);

      // longitudinal demand
      const bT = this.brakeT[w], bEff = brakeMu(bT);
      const fbw = (front ? Fb * bias : Fb * (1 - bias)) / 2 * bEff;
      let fxd = -vsign * fbw;
      if (!front) fxd += drive / 2;
      const braking = brk > 0.02 || (!front && drive < 0);
      let fx = fxd, latK = 1, ratio = Fmax > 1 ? Math.abs(fxd) / Fmax : 0;
      this.lock[w] = 0; this.spin[w] = 0;
      // assists keep the tyre inside its friction circle with cornering taking priority (that is what makes them stabilising)
      const assist = braking ? set.abs : set.tc;
      const usage = Math.min(1, Math.abs(pacejka(this.alpha[w])));
      const pastPeak = Math.abs(this.alpha[w]) > 0.085;
      let cap = assist && Math.abs(vx) > 2 ? (pastPeak && !braking ? 0.05 : Math.max(0.3, Math.sqrt(1 - usage * usage)) * 0.97) : 1;
      if (ratio > cap) {
        // ABS cycles the pressure around lock-up, so it gives away grip: a driver holding the pedal just under the
        // threshold stops shorter than one standing on it. (TC stays exact: it trims torque, it does not pulse.)
        if (assist && Math.abs(vx) > 2) { if (braking) cap *= ABS_LOSS; fx = Math.sign(fxd) * Fmax * cap; ratio = cap; latK = Math.sqrt(1 - cap * cap); if (braking) this.absActive = true; else this.tcActive = true; }
        else if (braking && Math.abs(vx) > 2) { fx = Math.sign(fxd) * Fmax * 0.78; latK = 0.12; this.lock[w] = 1; this.wear[w] += dt * 0.004; }
        else if (!braking && Math.abs(vx) > 0.5) { fx = Math.sign(fxd) * Fmax * 0.8; latK = 0.22; this.spin[w] = 1; }
        else { fx = Math.sign(fxd) * Fmax; latK = 0; }
      } else latK = Math.sqrt(1 - ratio * ratio);
      fx -= Math.sign(vx) * Math.min(Math.abs(vx), 1) * Math.min(surf.drag + (surf.dragV || 0) * Math.abs(vx), 0.6) * Fz[w];
      const fy = -pacejka(this.alpha[w]) * Fmax * latK;
      // Approximate pneumatic trail falls with slip, so understeer lightens the wheel.
      if (front) this.aligningTorque -= fy * 0.055 * Math.exp(-((this.alpha[w] / 0.16) ** 2)) * Math.min(1, v / 3);
      slipMax = Math.max(slipMax, Math.abs(this.alpha[w]) / 0.09, this.lock[w] * 1.5, this.spin[w] * 1.5);

      const cx = fx * cs - fy * sn, cy = fx * sn + fy * cs;
      Fx += cx; Fy += cy; Mz += XW[w] * cy - YW[w] * cx;

      // thermals & wear
      const bPow = brk > 0.02 ? Math.min(fbw, Math.abs(fx)) * Math.abs(vx) : 0; // W into the disc
      this.brakeT[w] += (bPow / 2000 - (bT - set.ambient) * (0.010 + 0.0003 * v)) * dt; // ~1.1 kg carbon disc, airflow cooling
      const slipPow = Math.abs(fy * ly) + Math.abs(fx) * Math.abs(vx) * (this.lock[w] || this.spin[w] ? 0.25 : 0.03);
      heatAll += slipPow;
      this.tyreT[w] += (TUNE.heat * (front ? TUNE.fheat : 1) * slipPow - (set.wet ? 9 : 6) * (T - set.ambient) * (1 + v / 25)) / 2500 * dt; // standing water cools the tread
      this.wear[w] = Math.min(1, this.wear[w] + slipPow * dt * cmp.wear);
    }
    this.slipMax = slipMax; this.gripK = gripK;

    // aero drag
    if (v > 0.1) { Fx -= drag * vx / v; Fy -= drag * vy / v; }

    // integrate (world frame)
    const wx = Fx * cf - Fy * sf, wz = Fx * sf + Fy * cf;
    this.vx += wx / m * dt; this.vz += wz / m * dt;
    this.r += Mz / c.Iz * dt;
    this.psi += this.r * dt;
    this.ax += (Fx / m - this.ax) * Math.min(1, dt * 15);
    this.ay += (Fy / m - this.ay) * Math.min(1, dt * 15);
    // standstill clamp so brakes/drag don't push the car backwards
    const nv = Math.hypot(this.vx, this.vz);
    if (nv < 0.5 && thr < 0.05 && this.gear !== -1 && (brk > 0.05 || nv < 0.15)) { this.vx = 0; this.vz = 0; this.r *= 0.8; }
    this.x += this.vx * dt; this.z += this.vz * dt;

    // --- barriers ---
    const l2 = tr.locate(this.x, this.z, ti);
    this.idx = l2.i; this.d = l2.d;
    const lim = l2.d > 0 ? tr.wallP[l2.i] - 1.1 : -(tr.wallM[l2.i] - 1.1);
    if (Math.abs(l2.d) > Math.abs(lim)) {
      const nx = -tr.tz[l2.i] * Math.sign(l2.d), nz = tr.tx[l2.i] * Math.sign(l2.d);
      const vn = this.vx * nx + this.vz * nz;
      const pen = Math.abs(l2.d) - Math.abs(lim);
      this.x -= nx * pen; this.z -= nz * pen;
      if (vn > 0) {
        this.vx -= 1.25 * vn * nx; this.vz -= 1.25 * vn * nz;
        this.vx *= 0.8; this.vz *= 0.8; this.r *= 0.3;
        this.impact = Math.max(this.impact, vn);
        if (vn > 6) this.flash('IMPACT  ' + Math.round(vn * 3.6) + ' km/h');
      }
    }

    // --- DRS ---
    if (this.drsOpen && (brk > 0.08 || !this.inDrsZone())) this.drsOpen = false;

    // --- timing ---
    this.t += dt;
    const prevS = this.s; this.s = l2.s;
    const L = tr.L, lapT = this.t - this.lapStart;
    if (Math.abs(l2.d) - 0.8 > tr.halfW && !this.invalid && v > 5) { this.invalid = true; this.flash('TRACK LIMITS · LAP DELETED'); }
    const R = this.rec, rb = Math.min(R.n - 1, Math.floor(this.s / REC_DS));
    if (R.t[rb] < 0 && this.s - prevS < 50 && this.s - prevS > -1) {
      R.t[rb] = lapT; R.x[rb] = this.x; R.z[rb] = this.z; R.psi[rb] = this.psi; R.v[rb] = v; R.thr[rb] = this.thr; R.brk[rb] = this.brk;
    }
    for (let k = 0; k < 2; k++) {
      const b = tr.sectors[k];
      if (prevS < b && this.s >= b && this.s - prevS < 50 && this.sectorTimes[k] === null && (k === 0 || this.sectorTimes[0] !== null))
        this.sectorTimes[k] = k === 0 ? lapT : lapT - this.sectorTimes[0];
    }
    if (prevS > L - 60 && this.s < 60) this.completeLap(lapT);
    else if (prevS < 60 && this.s > L - 60) { this.invalid = true; }
    if (this.messageT > 0) this.messageT -= dt;
  }
  completeLap(lapT) {
    if (this.lap === 0) { // standing start reaches the line: the flying lap begins
      this.lap = 1; this.lapStart = this.t; this.invalid = false; this.sectorTimes = [null, null, null]; this.rec = newRec(this.track);
      this.flash(this.inRace ? 'LAP 1' : 'FLYING LAP', 2); return;
    }
    const st = this.sectorTimes;
    if (st[0] !== null && st[1] !== null) st[2] = lapT - st[0] - st[1];
    const valid = !this.invalid && st[0] !== null && st[1] !== null;
    this.lastLap = lapT; this.lastSectors = st.slice(); this.lastValid = valid;
    this.lapsDone.push({ lap: this.lap, time: lapT, valid, sectors: st.slice() });
    // close the recording: bins skipped by a recover-to-track copy their predecessor so every lap is a complete trace
    const rec = this.rec; rec.lapTime = lapT; rec.valid = valid; rec.lap = this.lap; rec.sectors = st.slice();
    if (rec.t[0] < 0) { rec.t[0] = 0; rec.x[0] = this.x; rec.z[0] = this.z; rec.psi[0] = this.psi; rec.v[0] = this.speed; }
    for (let i = 1; i < rec.n; i++) if (rec.t[i] < 0) for (const k of REC_KEYS) rec[k][i] = rec[k][i - 1];
    this.lastRec = rec; this.refRec = this.bestRec; this.rec = newRec(this.track);
    if (valid) {
      for (let k = 0; k < 3; k++) if (this.bestSectors[k] === null || st[k] < this.bestSectors[k]) this.bestSectors[k] = st[k];
      if (this.bestLap === null || lapT < this.bestLap) { this.bestLap = lapT; this.bestRec = rec; this.flash('PERSONAL BEST  ' + fmtTime(lapT), 4); }
      else this.flash('LAP ' + this.lap + '  ' + fmtTime(lapT), 3);
    } else this.flash('LAP ' + this.lap + '  ' + fmtTime(lapT) + '  · INVALID', 3);
    this.lap++; this.lapStart = this.t; this.invalid = false;
    this.sectorTimes = [null, null, null];
  }
  delta() {
    if (!this.bestRec || this.lap < 1) return null;
    const b = Math.min(this.rec.n - 1, Math.floor(this.s / REC_DS));
    return this.rec.t[b] >= 0 ? this.rec.t[b] - this.bestRec.t[b] : null;
  }
}

function fmtTime(t) {
  if (t === null || t === undefined) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

// ---------------- Autopilot (used by tests and the menu attract loop) ----------------
// On-track gap to the player: ds wraps to +-L/2 (positive = ahead); lapDiff +1 = a lap up on the player. Speed floor keeps the gap finite when slow.
function relGap(L, sCar, sMe, progCar, progMe, speed) {
  const ds = ((sCar - sMe) % L + 1.5 * L) % L - 0.5 * L;
  return { rel: ds / Math.max(speed, 30), lapDiff: Math.round((progCar - progMe - ds) / L) };
}
function autopilot(sim, look = 8, pace = 1, off = 0, vCap = 1e9) {
  const tr = sim.track, L = tr.line, v = sim.speed;
  const j = (sim.idx + Math.round((look + v * TUNE.look) / tr.ds)) % tr.N;
  const o = clamp(L.off[j] + off, -(tr.halfW - 1.1), tr.halfW - 1.1) - L.off[j]; // offset from the racing line, kept on the road
  const dx = L.x[j] - tr.tz[j] * o - sim.x, dz = L.z[j] + tr.tx[j] * o - sim.z;
  const cf = Math.cos(sim.psi), sf = Math.sin(sim.psi);
  const lx = dx * cf + dz * sf, ly = -dx * sf + dz * cf;
  let steerAngle = Math.atan(2 * ly / (lx * lx + ly * ly) * CAR.wb);
  const af = Math.abs(sim.alpha[0]); if (af > 0.085) steerAngle *= 0.085 / af; // stay under the front tyre's peak slip
  // drive to the tyres: cold, cooked or worn rubber means lower corner speeds and earlier braking
  // In corners follow the full profile (it limits how hard the car accelerates out). On straights only the braking
  // limit applies, so a car carrying extra speed from a tow or DRS keeps its foot in until it has to brake.
  const i3 = (sim.idx + 3) % tr.N, straight = clamp(1 - Math.abs(L.k[i3]) * 150, 0, 1);
  const target = Math.min(L.vb[i3], L.v[i3] + 40 * straight) * pace * Math.min(1, Math.sqrt(sim.gripK / 0.92));
  if (target > vCap) return { analog: true, steer: clamp(steerAngle / (CAR.maxLock * Math.max(1 / (1 + v * v / 4900), 0.08)), -1, 1), throttle: v < vCap - 0.5 ? 1 : 0, brake: v > vCap + 0.5 ? clamp((v - vCap) / 4, 0.15, 1) : 0 };
  const sens = 1 / (1 + v * v / 4900);
  return {
    analog: true,
    steer: clamp(steerAngle / (CAR.maxLock * Math.max(sens, 0.08)), -1, 1),
    throttle: v < target - 0.5 ? 1 : 0,
    brake: v > target + 0.5 ? clamp((v - target) / 4, 0.15, 1) : 0,
  };
}

// Teams: id, name, body colour, accent colour. The 2026 grid by name, in colours that approximate each livery (no logos or
// sponsors); 'apex' is the car model's own navy and orange. Every team's car drives the same.
const TEAMS = [
  ['apex', 'Apex GP', 0x1b2a6b, 0xff6a14], ['mclaren', 'McLaren', 0xff8000, 0x17181b], ['ferrari', 'Ferrari', 0xd40000, 0xf4f4f0],
  ['redbull', 'Red Bull', 0x15224f, 0xe8112d], ['mercedes', 'Mercedes', 0xb9bfc4, 0x00d7b6], ['aston', 'Aston Martin', 0x00594f, 0xcedc00],
  ['alpine', 'Alpine', 0x0a62d8, 0xff87bc], ['williams', 'Williams', 0x0b2f8f, 0x64c4ff], ['racingbulls', 'Racing Bulls', 0xf2f4fa, 0x1e41ff],
  ['haas', 'Haas', 0xf0f0f0, 0xe6002b], ['audi', 'Audi', 0x9a9da1, 0xe00a1e], ['cadillac', 'Cadillac', 0x18181b, 0xf2f2f2],
];
const teamDef = (id) => TEAMS.find(t => t[0] === id) || TEAMS[0];
// a team's colour for timing screens: the body colour, or the accent when the body is too dark to read on a dark panel
const teamColor = (id) => { const [, , body, acc] = teamDef(id), lum = (c) => 0.3 * (c >> 16) + 0.59 * (c >> 8 & 255) + 0.11 * (c & 255); return '#' + (lum(body) > 70 ? body : lum(acc) > 70 ? acc : 0x8f9bb3).toString(16).padStart(6, '0'); };

// ---------------- Race: the player plus AI cars on one track ----------------
const DRIVERS = [ // fictional grid: code, name, livery hue shift (degrees) for the renderer
  ['VOS', 'M. Voss', 140], ['KAI', 'T. Kaine', 285], ['RYD', 'A. Ryder', 60], ['TAN', 'S. Tanaro', 200], ['MIL', 'J. Milano', 330],
];
const SKILL = { rookie: [0.8, 0.84], pro: [0.9, 1], elite: [0.975, 1] }; // [corner pace, throttle cap] ≈ 1:13 / 1:06 / 1:03 laps of Kestrel
function wrapGap(tr, a, b) { let g = a - b; if (g > tr.L / 2) g -= tr.L; else if (g < -tr.L / 2) g += tr.L; return g; }

class Race {
  // playerSim is reused (and reset onto the grid); AI cars get their own Sim on the same track
  constructor(track, playerSim, opts = {}) {
    this.track = track; this.laps = opts.laps || 3; this.t = 0; this.over = false; this.finishers = 0;
    const [base, power] = SKILL[opts.skill] || SKILL.pro, n = Math.min(opts.opponents === undefined ? 5 : opts.opponents, DRIVERS.length);
    const rnd = opts.rnd || Math.random;
    const mine = teamDef(opts.team)[0], others = TEAMS.filter(t => t[0] !== 'apex' && t[0] !== mine); // the AI cars take the other teams
    this.cars = [];
    for (let k = 0; k < n; k++) {
      const [code, name, hue] = DRIVERS[k];
      // quickest AI at the front; each has its own pace and reaction time
      this.cars.push({ code, name, hue, team: others[k % others.length][0], ai: true, sim: new Sim(track, Object.assign({}, playerSim.setup, { tc: true, abs: true, autoGear: true })), pace: base * (1 - 0.012 * k) * (0.995 + rnd() * 0.01), power, react: 0.18 + rnd() * 0.25, off: 0 });
    }
    this.player = { code: 'YOU', name: 'You', hue: 0, team: mine, ai: false, sim: playerSim, off: 0, pace: 0.9, power: 1 }; // pace is for its cool-down lap
    this.cars.push(this.player); // the player starts last
    track.rubber.fill(RUBBER0);
    this.cars.forEach((c, k) => {
      c.sim.setup.fuel = 2 + 1.6 * this.laps; /* ~1.45 kg a lap at full pace, plus a margin */ c.sim.resetSession(); c.sim.inRace = true; c.sim.placeAt(track.L - 16 - 9 * k, k % 2 ? 2.6 : -2.6);
      c.finished = false; c.finishT = null; c.curPace = c.pace; c.pos = k + 1; c.progress = 0; c.gap = 0;
    });
    speedProfile(track, playerSim.setup); // braking points for the race fuel load
    this.order = this.cars.slice();
  }
  // AI decision: where to sit relative to the racing line, and how fast the car ahead lets us go
  drive(me) {
    const sim = me.sim, tr = this.track, corner = tr.corner[sim.idx];
    let wantD = null, vCap = 1e9, paceCap = 9;
    for (const o of this.cars) {
      if (o === me) continue;
      const gap = wrapGap(tr, o.sim.s, sim.s), lat = o.sim.d - sim.d, closing = sim.speed - o.sim.speed;
      if (gap <= -8 || gap >= 45 || Math.abs(lat) > 3.4) continue;
      // pass on the side we are already on, else the side with more road
      const side = Math.abs(lat) > 0.5 ? -Math.sign(lat) : o.sim.d > 0 ? -1 : 1;
      // in our path: carry only as much extra speed as the gap lets us shed again
      if (gap > 0 && Math.abs(lat) < 2.2) {
        vCap = Math.min(vCap, o.sim.speed + Math.sqrt(12 * Math.max(gap - 8, 0)) - (gap < 7 ? 2 : 0));
        // both cars brake at the limit, so closing speed cannot be shed in a braking zone: brake where the car ahead brakes
        // (a human ahead is assumed to brake early)
        paceCap = Math.min(paceCap, (o.ai || o.finished ? o.curPace : 0.8) + Math.max(gap - 8, 0) / 100);
      }
      if (gap > 6) { if (!corner && gap < 35 && (closing > 1 || (Math.abs(lat) > 1.5 && closing > -1))) wantD = o.sim.d + side * 3.3; } // quicker on a straight: pull out
      else if (Math.abs(lat) > 1.2) wantD = o.sim.d + side * 3.3; // alongside: hold station next to it, through the corner too
    }
    // the autopilot applies the offset at its look-ahead point, so measure it against the line there
    const j = (sim.idx + Math.round((8 + sim.speed * TUNE.look) / tr.ds)) % tr.N;
    const want = wantD === null ? 0 : clamp(wantD, -(tr.halfW - 1.3), tr.halfW - 1.3) - tr.line.off[j];
    me.off += clamp(want - me.off, -4.5 / 240, 4.5 / 240);
    const pace = me.curPace = Math.min(paceCap, me.pace * (corner ? 1 - 0.03 * Math.min(Math.abs(me.off), 4) : 1) * (me.finished ? 0.75 : 1)); // off-line in a corner means a tighter, slower arc
    const inp = autopilot(sim, 8, pace, me.off, vCap);
    if (inp.throttle && !sim.drsOpen && sim.inDrsZone() && sim.speed > 40) sim.drsOpen = true;
    inp.throttle *= me.power;
    return inp;
  }
  step(dt, playerInput) {
    const cars = this.cars, tr = this.track;
    this.t += dt;
    for (const c of cars) {
      // tow from the nearest car ahead in line: strongest close behind, gone by 60 m or 2 m of lateral offset
      const s = c.sim, cf = Math.cos(s.psi), sf = Math.sin(s.psi); let tow = 0;
      if (s.speed > 25) for (const o of cars) {
        if (o === c) continue;
        const dx = o.sim.x - s.x, dz = o.sim.z - s.z, along = dx * cf + dz * sf, lat = -dx * sf + dz * cf;
        if (along > 3 && along < 60) tow = Math.max(tow, (1 - along / 60) * clamp(1 - Math.abs(lat) / (1.4 + along * 0.02), 0, 1) * clamp(o.sim.speed / 50, 0, 1));
      }
      s.tow = tow;
    }
    for (const c of cars) {
      const hold = c.ai && this.t < c.react;
      const inp = c.ai || c.finished ? (hold ? IDLE : this.drive(c)) : playerInput; // finished cars cruise a cool-down lap
      c.sim.step(dt, inp);
      // an AI car that has been punted into a wall or parked for 2.5 s is put back on the racing line where it stopped
      if (c.ai && !hold && !c.finished) {
        c.stuckT = c.sim.speed < 3 && inp.throttle > 0.5 ? (c.stuckT || 0) + dt : 0; // flooring it and going nowhere
        if (c.stuckT > 2.5) { c.sim.placeAt(c.sim.s, tr.line.off[c.sim.idx]); c.off = 0; c.stuckT = 0; c.recovered = (c.recovered || 0) + 1; }
      }
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) collide(cars[i].sim, cars[j].sim);
    for (const c of cars) {
      const s = c.sim;
      c.progress = (s.lap - 1) * tr.L + s.s;
      if (!c.finished && s.lapsDone.length >= this.laps) { c.finished = true; c.finishT = s.t; c.finishN = ++this.finishers; s.inRace = false; if (!c.ai) this.over = true; } // inRace off: no fuel burn on the cool-down lap
    }
    this.order.sort((a, b) => (a.finished || b.finished) ? (a.finished && b.finished ? a.finishN - b.finishN : a.finished ? -1 : 1) : b.progress - a.progress);
    this.order.forEach((c, k) => { c.pos = k + 1; });
  }
}
const IDLE = { analog: true, steer: 0, throttle: 0, brake: 0 };
// Car-to-car contact: two circles per car (front and rear), pushed apart with a mostly inelastic bounce.
function collide(a, b) {
  const dx0 = b.x - a.x, dz0 = b.z - a.z;
  if (dx0 * dx0 + dz0 * dz0 > 49) return;
  const R = 1.0, O = [1.6, -1.6];
  for (const oa of O) for (const ob of O) {
    const ax = a.x + Math.cos(a.psi) * oa, az = a.z + Math.sin(a.psi) * oa, bx = b.x + Math.cos(b.psi) * ob, bz = b.z + Math.sin(b.psi) * ob;
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
    if (d >= 2 * R || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, pen = (2 * R - d) / 2;
    a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vn < 0) {
      const j = -1.2 * vn / 2;
      a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
      // the hit lands off-centre, so it also turns each car a little
      a.r -= (Math.cos(a.psi) * nz - Math.sin(a.psi) * nx) * oa * j * 0.06; b.r += (Math.cos(b.psi) * nz - Math.sin(b.psi) * nx) * ob * j * 0.06;
      a.impact = Math.max(a.impact, -vn); b.impact = Math.max(b.impact, -vn);
    }
  }
}

// ---------------- Rendering / game shell (browser only) ----------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function noise(ctx, w, h, base, spread, n, size = 1) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * spread;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

function ribbon(tr, inner, outer, y, uvLen, include, yTop) {
  // inner/outer: (i)=>lateral offset. yTop: vertical wall from y to yTop at offset inner (outer ignored)
  const pos = [], uv = [], idx = [];
  let vcount = 0, prevOk = false, sAcc = 0;
  for (let ii = 0; ii <= tr.N; ii++) {
    const i = ii % tr.N, ok = include ? include(i) : true;
    sAcc = ii * tr.ds;
    if (!ok) { prevOk = false; continue; }
    const nx = -tr.tz[i], nz = tr.tx[i];
    const a = inner(i), b = yTop !== undefined ? a : outer(i);
    pos.push(tr.px[i] + nx * a, y, tr.pz[i] + nz * a, tr.px[i] + nx * b, yTop !== undefined ? yTop : y, tr.pz[i] + nz * b);
    uv.push(0, sAcc / uvLen, 1, sAcc / uvLen);
    if (prevOk) { const k = vcount; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    vcount += 2; prevOk = true;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// shortcut: only the V12 upper revs use recordings; other ranges/eras need licensed multi-RPM sources.
const ENGINE_ERAS = [
  { id: 'v6', label: 'V6 turbo hybrid · 2014–present', note: 'Deep exhaust, turbo whistle and electric whine.', cylinders: 6, idle: 3800, redline: 12500, cutoff: 4200, bank: 0.38, intake: 0.18, drive: 2.1, turbo: true, harmonics: [0, 1, 0.62, 0.32, 0.21, 0.12, 0.08, 0.035, 0.025] },
  { id: 'v8', label: 'V8 · 2006–2013', note: 'Hard-edged rasp rising to an 18,000 rpm scream.', cylinders: 8, idle: 4000, redline: 18000, cutoff: 7200, bank: 0.28, intake: 0.26, drive: 2.4, turbo: false, harmonics: [0, 1, 0.5, 0.36, 0.24, 0.18, 0.12, 0.09, 0.05, 0.03] },
  { id: 'v10', label: 'V10 · late 1990s–2005', note: 'Bright, piercing induction howl up to 19,000 rpm.', cylinders: 10, idle: 4000, redline: 19000, cutoff: 9000, bank: 0.18, intake: 0.22, drive: 1.8, turbo: false, harmonics: [0, 1, 0.78, 0.31, 0.26, 0.12, 0.11, 0.045, 0.03] },
  { id: 'v12', label: 'V12 · early 1990s', note: 'Ferrari F93A recorded acceleration; synthesized low revs and coasting.', cylinders: 12, idle: 3500, redline: 15500, cutoff: 7800, bank: 0.32, intake: 0.24, drive: 1.6, turbo: false, harmonics: [0, 1, 0.3, 0.44, 0.16, 0.11, 0.06, 0.04, 0.02] },
];

class Audio {
  init(context) {
    const A = window.AudioContext || window.webkitAudioContext; if (!context && !A) return;
    const ac = this.ac = context || new A();
    this.master = ac.createGain(); this.master.gain.value = 0;
    const compressor = ac.createDynamicsCompressor(); compressor.threshold.value = -12; compressor.knee.value = 12;
    compressor.ratio.value = 4; compressor.attack.value = 0.003; compressor.release.value = 0.12;
    this.master.connect(compressor); compressor.connect(ac.destination);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noiseSrc = () => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    // Exhaust pulses and the lower bank order replace the generic saw/square buzz.
    this.eg = ac.createGain(); this.eg.gain.value = 0;
    const shaper = this.shaper = ac.createWaveShaper(); shaper.oversample = '2x';
    this.voices = ENGINE_ERAS.map(era => {
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(era.drive * (i / (curve.length - 1) * 2 - 1));
      return { wave: ac.createPeriodicWave(new Float32Array(era.harmonics.length), new Float32Array(era.harmonics)), curve };
    });
    const bankWave = ac.createPeriodicWave(new Float32Array(8), new Float32Array([0, 1, 0.14, 0.36, 0.05, 0.15, 0.03, 0.07]));
    this.lp = ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.7;
    this.oscs = [[1, 0.7], [0.5, 0.3]].map(([mul, g]) => {
      const o = ac.createOscillator(), gg = ac.createGain(); gg.gain.value = g; o.setPeriodicWave(bankWave);
      o.connect(gg); gg.connect(shaper); o.start(); return [o, mul, gg];
    });
    this.synthG = ac.createGain();
    shaper.connect(this.synthG); this.synthG.connect(this.lp); this.lp.connect(this.eg); this.eg.connect(this.master);
    this.intakeF = ac.createBiquadFilter(); this.intakeF.type = 'bandpass'; this.intakeF.Q.value = 0.65;
    this.intakeG = ac.createGain(); this.intakeG.gain.value = 0;
    noiseSrc().connect(this.intakeF); this.intakeF.connect(this.intakeG); this.intakeG.connect(shaper);
    const turbo = ac.createOscillator(); turbo.type = 'sine'; this.turbo = turbo; this.tg = ac.createGain(); this.tg.gain.value = 0;
    turbo.connect(this.tg); this.tg.connect(this.master); turbo.start();
    const mk = (type, f, q) => { const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; noiseSrc().connect(fl); fl.connect(g); g.connect(this.master); return g; };
    this.squeal = mk('bandpass', 950, 4); this.wind = mk('lowpass', 420, 0.5); this.rumble = mk('lowpass', 110, 1); this.gravel = mk('bandpass', 2500, 0.7);
    this.hit = mk('lowpass', 300, 0.7);
    this.pop = mk('bandpass', 1500, 1.2); // gear-change crack and overrun crackle
    // ERS: a motor whine that climbs with road speed while deploying and falls away while harvesting
    this.ersO = ac.createOscillator(); this.ersO.type = 'triangle'; this.ersG = ac.createGain(); this.ersG.gain.value = 0;
    this.ersO.connect(this.ersG); this.ersG.connect(this.master); this.ersO.start();
    // The nearest rival shares the selected exhaust voice, doppler-shifted and panned.
    this.oppG = ac.createGain(); this.oppG.gain.value = 0;
    const olp = this.oppLP = ac.createBiquadFilter(); olp.type = 'lowpass'; olp.Q.value = 0.7;
    this.oppO = [[1, 0.7], [0.5, 0.25]].map(([mul, g]) => { const o = ac.createOscillator(); o.setPeriodicWave(bankWave); const gg = ac.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(olp); o.start(); return [o, mul]; });
    olp.connect(this.oppG);
    this.oppPan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (this.oppPan) { this.oppG.connect(this.oppPan); this.oppPan.connect(this.master); } else this.oppG.connect(this.master);
    this.lastGear = 1; this.blipT = 0; this.active = false;
  }
  loadV12() {
    if (this.v12Loading) return this.v12Loading;
    const ac = this.ac;
    this.v12Loading = Promise.all(['mid', 'high'].map(async band => {
      const response = await fetch(new URL('audio/v12-' + band + '.wav?v=f93a-1', ENGINE_URL || document.baseURI));
      if (!response.ok) throw Error('V12 recording: HTTP ' + response.status);
      return ac.decodeAudioData(await response.arrayBuffer());
    })).then(buffers => {
      if (ac.state === 'closed') return false;
      this.v12Loops = buffers.map((buffer, i) => {
        const source = ac.createBufferSource(), gain = ac.createGain();
        source.buffer = buffer; source.loop = true; gain.gain.value = 0;
        source.connect(gain); gain.connect(this.lp); source.start();
        return { source, gain, rpm: i ? 14000 : 11000 };
      });
      return true;
    }).catch(error => { console.warn('V12 recording unavailable; using synthesis.', error); return false; });
    return this.v12Loading;
  }
  resume() { if (!this.ac) this.init(); if (this.ac && this.ac.state !== 'running') this.ac.resume(); }
  update(sim, on, near, inside) { // inside: heard from in the helmet (cockpit view). near: the closest other car { rpm, dist, closing (m/s towards the listener), pan }
    if (!this.ac) return;
    const t = this.ac.currentTime, dt = clamp(t - (this.lastTime === undefined ? t : this.lastTime), 0, 0.1), set = (p, v, k = 0.04) => p.setTargetAtTime(v, t, k);
    this.lastTime = t;
    const era = ENGINE_ERAS.find(e => e.id === sim.setup.engineEra) || ENGINE_ERAS[0];
    if (this.era !== era) {
      const voice = this.voices[ENGINE_ERAS.indexOf(era)];
      this.oscs[0][0].setPeriodicWave(voice.wave); this.oppO[0][0].setPeriodicWave(voice.wave); this.shaper.curve = voice.curve;
      this.oscs[1][2].gain.value = era.bank; this.era = era;
    }
    if (!on) { set(this.master.gain, 0, 0.1); this.active = false; return; }
    if (era.id === 'v12') this.loadV12();
    if (!this.active) {
      this.lastGear = sim.gear; this.blipT = 0; this.active = true;
      this.pop.gain.cancelScheduledValues(t); this.pop.gain.setValueAtTime(0, t);
    }
    set(this.master.gain, this.muted ? 0 : 0.5, 0.1);
    // gear changes: a crack on every shift, and on downshifts a 120 ms throttle blip
    if (sim.gear !== this.lastGear) {
      const down = sim.gear < this.lastGear && sim.gear >= 1, g = this.pop.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(down ? 0.45 : 0.25, t); g.setTargetAtTime(0, t, down ? 0.045 : 0.016);
      if (down) this.blipT = t + 0.12;
      this.lastGear = sim.gear;
    } else if (sim.thr < 0.05 && sim.rpm > 8000 && Math.random() < 1 - Math.exp(-dt * (era.turbo ? 3 : 8))) {
      const g = this.pop.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.04 + Math.random() * 0.1, t); g.setTargetAtTime(0, t, 0.02);
    }
    // Map the same drivetrain rev fraction onto each era's audible rev range; handling stays identical.
    const soundRpm = rpm => era.idle + clamp((rpm - CAR.idle) / (CAR.limiter - CAR.idle), 0, 1.08) * (era.redline - era.idle);
    const blip = t < this.blipT, thr = Math.max(sim.thr, blip ? 0.8 : 0), rpm = soundRpm(sim.rpm), f = rpm / 60 * era.cylinders / 2 * (blip ? 1.07 : 1);
    // The pass-by supplied loaded upper-rev loops; idle/coasting retain synthesis.
    const recorded = this.v12Loops && era.id === 'v12' ? clamp((rpm - 8500) / 2000, 0, 1) * thr : 0;
    set(this.synthG.gain, 1 - recorded * 0.9, 0.06);
    if (this.v12Loops) {
      const blend = clamp((rpm - 11000) / 3000, 0, 1);
      this.v12Loops.forEach((loop, i) => {
        set(loop.source.playbackRate, clamp(rpm / loop.rpm * (blip ? 1.07 : 1), 0.7, 1.3), 0.015);
        set(loop.gain.gain, 2.8 * recorded * Math.sqrt(i ? blend : 1 - blend), 0.06);
      });
    }
    for (const [o, mul] of this.oscs) set(o.frequency, f * mul, 0.015);
    set(this.lp.frequency, (900 + thr * era.cutoff + rpm * 0.1) * (inside ? 0.7 - 0.3 * recorded : 1), 0.03);
    set(this.intakeF.frequency, 650 + f * 1.6, 0.04); set(this.intakeG.gain, era.intake * thr * thr, 0.025);
    const cut = sim.rpm >= CAR.limiter && Math.floor(t * 38) % 2 === 0;
    set(this.eg.gain, (sim.shiftT > 0 && !blip ? 0.045 : 0.14 + 0.24 * thr) * (cut ? 0.25 : 1), 0.008);
    const deploy = sim.thr > 0.85 && sim.ers > 0 && sim.gear >= 2 && sim.speed > 8, harvest = sim.brk > 0.05 && sim.speed > 5;
    set(this.ersO.frequency, 700 + sim.speed * (deploy ? 42 : 30), 0.06);
    set(this.ersG.gain, era.turbo ? (deploy ? (sim.overtake ? 0.03 : 0.018) : harvest ? 0.022 * sim.brk : 0) : 0, 0.06);
    if (near) {
      const fo = soundRpm(near.rpm) / 60 * era.cylinders / 2 * (1 + clamp(near.closing, -90, 90) / 343);
      for (const [o, mul] of this.oppO) set(o.frequency, fo * mul, 0.03);
      set(this.oppLP.frequency, (1200 + era.cutoff * 0.7) / (1 + near.dist / 100), 0.05);
      set(this.oppG.gain, 0.2 / (1 + (near.dist / 14) ** 2), 0.05);
      if (this.oppPan) set(this.oppPan.pan, near.pan, 0.05);
    } else set(this.oppG.gain, 0, 0.1);
    set(this.turbo.frequency, 1800 + rpm * 0.32, 0.05); set(this.tg.gain, era.turbo ? 0.012 * thr * rpm / 12500 : 0, 0.08);
    const v = sim.speed, surf = sim.surf;
    set(this.squeal.gain, sim.speed > 6 ? clamp((sim.slipMax - 0.85) * 0.25, 0, 0.18) : 0, 0.05);
    set(this.wind.gain, Math.min(0.35, v * v / 9000 * 0.4) * (inside ? 1.5 : 1), 0.1);
    const onKerb = surf.some(s => s === 'kerb'), off = surf.some(s => LOOSE[s]);
    set(this.rumble.gain, onKerb && v > 3 ? 0.9 : 0, 0.02);
    set(this.gravel.gain, off && v > 3 ? 0.12 : 0, 0.05);
    if (sim.impact > 2) { this.hit.gain.cancelScheduledValues(t); this.hit.gain.setValueAtTime(Math.min(2, sim.impact / 8), t); this.hit.gain.setTargetAtTime(0, t, 0.15); }
  }
}

function create(canvas, opts = {}) {
  const track = buildTrack(trackDef(opts.track));
  const sim = new Sim(track, opts.setup);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(1); // resize() sets the real ratio from the pixel budget
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 6000);

  // sky + image-based lighting
  const sky = new THREE.Sky(); sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su.turbidity.value = 5; su.rayleigh.value = 1.3; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
  scene.add(sky);
  const sunDir = new THREE.Vector3();
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight, sunLight.target);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 0.45); scene.add(hemi);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  let elevNow = 38;
  function setTimeOfDay(elevDeg) {
    elevNow = elevDeg; const wet = state.wet;
    su.turbidity.value = wet ? 20 : 5; su.rayleigh.value = wet ? 0.35 : 1.3; // overcast: grey, flat sky
    const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(215);
    sunDir.setFromSphericalCoords(1, phi, theta);
    su.sunPosition.value.copy(sunDir);
    const warm = clamp(1 - elevDeg / 30, 0, 1);
    sunLight.color.setRGB(1, lerp(0.95, 0.72, warm), lerp(0.88, 0.5, warm));
    sunLight.intensity = lerp(2.4, 1.6, warm) * (wet ? 0.3 : 1);
    hemi.intensity = wet ? 1.0 : 0.45;
    renderer.toneMappingExposure = lerp(0.55, 0.42, warm) * (wet ? 1.1 : 1);
    scene.fog = wet ? new THREE.Fog(0x8b9299, 60, 1100) : new THREE.Fog(new THREE.Color().setRGB(lerp(0.74, 0.86, warm), lerp(0.80, 0.72, warm), lerp(0.88, 0.62, warm)), 400, 3200);
    asphaltMat.roughness = wet ? 0.22 : 0.88; asphaltMat.color.setScalar(wet ? 0.5 : 1); asphaltMat.envMapIntensity = wet ? 1.8 : 1; // wet tarmac: dark and mirror-like
    const skyScene = new THREE.Scene(); const s2 = new THREE.Sky(); s2.scale.setScalar(1000); s2.material.uniforms.sunPosition.value.copy(sunDir);
    ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(k => s2.material.uniforms[k].value = su[k].value);
    skyScene.add(s2);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene); scene.environment = envRT.texture;
  }

  // ground
  const W = WORLDS[track.world] || WORLDS.alpine, city = track.city;
  const grassTex = canvasTex(512, 512, (x, w, h) => { noise(x, w, h, W.ground, 0.22, 26000, 2); }, [700, 700]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 144, 144), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, vertexColors: true })); // tessellated: depth interpolated across two 7 km triangles drifted by >12 cm and swallowed the road
  // The circuit itself is flat (physics and every placed object assume y = 0); the land rolls once it is 90 m clear of the track.
  const nearest = (x, z) => { let m = 1e12, bi = 0; for (let i = 0; i < track.N; i += 5) { const dx = x - track.px[i], dz = z - track.pz[i], d = dx * dx + dz * dz; if (d < m) { m = d; bi = i; } } return [Math.sqrt(m), bi]; };
  const trackDist = (x, z) => nearest(x, z)[0];
  const inCity = (x, z, pad) => city && Math.hypot(x - city.x, z - city.z) < city.r + pad;
  // patchy woodland: 0 … 1, wooded where it is below the world's `forest`
  const wood = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.0043 + 1.7) * Math.cos(z * 0.0037 - 0.4) + 0.2 * Math.sin(x * 0.0121 + z * 0.0093 + 2);
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const terrH = (x, z, dist) => {
    const m = clamp((dist - 90) / 280, 0, 1), k = m * m * (3 - 2 * m);
    return k * W.relief * (24 + 20 * Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0037) + 12 * Math.sin(x * 0.011 + z * 0.009) + 9 * Math.sin(z * 0.006 - x * 0.002));
  };
  // the land's colour varies: darker under the trees, paved under a town, and on farmland a patchwork of crops and plough
  const CROPS = [[1, 1, 1], [1.5, 1.32, 0.62], [0.82, 1.02, 0.8], [1.2, 0.92, 0.62], [1.12, 1.18, 0.7], [0.9, 1.08, 1]];
  const tint = (x, z, dist, out) => {
    let c = 0.9 + 0.2 * hash(Math.round(x / 49), Math.round(z / 49)), g = c, b = c;
    if (inCity(x, z, 30)) { c = 1.25; g = 1.02; b = 1.0; if (W === WORLDS.desert) { c = 0.72; g = 0.72; b = 0.8; } }
    else if (W.fields && dist > 130) { const u = x * 0.88 + z * 0.48, v = -x * 0.48 + z * 0.88, f = CROPS[Math.floor(hash(Math.floor(u / 310), Math.floor(v / 220)) * CROPS.length)]; c *= f[0]; g *= f[1]; b *= f[2]; }
    else if (dist > 80 && wood(x, z) < W.forest) { c *= 0.8; g *= 0.86; b *= 0.8; }
    out[0] = c; out[1] = g; out[2] = b;
  };
  { const gp = ground.geometry.attributes.position; // plane is in XY before the mesh rotation: world x = x, world z = -y, height = z
    const gc = new Float32Array(gp.count * 3), t3 = [0, 0, 0];
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = -gp.getY(i), d = trackDist(x, z); gp.setZ(i, terrH(x, z, d)); tint(x, z, d, t3); gc.set(t3, i * 3); }
    ground.geometry.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    ground.geometry.computeVertexNormals(); }
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  // mown stripes near the track
  const mowTex = canvasTex(64, 256, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = W.mow[i % 2]; x.fillRect(0, i * 32, w, 32); } });
  const mow = new THREE.Mesh(ribbon(track, i => -track.wallM[i], i => track.wallP[i], -0.06, 40), new THREE.MeshStandardMaterial({ map: mowTex, roughness: 1 }));
  mow.receiveShadow = true; scene.add(mow);

  const hw = track.halfW;
  const asphaltTex = canvasTex(1024, 1024, (x, w, h) => {
    noise(x, w, h, '#3b3d40', 0.32, 220000, 1.5);
    const g = x.createLinearGradient(0, 0, w, 0); // rubbered-in centre band
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,0,0,0.18)'); g.addColorStop(0.7, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2f2ee'; x.fillRect(w * 0.012, 0, w * 0.022, h); x.fillRect(w * 0.966, 0, w * 0.022, h);
  });
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.88, metalness: 0 });
  const road = new THREE.Mesh(ribbon(track, () => -hw, () => hw, 0, hw * 2), asphaltMat); road.receiveShadow = true; scene.add(road);
  const state = { lineMode: 2, phase: 'menu', lights: 0, lightsT: 0, outAt: 0, reaction: null, camMode: 0, paused: false, ghost: true, tel: false, quality: 2, wet: false };
  setTimeOfDay(38);
  const kerbTex = canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#d42a1e'; x.fillRect(0, 0, w, h / 2); x.fillStyle = '#f4f4f0'; x.fillRect(0, h / 2, w, h / 2); });
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 });
  for (const sgn of [1, -1]) {
    const k = new THREE.Mesh(ribbon(track, () => sgn * hw, () => sgn * (hw + track.kerbW), 0.03, 3, i => track.corner[i]), kerbMat);
    k.receiveShadow = true; scene.add(k);
  }
  const gravelTex = canvasTex(256, 256, (x, w, h) => noise(x, w, h, '#a29b8f', 0.35, 30000, 2));
  const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1 });
  const sandTex = canvasTex(256, 256, (x, w, h) => noise(x, w, h, '#d9c08a', 0.16, 30000, 2));
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
  for (const [kind, mat] of [[1, gravelMat], [2, sandMat]]) {
    const pm = new THREE.Mesh(ribbon(track, i => hw + 3, i => track.wallP[i] - 3, 0.005, 12, i => track.gravP[i] === kind), mat);
    const mm = new THREE.Mesh(ribbon(track, i => -(hw + 3), i => -(track.wallM[i] - 3), 0.005, 12, i => track.gravM[i] === kind), mat);
    pm.receiveShadow = mm.receiveShadow = true; scene.add(pm, mm);
  }
  // racing line: red = braking zone, yellow = lift/turn-in, green = flat out. Within 300 m it reacts to your speed:
  // carry too much and red starts earlier; arrive slow and the zone softens to yellow.
  const RL = track.line;
  // rubber laid on the racing line: a dark groove with a darker core, as on any circuit that has been driven on
  const grooveMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
  for (const [w, y] of [[1.7, 0.006], [0.9, 0.008]]) { const gm = new THREE.Mesh(ribbon(track, i => RL.off[i] - w, i => RL.off[i] + w, y, 4), grooveMat); gm.renderOrder = 0.5; scene.add(gm); }
  // 3D circuit map for the menu: the track drawn as a wide lit band in sector colours (S1 red, S2 blue, S3 yellow) with DRS zones in
  // green along its edge, seen from an orbiting helicopter view. Hidden everywhere else.
  const mapGroup = new THREE.Group(); mapGroup.visible = false; scene.add(mapGroup);
  let mapC = null;
  {
    const N = track.N, col = new Float32Array((N + 1) * 6), SEC = [[1, 0.16, 0.12], [0.2, 0.5, 1], [1, 0.8, 0.1]];
    for (let ii = 0; ii <= N; ii++) { const sD = (ii % N) * track.ds, c = SEC[sD < track.sectors[0] ? 0 : sD < track.sectors[1] ? 1 : 2]; for (let k = 0; k < 2; k++) col.set(c, ii * 6 + k * 3); }
    const band = ribbon(track, () => -15, () => 15, 6, 4); band.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const flat = (o) => new THREE.MeshBasicMaterial(Object.assign({ toneMapped: false, fog: false, side: THREE.DoubleSide }, o));
    mapGroup.add(new THREE.Mesh(band, flat({ vertexColors: true })));
    const inDrs = (i) => { const sD = i * track.ds; return track.drs.some(([a, b]) => a < b ? sD > a && sD < b : sD > a || sD < b); };
    mapGroup.add(new THREE.Mesh(ribbon(track, () => 19, () => 27, 6, 4, inDrs), flat({ color: 0x2bd96b })));
    const flag = new THREE.Mesh(new THREE.BoxGeometry(10, 70, 10), flat({ color: 0xffffff })); flag.position.set(track.px[0], 41, track.pz[0]); mapGroup.add(flag);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, track.px[i]); x1 = Math.max(x1, track.px[i]); z0 = Math.min(z0, track.pz[i]); z1 = Math.max(z1, track.pz[i]); }
    mapC = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, e: Math.max(x1 - x0, z1 - z0) };
  }
  const lineGeo = ribbon(track, i => RL.off[i] - 0.38, i => RL.off[i] + 0.38, 0.012, 4);
  const lineCol = new Float32Array((track.N + 1) * 8);
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 4));
  const lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  lineMesh.renderOrder = 1; scene.add(lineMesh);
  const LINE_MODES = ['OFF', 'BRAKING', 'FULL'], LCOL = { g: [0.1, 0.85, 0.35], y: [1, 0.78, 0.05], r: [1, 0.12, 0.08] };
  const zone = new Array(track.N);
  function computeZones() {
    const N = track.N;
    for (let i = 0; i < N; i++) zone[i] = RL.v[(i + 1) % N] < RL.v[i] - 0.02 ? 'r' : Math.abs(RL.k[i]) > 1 / 120 ? 'y' : 'g';
    for (let i = 0; i < N; i++) if (zone[i] === 'r' && zone[(i - 1 + N) % N] === 'g') for (let j = 1; j <= 12; j++) { const q = (i - j + N) % N; if (zone[q] === 'g') zone[q] = 'y'; }
  }
  computeZones();
  function updateLine() {
    const mode = LINE_MODES[state.lineMode];
    lineMesh.visible = mode !== 'OFF' && state.phase !== 'menu';
    if (!lineMesh.visible) return;
    const N = track.N, v = sim.speed, aB = brakeDecel(sim.setup, v);
    for (let ii = 0; ii <= N; ii++) {
      const i = ii % N, ahead = ((i - sim.idx + N) % N) * track.ds;
      let c = zone[i];
      if (ahead < 300) {
        const vt = RL.v[i], need = (v * v - vt * vt) / (2 * Math.max(ahead, 1));
        if (need > 0.85 * aB) c = 'r'; else if (c === 'r' && need < 0.3 * aB) c = 'y';
      }
      const a = (mode === 'BRAKING' && c === 'g') || ahead > track.L - 10 ? 0 : 0.72, col = LCOL[c];
      for (let o = ii * 8; o < ii * 8 + 8; o += 4) { lineCol[o] = col[0]; lineCol[o + 1] = col[1]; lineCol[o + 2] = col[2]; lineCol[o + 3] = a; }
    }
    lineGeo.attributes.color.needsUpdate = true;
  }

  // barriers: tecpro blocks + catch fence
  const wallTex = canvasTex(256, 64, (x, w, h) => {
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#e8ecef' : '#1d4fa3'; x.fillRect(i * w / 4, 0, w / 4, h); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) x.fillRect(i * w / 4, 0, 2, h);
  });
  const fenceTex = canvasTex(64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(200,205,210,0.9)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
  });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  fenceTex.repeat.set(30, 1);
  for (const [arr, sgn] of [[track.wallP, 1], [track.wallM, -1]]) {
    const wall = new THREE.Mesh(ribbon(track, i => sgn * arr[i], null, 0, 4, null, 1.0), wallMat); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    scene.add(new THREE.Mesh(ribbon(track, i => sgn * (arr[i] + 0.6), null, 1.0, 1.2, null, 4.2), fenceMat));
  }

  // start/finish line, gantry, grandstands, pit building
  const startI = 0, snx = -track.tz[startI], snz = track.tx[startI], heading = Math.atan2(track.tz[startI], track.tx[startI]);
  const checker = canvasTex(256, 32, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; x.fillRect(i * 16, j * 16, 16, 16); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, hw * 2), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7 }));
  line.rotation.set(-Math.PI / 2, 0, -heading + Math.PI / 2); line.material.map.rotation = Math.PI / 2; line.material.map.center.set(0.5, 0.5);
  line.position.set(track.px[0], 0.015, track.pz[0]); line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, -heading, 0, 'YXZ');
  scene.add(line);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.6 });
  const gantry = new THREE.Group();
  const post = new THREE.BoxGeometry(0.6, 7.5, 0.6);
  for (const sgn of [1, -1]) { const p = new THREE.Mesh(post, darkMat); p.position.set(0, 3.75, sgn * (hw + 2)); p.castShadow = true; gantry.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, hw * 2 + 5), darkMat); beam.position.y = 7.2; beam.castShadow = true; gantry.add(beam);
  const lightMats = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 0 });
    for (const row of [0.3, -0.3]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), m); b.position.set(-0.52, 7.2 + row, (i - 2) * 0.9); b.rotation.y = -Math.PI / 2; gantry.add(b); }
    lightMats.push(m);
  }
  gantry.position.set(track.px[0], 0, track.pz[0]); gantry.rotation.y = -heading; scene.add(gantry);

  // one row of seated spectators, about 0.73 m each: big enough shapes that mip-mapping blends them instead of sparkling
  const crowdTex = canvasTex(512, 64, (x, w, h) => {
    x.fillStyle = '#23262c'; x.fillRect(0, 0, w, h);
    const shirts = ['#c9412b', '#e0b548', '#e9e9e4', '#2b62c0', '#e87424', '#2a2a2e', '#cfc7b6', '#2f9456', '#7a3fa0'], skin = ['#e8b894', '#c98f68', '#8d5a3b', '#f1cfb4'];
    for (let c = 0; c < 64; c++) {
      if (Math.random() < 0.07) continue; // empty seat
      const cx = c * 8 + 4;
      x.fillStyle = shirts[(Math.random() * shirts.length) | 0]; x.fillRect(cx - 3, 26, 6, 38);
      x.fillStyle = skin[(Math.random() * skin.length) | 0]; x.beginPath(); x.arc(cx, 18, 3.2, 0, TAU); x.fill();
    }
  }, [3, 1]);
  const standMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.4, metalness: 0.5 });
  function placeAlong(s, d, mesh, yRot = 0) {
    const i = Math.round(s / track.ds) % track.N, nx = -track.tz[i], nz = track.tx[i];
    mesh.position.set(track.px[i] + nx * d, mesh.position.y, track.pz[i] + nz * d);
    mesh.rotation.y = -Math.atan2(track.tz[i], track.tx[i]) + yRot; scene.add(mesh); return mesh;
  }
  { // four grandstands on the start straight: 40 terrace steps and 4 roofs, two draw calls
    const spots = [track.L - 420, track.L - 260, 80, 240], dummy = new THREE.Object3D(), base = new THREE.Object3D();
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(140, 1.0, 1.6), standMat, spots.length * 10);
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(142, 0.4, 20), roofMat, spots.length);
    base.add(dummy);
    spots.forEach((sp, k) => {
      const i = Math.round(sp / track.ds) % track.N, d = -(track.wallM[i] + 6);
      base.position.set(track.px[i] - track.tz[i] * d, 0, track.pz[i] + track.tx[i] * d); base.rotation.y = -Math.atan2(track.tz[i], track.tx[i]);
      for (let r = 0; r < 10; r++) { dummy.position.set(0, 0.5 + r, -r * 1.6); base.updateMatrixWorld(true); steps.setMatrixAt(k * 10 + r, dummy.matrixWorld); }
      dummy.position.set(0, 14, -8); base.updateMatrixWorld(true); roofs.setMatrixAt(k, dummy.matrixWorld);
    });
    steps.castShadow = steps.receiveShadow = roofs.castShadow = true; scene.add(steps, roofs);
  }
  const pitTex = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#e9ebee'; x.fillRect(0, 0, w, h); x.fillStyle = '#1e2a38';
    for (let i = 0; i < 32; i++) { x.fillRect(i * 16 + 2, 12, 12, 40); x.fillRect(i * 16 + 2, 70, 12, 40); }
  }, [6, 1]);
  const pit = new THREE.Mesh(new THREE.BoxGeometry(380, 12, 18), [new THREE.MeshStandardMaterial({ map: pitTex, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: pitTex, roughness: 0.5 }), roofMat, roofMat, new THREE.MeshStandardMaterial({ map: pitTex }), new THREE.MeshStandardMaterial({ map: pitTex })]);
  pit.position.y = 6; pit.castShadow = true; pit.receiveShadow = true;
  placeAlong(60, track.wallP[30] + 22, pit);
  const pitLane = new THREE.Mesh(new THREE.PlaneGeometry(420, 14), asphaltMat); pitLane.rotation.x = -Math.PI / 2; pitLane.position.y = 0.004;
  placeAlong(60, track.wallP[30] + 8, pitLane);

  { // trackside furniture
    const N = track.N, at = (i, d, y, o) => { o.position.set(track.px[i] - track.tz[i] * d, y, track.pz[i] + track.tx[i] * d); return o; };
    const o3 = new THREE.Object3D(), put = (mesh, k, i, d, y, yaw) => { at(i, d, y, o3).rotation.y = yaw; o3.updateMatrix(); mesh.setMatrixAt(k, o3.matrix); };
    const faceBack = (i) => Math.atan2(-track.tx[i], -track.tz[i]); // a plane turned to face oncoming cars
    // braking boards: 300/200/100 m before the turn-in of every big stop, on the outside of the corner
    const stops = [];
    for (let i = 0; i < N; i++) {
      if (zone[i] !== 'r' || zone[(i - 1 + N) % N] === 'r') continue;
      let j = i; while (zone[j % N] === 'r' && j - i < N) j++;
      if (RL.v[i] - RL.v[j % N] > 22) stops.push(j % N);
    }
    const signTex = (txt) => canvasTex(128, 96, (x, w, h) => { x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.font = 'bold 68px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, h / 2 + 4); });
    const boardG = new THREE.PlaneGeometry(1.5, 1.1), posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), darkMat, stops.length * 3);
    [100, 200, 300].forEach((dist, n) => {
      const boards = new THREE.InstancedMesh(boardG, new THREE.MeshStandardMaterial({ map: signTex(String(dist)), roughness: 0.6, side: THREE.DoubleSide }), stops.length);
      stops.forEach((j, k) => {
        const i = (j - Math.round(dist / track.ds) + N) % N, side = track.k[(j + 8) % N] > 0 ? -1 : 1, d = side * (hw + 2.6);
        put(boards, k, i, d, 1.55, faceBack(i)); put(posts, k * 3 + n, i, d, 0.5, 0);
      });
      scene.add(boards);
    });
    scene.add(posts);
    // marshal posts: an orange hut behind the fence every 330 m, alternating sides
    const nPost = Math.floor(track.L / 330), huts = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.3, 1.9), new THREE.MeshStandardMaterial({ color: 0xe8641c, roughness: 0.7 }), nPost);
    const hutRoofs = new THREE.InstancedMesh(new THREE.BoxGeometry(3.1, 0.14, 2.4), roofMat, nPost);
    for (let k = 0; k < nPost; k++) {
      const i = Math.round((k + 0.5) * 330 / track.ds) % N, sgn = k % 2 ? 1 : -1, d = sgn * ((sgn > 0 ? track.wallP[i] : track.wallM[i]) + 3), yaw = -Math.atan2(track.tz[i], track.tx[i]);
      put(huts, k, i, d, 1.15, yaw); put(hutRoofs, k, i, d, 2.37, yaw);
    }
    huts.castShadow = true; scene.add(huts, hutRoofs);
    // advertising hoardings above the barrier on the straights; every brand is made up
    const brands = [['VANTREL OILS', '#0f3d8c', '#ffffff'], ['LUMARA ENERGY', '#f2c230', '#141414'], ['KORVEX TOOLS', '#c8251d', '#ffffff'], ['TALVIO AIR', '#f1f1ee', '#0c6b5a']];
    const slots = brands.map(() => []);
    for (const sgn of [1, -1]) for (let i = 3, n = 0; i < N; i += 7) {
      const wall = sgn > 0 ? track.wallP[i] : track.wallM[i];
      if (track.corner[i] || track.corner[(i + 6) % N] || track.corner[(i - 6 + N) % N] || wall > RUNOFF[0] + 1) continue;
      slots[(n++ + (sgn > 0 ? 0 : 2)) % brands.length].push([i, sgn * (wall + 0.15), -Math.atan2(track.tz[i], track.tx[i]) + (sgn > 0 ? Math.PI : 0)]);
    }
    const adG = new THREE.PlaneGeometry(13, 1.15);
    brands.forEach(([name, bg, fg], b) => {
      const tex = canvasTex(512, 48, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h / 2 + 2); });
      const ads = new THREE.InstancedMesh(adG, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), slots[b].length);
      slots[b].forEach(([i, d, yaw], k) => put(ads, k, i, d, 1.6, yaw));
      scene.add(ads);
    });
  }

  // ---------------- Surroundings: trees, scrub, rocks, far mountains, a town ----------------
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < track.N; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
  // How far a spot is beyond the barrier there (negative: on the circuit's own ground). Along the start straight the pit
  // building and the grandstands stand behind the barrier, so nothing grows within the full runoff depth.
  let fromTrack = 0; // set by beyond(): the plain distance to the track, which the terrain height needs
  const beyond = (x, z) => {
    const [d, i] = nearest(x, z), side = -(x - track.px[i]) * track.tz[i] + (z - track.pz[i]) * track.tx[i], sD = i * track.ds;
    fromTrack = d; return d - (sD < 520 || sD > track.L - 560 ? RUNOFF[1] + 6 : side > 0 ? track.wallP[i] : track.wallM[i]);
  };
  const mergeG = (parts) => { // several small shapes as one geometry, so a whole kind of tree is a single instanced draw
    const P = [], Nn = [], I = [];
    for (const g of parts) {
      const o = P.length / 3, gp = g.attributes.position, gn = g.attributes.normal;
      for (let i = 0; i < gp.count; i++) { P.push(gp.getX(i), gp.getY(i), gp.getZ(i)); Nn.push(gn.getX(i), gn.getY(i), gn.getZ(i)); }
      if (g.index) for (const v of g.index.array) I.push(v + o); else for (let i = 0; i < gp.count; i++) I.push(o + i);
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); out.setIndex(I); return out;
  };
  const blob = (r, x, y, z, sy = 1) => { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, sy, 1); g.translate(x, y, z); return g; };
  const cyl = (r0, r1, h) => { const g = new THREE.CylinderGeometry(r0, r1, h, 5, 1, true); g.translate(0, h / 2, 0); return g; };
  // [trunk, crown, hue from, hue range, saturation, lightness from, lightness range]
  const FLORA = {
    conifer: [cyl(0.25, 0.35, 3), mergeG([[2.9, 4.6, 4.6], [2.3, 4.2, 7.4], [1.6, 3.8, 10]].map(([r, h, y]) => { const c = new THREE.ConeGeometry(r, h, 5, 1, true); c.translate(0, y, 0); return c; })), 0.27, 0.08, 0.5, 0.1, 0.08],
    broadleaf: [cyl(0.3, 0.45, 4.6), mergeG([blob(4.2, 0, 7.6, 0, 0.85), blob(3.3, 2.2, 5.8, 1.2, 0.9), blob(3.2, -2, 6, -1.5, 0.9)]), 0.23, 0.09, 0.62, 0.1, 0.09],
    palm: [cyl(0.14, 0.24, 8), mergeG([0, 1, 2, 3, 4, 5, 6, 7].map(k => { const c = new THREE.ConeGeometry(0.5, 4.2, 3, 1, true); c.translate(0, 2.1, 0); c.rotateZ(-(Math.PI / 2 + 0.3 + (k % 2) * 0.35)); c.rotateY(k * TAU / 8); c.translate(0, 8, 0); return c; })), 0.25, 0.06, 0.55, 0.14, 0.08],
    bush: [null, blob(1.2, 0, 0.6, 0, 0.75), W.bush[1], 0.05, W.bush[2], W.bush[3], 0.1],
    rock: [null, blob(1, 0, 0.35, 0, 0.6), 0.09, 0.03, 0.22, 0.4, 0.16],
  };
  const spots = { conifer: [], broadleaf: [], palm: [], bush: [], rock: [] };
  const kinds = Object.keys(W.trees), nTrees = Math.round(1500 + 12000 * W.forest);
  for (let t = 0, n = 0; t < 140000 && n < nTrees; t++) {
    const x = lerp(minX - 800, maxX + 800, rnd()), z = lerp(minZ - 800, maxZ + 800, rnd());
    if (inCity(x, z, 25) || (wood(x, z) > W.forest && rnd() > 0.05)) continue;
    const out = beyond(x, z); if (out < 7 || rnd() > (out < 220 ? 1 : out < 450 ? 0.5 : 0.18)) continue; // thick where it is seen from the road, thinner in the haze beyond
    let pick = rnd(), kind = kinds[0]; for (const k of kinds) { if (pick < W.trees[k]) { kind = k; break; } pick -= W.trees[k]; }
    spots[kind].push([x, z, 0.7 + rnd() * 0.7, terrH(x, z, fromTrack) - 0.4]); n++;
  }
  // scrub in a band just behind the fences, and boulders scattered wider
  for (let t = 0, n = 0; t < 30000 && n < 1500 * W.bush[0]; t++) {
    const x = lerp(minX - 150, maxX + 150, rnd()), z = lerp(minZ - 150, maxZ + 150, rnd()), out = beyond(x, z);
    if (out > 4 && out < 60 && !inCity(x, z, 10)) { spots.bush.push([x, z, 0.5 + rnd() * 0.9, terrH(x, z, fromTrack) - 0.2]); n++; }
  }
  for (let t = 0, n = 0; t < 9000 && n < (W.rocks || 0); t++) {
    const x = lerp(minX - 700, maxX + 700, rnd()), z = lerp(minZ - 700, maxZ + 700, rnd()), out = beyond(x, z);
    if (out > 6 && !inCity(x, z, 10)) { spots.rock.push([x, z, 0.6 + rnd() * rnd() * 5, terrH(x, z, fromTrack) - 0.3]); n++; }
  }
  const flora = []; // instanced meshes, thinned on the lowest graphics level (see setQuality)
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), v3 = new THREE.Vector3();
  for (const kind in spots) {
    const list = spots[kind], [trunkG, crownG, h0, hr, sat, l0, lr] = FLORA[kind]; if (!list.length) continue;
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: kind !== 'conifer', side: kind === 'palm' ? THREE.DoubleSide : THREE.FrontSide }), list.length);
    const trunks = trunkG && new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: kind === 'palm' ? 0x7a6348 : 0x4a3626, roughness: 1 }), list.length);
    list.forEach(([x, z, sc, y], i) => {
      m4.makeRotationY(rnd() * TAU).scale(v3.set(sc, sc * (0.8 + rnd() * 0.5), sc)).setPosition(x, y, z);
      crowns.setMatrixAt(i, m4); if (trunks) trunks.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(h0 + rnd() * hr, sat, l0 + rnd() * lr));
    });
    // no shadows: the shadow map only covers 45 m round the car, but an instanced mesh is drawn whole into it
    scene.add(crowns); flora.push(crowns); if (trunks) { scene.add(trunks); flora.push(trunks); }
  }
  // far mountains: all round, or only in the direction the circuit names
  if (W.peaks) {
    const [n, lo, hi, colr, snow] = W.peaks, pk = track.peaks || { at: 0, arc: TAU };
    const hillMat = new THREE.MeshStandardMaterial({ color: colr, roughness: 1, flatShading: true }), snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.9, flatShading: true });
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < n; i++) {
      const a = pk.at + ((i + rnd() * 0.6) / n - 0.5) * pk.arc, R = 2300 + rnd() * 600, h = lo + rnd() * (hi - lo), rad = h * (1.1 + rnd() * 0.9) + 150;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), hillMat); hill.rotation.y = rnd() * TAU;
      hill.position.set(cx + Math.cos(a) * R, h / 2 - 10, cz + Math.sin(a) * R); scene.add(hill);
      if (snow && h > 230) { const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.36, h * 0.36, 7), snowMat); cap.rotation.y = hill.rotation.y; cap.position.set(hill.position.x, h * 0.82 - 9.5, hill.position.z); scene.add(cap); }
    }
  }
  // a town, a village or a far skyline: boxes on a street grid, one instanced draw per building class. The windows are one
  // tiling texture; the shader repeats it by each building's own size, so floors stay floor-sized on a house and on a tower.
  if (city) {
    // [share, floors from, floors to, footprint from, to]; cell: street grid pitch; fill: share of plots built on
    const CITY = {
      town:    { cell: 38, fill: 0.84, turn: 0.35, cls: [[1, 3, 6, 17, 27]], walls: [0xc9ad7c, 0xbf9a68, 0xcbb894, 0xb5825c, 0xa99c84], roof: 0xc0502a, glass: '#39424d' },
      village: { cell: 32, fill: 0.5, turn: 0.9, cls: [[1, 2, 3, 9, 15]], walls: [0xb3a27e, 0xa3906c, 0xbdb294, 0x8f7054], roof: 0x6a5a4c, glass: '#2f3840' },
      skyline: { cell: 72, fill: 0.7, turn: 0.2, cls: [[0.72, 6, 20, 26, 44], [0.28, 30, 85, 24, 38]], walls: [0xb9c8d6, 0x9fb4c8, 0xd8dde2, 0x8fa3b5, 0xc9b79c], roof: 0x6f7780, glass: '#27445f' },
    }[city.kind];
    const lots = [], ct = Math.cos(CITY.turn), st = Math.sin(CITY.turn), nC = Math.ceil(city.r / CITY.cell);
    for (let a = -nC; a <= nC; a++) for (let b = -nC; b <= nC; b++) {
      const u = (a + (rnd() - 0.5) * 0.25) * CITY.cell, v = (b + (rnd() - 0.5) * 0.25) * CITY.cell, rr = Math.hypot(u, v) / city.r;
      if (rr > 1 || rnd() > CITY.fill * (1.15 - 0.6 * rr)) continue; // thins out towards the edge
      const x = city.x + u * ct - v * st, z = city.z + u * st + v * ct, d = trackDist(x, z); if (d < 150) continue;
      let pick = rnd(), c = CITY.cls[0]; for (const k of CITY.cls) { if (pick < k[0]) { c = k; break; } pick -= k[0]; }
      const tall = 1 - 0.55 * rr; // the middle stands highest
      lots.push([x, terrH(x, z, d) - 3, z, lerp(c[3], c[4], rnd()), 3 + 3.2 * Math.round(lerp(c[1], c[2], rnd() * rnd()) * (c[2] > 25 ? tall : 1)), lerp(c[3], c[4], rnd())]);
    }
    const winTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = CITY.glass; for (const wx of [8, 40]) x.fillRect(wx, 14, 17, 30); });
    const wallMat2 = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.75 }), roofMat2 = new THREE.MeshStandardMaterial({ color: CITY.roof, roughness: 0.9 });
    wallMat2.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_INSTANCING\n\tvUv *= vec2( max( 1.0, floor( length( instanceMatrix[ 0 ].xyz ) / 5.0 ) ), max( 1.0, floor( length( instanceMatrix[ 1 ].xyz ) / 3.2 ) ) );\n#endif'); };
    const boxG = new THREE.BoxGeometry(1, 1, 1); boxG.translate(0, 0.5, 0);
    const town = new THREE.InstancedMesh(boxG, [wallMat2, wallMat2, roofMat2, roofMat2, wallMat2, wallMat2], lots.length);
    lots.forEach(([x, y, z, w, h, d], i) => {
      m4.makeRotationY(-CITY.turn).scale(v3.set(w, h + 3, d)).setPosition(x, y, z); town.setMatrixAt(i, m4);
      town.setColorAt(i, col.setHex(CITY.walls[Math.floor(rnd() * CITY.walls.length)]));
    });
    scene.add(town);
  }

  // car
  const car = new THREE.Group(); scene.add(car);
  // Cut the four wheels out of the single Tripo mesh so the fronts can steer and all four can roll.
  // ponytail: hub positions were measured from this particular Tripo mesh (raw model units: x, y, radius, inner |z|);
  // a regenerated car needs new numbers, and the split quietly does nothing if a wheel comes out empty.
  // [hub x, hub y, cut radius, inner z]. The cut radius is the tyre's own (81.5 mm front, 85.5 mm rear in model units) plus half a millimetre:
  // at 84 / 88 it also took slivers of the bodywork beside each wheel, which then span round with it.
  // The last value is the inner z for the tyre itself (radius over 62 mm): the rear tread starts at z = 97 mm, well inboard of the
  // hub cut, and leaving that band on the body tore the tyre into a still half and a spinning half.
  const WHEEL_DEFS = [[0.305, -0.057, 0.082, 0.135, 0.135], [-0.295, -0.053, 0.086, 0.125, 0.096]];
  let wheels = [];
  const wheelsOf = (group) => { const out = []; group.traverse(o => { if (o.userData.wheel !== undefined) out.push({ steer: o, spin: o.children[0], glow: o.children[1], w: o.userData.wheel }); }); return out; };
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  function splitWheels(root) {
    root.traverse(o => {
      if (!o.isMesh || !o.geometry.index || o.userData.split) return;
      const g = o.geometry, pos = g.attributes.position, idx = g.index.array;
      const which = (vi) => {
        const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
        for (let d = 0; d < 2; d++) { const [cx, cy, r, inner, tread] = WHEEL_DEFS[d], q = (x - cx) ** 2 + (y - cy) ** 2; if (q <= r * r && Math.abs(z) >= (q > 0.062 * 0.062 ? tread : inner)) return d * 2 + (z > 0 ? 0 : 1); }
        return -1;
      };
      const body = [], parts = [[], [], [], []]; // sim wheel order: front +z, front -z, rear +z, rear -z
      for (let t = 0; t < idx.length; t += 3) {
        const a = which(idx[t]);
        if (a >= 0 && a === which(idx[t + 1]) && a === which(idx[t + 2])) parts[a].push(idx[t], idx[t + 1], idx[t + 2]);
        else body.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (parts.some(q => q.length < 300)) return;
      g.setIndex(body); o.userData.split = true;
      parts.forEach((tris, w) => {
        const wg = new THREE.BufferGeometry();
        for (const k in g.attributes) wg.setAttribute(k, g.attributes[k]);
        wg.setIndex(tris);
        let cz = 0; for (const vi of tris) cz += pos.getZ(vi); cz /= tris.length;
        const [cx, cy] = WHEEL_DEFS[w < 2 ? 0 : 1];
        const steer = new THREE.Group(), spin = new THREE.Group(), mesh = new THREE.Mesh(wg, o.material);
        steer.position.set(cx, cy, cz); mesh.position.set(-cx, -cy, -cz); mesh.castShadow = true; mesh.userData.split = true;
        steer.add(spin); spin.add(mesh); o.add(steer); steer.userData.wheel = w;
        // brake disc glow: a ring just proud of the wheel's outer face, lit by disc temperature
        let zo = 0; for (const vi of tris) zo = Math.max(zo, Math.abs(pos.getZ(vi)));
        const r = WHEEL_DEFS[w < 2 ? 0 : 1][2], glow = new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r * 0.44, 28), glowMat.clone());
        glow.position.z = Math.sign(cz) * (zo + 0.0015) - cz; glow.userData.glow = true; glow.visible = false; steer.add(glow);
      });
    });
  }
  let carReady = false, rigPaint = null, teamId = teamDef(opts.team)[0];
  // Liveries: the model's texture is navy bodywork with orange accents over bare carbon. A team's car is the same texture with
  // the navy swapped for its body colour and the orange for its accent, keeping each pixel's own shading.
  const baseMaps = new Map(), liveries = new Map(); // car material -> its original texture; texture + team -> repainted texture
  function liveryTex(tex, team) {
    if (team[0] === 'apex' || !tex || !tex.image) return tex;
    const key = tex.uuid + team[0]; if (liveries.has(key)) return liveries.get(key);
    let out = tex;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
      x.drawImage(tex.image, 0, 0, 1024, 1024);
      const img = x.getImageData(0, 0, 1024, 1024), d = img.data, bR = team[2] >> 16, bG = team[2] >> 8 & 255, bB = team[2] & 255, aR = team[3] >> 16, aG = team[3] >> 8 & 255, aB = team[3] & 255;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], Gc = d[i + 1], B = d[i + 2], mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B); if (mx - mn < 0.25 * mx || mx < 24) continue; // carbon, tyres, metal
        const k = Math.min(1, ((mx - mn) / mx - 0.25) / 0.2);
        if (B === mx && B - R > 0.3 * mx) { const sh = Math.min(1.25, mx / 78); d[i] = R + (Math.min(255, bR * sh) - R) * k; d[i + 1] = Gc + (Math.min(255, bG * sh) - Gc) * k; d[i + 2] = B + (Math.min(255, bB * sh) - B) * k; } // navy -> body
        else if (R === mx && R - B > 0.45 * mx && Gc < 0.8 * R) { const sh = mx / 240; d[i] = R + (Math.min(255, aR * sh) - R) * k; d[i + 1] = Gc + (Math.min(255, aG * sh) - Gc) * k; d[i + 2] = B + (Math.min(255, aB * sh) - B) * k; } // orange -> accent
      }
      x.putImageData(img, 0, 0);
      out = new THREE.CanvasTexture(c); out.flipY = tex.flipY; out.encoding = tex.encoding; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT; out.anisotropy = 4;
    } catch (e) { /* canvas read-back blocked: keep the model's own colours */ }
    liveries.set(key, out); return out;
  }
  function paintCar(id) {
    teamId = teamDef(id)[0]; const team = teamDef(id);
    car.traverse(o => { if (!o.isMesh || !o.material || !o.material.map || o.userData.glow) return; if (!baseMaps.has(o.material)) baseMaps.set(o.material, o.material.map); o.material.map = liveryTex(baseMaps.get(o.material), team); o.material.needsUpdate = true; });
    if (rigPaint) rigPaint(team);
  }
  function fallbackCar() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x14204a, metalness: 0.4, roughness: 0.3 }));
    body.position.y = 0.45; car.add(body);
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.4, 20); wg.rotateX(Math.PI / 2);
    for (const [x, z] of [[1.9, 0.8], [1.9, -0.8], [-1.7, 0.8], [-1.7, -0.8]]) { const w = new THREE.Mesh(wg, darkMat); w.position.set(x, 0.36, z); car.add(w); }
    carReady = true;
  }
  if (root.APEX_CAR_B64 && THREE.GLTFLoader) {
    const bin = atob(root.APEX_CAR_B64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', (gltf) => {
      const m = gltf.scene;
      m.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      if (size.z > size.x) m.rotation.y = Math.PI / 2;
      m.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(m); box.getSize(size);
      // which end is the nose? the rear wing is the tallest thing on the car
      let hiFront = -1e9, hiRear = -1e9; const v = new THREE.Vector3();
      m.traverse(o => {
        if (!o.isMesh) return; const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const u = (v.x - box.min.x) / size.x; if (u > 0.85) hiFront = Math.max(hiFront, v.y); if (u < 0.15) hiRear = Math.max(hiRear, v.y); }
      });
      if (hiFront > hiRear) m.rotation.y += Math.PI;
      m.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(m);
      const s = 5.6 / box.getSize(new THREE.Vector3()).x;
      const wrap = new THREE.Group(); wrap.add(m); wrap.scale.setScalar(s);
      const ctr = box.getCenter(new THREE.Vector3());
      m.position.set(-ctr.x, -box.min.y, -ctr.z);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material.envMapIntensity = 1.3; } } });
      splitWheels(m);
      car.add(wrap); wheels = wheelsOf(car); carReady = true; paintCar(teamId);
    }, () => fallbackCar());
  } else fallbackCar();

  // ---------------- First-person cockpit (COCKPIT camera only) ----------------
  // The camera sits at the driver's eyes, where the model's helmet is. Up close the Tripo body is a blurry blob, so in this
  // view the body is hidden for the main render and `rig` stands in for what the driver sees: chassis top, halo, mirrors,
  // steering wheel with a live display, gloves and arms. The model's own (split) wheels stay visible beyond it.
  // Axes as the car: +x nose, +y up, +z driver's right. `rig` is a separate scene object, not a child of `car`, because
  // opponents and the ghost are car.clone().
  const EYE = [0.72, 0.92];
  const rig = new THREE.Group(), wheelSpin = new THREE.Group(), arms = [], frontTyres = []; rig.visible = false; scene.add(rig);
  const dashCv = document.createElement('canvas'); dashCv.width = 384; dashCv.height = 256;
  const dashTex = new THREE.CanvasTexture(dashCv); dashTex.encoding = THREE.sRGBEncoding; dashTex.anisotropy = 4;
  const mirrorRT = new THREE.WebGLRenderTarget(640, 128), mirrorCam = new THREE.PerspectiveCamera(16, 5, 0.5, 2500);
  let bodyMeshes = null, mirrorTick = 0, dashT = 0;
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x070d24, roughness: 0.95, envMapIntensity: 0.1 }), ringMat = new THREE.MeshBasicMaterial({ color: 0xb0120c });
  const RING = { soft: 0xb0120c, medium: 0xb89400, hard: 0xb5b7ba, wet: 0x1560c0 };
  const NO_GEO = new THREE.BufferGeometry(); NO_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  {
    const [ex, ey] = EYE, v3 = (x, y, z) => new THREE.Vector3(x, y, z), V = (x, y, z) => v3(ex + x, ey + y, z);
    // Every static shape is baked into a vertex-coloured mesh per material and moving part, so the whole cockpit is about a dozen draw calls.
    // Colours are far darker than they should look: the sky's image-based light and the exposure lift them a long way.
    const NAVY = 0x060b1f, ORANGE = 0xb83a06, CARBON = 0x050506, RUBBER = 0x070708, GLOVE = 0x1c1e23, SUIT = 0x070d24, KNOB = 0x16171a;
    const o3 = new THREE.Object3D(), col = new THREE.Color(), bucket = () => ({ p: [], n: [], c: [] });
    const put = (b, geo, color, pos, rot, scl) => {
      o3.position.set(0, 0, 0); o3.rotation.set(0, 0, 0); o3.scale.set(1, 1, 1);
      if (pos) o3.position.copy(pos); if (rot) o3.rotation.set(rot[0], rot[1], rot[2]); if (scl) o3.scale.set(scl[0], scl[1], scl[2]);
      o3.updateMatrix();
      const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(o3.matrix); col.set(color);
      const P = g.attributes.position.array, Nn = g.attributes.normal.array;
      for (let i = 0; i < P.length; i += 3) { b.p.push(P[i], P[i + 1], P[i + 2]); b.n.push(Nn[i], Nn[i + 1], Nn[i + 2]); b.c.push(col.r, col.g, col.b); }
    };
    const bake = (b, mat, parent) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      const m = new THREE.Mesh(g, mat); parent.add(m); return m;
    };
    const tubeG = (pts, r, seg = 32) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 12);
    const strutG = (a, b, r, flat = 1) => { // a rod from a to b; flat > 1 makes it a blade
      const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10); g.scale(1, 1, flat);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize()));
      const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g;
    };
    const lathe = (prof, seg, phi0, phiL) => new THREE.LatheGeometry(new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(prof.length * 4), seg, phi0, phiL);
    const sphere = () => new THREE.SphereGeometry(1, 20, 14), capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, envMapIntensity: 0.2 });
    const gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, envMapIntensity: 0.5 });
    const G = bucket(), M = bucket(), W = bucket(), T = bucket(), R = bucket();

    // painted bodywork: the chassis top sweeping down to the nose with its stripe, the padded cockpit rim, the mirror pods
    const nose = [[0.29, 0], [0.285, 0.25], [0.26, 0.6], [0.21, 1.0], [0.15, 1.45], [0.09, 1.8], [0.04, 1.93], [0.001, 1.96]];
    const noseAt = V(0.5, -0.36, 0), noseRot = [0, 0, -0.05], flatY = [1, 0.55, 1];
    const ng = lathe(nose, 36); ng.rotateZ(-Math.PI / 2); put(G, ng, NAVY, noseAt, noseRot, flatY);
    const sg = lathe(nose.map(p => [p[0] * 1.006 + 0.001, p[1]]), 4, Math.PI * 1.5 - 0.12, 0.24); sg.rotateZ(-Math.PI / 2); put(G, sg, ORANGE, noseAt, noseRot, flatY);
    for (const s of [-1, 1]) {
      put(G, tubeG([V(-0.55, -0.1, s * 0.33), V(-0.2, -0.15, s * 0.34), V(0.25, -0.2, s * 0.3), V(0.52, -0.2, s * 0.2), V(0.6, -0.21, 0)], 0.06), NAVY);
      put(G, sphere(), NAVY, V(0.632, -0.07, s * 0.64), [0, s * 0.12, 0], [0.03, 0.05, 0.115]);
      put(M, strutG(V(0.6, -0.19, s * 0.33), V(0.63, -0.1, s * 0.6), 0.011, 1.8), CARBON);
    }
    // carbon: the well under the wheel, the dash cowl, halo hoop and centre pillar, steering column
    put(M, new THREE.BoxGeometry(1.7, 0.5, 0.5), CARBON, V(0.2, -0.56, 0));
    put(M, sphere(), CARBON, V(0.76, -0.235, 0), null, [0.15, 0.04, 0.24]); // clear of the wheel: further back its tip poked through the screen
    put(M, tubeG([V(-0.5, -0.2, -0.37), V(-0.28, 0.03, -0.36), V(0.12, 0.12, -0.34), V(0.43, 0.155, -0.2), V(0.57, 0.165, 0), V(0.43, 0.155, 0.2), V(0.12, 0.12, 0.34), V(-0.28, 0.03, 0.36), V(-0.5, -0.2, 0.37)], 0.026, 72), 0x08080a);
    const pg0 = tubeG([V(0.57, 0.165, 0), V(0.66, 0.06, 0), V(0.76, -0.09, 0), V(0.84, -0.24, 0)], 0.021, 20); pg0.scale(1, 1, 0.62); put(M, pg0, 0x08080a);
    // front suspension: wishbone blades and push rod from the chassis out to each upright
    for (const s of [-1, 1]) {
      const hubP = (y) => v3(1.71, y, s * 0.6);
      put(M, strutG(v3(1.38, 0.55, s * 0.17), hubP(0.52), 0.011, 2.4), CARBON); put(M, strutG(v3(2.0, 0.5, s * 0.13), hubP(0.52), 0.011, 2.4), CARBON);
      put(M, strutG(v3(1.38, 0.32, s * 0.2), hubP(0.22), 0.011, 2.4), CARBON); put(M, strutG(v3(1.62, 0.56, s * 0.15), hubP(0.24), 0.009), CARBON);
      put(M, sphere(), SUIT, V(-0.02, -0.47, s * 0.27), null, [0.06, 0.06, 0.06]); // elbow
    }
    const paintMesh = bake(G, gloss, rig); bake(M, matte, rig);
    { // remember which of the baked bodywork is body colour and which is accent, so a team's livery can repaint it
      const c = paintMesh.geometry.attributes.color, is = (i, hex) => Math.abs(c.getX(i) - (hex >> 16) / 255) + Math.abs(c.getY(i) - (hex >> 8 & 255) / 255) + Math.abs(c.getZ(i) - (hex & 255) / 255) < 0.004;
      const body = [], acc = []; for (let i = 0; i < c.count; i++) { if (is(i, NAVY)) body.push(i); else if (is(i, ORANGE)) acc.push(i); }
      rigPaint = (team) => {
        // as dark as the baked colours are (see above): the model's navy and orange are the reference for how dark
        const set = (list, hex, ref, k) => { const f = team[0] === 'apex' ? 0 : k, R = f ? (hex >> 16) / 255 * f : (ref >> 16) / 255, Gc = f ? (hex >> 8 & 255) / 255 * f : (ref >> 8 & 255) / 255, B = f ? (hex & 255) / 255 * f : (ref & 255) / 255; for (const i of list) c.setXYZ(i, R, Gc, B); };
        set(body, team[2], NAVY, 0.3); set(acc, team[3], ORANGE, 0.7); c.needsUpdate = true;
      };
      rigPaint(teamDef(teamId));
    }

    // front tyres: the model's wheel split keeps only the outer half of each tyre (the inner half belongs to the hidden body), so the
    // driver gets whole ones, with rounded shoulders, a wheel cover and the compound's colour band on the sidewall
    const tg = lathe([[0.2, -0.186], [0.3, -0.19], [0.345, -0.182], [0.368, -0.155], [0.373, -0.1], [0.373, 0.1], [0.368, 0.155], [0.345, 0.182], [0.3, 0.19], [0.2, 0.186]], 48); tg.rotateX(Math.PI / 2);
    put(T, tg, RUBBER);
    for (const s of [-1, 1]) {
      put(T, new THREE.CircleGeometry(0.2, 32), 0x0c0c0e, v3(0, 0, s * 0.186), [0, s > 0 ? 0 : Math.PI, 0]);
      put(R, new THREE.RingGeometry(0.283, 0.308, 48), 0xffffff, v3(0, 0, s * 0.1915), [0, s > 0 ? 0 : Math.PI, 0]);
    }
    const tyre = new THREE.Group(); bake(T, matte, tyre); bake(R, ringMat, tyre);
    for (const s of [-1, 1]) { const st = tyre.clone(); st.position.set(1.71, 0.373, s * 0.8); rig.add(st); frontTyres.push(st); } // clones share the geometry

    // mirrors: both faces show halves of one rear-view render (see poseCockpit)
    const mirrorMat = new THREE.MeshBasicMaterial({ map: mirrorRT.texture });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.19, 0.072); g.rotateY(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (s < 0 ? 1 : 0.5) - 0.5 * uv.getX(i)); // mirrored, outer edge shows furthest out
      const face = new THREE.Mesh(g, mirrorMat); face.position.copy(V(0.6, -0.07, s * 0.64)); face.rotation.y = s * 0.12; rig.add(face);
    }

    // steering wheel: raked hub, bevelled carbon plate, rubber grips, paddles, raised buttons and rotaries, and the screen (a canvas texture)
    const hub = new THREE.Group(); hub.position.copy(V(0.47, -0.225, 0)); hub.rotation.z = -0.28; rig.add(hub); hub.add(wheelSpin);
    const colG = new THREE.CylinderGeometry(0.022, 0.026, 0.3, 14); colG.rotateZ(Math.PI / 2); put(W, colG, CARBON, v3(0.17, 0, 0));
    const plate = new THREE.Shape(), pw = 0.098, ph = 0.06, pr = 0.022;
    plate.moveTo(-pw + pr, -ph); plate.lineTo(pw - pr, -ph); plate.quadraticCurveTo(pw, -ph, pw, -ph + pr); plate.lineTo(pw, ph - pr); plate.quadraticCurveTo(pw, ph, pw - pr, ph);
    plate.lineTo(-pw + pr, ph); plate.quadraticCurveTo(-pw, ph, -pw, ph - pr); plate.lineTo(-pw, -ph + pr); plate.quadraticCurveTo(-pw, -ph, -pw + pr, -ph);
    const pg = new THREE.ExtrudeGeometry(plate, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 8 }); pg.rotateY(Math.PI / 2);
    put(W, pg, 0x0a0a0c);
    const btn = () => { const g = new THREE.CylinderGeometry(0.0085, 0.0095, 0.008, 14); g.rotateZ(Math.PI / 2); return g; };
    [[0.034, -1, 0x8a0f0a], [0.006, -1, 0x0f6b2c], [-0.022, -1, 0x8a6d00], [0.034, 1, 0x0f3a8a], [0.006, 1, 0x9a4a06], [-0.022, 1, 0x77797d]].forEach(([y, s, c]) => put(W, btn(), c, v3(-0.008, y, s * 0.079)));
    for (const z of [-0.042, 0, 0.042]) {
      const g = new THREE.CylinderGeometry(0.0105, 0.013, 0.013, 16); g.rotateZ(Math.PI / 2); put(W, g, KNOB, v3(-0.0105, -0.044, z));
      put(W, new THREE.BoxGeometry(0.002, 0.009, 0.0025), 0x9a9da2, v3(-0.0175, -0.039, z));
    }
    for (const s of [-1, 1]) {
      put(W, tubeG([v3(0.01, 0.058, s * 0.08), v3(0.01, 0.072, s * 0.122), v3(0.01, 0.04, s * 0.152), v3(0.01, -0.04, s * 0.152), v3(0.01, -0.084, s * 0.125), v3(0.01, -0.076, s * 0.066)], 0.018, 28), RUBBER);
      put(W, new THREE.BoxGeometry(0.005, 0.062, 0.07), CARBON, v3(0.042, 0.004, s * 0.128)); // shift paddle
      // glove: back of the hand outside the grip, four fingers wrapped round the front of it, thumb hooked over the top, wrist
      put(W, sphere(), GLOVE, v3(0.006, -0.002, s * 0.174), null, [0.027, 0.05, 0.026]);
      for (const [k, y] of [0.036, 0.012, -0.012, -0.036].entries()) put(W, capsule(0.0088, 0.026), GLOVE, v3(-0.0165 + 0.002 * Math.abs(k - 1.5), y, s * 0.155), [Math.PI / 2, 0, 0]);
      put(W, capsule(0.0065, 0.066), ORANGE, v3(-0.011, 0, s * 0.169)); // knuckle guard
      put(W, capsule(0.0105, 0.034), GLOVE, v3(-0.02, 0.058, s * 0.124), [s * 1.0, 0, 0]);
      put(W, sphere(), GLOVE, v3(0.012, -0.05, s * 0.18), null, [0.033, 0.03, 0.031]);
      const wrist = new THREE.Object3D(); wrist.position.set(0.016, -0.056, s * 0.182); wheelSpin.add(wrist);
      const ag = new THREE.CylinderGeometry(0.032, 0.052, 1, 16); ag.rotateX(Math.PI / 2); ag.translate(0, 0, 0.5); // unit length along +z from the elbow
      const arm = new THREE.Mesh(ag, suitMat); arm.position.copy(V(-0.02, -0.47, s * 0.27)); rig.add(arm); arms.push({ arm, hand: wrist });
    }
    bake(W, matte, wheelSpin);
    const fg = new THREE.PlaneGeometry(0.118, 0.079); fg.rotateY(-Math.PI / 2);
    const face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false })); face.position.set(-0.0052, 0.013, 0); wheelSpin.add(face);
    rig.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  }
  // The wheel's screen: rev lights along the top, then gear, speed, delta, DRS, assists, tyre temperatures and the ERS store.
  const hVec = new THREE.Vector3();
  function drawDash() {
    const g = dashCv.getContext('2d'), W = dashCv.width, H = dashCv.height, s = sim;
    g.fillStyle = '#050506'; g.fillRect(0, 0, W, H);
    const frac = clamp((s.rpm - 6500) / (CAR.limiter - 700 - 6500), 0, 1), lit = Math.round(frac * 15), flash = frac >= 1;
    for (let i = 0; i < 15; i++) { g.fillStyle = flash ? '#4a7dff' : i < lit ? (i < 5 ? '#2bd96b' : i < 10 ? '#ff3b30' : '#4a7dff') : '#1d2026'; g.beginPath(); g.arc(24 + i * 24, 18, 8, 0, TAU); g.fill(); }
    g.fillStyle = '#000'; g.fillRect(4, 38, W - 8, H - 42); g.strokeStyle = '#30343c'; g.lineWidth = 3; g.strokeRect(4, 38, W - 8, H - 42);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.font = '800 132px "Barlow Condensed", Arial, sans-serif'; g.fillText(s.gear === -1 ? 'R' : s.gear === 0 ? 'N' : String(s.gear), 192, 132);
    const mph = s.setup.units === 'mph';
    g.font = '700 52px "Barlow Condensed", Arial, sans-serif'; g.fillText(String(Math.round(s.speed * (mph ? 2.237 : 3.6))), 70, 106);
    g.font = '600 16px Arial, sans-serif'; g.fillStyle = '#8b93a0'; g.fillText(mph ? 'MPH' : 'KM/H', 70, 142); g.fillText('LAP ' + Math.max(1, s.lap), 314, 64);
    g.fillText(Math.round(s.tyreT[0]) + '°  ' + Math.round(s.tyreT[1]) + '°', 70, 64);
    const d = s.delta();
    g.font = '700 38px "Barlow Condensed", Arial, sans-serif'; g.fillStyle = d === null ? '#8b93a0' : d <= 0 ? '#2bd96b' : '#ff5a4f';
    g.fillText(d === null ? '-.---' : (d > 0 ? '+' : '') + d.toFixed(2), 314, 102);
    const drs = s.drsOpen || s.inDrsZone();
    g.fillStyle = s.drsOpen ? '#2bd96b' : drs ? '#f5c400' : '#22252b'; g.fillRect(272, 128, 84, 28);
    g.fillStyle = drs ? '#000' : '#6b7380'; g.font = '700 17px Arial, sans-serif'; g.fillText('DRS', 314, 143);
    for (const [on, t, x] of [[s.tcActive, 'TC', 44], [s.absActive, 'ABS', 96]]) { g.fillStyle = on ? '#f5c400' : '#3a3f48'; g.fillText(t, x, 184); }
    g.fillStyle = '#8b93a0'; g.font = '600 15px Arial, sans-serif'; g.fillText('ERS ' + Math.round(clamp(s.ers / CAR.ersCap, 0, 1) * 100) + '%', 314, 184);
    g.fillStyle = '#22252b'; g.fillRect(22, 212, 340, 18); g.fillStyle = '#f5c400'; g.fillRect(22, 212, 340 * clamp(s.ers / CAR.ersCap, 0, 1), 18);
    dashTex.needsUpdate = true;
  }
  // Called every frame just before rendering. Returns true when the body must be hidden for the main pass.
  function poseCockpit(dtF) {
    // the body is the mesh the split wheels hang off, so it can't simply be made invisible: its geometry is swapped out for the render instead
    if (!bodyMeshes && carReady) { bodyMeshes = []; car.traverse(o => { if (o.isMesh && o.children.some(ch => ch.userData.wheel !== undefined)) bodyMeshes.push({ o, geo: o.geometry }); }); }
    rig.position.copy(car.position); rig.rotation.copy(car.rotation);
    wheelSpin.rotation.x = (sim.roadAngle || 0) * 5.5; // about 100° of wheel at full lock
    for (const t of frontTyres) t.rotation.y = -(sim.roadAngle || 0);
    ringMat.color.setHex(RING[sim.setup.compound] || RING.soft);
    rig.updateMatrixWorld(true);
    for (const a of arms) { a.hand.getWorldPosition(hVec); a.arm.lookAt(hVec); a.arm.scale.z = a.arm.getWorldPosition(vT).distanceTo(hVec); }
    if ((dashT += dtF) > 0.08) { dashT = 0; drawDash(); }
    // mirrors: one wide look backwards from mirror height, every third frame, without the player's own car or a second shadow pass
    if (state.quality > 0 && mirrorTick++ % 3 === 0) {
      const c = Math.cos(sim.psi), s = Math.sin(sim.psi);
      mirrorCam.position.set(sim.x + c * EYE[0], EYE[1] - 0.07, sim.z + s * EYE[0]); mirrorCam.lookAt(sim.x - c * 60, 0.6, sim.z - s * 60);
      car.visible = false; rig.visible = false; const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(mirrorRT); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = au; car.visible = true; rig.visible = true;
    }
    return true;
  }

  // race opponents: clones of the car (shared geometry), each in its team's livery
  let race = null, tt = null; const opp = [];
  function buildOpponents() {
    for (const c of race.cars) {
      if (!c.ai) continue;
      const group = car.clone(true), mats = new Map();
      group.traverse(o => {
        if (!o.isMesh || o.userData.glow) return;
        if (!mats.has(o.material)) {
          const m = o.material.clone();
          if (m.map) m.map = liveryTex(baseMaps.get(o.material) || m.map, teamDef(c.team)); else if (o.material !== darkMat) m.color.setHex(teamDef(c.team)[2]);
          mats.set(o.material, m);
        }
        o.material = mats.get(o.material);
      });
      const whs = wheelsOf(group); for (const wh of whs) if (wh.glow) wh.glow.material = glowMat.clone();
      scene.add(group); opp.push({ group, wheels: whs, sk: new Float32Array(12) });
    }
  }
  function endRace() { if (!race) return; race = null; sim.inRace = false; sim.resetSession(); Object.assign(sim, tt); }
  function poseCar(group, whs, s, dtF) {
    const roll = clamp(s.ay / G * 0.006, -0.025, 0.025);
    // drawn where the car is now, not at the last 240 Hz step: the leftover time varies frame to frame and showed as judder at speed
    const rough = s.speed < 5 ? 0 : s.surf.some(n => LOOSE[n]) ? 0.035 : s.surf.indexOf('kerb') >= 0 ? 0.02 : 0; // the body jiggles over kerbs and rough ground
    group.position.set(s.x + s.vx * acc, Math.random() * rough, s.z + s.vz * acc);
    group.rotation.set(roll, -s.psi, clamp(-s.ax / G * 0.006, -0.02, 0.02));
    const vxCar = s.vx * Math.cos(s.psi) + s.vz * Math.sin(s.psi);
    for (const wh of whs) {
      if (wh.w < 2) wh.steer.rotation.y = -(s.roadAngle || 0);
      if (!s.lock[wh.w]) wh.spin.rotation.z -= vxCar / CAR.R * dtF * (s.spin[wh.w] ? 1.7 : 1);
      if (wh.glow) { // dull red from ~550 °C, orange-yellow by 950 °C
        const k = clamp((s.brakeT[wh.w] - 540) / 410, 0, 1), gm = wh.glow.material;
        wh.glow.visible = k > 0.02; gm.opacity = 0.15 + 0.5 * k; gm.color.setRGB(1, 0.12 + 0.22 * k, 0.02 + 0.03 * k); if (composer && state.quality === 2) gm.color.multiplyScalar(1 + 1.2 * k); // over 1.0 so the disc blooms
      }
    }
    return roll;
  }

  // ghost of the best lap: a translucent copy of the car (shares its geometry) replaying sim.bestRec
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0x2f7dff, emissive: 0x0b3dff, emissiveIntensity: 0.9, roughness: 0.6, envMapIntensity: 0.3, transparent: true, opacity: 0.4 });
  let ghost = null; const gp = {};
  function makeGhost() {
    ghost = car.clone(true); ghost.visible = false;
    ghost.traverse(o => { if (o.userData.glow) o.visible = false; else if (o.isMesh) { o.material = ghostMat; o.castShadow = o.receiveShadow = false; } });
    scene.add(ghost);
  }
  const STORE = 'apexgp.best.v1' + (track.id === 'kestrel' ? '' : '.' + track.id); // one saved best lap per circuit
  let savedRec = null;
  function saveBest() {
    savedRec = sim.bestRec;
    try {
      const r = savedRec, o = { L: Math.round(track.L), lapTime: r.lapTime, sectors: r.sectors, lap: r.lap };
      for (const k of REC_KEYS) o[k] = Array.from(r[k], v => Math.round(v * 1000) / 1000);
      localStorage.setItem(STORE, JSON.stringify(o));
    } catch (e) { /* storage blocked or full: the best lap just lasts for this session */ }
  }
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || 'null'), r = newRec(track);
    if (o && o.L === Math.round(track.L) && o.lapTime > 0 && REC_KEYS.every(k => Array.isArray(o[k]) && o[k].length === r.n)) {
      for (const k of REC_KEYS) r[k].set(o[k]);
      Object.assign(r, { lapTime: o.lapTime, sectors: o.sectors, lap: o.lap, valid: true });
      sim.bestRec = savedRec = r; sim.bestLap = r.lapTime; if (Array.isArray(o.sectors) && o.sectors.length === 3) sim.bestSectors = o.sectors.slice();
    }
  } catch (e) { /* no stored lap */ }

  // tyre smoke
  const smokeN = 160, smokeGeo = new THREE.BufferGeometry(), smokePos = new Float32Array(smokeN * 3), smokeLife = new Float32Array(smokeN);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(235,235,235,0.55)'); g.addColorStop(1, 'rgba(235,235,235,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 3.2, map: smokeTex, transparent: true, depthWrite: false, opacity: 0.32 }));
  smoke.frustumCulled = false; scene.add(smoke); let smokeIdx = 0;
  for (let i = 0; i < smokeN; i++) smokePos[i * 3 + 1] = -100;

  // skid marks: one mesh, a ring buffer of quads laid wherever a tyre slides on tarmac; they stay for the session
  const SKN = 4000, skPos = new Float32Array(SKN * 12), skCol = new Float32Array(SKN * 16), skGeo = new THREE.BufferGeometry();
  { const ix = new Uint16Array(SKN * 6); for (let q = 0; q < SKN; q++) ix.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    skGeo.setIndex(new THREE.BufferAttribute(ix, 1)); }
  skGeo.setAttribute('position', new THREE.BufferAttribute(skPos, 3)); skGeo.setAttribute('color', new THREE.BufferAttribute(skCol, 4));
  const skMesh = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x08080a, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })); // quads wind either way depending on travel direction
  skMesh.frustumCulled = false; skMesh.renderOrder = 2; scene.add(skMesh);
  let skN = 0, skDirty = false; const mySk = new Float32Array(12);
  function clearSkids() { skPos.fill(0); skCol.fill(0); skN = 0; skDirty = true; mySk.fill(0); for (const o of opp) o.sk.fill(0); }
  function laySkids(s, st) { // st: per wheel [lastX, lastZ, wasSliding]
    const cf = Math.cos(s.psi), sf = Math.sin(s.psi);
    for (let w = 0; w < 4; w++) {
      const a = s.lock[w] ? 0.8 : s.spin[w] ? 0.62 : clamp((Math.abs(s.alpha[w]) - 0.1) / 0.12, 0, 0.55);
      const on = a > 0.05 && s.speed > 6 && (s.surf[w] === 'asphalt' || s.surf[w] === 'kerb');
      const x = s.x + cf * XW[w] - sf * YW[w], z = s.z + sf * XW[w] + cf * YW[w], o = w * 3;
      if (on && st[o + 2]) {
        const dx = x - st[o], dz = z - st[o + 1], d = Math.hypot(dx, dz);
        if (d < 0.3) continue; // too short to draw yet: keep the old end point
        if (d < 4) {
          const px = -dz / d * 0.17, pz = dx / d * 0.17, q = (skN++ % SKN), p = q * 12, c = q * 16;
          skPos[p] = st[o] + px; skPos[p + 2] = st[o + 1] + pz; skPos[p + 3] = st[o] - px; skPos[p + 5] = st[o + 1] - pz;
          skPos[p + 6] = x + px; skPos[p + 8] = z + pz; skPos[p + 9] = x - px; skPos[p + 11] = z - pz;
          skPos[p + 1] = skPos[p + 4] = skPos[p + 7] = skPos[p + 10] = 0.016;
          for (let v = 0; v < 4; v++) { skCol[c + v * 4] = skCol[c + v * 4 + 1] = skCol[c + v * 4 + 2] = 1; skCol[c + v * 4 + 3] = a; }
          skDirty = true;
        }
      }
      st[o] = x; st[o + 1] = z; st[o + 2] = on ? 1 : 0;
    }
  }
  // sparks: the plank strikes the track over two bumps on the straights, on kerbs at speed, and in any impact
  const SPN = 260, spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN), spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  for (let i = 0; i < SPN; i++) spPos[i * 3 + 1] = -100;
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.11, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; scene.add(sparks); let spN = 0;
  const BUMPS = [560, 2640];
  function sparkCar(s, dtF) {
    let rate = 0;
    for (const b of BUMPS) if (s.s > b && s.s < b + 45 && s.speed > 68) rate = 260;
    if (s.speed > 35 && s.surf.indexOf('kerb') >= 0) rate = Math.max(rate, 90);
    if (s.impact > 2) rate = 2500;
    let n = rate * dtF; n = (n | 0) + (Math.random() < n % 1 ? 1 : 0);
    const cf = Math.cos(s.psi), sf = Math.sin(s.psi);
    while (n-- > 0) {
      const k = (spN++ % SPN) * 3, back = -1.2 - Math.random() * 1.2, side = (Math.random() - 0.5) * 1.1;
      spPos[k] = s.x + cf * back - sf * side; spPos[k + 1] = 0.05; spPos[k + 2] = s.z + sf * back + cf * side;
      spVel[k] = s.vx * 0.5 + (Math.random() - 0.5) * 5; spVel[k + 1] = 1 + Math.random() * 3.5; spVel[k + 2] = s.vz * 0.5 + (Math.random() - 0.5) * 5;
      spLife[k / 3] = 0.25 + Math.random() * 0.4;
    }
  }

  // rain: streaks in a box that travels with the camera
  const RN = 700, rainPos = new Float32Array(RN * 6), rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const rainSeed = new Float32Array(RN * 3); for (let i = 0; i < RN * 3; i++) rainSeed[i] = Math.random();
  function updateRain(now) {
    rain.visible = state.wet; if (!state.wet) return;
    const t = now / 1000, cx = camera.position.x, cz = camera.position.z, lean = clamp(sim.speed / 40, 0, 1.6); // streaks lean back as you go faster
    const fx = Math.cos(sim.psi), fz = Math.sin(sim.psi);
    for (let i = 0; i < RN; i++) {
      const o = i * 6, x = cx + (rainSeed[i * 3] - 0.5) * 44, z = cz + (rainSeed[i * 3 + 2] - 0.5) * 44, y = 14 - ((rainSeed[i * 3 + 1] * 14 + t * 22) % 14);
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      rainPos[o + 3] = x + fx * lean * 0.9; rainPos[o + 4] = y + 0.9; rainPos[o + 5] = z + fz * lean * 0.9;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ---- input ----
  const keys = new Set(), edges = [];
  let pad = { prev: [] };
  function readPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.mapping === 'standard') : null;
    if (!gp) return null;
    const b = i => gp.buttons[i] ? gp.buttons[i].value : 0;
    const pressed = i => gp.buttons[i] && gp.buttons[i].pressed;
    [[5, 'up'], [4, 'down'], [3, 'cam'], [2, 'drs'], [1, 'ot'], [9, 'pause']].forEach(([i, e]) => { if (pressed(i) && !pad.prev[i]) edges.push(e); pad.prev[i] = pressed(i); });
    let st = gp.axes[0] || 0; st = Math.abs(st) < 0.06 ? 0 : Math.sign(st) * Math.pow((Math.abs(st) - 0.06) / 0.94, 1.4);
    return { analog: true, steer: st, throttle: b(7), brake: b(6) };
  }
  const KEYMAP = { KeyE: 'up', ShiftRight: 'up', KeyQ: 'down', ControlRight: 'down', KeyC: 'cam', KeyX: 'drs', Space: 'ot', Escape: 'pause', KeyP: 'pause', KeyR: 'reset', KeyM: 'mute', KeyL: 'line', KeyG: 'ghost', KeyT: 'tel', KeyB: 'fx' };

  // ---- loop ----
  const audio = new Audio();
  const CAMS = ['CHASE', 'T-CAM', 'COCKPIT'];
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const nearCar = { rpm: 0, dist: 0, closing: 0, pan: 0 };
  const vF = new THREE.Vector3(), vC = new THREE.Vector3(), vT = new THREE.Vector3();
  let hadWheel = false;
  let fps = 60, camPsi = sim.psi, headYaw = 0, shake = 0, last = performance.now(), acc = 0, telT = 0, raf = 0, orbit = 0;
  const DT = 1 / 240;

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, pr = prFor(state.quality);
    if (Math.abs(pr - renderer.getPixelRatio()) > 0.02) renderer.setPixelRatio(pr);
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    }
  }
  // Bloom (vendor/postfx.js, optional): the scene is tone-mapped into a multisampled half-float target, so only things
  // brighter than paper white bloom: brake discs, sparks, start lights, the low sun.
  let composer = null;
  if (THREE.EffectComposer && THREE.UnrealBloomPass && renderer.capabilities.isWebGL2) {
    composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType }));
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.3, 0.93));
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    sparks.material.color.multiplyScalar(3);
  }
  // Quality steps down by itself if the frame rate is poor: 2 = bloom, 1 = no bloom and fewer pixels, 0 = also smaller shadows.
  // The drawing buffer is held to a pixel budget, not a fixed ratio: on a 4K or high-DPI screen a ratio of 1.75 meant up to 25
  // megapixels through 4x MSAA and bloom. 3.7 MP is 2560x1440.
  const PIXELS = [1.2e6, 2.2e6, 3.7e6];
  const prFor = (q) => clamp(Math.sqrt(PIXELS[q] / ((canvas.clientWidth || 1) * (canvas.clientHeight || 1))), 0.5, Math.min(window.devicePixelRatio || 1, 2));
  // Graphics mode: 'auto' (default) starts at the top level and times the menu's own frames once the car has loaded; under 48 fps it
  // steps down and times again, so a slow machine is settled about a second after loading. A software renderer goes straight to the
  // bottom. A level chosen by hand is kept and never changed.
  let slowN = 0, frameN = 0, gfxAuto = opts.quality === undefined || opts.quality === 'auto', bench = gfxAuto ? { n: 0, ms: 0 } : null;
  let gpuName = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* not exposed */ }
  function benchStep(ms) {
    if (!bench || !carReady || ms > 250 || ms <= 0) return; // hidden tab or a hitch: not a measurement
    if (++bench.n <= 20) return; // let shaders compile and the model upload first
    bench.ms += ms;
    if (bench.n < 80) return;
    const f = 60000 / bench.ms;
    if (f < 48 && state.quality > 0) { setQuality(state.quality - 1); bench = { n: 0, ms: 0 }; } else bench = null;
  }
  function setQuality(q) {
    state.quality = q = clamp(q, 0, 2);
    renderer.setPixelRatio(prFor(q));
    const size = q === 0 ? 1024 : 2048;
    for (const f of flora) { if (!f.userData.n) f.userData.n = f.count; f.count = Math.ceil(f.userData.n * (q === 0 ? 0.5 : 1)); } // half the trees on LOW
    if (sunLight.shadow.mapSize.x !== size) { sunLight.shadow.mapSize.set(size, size); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; } }
  }

  function handleEdge(e) {
    if (e === 'pause') { if (opts.controls) opts.controls.stop(); if (state.phase === 'run' || state.phase === 'lights') { state.phase = 'paused'; } else if (state.phase === 'paused') { state.phase = 'run'; state.tel = false; } else state.tel = false; return; }
    if (e === 'tel') { showTel(!state.tel); return; }
    if (e === 'ghost') { state.ghost = !state.ghost; return; }
    if (e === 'fx') { gfxAuto = false; bench = null; setQuality(state.quality === 0 ? 2 : state.quality - 1); sim.flash('GRAPHICS ' + ['LOW', 'MEDIUM', 'HIGH'][state.quality], 1.5); return; }
    if (e === 'mute') { audio.muted = !audio.muted; return; }
    if (e === 'line') { state.lineMode = (state.lineMode + 1) % LINE_MODES.length; return; }
    if (e === 'cam') { state.camMode = (state.camMode + 1) % CAMS.length; return; }
    if (state.phase !== 'run') return;
    if (e === 'up') sim.shift(1);
    else if (e === 'down') sim.shift(-1);
    else if (e === 'drs') { if (sim.inDrsZone()) sim.drsOpen = !sim.drsOpen; }
    else if (e === 'ot') { if (sim.ers > 0) sim.overtake = !sim.overtake; }
    else if (e === 'reset') {
      const tr = track, s = sim.s; sim.placeAt(s, 0); sim.idx = Math.round(s / tr.ds) % tr.N; sim.invalid = true; sim.flash('RECOVERED TO TRACK · LAP INVALID');
    }
  }

  // lap telemetry screen: opening it mid-run pauses, closing it resumes
  function showTel(on) {
    if (on && !sim.lastRec) return;
    if (on && state.phase === 'run') { state.phase = 'paused'; state.telResume = true; }
    else if (!on && state.phase === 'paused' && state.telResume) state.phase = 'run';
    if (!on || state.phase !== 'paused') state.telResume = false;
    state.tel = on;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    resize();
    if (now > last) fps += (1000 / (now - last) - fps) * 0.05;
    benchStep(now - last);
    const dtF = clamp((now - last) / 1000, 0, 0.05); last = now;
    const wheelIn = opts.controls ? opts.controls.read(edges) : null;
    if (hadWheel && !wheelIn && (state.phase === 'run' || state.phase === 'lights')) { state.phase = 'paused'; keys.clear(); }
    hadWheel = !!wheelIn;
    const padIn = wheelIn ? null : readPad();
    while (edges.length) handleEdge(edges.shift());
    const kb = {
      analog: false,
      throttle: keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0,
      brake: keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0,
      steer: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
    };
    let inp = wheelIn || kb;
    if (padIn && (Math.abs(padIn.steer) > 0.02 || padIn.throttle > 0.02 || padIn.brake > 0.02) && !kb.throttle && !kb.brake && !kb.steer) inp = padIn;

    if (state.phase === 'menu') {
      orbit += dtF * 0.12;
      sim.vx = sim.vz = 0;
    } else if (state.phase === 'lights') {
      state.lightsT += dtF;
      const n = Math.min(5, Math.floor(state.lightsT));
      state.lights = n;
      if (n === 5 && state.lightsT > 5 + state.holdT) { state.lights = 0; state.phase = 'run'; state.outAt = now; state.reaction = null; state.armed = inp.throttle < 0.3; sim.t = 0; sim.lapStart = 0; }
      // revving on the grid
      sim.thr += clamp(inp.throttle - sim.thr, -dtF * 8, dtF * 8);
      sim.rpm = lerp(sim.rpm, CAR.idle + sim.thr * 8500, Math.min(1, dtF * 6));
    } else if (state.phase === 'run') {
      if (state.reaction === null && state.armed && inp.throttle > 0.5) state.reaction = (now - state.outAt) / 1000;
      acc += dtF;
      sim.impact = 0;
      if (race) { for (const c of race.cars) c.sim.impact = 0; while (acc >= DT) { race.step(DT, inp); acc -= DT; } if (race.over) state.phase = 'finished'; }
      else while (acc >= DT) { sim.step(DT, inp); acc -= DT; }
    } else if (state.phase === 'finished' && race) { // the player has taken the flag: the rest of the field races on behind the results
      acc += dtF; sim.impact = 0;
      while (acc >= DT) { race.step(DT, inp); acc -= DT; }
    }
    if (opts.controls && (state.phase === 'paused' || state.phase === 'finished')) opts.controls.stop();
    if (opts.controls) opts.controls.feedback(sim, !!wheelIn && state.phase === 'run');
    lightMats.forEach((m, i) => m.emissiveIntensity = i < state.lights ? 3.5 : 0);

    // car transforms
    const roll = poseCar(car, wheels, sim, dtF);
    if (race && carReady && !opp.length) buildOpponents();
    for (let k = 0; k < opp.length; k++) {
      const c = race && race.cars[k];
      opp[k].group.visible = !!(c && c.ai);
      if (opp[k].group.visible) poseCar(opp[k].group, opp[k].wheels, c.sim, dtF);
    }
    updateLine();
    if (carReady && !ghost) makeGhost();
    if (ghost) {
      const gr = sim.bestRec;
      ghost.visible = !!(state.ghost && gr && !race && sim.lap >= 1 && state.phase !== 'menu');
      if (ghost.visible) {
        ghostPose(gr, sim.t - sim.lapStart, gp);
        ghost.position.set(gp.x, 0, gp.z); ghost.rotation.y = -gp.psi;
        ghostMat.opacity = clamp((Math.hypot(gp.x - sim.x, gp.z - sim.z) - 3) / 14, 0.05, 0.42); // fades out as you drive through it
      }
    }
    if (!race && sim.bestRec && sim.bestRec !== savedRec) saveBest();

    // skid marks and sparks for every car on track
    if (state.phase === 'run' || state.phase === 'finished') {
      laySkids(sim, mySk); sparkCar(sim, dtF);
      for (let k = 0; k < opp.length; k++) if (opp[k].group.visible) { laySkids(race.cars[k].sim, opp[k].sk); sparkCar(race.cars[k].sim, dtF); }
    }
    if (skDirty) { skGeo.attributes.position.needsUpdate = skGeo.attributes.color.needsUpdate = true; skDirty = false; }
    for (let i = 0; i < SPN; i++) {
      if (spLife[i] <= 0) continue;
      const k = i * 3; spLife[i] -= dtF; spVel[k + 1] -= 9.81 * dtF;
      spPos[k] += spVel[k] * dtF; spPos[k + 1] += spVel[k + 1] * dtF; spPos[k + 2] += spVel[k + 2] * dtF;
      if (spPos[k + 1] < 0.02) { spPos[k + 1] = 0.02; spVel[k + 1] *= -0.4; }
      if (spLife[i] <= 0) spPos[k + 1] = -100;
    }
    spGeo.attributes.position.needsUpdate = true;
    updateRain(now);
    // smoke from locked/spinning/sliding tyres (and, in the wet, spray off the rear wheels of every car)
    for (let i = 0; i < smokeN; i++) { if (smokeLife[i] > 0) { smokeLife[i] -= dtF; smokePos[i * 3 + 1] += dtF * 0.8; if (smokeLife[i] <= 0) smokePos[i * 3 + 1] = -100; } }
    if (state.phase === 'run' && sim.speed > 4) {
      const cf = Math.cos(sim.psi), sf = Math.sin(sim.psi);
      for (let w = 0; w < 4; w++) {
        const sliding = sim.lock[w] || sim.spin[w] || Math.abs(sim.alpha[w]) > 0.16 || sim.surf[w] === 'gravel' || sim.surf[w] === 'sand'; // loose surfaces throw up dust
        if (!sliding || Math.random() > 0.7) continue;
        const k = smokeIdx++ % smokeN;
        smokePos[k * 3] = sim.x + cf * XW[w] - sf * YW[w]; smokePos[k * 3 + 1] = 0.3; smokePos[k * 3 + 2] = sim.z + sf * XW[w] + cf * YW[w];
        smokeLife[k] = 1.4;
      }
    }
    if (state.wet && (state.phase === 'run' || state.phase === 'finished')) for (let k = -1; k < opp.length; k++) {
      const s = k < 0 ? sim : opp[k].group.visible ? race.cars[k].sim : null;
      if (!s || s.speed < 14 || Math.random() > s.speed / 60) continue;
      const cf = Math.cos(s.psi), sf = Math.sin(s.psi), w = 2 + (Math.random() < 0.5 ? 0 : 1), q = smokeIdx++ % smokeN;
      smokePos[q * 3] = s.x + cf * (XW[w] - 0.8) - sf * YW[w]; smokePos[q * 3 + 1] = 0.5; smokePos[q * 3 + 2] = s.z + sf * (XW[w] - 0.8) + cf * YW[w];
      smokeLife[q] = 0.9;
    }
    smokeGeo.attributes.position.needsUpdate = true;

    // camera
    const f = vF.set(Math.cos(sim.psi), 0, Math.sin(sim.psi));
    let fov = 62;
    shake = sim.surf.some(s => s !== 'asphalt') && sim.speed > 5 ? 0.04 : sim.speed / 95 * 0.006;
    rig.visible = false;
    mapGroup.visible = !!(state.phase === 'menu' && state.map && !state.poseCam); // a plain false: three.js draws anything whose `visible` is not exactly false
    if (mapGroup.visible) {
      const a = orbit * 1.6 + 0.9, e = mapC.e;
      camera.position.set(mapC.x + Math.cos(a) * e * 1.05, e * 0.72, mapC.z + Math.sin(a) * e * 1.05); camera.lookAt(mapC.x, 0, mapC.z);
      camera.translateX(-e * (state.mapShift || 0)); fov = 42; // shifted so the circuit sits clear of a menu on the left
    } else
    if (state.phase === 'menu' || state.poseCam) { // poseCam {a, r, h}: a fixed view around the car, for screenshots
      const pc = state.poseCam, a = pc ? sim.psi + pc.a : orbit, r = pc ? pc.r : 9;
      camPos.set(sim.x + Math.cos(a) * r, pc ? pc.h : 1.6 + Math.sin(orbit * 0.7) * 0.4, sim.z + Math.sin(a) * r);
      camera.position.copy(camPos); camera.lookAt(sim.x, 0.55, sim.z); fov = 42;
    } else {
      const mode = CAMS[state.camMode], px = car.position.x, pz = car.position.z;
      if (mode === 'CHASE') {
        camPsi += (sim.psi - camPsi) * Math.min(1, dtF * 7);
        const cfc = vC.set(Math.cos(camPsi), 0, Math.sin(camPsi));
        camPos.set(px, 2.05, pz).addScaledVector(cfc, -7.4); // fixed distance: only the yaw trails, so the car no longer pulls away at speed
        camLook.set(px, 0.9, pz).addScaledVector(f, 4);
        fov = 60 + Math.min(6, sim.speed * 0.06);
      } else if (mode === 'T-CAM') {
        camPos.set(px, 1.78, pz).addScaledVector(f, -0.55); camLook.copy(camPos).addScaledVector(f, 30); camLook.y = 0.7; fov = 66 + Math.min(8, sim.speed * 0.08);
      } else {
        // driver's eyes: the head is pushed about by the g-forces and turns into the corner
        headYaw += (clamp(sim.r * 0.3, -0.35, 0.35) - headYaw) * Math.min(1, dtF * 5);
        const side = vC.set(-f.z, 0, f.x);
        camPos.set(px, EYE[1], pz).addScaledVector(f, EYE[0] - clamp(sim.ax / G, -5, 2) * 0.008).addScaledVector(side, -clamp(sim.ay / G, -4, 4) * 0.008);
        camLook.copy(camPos).addScaledVector(f, 30 * Math.cos(headYaw)).addScaledVector(side, 30 * Math.sin(headYaw)); camLook.y = EYE[1] - 1.5; fov = 68;
      }
      rig.visible = mode === 'COCKPIT';

      camera.position.copy(camPos);
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
      camera.lookAt(camLook);
      if (mode !== 'CHASE') camera.rotateZ(-roll * 0.6);
    }
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 0.1); camera.updateProjectionMatrix(); }

    // shadow follows car
    sunLight.position.set(sim.x, 0, sim.z).addScaledVector(sunDir, 200); sunLight.target.position.set(sim.x, 0, sim.z);
    const hideBody = rig.visible && poseCockpit(dtF) && bodyMeshes;
    // only for this render: clones of `car` must never inherit it. The model's front wheels go too: only their outer halves are
    // split off, and those shells spinning over the rig's whole tyres looked like wheel arches turning with the wheels.
    if (hideBody) { for (const b of bodyMeshes) b.o.geometry = NO_GEO; for (const wh of wheels) if (wh.w < 2) wh.steer.visible = false; }
    if (composer && state.quality === 2) composer.render(); else renderer.render(scene, camera);
    if (hideBody) { for (const b of bodyMeshes) b.o.geometry = b.geo; for (const wh of wheels) wh.steer.visible = true; }
    if (gfxAuto && state.phase === 'run' && ++frameN && dtF > 1 / 40 && ++slowN > 110 && state.quality > 0) { setQuality(state.quality - 1); sim.flash('EFFECTS REDUCED FOR FRAME RATE', 2.5); frameN = slowN = 0; }
    if (frameN >= 180) frameN = slowN = 0; // 110 of 180 frames under 40 fps trips it
    let near = null;
    if (race) { // nearest rival to the camera, for its engine note
      let best = 150 * 150;
      for (const c of race.cars) {
        if (!c.ai) continue;
        const dx = c.sim.x - camera.position.x, dz = c.sim.z - camera.position.z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; nearCar.dist = Math.sqrt(d2); nearCar.rpm = c.sim.rpm; nearCar.closing = -((c.sim.vx - sim.vx) * dx + (c.sim.vz - sim.vz) * dz) / (nearCar.dist + 0.5); nearCar.pan = clamp((dz * f.x - dx * f.z) / 8, -1, 1); near = nearCar; }
      }
    }
    audio.update(sim, state.phase === 'run' || state.phase === 'lights' || state.phase === 'finished', near, CAMS[state.camMode] === 'COCKPIT');

    telT += dtF;
    if (opts.onTelemetry && telT > 1 / 15) { telT = 0; opts.onTelemetry(telemetry()); }
  }

  function telemetry() {
    const s = sim, d = s.delta();
    const L = track.L;
    const sectorState = (k) => {
      const t = k < 2 ? s.sectorTimes[k] : null;
      if (t === null) return { time: '', state: 'none' };
      const b = s.bestSectors[k];
      return { time: t.toFixed(3), state: b === null || t <= b ? (s.invalid ? 'pb' : 'best') : 'slower' };
    };
    let raceTel = null;
    if (race) {
      const lead = race.order[0];
      raceTel = {
        lap: clamp(s.lap, 1, race.laps), laps: race.laps, pos: race.player.pos, n: race.cars.length, over: race.over,
        cars: race.order.map(c => {
          const best = c.sim.lapsDone.reduce((m, l) => Math.min(m, l.time), 1e9);
          let gap = c === lead ? (c.finished ? fmtTime(c.finishT) : 'LEADER') : c.finished && lead.finished ? '+' + (c.finishT - lead.finishT).toFixed(3) : '+' + ((lead.progress - c.progress) / Math.max(c.sim.speed, 30)).toFixed(1);
          if (lead.finished && !c.finished) gap = 'ON TRACK';
          return { ...relGap(L, c.sim.s, race.player.sim.s, c.progress, race.player.progress, race.player.sim.speed), code: c.code, name: c.name, pos: c.pos, you: !c.ai, hue: c.hue, team: teamDef(c.team)[1], color: teamColor(c.team), x: c.sim.x, z: c.sim.z, gap, best: best < 1e9 ? fmtTime(best) : '' };
        }),
      };
    }
    return {
      race: raceTel, tow: s.tow, fuel: s.fuel, brakes: [Math.round((s.brakeT[0] + s.brakeT[1]) / 2), Math.round((s.brakeT[2] + s.brakeT[3]) / 2)],
      phase: state.phase, lights: state.lights, reaction: state.reaction,
      speed: Math.round(s.speed * 3.6), gear: s.gear === -1 ? 'R' : String(s.gear), rpm: Math.round(s.rpm), rpmFrac: clamp((s.rpm - 4000) / (CAR.limiter - 4000), 0, 1),
      throttle: s.thr, brake: s.brk, lap: s.lap, lapTime: fmtTime(s.t - s.lapStart), lastLap: fmtTime(s.lastLap), lastValid: s.lastValid !== false, bestLap: fmtTime(s.bestLap),
      delta: d, invalid: s.invalid, ers: s.ers / CAR.ersCap, overtake: s.overtake,
      drs: s.drsOpen ? 'open' : s.inDrsZone() ? 'avail' : 'off',
      tyres: s.tyreT.map((t, i) => ({ t: Math.round(t), wear: Math.round(s.wear[i] * 100), lock: s.lock[i] || s.spin[i] })),
      compound: (COMPOUNDS[s.setup.compound] || COMPOUNDS.soft).label,
      tc: s.tcActive, abs: s.absActive, gLat: s.ay / G, gLong: s.ax / G,
      sectors: [sectorState(0), sectorState(1), { time: '', state: 'none' }],
      lastSectors: s.lastSectors.map(t => t === null ? '' : t.toFixed(3)),
      mapX: s.x, mapZ: s.z, progress: s.s / L,
      camera: CAMS[state.camMode], message: s.messageT > 0 ? s.message : '', surface: s.surf[0],
      laps: s.lapsDone.slice(-5).reverse().map(l => ({ lap: l.lap, time: fmtTime(l.time), valid: l.valid })),
      muted: !!audio.muted, fps: Math.round(fps), fxq: state.quality, fxAuto: gfxAuto, fxBusy: !!bench, ready: carReady, map: !!state.map, tel: state.tel, ghost: state.ghost, lapsDone: s.lapsDone.length, line: LINE_MODES[state.lineMode], gearbox: s.setup.autoGear ? 'AUTO' : 'MANUAL',
    };
  }

  if (/swiftshader|llvmpipe|software/i.test(gpuName) && gfxAuto) { bench = null; setQuality(0); } else if (!gfxAuto) setQuality(+opts.quality);
  raf = requestAnimationFrame(frame);
  return {
    track, sim, CAMS, state, renderer, scene, get race() { return race; },
    fx: { skid: () => laySkids(sim, mySk), spark: (dt) => sparkCar(sim, dt) }, // for posed screenshots (test/canvas-pose.js)
    key(code, down) {
      audio.resume();
      if (down) { if (!keys.has(code) && KEYMAP[code]) edges.push(KEYMAP[code]); keys.add(code); }
      else keys.delete(code);
    },
    begin(setup) {
      audio.resume();
      audio.active = false;
      Object.assign(sim.setup, setup || {});
      state.wet = !!(setup && setup.wet); sim.setup.wet = state.wet; // rain: wet tyres go on automatically
      if (state.wet) sim.setup.compound = 'wet'; else if (sim.setup.compound === 'wet') sim.setup.compound = 'soft';
      // time-trial bests survive new runs, and are parked while a race borrows the player's car
      if (!race) tt = { bestLap: sim.bestLap, bestRec: sim.bestRec, lastRec: sim.lastRec, refRec: sim.refRec, bestSectors: sim.bestSectors, lapsDone: sim.lapsDone };
      speedProfile(track, sim.setup); computeZones();
      if (setup && setup.mode === 'race') race = new Race(track, sim, { laps: setup.laps, skill: setup.skill, team: teamId });
      else { race = null; sim.inRace = false; sim.resetSession(); Object.assign(sim, tt); }
      if (setup && setup.line) state.lineMode = Math.max(0, LINE_MODES.indexOf(String(setup.line).toUpperCase()));
      setTimeOfDay(setup && setup.time !== undefined ? setup.time : elevNow);
      if (setup && setup.ghost !== undefined) state.ghost = !!setup.ghost;
      state.tel = false; clearSkids();
      state.phase = 'lights'; state.lightsT = 0; state.lights = 0; state.holdT = 0.2 + Math.random() * 2.8; acc = 0; camPsi = sim.psi;
    },
    resume() { if (state.phase === 'paused') state.phase = 'run'; state.tel = false; },
    showTelemetry: showTel,
    // traces for the telemetry screen: the lap just finished, and the best lap as it stood before it
    lapData() { return { ds: REC_DS, L: track.L, sectors: track.sectors, last: sim.lastRec, ref: sim.refRec }; },
    clearBest() { sim.bestRec = savedRec = null; sim.bestLap = null; sim.bestSectors = [null, null, null]; try { localStorage.removeItem(STORE); } catch (e) { /* nothing stored */ } },
    pause() { if (opts.controls) opts.controls.stop(); keys.clear(); if (state.phase === 'run' || state.phase === 'lights') state.phase = 'paused'; },
    menu() { if (opts.controls) opts.controls.stop(); state.phase = 'menu'; state.tel = false; endRace(); sim.placeAt(track.L - 16, -2.5); },
    camera(i) { state.camMode = i; },
    team(id) { paintCar(id); }, // the player's car; the AI field takes the other teams at the next race
    // 'auto' or 0 / 1 / 2 (low / medium / high)
    graphics(mode) { gfxAuto = mode === 'auto'; if (gfxAuto) { setQuality(2); bench = { n: 0, ms: 0 }; } else { bench = null; setQuality(+mode); } },
    // the menu's 3D circuit map; shift moves the circuit sideways on screen (fraction of its size) to clear a menu panel
    overview(on, shift) { state.map = !!on; state.mapShift = shift || 0; },
    mute(m) { audio.muted = m; },
    destroy() { // frees the GPU side too: the UI destroys and re-creates the game to change circuit
      cancelAnimationFrame(raf); if (opts.controls) opts.controls.stop();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); } });
      mirrorRT.dispose(); dashTex.dispose();
      renderer.dispose(); if (audio.ac) audio.ac.close(); },
  };
}

const api = { TUNE, create, buildTrack, TRACKS, TEAMS, teamDef, trackDef, speedProfile, Sim, Race, collide, autopilot, ghostPose, REC_DS, fmtTime, relGap, CIRCUIT, CAR, COMPOUNDS, DEFAULT_SETUP, surfaceAt, surfaceRipple, ENGINE_ERAS, EngineAudio: Audio };
root.ApexGP = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

# Monza trackside reconstruction — 2026-11-12

Implemented in the shared engine and built into `docs/` and the Design copy. This is a reference-led visual reconstruction on the existing flat TUM/OpenStreetMap centreline, not a surveyed or laser-scanned circuit.

## References and production

- [Official F1 onboard, 2025 Monza pole lap](https://www.youtube.com/watch?v=wgZdpFRpZCs): driving sightlines, guardrails, trees, road surface and sponsorship. Inspected in Chrome; no video redistributed.
- [MSV/GB3 circuit photograph](https://www.gb-3.net/news/2024/aug/22/gb3-championship-reveals-f1focused-2025-calendar-with-monza-finale): pit frontage, roof trusses, grandstands, grid and park setting. The selected original is preserved as `source/pit-straight-msv.jpg`, with its URL and hash in `production.json`. It is a research reference, not a shipped game texture.
- [Monza circuit guide](https://www.monzanet.it/en/circuit/): circuit and corner identities.
- Monza was selected from the existing real layouts; the [2021 F1 fan survey](https://www.formula1.com/en/latest/article/new-global-fan-survey-reveals-f1s-most-popular-team-and-driver.2evqTWEPsWYeBlw9vmSyBs) places it among the favorite races. This is not a claim about a current ranking.

One Tripo Studio H3.1 text job was approved and submitted: **b4eceda4-3f49-49b2-988c-c03af6e6fd02**, Private, parts OFF, 8K OFF. Quote **30 credits**; observed wallet **23,920 → 23,890**, a **30-credit total**. No paid retries or follow-up jobs. The exact prompt, input role, settings, source hashes and browser screenshots are preserved in `production.json` and `evidence/`.

The source GLB has **48,721 triangles, 24,187 vertices and no texture images**. Studio displayed “Geometry & Texture”, but the actual export is geometry only. The local derivative is **5,999 triangles / 138,888 bytes**, roughly 15.75 m tall, with locally assigned bark/foliage vertex colours. `tools/prepare-monza-tree.py` reproduces it through Blender. `vendor/monza-tree.js` embeds that exact GLB for both front ends. Runtime diffuse leaf sprays add smaller leaf silhouettes, and an offscreen render of the same tree supplies crossed impostors for the surrounding woodland. LOW halves the instance counts. The distant impostors reuse their baked diffuse shading with a time-of-day tint. Woodland is partitioned into 180 m cells and culled beyond 900 m; source trees beyond 800 m and leaf sprays beyond 350 m are omitted. Source-mesh shadows are limited to nearby groups, and leaf sprays do not add a second shadow pass. There are 271 detailed tree instances in 16 groups on HIGH and 137 on LOW. Both graphics levels passed the browser check.

## Visible work

- Pit garages, glazed hospitality floors, roof framing, race-control block, podium canopy and tricolour panel.
- Main roofed stands and corner stands, red crowd sections, pit wall consoles and grid markings.
- Monza-specific guardrail corridor widths, mesh fencing and posts, 150/100/50 braking boards and approximate trackside sponsor panels.
- Chicane escape lanes, green kerb aprons, gravel outside Lesmo and Parabolica, the Serraglio overpass and an Ascari footbridge.
- Taller park woodland, leaf detail and a flatter, less mountainous backdrop.
- Fixed a shared ribbon winding bug that culled negative-offset kerbs and runoff from above. Wall geometry is unaffected.

## Verification

- `node test/monza-test.js`: finite corridor widths and driving clearance, gravel classification, tree face budget, upright metre scale, retained vertex colours, embedded GLB identity and matching built copies.
- `node test/sim-test.js`: PASS, all six layouts; Monza clean laps 1:25.796 / 1:24.971.
- `node test/race-test.js`: PASS, all six layouts, no recoveries.
- Browser scene check: 435 sampled vertical clearance rays across the drivable road, tree roots beyond the barriers, actual car/tree/leaf/impostor loading, and upward-facing gravel at three outside-corner samples. These are sampled checks, not proof of continuous clearance.
- Cockpit and chase poses inspected in Chrome, including pit straight, first chicane, Serraglio, Ascari and Parabolica. High effects rendered on NVIDIA RTX 3090 Ti through ANGLE. JSON and images are in `evidence/`; these are posed checks, not a frame-rate benchmark. The FPS readings during automation were unstable (the unchanged Kestrel circuit also read slowly), so they are not accepted as performance measurements.

To reproduce the browser check, serve the project root and open:
`/src/play.html?track=monza&pose=steer&s=3200&cam=2&d=0&line=off&quality=2&check=1`
Change `cam=0` for chase or `cam=1` for T-cam, and `s` for metres along the lap. Wait for PASS; a fallback forest or missing car does not count as success.

## Remaining limits

Dimensions, bridge positions, widths and sponsor placements are estimates from visual references. The existing flat centreline and nominal 13 m racing width remain; there is no surveyed elevation, banking or cross-section data. Buildings are batched exterior shapes with no interiors. Off-track collision remains the circuit barrier; decorative pit and escape-lane pavement does not add a drivable pit-lane system. The generated tree's shape remains approximate and one-species repetition is visible. Physical wheel feel and sustained frame pacing were not evaluated. No public deployment was performed.

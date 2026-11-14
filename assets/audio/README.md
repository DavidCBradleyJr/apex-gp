# Real engine recording clips

Selected 2026-11-12, V12 corrected 2026-11-13, under the user's
**free licensed recordings only** constraint.
Four real-recording excerpts are in `clips/`. These are audition/reference
clips, not finished continuous engine loops. The V12 now also has a separate
hybrid playback derivative: two short prepared loops in `src/audio/`, with
provenance, edits, limits and hashes in `runtime.json`. Rebuild them with
`python tools/prepare-v12-audio.py`, then `./build.sh`. This does not make the
other audition clips ready for game playback.

| Era | Selected sound | Recording source | License |
| --- | --- | --- | --- |
| V12 | Ferrari F93A, accelerating pass-by | [Pe, Italia a Zandvoort 2013, 0:00–0:10](https://www.youtube.com/watch?v=gpY0oKp3YC4) | YouTube Creative Commons Attribution |
| V10 | Schumacher's Ferrari F2003-GA / Ferrari 052 | [Heigh-hoo, Suzuka 2003](https://freesound.org/people/Heigh-hoo/sounds/14830/) | CC0 1.0 |
| V8 | Alonso's 2009 Renault F1 car | [LG, Rotterdam 2009](https://freesound.org/people/LG/sounds/77911/) | CC BY 4.0 |
| Hybrid V6 | Honda, Toro Rosso STR13, 2018 | [Italiansupercarvideo, Barcelona 2018, 3:11–3:19](https://www.youtube.com/watch?v=gPreTavrsiM&t=191s) | YouTube Creative Commons Attribution |

The maker choices are a curated selection, not a measured popularity ranking.
The V12 source identifies the F93A at Italia a Zandvoort 2013. It shows two
passes; the selected first pass contains rising engine harmonics, and a frame
from the second pass at 0:15 records the car's appearance. This replaces the
Imola garage excerpt, which did not provide useful revs. The Honda excerpt was
checked visually against the blue/red/silver Toro Rosso-Honda car at 3:15.
Supporting frames and the exact source license metadata are in `evidence/`.

## Credits and permitted use

Keep the following credits with any reuse, along with source links, license
information and a description of edits. Attribution does not imply endorsement.

- V12: **Pe**, *V12 Ferrari F93A @ Zandvoort*; source video linked above,
  Creative Commons Attribution.
- V10: **Heigh-hoo**, *MSchFerr.aif*, Freesound,
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- V8: **LG**, *BCR F1 Car 11.wav*, Freesound,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- V6: **Italiansupercarvideo**, collaborating with **19Bozzy92**; source video
  linked above, Creative Commons Attribution.

Both selected YouTube videos return the exact license label **Creative Commons
Attribution license (reuse allowed)** in their metadata. The V6 description
claims first-hand filming and credits collaborators. The V12 is continuous
amateur spectator-camera footage with no broadcast watermark or third-party
credit; direct confirmation of authorship from its uploader has not been
obtained. YouTube's
[license documentation](https://support.google.com/youtube/answer/2797468?hl=en)
explains reuse with attribution and links to
[CC BY](https://creativecommons.org/licenses/by/4.0/). The source's license link
is preserved as <https://www.youtube.com/t/creative_commons> rather than guessing
a historical license version from its 2018 upload date.

`sources.json` records titles, authors, source URLs, exact excerpt times, edits,
hashes and technical metadata. YouTube audio streams are preserved without
re-encoding in `sources/`, including the superseded Imola source; Freesound preview
downloads are preserved under `research/`. V10/V8 original lossless uploads
require a Freesound login; their downloaded public MP3 previews are explicitly
identified as such. Decoding them to WAV does not restore lost detail.

## Processing and verification

The excerpts were mixed to mono, resampled to 48 kHz PCM16, peak normalized to
-6 dBFS and given 25 ms edge fades. No synthesized audio, pitch shifting or
source separation was added. All four files decode successfully; durations,
finite samples, peak levels and SHA-256 hashes were checked.

The V12 now contains an acceleration pass-by, with crowd and track ambience.
The trackside clips contain changes in distance, gear and Doppler. For new game integrations,
qualify stable segments, measure pitch/RPM, prepare seamless loops or grains,
remove unwanted ambience where practical, and verify load/gear transitions by
listening. Do not simply repeat a pass-by under the accelerator. Preserve a
nonblocking synthetic fallback while sample loading/decoding is implemented.

## Covering the rev range

None of these excerpts establishes complete idle-to-redline coverage. The V12
has no tachometer or calibrated RPM, and a rising trackside pitch also contains
Doppler. A full acceleration sweep is a useful source to edit, not an engine
loop that can be played at a fixed point for each RPM without preparation.

The intended game treatment is overlapping idle/low/mid/high/near-redline
sample bands, each looped cleanly, with modest pitch adjustment within each
band and smooth crossfades driven by engine RPM. Separate on-throttle and
off-throttle recordings preserve the change in engine tone under load; shifts,
blips and the limiter follow the simulation. Stationary or onboard recordings
are preferable because their pitch is not distorted by a passing car's motion.
Exact band RPMs must be measured or supported by recording metadata before
claiming coverage. Until suitable free licensed bands are found and qualified,
retain synthesis for missing ranges and describe the result as a hybrid. The
first V12 implementation follows that approach: samples fade in over roughly
8,500–10,500 audible RPM under throttle, crossfade between apparent 11,000 and
14,000 RPM bands, and fade out on coasting. Both share the simulation's shifts,
blips, limiter, mute and pause envelope. Failed loading preserves synthesis.

The older `research/` candidates document the initial search and rejected
leads. The unidentified V12 and Montreal clips are **not** selected or included
in the final audition archive. `f1-era-clips.zip` contains only the four selected
clips, this attribution file, source metadata and identification/license
evidence for the current audition selection. It excludes playback derivatives,
which have separate runtime metadata and shipped credits. No purchase or
recorder outreach was performed.

# Real F1 audio source candidates

Initial search candidates only. The subsequent four-maker selection, including
verified-license Ferrari V12 and Honda V6 excerpts, is documented in
`../README.md` and `../sources.json`. The unresolved candidates below were not
included in the final audition archive.

Checked 2026-11-12. User constraint: **free licensed recordings only**.

These are recordings obtained for evaluation, not game-ready engine loops. None
has been integrated, committed or published. `sources.json` records the exact
download URLs, SHA-256 hashes, audio formats, license links and qualification
status. The files are Freesound's public compressed previews; original lossless
uploads require a Freesound login. Downloaded preview bytes are unchanged.

| Candidate | Identity evidence | License | Qualification |
| --- | --- | --- | --- |
| Ferrari F2003-GA / Ferrari 052 V10 | Recordist identifies Schumacher, Suzuka, 2003 | CC0 1.0 | Identified real-car pass-by; suitable for further editing experiments |
| Renault V8, Alonso's 2009 car | Recordist identifies driver/car and Rotterdam recording date | CC BY 4.0 | Identified real-car acceleration/pass-by; credit required |
| Montreal F1 recording | Location given; capture date and car omitted | CC BY 4.0 | Era and manufacturer unverified; do not claim Honda or hybrid V6 |
| Uploader-labeled Formula One V12 | No car, recording date or recording setup given | Sampling+ 1.0 | Manufacturer and recording provenance unverified; not cleared for integration |

Preferred sound targets are Ferrari's 1990s V12, Ferrari's early-2000s V10,
Renault's V8, and Honda's hybrid V6. These are curatorial choices, not a measured
popularity ranking. Only the V10 and V8 have qualifying maker-identified free
recordings in this collection. A public-domain Honda V10 alternative was also
verified at <https://freesound.org/people/Heigh-hoo/sounds/14832/>; it is a 2003
Honda RA003E, **not** a modern Honda hybrid.

## Attribution and terms

- **MSchFerr.aif**, Heigh-hoo: <https://freesound.org/people/Heigh-hoo/sounds/14830/>.
  CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>.
- **BCR F1 Car 11.wav**, LG: <https://freesound.org/people/LG/sounds/77911/>.
  CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/>. Credit the creator,
  link the source and license, and disclose future edits.
- **Formula F1 Racing.wav**, monkeyman535:
  <https://freesound.org/people/monkeyman535/sounds/400130/>.
  CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/>. Same credit and
  modification disclosure requirements.
- **V12 Formula One Engine.mp3**, monsteruno:
  <https://freesound.org/people/monsteruno/sounds/67893/>.
  Sampling+ 1.0: <https://creativecommons.org/licenses/sampling+/1.0/>. This
  retired license allows creative sampling, and distribution of the whole work
  for noncommercial purposes, with attribution and promotion restrictions.
  This unmodified candidate is kept for noncommercial evaluation only. Do not
  treat it as CC0, relabel it as a specific Ferrari, or publish it as a game
  asset without resolving identity/provenance and the intended reuse terms.

## Rejected or unresolved sources

- The superseded Imola V12 garage excerpt at 2:04–2:14 in
  <https://www.youtube.com/watch?v=pi8uy9qOrfs> did not provide useful revs.
  Original audio and evidence remain preserved, but it is no longer the
  selected audition. The red closed-wheel car around 5:11 is a sports
  prototype, not an F1 car; do not substitute its sound for the F1 V12.
  The current F93A acceleration audition and its limitations are documented
  in `../README.md` and `../sources.json`.
- <https://www.youtube.com/watch?v=_W1nSELW0qc> has a V12 title and a CC flag,
  but its description discusses Need for Speed Heat and crashes with traction
  control off. Rejected as a real-car recording; no media downloaded.
- <https://www.youtube.com/watch?v=7PFwP75oysU> is CC-flagged but credits a
  third-party Facebook video. Original-owner permission is unresolved;
  no media downloaded.
- <https://www.youtube.com/watch?v=4tm11SQv41w> identifies a 2021 Honda/AlphaTauri
  pit-stop recording and is marked Creative Commons on YouTube. Its description
  explicitly says the footage came from AlphaTauri's Twitter account. The
  re-uploader's license flag does not establish permission from the original
  owner; no media downloaded.
- <https://www.youtube.com/watch?v=UN8722tmInw> is marked Creative Commons but
  explicitly disclaims ownership of the racing footage. Rejected for game
  reuse; no media downloaded.
- <https://freesound.org/people/LordFluffeh/sounds/478546/> is CC0 but describes
  racing at Brands Hatch without identifying cars or a capture date. Its 2019
  upload date does not establish a current hybrid engine.
- <https://freesound.org/people/djbono/sounds/18771/> is a Ferrari 456 road car
  recorded up to 6,200 rpm, not an F1 V12.
- <https://www.fab.com/listings/4fe4f1d8-fb85-4452-8f5f-b43b6a471d02> describes
  most clips as generative sound design, so it does not fulfill real recordings.
- <https://pole.se/product/f1-williams-fw29-2007/> is a genuine multi-perspective,
  multi-RPM recording library but costs $449, outside the free-only constraint.

## Playback suitability and checks

All four MP3 files decode successfully with FFmpeg. Durations and channels match
the source descriptions. These checks establish valid files, not listening
quality or suitability as a continuous engine.

The identified clips are trackside pass-bys with changing distance and Doppler.
They cannot simply be repeated under the accelerator: loop preparation needs
clean, stable segments, measured pitch, smooth boundaries, and testing at varying
RPM/load. Ambient voices, baked-in gear shifts and compression must be evaluated.
The V12 original is only 22.05 kHz/56 kbps mono; the higher-bitrate preview does
not restore missing detail. The live synthesizer remains in place.

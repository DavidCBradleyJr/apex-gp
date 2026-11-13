#!/usr/bin/env python3
"""Build the two small V12 playback loops from the preserved licensed recording."""
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio/sources/gpY0oKp3YC4.mka'
OUT = ROOT / 'src/audio'
RATE = 48000


def main():
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(SOURCE), '-ac', '1', '-ar', str(RATE),
        '-af', 'highpass=f=240,lowpass=f=8500', '-f', 'f32le', '-',
    ])
    samples = array.array('f', raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    OUT.mkdir(exist_ok=True)
    loops = []
    for name, start, end, rpm in [('mid', 2.65, 2.95, 11000), ('high', 3.75, 4.01, 14000)]:
        # Apparent bank pitch fitted to the rising harmonics; these are not tachometer RPMs.
        slope, initial = 147, 117 + 147 * start
        cycles, overlap_cycles = 128, 16
        n = round(cycles * RATE / (rpm / 20))
        overlap = round(overlap_cycles * n / cycles)
        hz = cycles * RATE / n
        flattened = []
        for i in range(n + overlap):
            elapsed = 2 * hz * i / RATE / (initial + math.sqrt(initial**2 + 2 * slope * hz * i / RATE))
            assert start + elapsed < end, 'source segment exhausted'
            position = (start + elapsed) * RATE
            k = int(position)
            flattened.append(samples[k] + (samples[k + 1] - samples[k]) * (position - k))
        loop = flattened[:n]
        for i in range(overlap):
            weight = 0.5 - 0.5 * math.cos(math.pi * i / (overlap - 1))
            loop[i] = flattened[n + i] * (1 - weight) + loop[i] * weight
        mean = sum(loop) / n
        loop = [v - mean for v in loop]
        gain = 0.8 / max(abs(v) for v in loop)
        pcm = array.array('h', (round(v * gain * 32767) for v in loop))
        rms = math.sqrt(sum(v * v for v in pcm) / n) / 32768
        diff_rms = math.sqrt(sum((pcm[i] - pcm[i - 1])**2 for i in range(1, n)) / (n - 1))
        seam = abs(pcm[0] - pcm[-1])
        assert 0.1 < rms < 0.6 and seam < 4 * diff_rms
        if sys.byteorder != 'little':
            pcm.byteswap()
        path = OUT / f'v12-{name}.wav'
        with wave.open(str(path), 'wb') as wav:
            wav.setparams((1, 2, RATE, n, 'NONE', 'not compressed'))
            wav.writeframes(pcm.tobytes())
        loops.append({
            'file': str(path.relative_to(ROOT)), 'referenceRpm': rpm,
            'sourceStartSeconds': start, 'sourceEndSeconds': end,
            'durationSeconds': n / RATE, 'bankHz': hz, 'rms': rms,
            'seamStep': seam / 32768, 'differenceRms': diff_rms / 32768,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        })
    manifest = {
        'source': 'https://www.youtube.com/watch?v=gpY0oKp3YC4', 'creator': 'Pe',
        'license': 'Creative Commons Attribution (YouTube)',
        'licenseUrl': 'https://www.youtube.com/t/creative_commons',
        'sourceAudioSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'changes': 'Mono 48 kHz; 240 Hz high-pass/8500 Hz low-pass; resampled to stabilize rising bank pitch; 128-cycle loops with 16-cycle seam crossfades; DC removed; peak normalized to 0.8; PCM16.',
        'limit': 'Apparent RPM inferred from bank harmonics includes Doppler. No tachometer calibration, isolated intake/exhaust, idle or off-throttle recording. Game uses synthesis below the sampled range and when coasting.',
        'loops': loops,
    }
    (ROOT / 'assets/audio/runtime.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(loops, indent=2))


if __name__ == '__main__':
    main()

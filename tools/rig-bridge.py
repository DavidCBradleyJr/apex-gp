#!/usr/bin/env python3
"""Serve Apex GP with SDL2 wheel input and directional force feedback (Linux/Windows)."""
import argparse
import ctypes as C
import ctypes.util
import json
import math
from pathlib import Path
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = Path(__file__).resolve().parents[1] / 'docs'


class Direction(C.Structure):
    _fields_ = [('type', C.c_uint8), ('dir', C.c_int32 * 3)]


class Constant(C.Structure):
    _fields_ = [('type', C.c_uint16), ('direction', Direction), ('length', C.c_uint32),
                ('delay', C.c_uint16), ('button', C.c_uint16), ('interval', C.c_uint16),
                ('level', C.c_int16), ('attack_length', C.c_uint16), ('attack_level', C.c_uint16),
                ('fade_length', C.c_uint16), ('fade_level', C.c_uint16)]


class Condition(C.Structure):
    _fields_ = [('type', C.c_uint16), ('direction', Direction), ('length', C.c_uint32),
                ('delay', C.c_uint16), ('button', C.c_uint16), ('interval', C.c_uint16),
                ('right_sat', C.c_uint16 * 3), ('left_sat', C.c_uint16 * 3),
                ('right_coeff', C.c_int16 * 3), ('left_coeff', C.c_int16 * 3),
                ('deadband', C.c_uint16 * 3), ('center', C.c_int16 * 3)]


class Effect(C.Union):
    # SDL copies its complete effect union, including unused fields. Reserve aligned storage.
    _fields_ = [('constant', Constant), ('condition', Condition), ('storage', C.c_uint8 * 128), ('alignment', C.c_void_p)]


class SDL:
    def __init__(self, library=None):
        library = library or ctypes.util.find_library('SDL2') or str(Path(__file__).with_name('SDL2.dll'))
        self.lib = C.CDLL(library)
        signatures = {
            'Init': (C.c_int, [C.c_uint32]), 'Quit': (None, []), 'GetError': (C.c_char_p, []),
            'SetHint': (C.c_int, [C.c_char_p, C.c_char_p]), 'PumpEvents': (None, []),
            'JoystickUpdate': (None, []), 'NumJoysticks': (C.c_int, []),
            'JoystickGetDeviceInstanceID': (C.c_int32, [C.c_int]),
            'JoystickOpen': (C.c_void_p, [C.c_int]), 'JoystickClose': (None, [C.c_void_p]),
            'JoystickName': (C.c_char_p, [C.c_void_p]),
            'JoystickGetVendor': (C.c_uint16, [C.c_void_p]), 'JoystickGetProduct': (C.c_uint16, [C.c_void_p]),
            'JoystickNumAxes': (C.c_int, [C.c_void_p]), 'JoystickNumButtons': (C.c_int, [C.c_void_p]),
            'JoystickGetAxis': (C.c_int16, [C.c_void_p, C.c_int]),
            'JoystickGetButton': (C.c_uint8, [C.c_void_p, C.c_int]),
            'JoystickIsHaptic': (C.c_int, [C.c_void_p]),
            'HapticOpenFromJoystick': (C.c_void_p, [C.c_void_p]),
            'HapticQuery': (C.c_uint, [C.c_void_p]), 'HapticClose': (None, [C.c_void_p]),
            'HapticSetAutocenter': (C.c_int, [C.c_void_p, C.c_int]),
            'HapticNewEffect': (C.c_int, [C.c_void_p, C.POINTER(Effect)]),
            'HapticUpdateEffect': (C.c_int, [C.c_void_p, C.c_int, C.POINTER(Effect)]),
            'HapticRunEffect': (C.c_int, [C.c_void_p, C.c_int, C.c_uint32]),
            'HapticStopEffect': (C.c_int, [C.c_void_p, C.c_int]),
            'HapticDestroyEffect': (None, [C.c_void_p, C.c_int]),
        }
        for name, (result, args) in signatures.items():
            fn = getattr(self.lib, 'SDL_' + name)
            fn.restype, fn.argtypes = result, args
            setattr(self, name, fn)
        self.SetHint(b'SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS', b'1')
        if self.Init(0x200 | 0x1000) != 0:
            raise RuntimeError(self.GetError().decode())


class Rig:
    def __init__(self, sdl, max_force=1):
        self.sdl, self.max_force = sdl, max_force
        self.devices = {}
        self.error = ''
        self.target = None
        self.deadline = 0

    def stop(self):
        for d in self.devices.values():
            for effect in d['effects'].values():
                self.sdl.HapticStopEffect(d['haptic'], effect)
        self.target = None
        self.deadline = 0

    def close_device(self, d):
        if d['haptic']:
            for effect in d['effects'].values():
                self.sdl.HapticStopEffect(d['haptic'], effect)
                self.sdl.HapticDestroyEffect(d['haptic'], effect)
            self.sdl.HapticClose(d['haptic'])
        self.sdl.JoystickClose(d['joy'])

    def tick(self):
        s = self.sdl
        s.PumpEvents()
        s.JoystickUpdate()
        ids = {s.JoystickGetDeviceInstanceID(i): i for i in range(s.NumJoysticks())}
        for ident in list(self.devices):
            if ident not in ids:
                self.stop()
                self.close_device(self.devices.pop(ident))
        for ident, index in ids.items():
            if ident < 0 or ident in self.devices:
                continue
            joy = s.JoystickOpen(index)
            if not joy:
                continue
            name = (s.JoystickName(joy) or b'Controller').decode(errors='replace')
            haptic = s.HapticOpenFromJoystick(joy) if s.JoystickIsHaptic(joy) else None
            capabilities = s.HapticQuery(haptic) if haptic else 0
            self.devices[ident] = dict(joy=joy, haptic=haptic, effects={}, levels={}, capabilities=capabilities, ffb=bool(capabilities & 1), name=name,
                                      key=f'sdl:{s.JoystickGetVendor(joy):04x}:{s.JoystickGetProduct(joy):04x}:{name}')
        if self.target is not None and time.monotonic() > self.deadline:
            self.stop()

    def snapshot(self):
        s = self.sdl
        result = []
        occurrences = {}
        for ident, d in self.devices.items():
            key = d['key']
            n = occurrences.get(key, 0)
            occurrences[key] = n + 1
            result.append(dict(id=ident, key=f'{key}:{n}', name=d['name'], ffb=d['ffb'],
                               damping=bool(d['ffb'] and d['capabilities'] & 256), friction=bool(d['ffb'] and d['capabilities'] & 1024),
                               axes=[max(-1, s.JoystickGetAxis(d['joy'], i) / 32767) for i in range(s.JoystickNumAxes(d['joy']))],
                               buttons=[s.JoystickGetButton(d['joy'], i) for i in range(s.JoystickNumButtons(d['joy']))]))
        return dict(devices=result, error=self.error, maxForce=self.max_force, feedbackVersion=2)

    def command(self, msg):
        force = msg.get('force', 0)
        ident = msg.get('device')
        values = dict(force=force, outputLimit=msg.get('outputLimit', .2), damping=msg.get('damping', 0), friction=msg.get('friction', 0))
        for key, value in values.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                self.stop()
                raise ValueError(f'{key} must be finite')
        limit = max(0, min(self.max_force, values['outputLimit']))
        damping, friction = (max(0, min(1, values[key])) for key in ('damping', 'friction'))
        force = max(-1, min(1, force))
        if msg.get('active') is not True or limit == 0 or not (force or damping or friction):
            self.stop()
            return
        if not isinstance(ident, int) or isinstance(ident, bool):
            self.stop()
            raise ValueError('device must be an integer')
        d = self.devices.get(ident)
        if not d or not d['ffb']:
            self.stop()
            raise ValueError('Selected device has no constant-force FFB')
        if (damping and not d['capabilities'] & 256) or (friction and not d['capabilities'] & 1024):
            self.stop()
            raise ValueError('Selected device does not support requested damping/friction')
        if self.target != ident:
            self.stop()
        s = self.sdl
        # Match the browser's shared worst-case torque budget, including condition saturation.
        scale = limit / (1 + damping + friction)
        if any(d['levels'].get(kind, 0) != level for kind, level in ((256, damping * scale), (1024, friction * scale))):
            self.stop()  # Stop the old budget before configuring a different mix of effects.
        for kind, level in ((1, force * scale), (256, damping * scale), (1024, friction * scale)):
            effect_id = d['effects'].get(kind)
            if level == 0:
                if effect_id is not None:
                    s.HapticStopEffect(d['haptic'], effect_id)
                d['levels'][kind] = 0
                continue
            effect = Effect()
            if kind == 1:
                effect.constant.type = 1  # SDL_HAPTIC_CONSTANT, not controller rumble
                effect.constant.direction.type = 1  # SDL_HAPTIC_CARTESIAN
                effect.constant.direction.dir[0] = 1
                effect.constant.length = 120
                effect.constant.level = math.trunc(level * 32767)
            else:
                effect.condition.type = kind
                effect.condition.length = 120
                effect.condition.right_coeff[0] = effect.condition.left_coeff[0] = math.trunc(level * 32767)
                effect.condition.right_sat[0] = effect.condition.left_sat[0] = math.trunc(level * 65535)
            ok = True
            if effect_id is None:
                if not d['effects']:
                    s.HapticSetAutocenter(d['haptic'], 0)
                effect_id = s.HapticNewEffect(d['haptic'], C.byref(effect))
                ok = effect_id >= 0
                if ok:
                    d['effects'][kind] = effect_id
            elif kind == 1 or d['levels'].get(kind) != level:
                ok = s.HapticUpdateEffect(d['haptic'], effect_id, C.byref(effect)) == 0
            if not ok or s.HapticRunEffect(d['haptic'], effect_id, 1) != 0:
                self.error = (s.GetError() or b'FFB effect failed').decode(errors='replace')
                self.stop()
                d['ffb'] = False
                raise ValueError(self.error)
            d['levels'][kind] = level
        self.error = ''
        self.target, self.deadline = ident, time.monotonic() + 0.12

    def close(self):
        self.stop()
        for d in self.devices.values():
            self.close_device(d)
        self.devices.clear()
        self.sdl.Quit()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed(self, post=False):
        port = self.server.server_port
        origins = {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}
        # Exact Host and Origin checks prevent DNS rebinding and cross-site hardware commands.
        return (self.headers.get('Host') in {f'127.0.0.1:{port}', f'localhost:{port}'}
                and (self.headers.get('Origin') in origins if post else self.headers.get('Origin') in origins | {None}))

    def do_GET(self):
        if not self.allowed():
            self.send_error(403)
        elif self.path == '/api/rig':
            self.reply(self.server.rig.snapshot())
        else:
            super().do_GET()

    def do_POST(self):
        try:
            if not self.allowed(True) or self.path != '/api/rig' or self.headers.get('Content-Type') != 'application/json':
                self.send_error(403)
                return
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 1024:
                raise ValueError('Invalid request size')
            msg = json.loads(self.rfile.read(size))
            if not isinstance(msg, dict):
                raise ValueError('Expected object')
            self.server.rig.command(msg)
            self.reply(self.server.rig.snapshot())
        except (ValueError, TypeError) as exc:
            self.server.rig.stop()
            self.reply({'error': str(exc)}, 400)

    def reply(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class Server(HTTPServer):
    def get_request(self):
        sock, address = super().get_request()
        sock.settimeout(0.1)  # slow clients cannot keep renewing an effect or block the watchdog
        return sock, address


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--sdl', help='Path to SDL2 shared library / SDL2.dll')
    args = parser.parse_args()
    try:
        rig = Rig(SDL(args.sdl))
    except (OSError, AttributeError, RuntimeError) as exc:
        parser.exit(1, f'SDL2 unavailable: {exc}\nSee README.md for wheel-bridge setup.\n')
    try:
        with Server(('127.0.0.1', args.port), Handler) as server:
            server.rig = rig
            server.timeout = 0.004
            print(f'Wheel bridge: http://127.0.0.1:{args.port} — adjustable FFB limit (20% default); Ctrl+C to stop.', flush=True)
            while True:
                rig.tick()
                server.handle_request()
    except KeyboardInterrupt:
        pass
    finally:
        rig.close()


if __name__ == '__main__':
    main()

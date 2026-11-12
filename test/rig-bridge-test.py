"""Run: python3 test/rig-bridge-test.py. Uses fake hardware; never sends physical forces."""
import ctypes as C
import importlib.util
from pathlib import Path
import time
import unittest

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'tools/rig-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class FakeSDL:
    def __init__(self):
        self.calls = []
        self.ids = [1]
        self.fail = False
    def __getattr__(self, name):
        def call(*args):
            self.calls.append((name, args))
            return {'NumJoysticks': len(self.ids), 'JoystickGetDeviceInstanceID': self.ids[0] if self.ids else -1,
                    'JoystickOpen': 10, 'JoystickName': b'MOZA R9', 'JoystickIsHaptic': 1,
                    'HapticOpenFromJoystick': 20, 'HapticQuery': 1, 'JoystickNumAxes': 1,
                    'JoystickNumButtons': 2, 'GetError': b'driver error'}.get(name, -1 if self.fail and name == 'HapticRunEffect' else 0)
        return call
    def HapticUpdateEffect(self, _, ident, effect):
        return self.HapticNewEffect(_, effect)
    def HapticNewEffect(self, _, effect):
        self.effect = C.cast(effect, C.POINTER(bridge.Effect)).contents.constant
        # Copy because the temporary argument is freed after command returns.
        self.level, self.length = self.effect.level, self.effect.length
        return 0


class Tests(unittest.TestCase):
    def setUp(self):
        self.sdl = FakeSDL()
        self.rig = bridge.Rig(self.sdl)
        self.rig.tick()
    def command(self, force=1):
        self.rig.command(dict(device=1, force=force, active=True))
    def test_detection_and_force(self):
        self.assertEqual(self.rig.snapshot()['devices'][0]['name'], 'MOZA R9')
        self.command()
        self.assertEqual(self.sdl.length, 120)
        self.assertEqual(self.sdl.level, round(32767 * .2))
        self.command(-10)
        self.assertEqual(self.sdl.level, -round(32767 * .2))
        self.rig.deadline = time.monotonic() - 1
        self.rig.tick()
        self.assertIsNone(self.rig.target)
        self.assertIn('HapticStopEffect', [c[0] for c in self.sdl.calls])
    def test_nonfinite_and_disarm(self):
        for force in [float('nan'), float('inf'), '1', True]:
            with self.assertRaises(ValueError): self.rig.command(dict(device=1, force=force, active=True))
        self.command()
        self.rig.command(dict(active=False))
        self.assertIsNone(self.rig.target)
    def test_hot_unplug(self):
        self.command()
        self.sdl.ids = []
        self.rig.tick()
        self.assertEqual(self.rig.snapshot()['devices'], [])
        self.assertIsNone(self.rig.target)
        self.assertIn('HapticDestroyEffect', [c[0] for c in self.sdl.calls])
    def test_driver_failure(self):
        self.sdl.fail = True
        with self.assertRaises(ValueError): self.command()
        self.assertFalse(self.rig.snapshot()['devices'][0]['ffb'])
        self.assertEqual(self.rig.error, 'driver error')
    def test_host_origin(self):
        h = object.__new__(bridge.Handler)
        h.server = type('Server', (), {'server_port': 8766})()
        h.headers = {'Host': '127.0.0.1:8766', 'Origin': 'http://127.0.0.1:8766'}
        self.assertTrue(h.allowed(True))
        h.headers['Origin'] = 'https://evil.example'
        self.assertFalse(h.allowed(True))
        del h.headers['Origin']
        self.assertFalse(h.allowed(True))
        h.headers['Host'] = 'evil.example:8766'
        self.assertFalse(h.allowed())


if __name__ == '__main__':
    unittest.main()

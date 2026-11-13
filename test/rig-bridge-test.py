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
        self.capabilities = 1
        self.effects = {}
    def __getattr__(self, name):
        def call(*args):
            self.calls.append((name, args))
            return {'NumJoysticks': len(self.ids), 'JoystickGetDeviceInstanceID': self.ids[0] if self.ids else -1,
                    'JoystickOpen': 10, 'JoystickName': b'MOZA R9', 'JoystickIsHaptic': 1,
                    'HapticOpenFromJoystick': 20, 'HapticQuery': self.capabilities, 'JoystickNumAxes': 1,
                    'JoystickNumButtons': 2, 'GetError': b'driver error'}.get(name, -1 if self.fail and name == 'HapticRunEffect' else 0)
        return call
    def HapticUpdateEffect(self, _, ident, effect):
        self.calls.append(('HapticUpdateEffect', (_, ident)))
        self.capture(ident, effect)
        return 0
    def HapticNewEffect(self, _, effect):
        ident = len(self.effects)
        self.calls.append(('HapticNewEffect', (_, ident)))
        self.capture(ident, effect)
        return ident
    def capture(self, ident, effect):
        copy = bridge.Effect.from_buffer_copy(C.string_at(effect, C.sizeof(bridge.Effect)))
        self.effects[ident] = copy
        if copy.constant.type == 1:
            self.level, self.length = copy.constant.level, copy.constant.length


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
        self.assertEqual(self.sdl.level, -round(32767 * .2))
        self.command(-10)
        self.assertEqual(self.sdl.level, round(32767 * .2))
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
    def test_restoring_direction(self):
        for steer in (-.02, .02):
            self.command(-steer)
            effect = self.sdl.effects[0].constant
            self.assertEqual(effect.direction.type, 1)
            self.assertEqual(list(effect.direction.dir), [1, 0, 0])
            physical_torque = -effect.level  # SDL direction denotes where force comes FROM.
            self.assertLess(physical_torque * steer, 0)
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
    def test_conditions_and_shared_budget(self):
        self.rig.close()
        self.sdl.capabilities = 1 | 256 | 1024
        self.sdl.effects = {}
        self.rig = bridge.Rig(self.sdl)
        self.rig.tick()
        snapshot = self.rig.snapshot()
        self.assertEqual(snapshot['feedbackVersion'], 2)
        self.assertTrue(snapshot['devices'][0]['damping'])
        self.assertTrue(snapshot['devices'][0]['friction'])
        self.rig.command(dict(device=1, force=1, outputLimit=.8, damping=.2, friction=.1, active=True))
        effects = {effect.constant.type: effect for effect in self.sdl.effects.values()}
        self.assertEqual(set(effects), {1, 256, 1024})
        ceiling = abs(effects[1].constant.level) / 32767
        for kind, amount in ((256, .2), (1024, .1)):
            effect = effects[kind].condition
            self.assertEqual(effect.length, 120)
            self.assertEqual(effect.right_coeff[0], int(amount * .8 / 1.3 * 32767))
            self.assertEqual(effect.right_coeff[0], effect.left_coeff[0])
            self.assertEqual(effect.right_sat[0], effect.left_sat[0])
            self.assertEqual(list(effect.right_coeff)[1:], [0, 0])
            ceiling += effect.right_sat[0] / 65535
        self.assertLessEqual(ceiling, .8)
        start = len(self.sdl.calls)
        self.rig.command(dict(device=1, force=0, outputLimit=.8, damping=.1, active=True))
        calls = self.sdl.calls[start:]
        first_run = next(i for i, (name, _) in enumerate(calls) if name == 'HapticRunEffect')
        self.assertEqual({args[1] for name, args in calls[:first_run] if name == 'HapticStopEffect'}, {0, 1, 2})
        self.assertEqual(self.rig.target, 1, 'damping stays active at zero steering torque')
        self.assertEqual(self.rig.devices[1]['levels'][1024], 0, 'disabled friction must leave the cached budget')
        self.rig.deadline = time.monotonic() - 1
        self.rig.tick()
        self.assertIsNone(self.rig.target)
        self.rig.close()
        self.assertEqual({args[1] for name, args in self.sdl.calls if name == 'HapticDestroyEffect'}, {0, 1, 2})
    def test_validation_and_unsupported_conditions(self):
        for key in ('outputLimit', 'damping', 'friction'):
            for bad in (float('nan'), float('inf'), '1', True):
                with self.assertRaises(ValueError):
                    self.rig.command(dict(device=1, force=1, active=True, **{key: bad}))
                self.assertIsNone(self.rig.target)
        with self.assertRaisesRegex(ValueError, 'does not support'):
            self.rig.command(dict(device=1, force=0, damping=.2, active=True))
        self.rig.command(dict(device=1, force=10, outputLimit=10, active=True))
        self.assertEqual(self.sdl.level, -32767)
        self.rig.command(dict(device=1, force=1, outputLimit=0, active=True))
        self.assertIsNone(self.rig.target)
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

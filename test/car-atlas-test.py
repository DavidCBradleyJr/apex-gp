"""Check atlas UV orientation, per-part colours and preserved geometry."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location('atlas_car', Path(__file__).resolve().parents[1] / 'tools/atlas-car.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def read_glb(data):
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length]), data[28 + length:]


class AtlasTest(unittest.TestCase):
    def test_colours_and_geometry(self):
        binary, views = bytearray(), []

        def add(data):
            binary.extend(b'\0' * (-len(binary) % 4))
            views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
            binary.extend(data)
            return len(views) - 1

        positions = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
        add(positions)
        add(struct.pack('<6f', .25, .25, .75, .25, .25, .75))
        add(struct.pack('<6f', .25, .25, .75, .25, .25, .75))
        add(struct.pack('<3H', 0, 1, 2))
        for colours in [((230, 15, 15), (15, 15, 230)), ((15, 230, 15), (230, 230, 15))]:
            image = Image.new('RGB', (64, 64), colours[0])
            image.paste(colours[1], (0, 32, 64, 64))
            png = io.BytesIO()
            image.save(png, format='PNG')
            add(png.getvalue())
        doc = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
               'buffers': [{'byteLength': len(binary)}], 'bufferViews': views,
               'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
                             {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'},
                             {'bufferView': 2, 'componentType': 5126, 'count': 3, 'type': 'VEC2'},
                             {'bufferView': 3, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'}],
               'images': [{'bufferView': 4, 'mimeType': 'image/png'}, {'bufferView': 5, 'mimeType': 'image/png'}],
               'textures': [{'source': 0}, {'source': 1}],
               'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': i}, 'roughnessFactor': .9}} for i in range(2)],
               'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': i + 1}, 'indices': 3, 'material': i} for i in range(2)]}]}

        def encode(value):
            j = json.dumps(value).encode()
            j += b' ' * (-len(j) % 4)
            b = binary + b'\0' * (-len(binary) % 4)
            return (struct.pack('<III', 0x46546C67, 2, 28 + len(j) + len(b))
                    + struct.pack('<II', len(j), 0x4E4F534A) + j
                    + struct.pack('<II', len(b), 0x004E4942) + b)

        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'source.glb', Path(directory) / 'atlas.glb'
            source.write_bytes(encode(doc))
            original = source.read_bytes()
            module.atlas_car(source, target)
            out, data = read_glb(target.read_bytes())
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(len(out['materials']), 1)
            v = out['bufferViews'][out['accessors'][0]['bufferView']]
            self.assertEqual(data[v['byteOffset']:v['byteOffset'] + v['byteLength']], positions)
            image_view = out['bufferViews'][out['images'][0]['bufferView']]
            image = Image.open(io.BytesIO(data[image_view['byteOffset']:image_view['byteOffset'] + image_view['byteLength']]))
            for accessor, expected in [(1, [(230, 15, 15), (230, 15, 15), (15, 15, 230)]),
                                       (2, [(15, 230, 15), (15, 230, 15), (230, 230, 15)])]:
                view = out['bufferViews'][out['accessors'][accessor]['bufferView']]
                for i, colour in enumerate(expected):
                    u, v = struct.unpack_from('<ff', data, view['byteOffset'] + i * 8)
                    actual = image.getpixel((round(u * 2048), round(v * 2048)))
                    self.assertLess(max(abs(a - b) for a, b in zip(actual, colour)), 12)
            bad = copy.deepcopy(doc)
            bad['materials'][0]['normalTexture'] = {'index': 0}
            source.write_bytes(encode(bad))
            with self.assertRaises(AssertionError):
                module.atlas_car(source, Path(directory) / 'unsupported.glb')
            self.assertFalse((Path(directory) / 'unsupported.glb').exists())
            with self.assertRaises(AssertionError):
                module.atlas_car(source, source)


if __name__ == '__main__':
    unittest.main()

"""Pack a segmented Tripo colour-only GLB for the browser; preserve the source.

Usage: python3 tools/atlas-car.py source.glb output.glb
Refuses additional material maps rather than silently discarding them.
"""
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

from PIL import Image


def atlas_car(source, output):
    assert source.resolve() != output.resolve(), "Preserve the source GLB"
    data = source.read_bytes()
    assert struct.unpack_from('<III', data) == (0x46546C67, 2, len(data))
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + length])
    offset = 20 + length
    bin_length, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942 and len(doc['buffers']) == 1
    binary = data[offset + 8:offset + 8 + bin_length]
    assert not doc.get('animations') and not doc.get('skins')
    materials = []
    for material in doc['materials']:
        m = copy.deepcopy(material)
        m.pop('name', None)
        assert set(m) <= {'pbrMetallicRoughness', 'doubleSided', 'alphaMode', 'alphaCutoff'}
        texture = m['pbrMetallicRoughness'].pop('baseColorTexture')
        assert texture.get('texCoord', 0) == 0
        assert set(m['pbrMetallicRoughness']) <= {'baseColorFactor', 'metallicFactor', 'roughnessFactor'}
        materials.append(m)
    assert all(m == materials[0] for m in materials), "Material factors differ"
    images = []
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        images.append(Image.open(io.BytesIO(binary[start:start + view['byteLength']])).convert('RGB'))

    size, padding, scale = 2048, 4, 0.22
    placements = None
    while scale >= 0.05:
        free, trial = [(0, 0, size, size)], {}
        for index in sorted(range(len(images)), key=lambda i: images[i].width * images[i].height, reverse=True):
            image = images[index]
            w, h = max(4, round(image.width * scale)), max(4, round(image.height * scale))
            tw, th = w + 2 * padding, h + 2 * padding
            fits = [r for r in free if r[2] >= tw and r[3] >= th]
            if not fits:
                break
            x, y, fw, fh = min(fits, key=lambda r: r[2] * r[3])
            free.remove((x, y, fw, fh))
            free.extend([(x + tw, y, fw - tw, th), (x, y + th, fw, fh - th)])
            trial[index] = (x + padding, y + padding, w, h)
        else:
            placements = trial
            break
        scale *= 0.95
    assert placements is not None, "Images do not fit the atlas"
    atlas = Image.new('RGB', (size, size), (16, 16, 16))
    for index, (x, y, w, h) in placements.items():
        image = images[index].resize((w, h), Image.Resampling.LANCZOS)
        atlas.paste(image, (x, y))
        for src_box, dst_box in [((0, 0, w, 1), (x, y - padding, w, padding)),
                                 ((0, h - 1, w, h), (x, y + h, w, padding)),
                                 ((0, 0, 1, h), (x - padding, y, padding, h)),
                                 ((w - 1, 0, w, h), (x + w, y, padding, h))]:
            dx, dy, dw, dh = dst_box
            atlas.paste(image.crop(src_box).resize((dw, dh)), (dx, dy))
        for cx, cy, px, py in [(0, 0, x - padding, y - padding),
                                (w - 1, 0, x + w, y - padding),
                                (0, h - 1, x - padding, y + h),
                                (w - 1, h - 1, x + w, y + h)]:
            atlas.paste(image.getpixel((cx, cy)), (px, py, px + padding, py + padding))

    new_bin, views, mapping = bytearray(), [], {}
    image_views = {image['bufferView'] for image in doc['images']}
    for index, view in enumerate(doc['bufferViews']):
        if index in image_views:
            continue
        new_bin.extend(b'\0' * (-len(new_bin) % 4))
        start = view.get('byteOffset', 0)
        mapping[index] = len(views)
        views.append(dict(view, byteOffset=len(new_bin)))
        new_bin.extend(binary[start:start + view['byteLength']])
    for accessor in doc['accessors']:
        assert 'sparse' not in accessor
        accessor['bufferView'] = mapping[accessor['bufferView']]
    changed_uvs = set()
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            material = doc['materials'][primitive['material']]
            texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
            image_index = doc['textures'][texture]['source']
            x, y, w, h = placements[image_index]
            uv_index = primitive['attributes']['TEXCOORD_0']
            assert uv_index not in changed_uvs, "Shared UVs need separate accessors"
            changed_uvs.add(uv_index)
            accessor = doc['accessors'][uv_index]
            assert accessor['type'] == 'VEC2' and accessor['componentType'] == 5126
            view = views[accessor['bufferView']]
            start = view['byteOffset'] + accessor.get('byteOffset', 0)
            stride = view.get('byteStride', 8)
            uv_min, uv_max = [1.0, 1.0], [0.0, 0.0]
            for i in range(accessor['count']):
                u, v = struct.unpack_from('<ff', new_bin, start + i * stride)
                assert 0 <= u <= 1 and 0 <= v <= 1, "Tiling UVs require baking"
                uv = ((x + u * w) / size, (y + v * h) / size)
                struct.pack_into('<ff', new_bin, start + i * stride, *uv)
                uv_min = [min(a, b) for a, b in zip(uv_min, uv)]
                uv_max = [max(a, b) for a, b in zip(uv_max, uv)]
            accessor.update(min=uv_min, max=uv_max)
            primitive['material'] = 0
    jpeg = io.BytesIO()
    atlas.save(jpeg, format='JPEG', quality=95, subsampling=0)
    new_bin.extend(b'\0' * (-len(new_bin) % 4))
    atlas_view = len(views)
    views.append({'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(jpeg.getvalue())})
    new_bin.extend(jpeg.getvalue())
    materials[0]['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
    doc.update(bufferViews=views, materials=materials[:1],
               images=[{'bufferView': atlas_view, 'mimeType': 'image/jpeg'}],
               textures=[{'sampler': 0, 'source': 0}],
               samplers=[{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
               buffers=[{'byteLength': len(new_bin)}])
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    new_bin.extend(b'\0' * (-len(new_bin) % 4))
    result = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(new_bin))
              + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
              + struct.pack('<II', len(new_bin), 0x004E4942) + new_bin)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    print(json.dumps({'file': str(output), 'sha256': hashlib.sha256(result).hexdigest(),
                      'bytes': len(result), 'atlas': [size, size], 'materials': 1,
                      'source_texture_pixels': sum(im.width * im.height for im in images)}))


if __name__ == '__main__':
    atlas_car(Path(sys.argv[1]), Path(sys.argv[2]))

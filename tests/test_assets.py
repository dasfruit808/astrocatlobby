from __future__ import annotations

import json
from pathlib import Path

import pytest

from astrocatlobby.game.assets import (
    AssetManifestError,
    SpriteFrame,
    load_assets_from_directory,
)


def _write_blank_png(path: Path, width: int, height: int) -> None:
    import struct
    import zlib

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    row = b"\x00" + b"\x00\x00\x00\x00" * width
    raw = row * height
    compressed = zlib.compress(raw)
    png = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", compressed) + _chunk(b"IEND", b"")
    path.write_bytes(png)


@pytest.fixture()
def asset_pack(tmp_path: Path) -> Path:
    sheet_path = tmp_path / "cats.png"
    _write_blank_png(sheet_path, 64, 32)

    manifest = {
        "sprite_sheet": {
            "image": "cats.png",
            "frame_width": 16,
            "frame_height": 32,
            "margin": 0,
            "spacing": 0,
        },
        "animations": {
            "walk": {"frames": [0, 1, 2, 3], "frame_duration": 0.2, "loop": True}
        },
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    return tmp_path


def test_load_assets_from_directory(asset_pack: Path) -> None:
    assets = load_assets_from_directory(asset_pack)

    assert (assets.sprite_sheet.width, assets.sprite_sheet.height) == (64, 32)
    assert assets.sprite_sheet.path.name == "cats.png"
    assert set(assets.animations) == {"walk"}
    walk = assets.animations["walk"]
    assert walk.name == "walk"
    assert len(walk.frames) == 4
    assert all(isinstance(frame, SpriteFrame) for frame in walk.frames)
    assert all(frame.box == (i * 16, 0, i * 16 + 16, 32) for i, frame in enumerate(walk.frames))
    assert walk.frame_duration == pytest.approx(0.2)
    assert walk.loop is True


def test_missing_sprite_sheet(asset_pack: Path) -> None:
    (asset_pack / "cats.png").unlink()

    with pytest.raises(AssetManifestError):
        load_assets_from_directory(asset_pack)

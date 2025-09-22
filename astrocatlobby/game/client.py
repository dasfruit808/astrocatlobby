"""Command-line entry point for running the Astrocat game client."""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

from .assets import LoadedAssets, load_assets_from_directory

DEFAULT_MANIFEST_NAME = "manifest.json"


def _default_asset_dir() -> Path:
    return Path.cwd()


@dataclass
class GameClient:
    """Minimal façade that prepares renderable assets for the game."""

    asset_directory: Path = field(default_factory=_default_asset_dir)
    manifest_name: str = DEFAULT_MANIFEST_NAME

    def configure_assets(self, asset_directory: Path, manifest_name: Optional[str] = None) -> None:
        """Update the asset directory and manifest name used by the client."""

        self.asset_directory = asset_directory
        if manifest_name:
            self.manifest_name = manifest_name

    def load_assets(self) -> LoadedAssets:
        """Load and return textures and animations from the configured directory."""

        return load_assets_from_directory(self.asset_directory, self.manifest_name)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Astrocat arcade client")
    parser.add_argument(
        "--assets",
        type=Path,
        default=_default_asset_dir(),
        help=(
            "Path to the asset pack directory. The directory must contain a manifest.json "
            "file and sprite sheet referenced by that manifest."
        ),
    )
    parser.add_argument(
        "--manifest",
        type=str,
        default=DEFAULT_MANIFEST_NAME,
        help="Optional manifest filename inside the asset directory (defaults to manifest.json).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    client = GameClient(asset_directory=args.assets, manifest_name=args.manifest)
    assets = client.load_assets()

    print(
        f"Loaded sprite sheet {assets.sprite_sheet.width}x{assets.sprite_sheet.height} "
        f"with {len(assets.animations)} animations."
    )
    for name, animation in assets.animations.items():
        print(f" - {name}: {len(animation.frames)} frames @ {animation.frame_duration:.3f}s")

    return 0


if __name__ == "__main__":  # pragma: no cover - manual invocation helper
    raise SystemExit(main())

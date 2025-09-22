"""Asset manifest handling for the Astrocat game client."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, MutableMapping, Sequence, Tuple


class AssetManifestError(RuntimeError):
    """Raised when an asset manifest cannot be parsed or loaded."""


@dataclass(frozen=True)
class SpriteSheetConfig:
    """Configuration describing a sprite sheet image."""

    image: Path
    frame_width: int
    frame_height: int
    margin: int = 0
    spacing: int = 0

    def resolve(self, root: Path) -> "SpriteSheetConfig":
        """Return a copy with the image path resolved relative to ``root``."""

        image = self.image
        if not image.is_absolute():
            image = root / image
        return SpriteSheetConfig(
            image=image,
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            margin=self.margin,
            spacing=self.spacing,
        )


@dataclass(frozen=True)
class AnimationSequence:
    """Configuration describing a named animation."""

    name: str
    frames: Sequence[int]
    frame_duration: float
    loop: bool = True


@dataclass(frozen=True)
class AssetManifest:
    """Full manifest describing the available sprite assets."""

    sprite_sheet: SpriteSheetConfig
    animations: Dict[str, AnimationSequence]


@dataclass(frozen=True)
class SpriteFrame:
    """A rectangular slice of a sprite sheet."""

    index: int
    box: Tuple[int, int, int, int]


@dataclass
class SpriteSheet:
    """Loaded sprite sheet metadata and raw image bytes."""

    path: Path
    width: int
    height: int
    data: bytes

    @property
    def size(self) -> Tuple[int, int]:
        """Return the (width, height) pair for convenience."""

        return self.width, self.height


@dataclass
class LoadedAnimation:
    """Animation data ready for rendering."""

    name: str
    frames: List[SpriteFrame]
    frame_duration: float
    loop: bool


@dataclass
class LoadedAssets:
    """Container bundling a sprite sheet and the derived animations."""

    sprite_sheet: SpriteSheet
    animations: Dict[str, LoadedAnimation]


def _ensure_positive(value: int, field: str) -> None:
    if value <= 0:
        raise AssetManifestError(f"{field} must be positive (got {value!r}).")


def _parse_sprite_sheet(data: MutableMapping[str, object], root: Path) -> SpriteSheetConfig:
    try:
        image_field = data["image"]
        frame_width = int(data["frame_width"])
        frame_height = int(data["frame_height"])
        margin = int(data.get("margin", 0))
        spacing = int(data.get("spacing", 0))
    except KeyError as exc:
        raise AssetManifestError("Sprite sheet configuration is missing required keys.") from exc
    except (TypeError, ValueError) as exc:
        raise AssetManifestError("Sprite sheet configuration has invalid values.") from exc

    _ensure_positive(frame_width, "frame_width")
    _ensure_positive(frame_height, "frame_height")
    if margin < 0 or spacing < 0:
        raise AssetManifestError("margin and spacing must be zero or positive.")

    image_path = Path(str(image_field))
    return SpriteSheetConfig(
        image=image_path,
        frame_width=frame_width,
        frame_height=frame_height,
        margin=margin,
        spacing=spacing,
    ).resolve(root)


def _parse_animation(name: str, data: MutableMapping[str, object]) -> AnimationSequence:
    try:
        frames_field = data["frames"]
        frame_duration = float(data["frame_duration"])
        loop = bool(data.get("loop", True))
    except KeyError as exc:
        raise AssetManifestError(f"Animation {name!r} is missing required keys.") from exc
    except (TypeError, ValueError) as exc:
        raise AssetManifestError(f"Animation {name!r} has invalid values.") from exc

    if isinstance(frames_field, Iterable) and not isinstance(frames_field, (str, bytes)):
        frames = [int(frame) for frame in frames_field]
    else:
        raise AssetManifestError(f"Animation {name!r} frames must be an iterable of indices.")

    if not frames:
        raise AssetManifestError(f"Animation {name!r} must define at least one frame.")

    for index in frames:
        if index < 0:
            raise AssetManifestError(f"Animation {name!r} contains a negative frame index: {index}")

    if frame_duration <= 0:
        raise AssetManifestError(
            f"Animation {name!r} frame_duration must be positive (got {frame_duration!r})."
        )

    return AnimationSequence(name=name, frames=frames, frame_duration=frame_duration, loop=loop)


def load_manifest(path: Path) -> AssetManifest:
    """Load a manifest JSON file into configuration dataclasses."""

    if not path.exists():
        raise AssetManifestError(f"No manifest found at {path}.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AssetManifestError(f"Manifest {path} is not valid JSON.") from exc

    root = path.parent
    try:
        sheet_data = data["sprite_sheet"]
        animations_data = data["animations"]
    except KeyError as exc:
        raise AssetManifestError("Manifest must define 'sprite_sheet' and 'animations'.") from exc

    if not isinstance(animations_data, MutableMapping):
        raise AssetManifestError("'animations' must be an object mapping names to configs.")

    sprite_sheet = _parse_sprite_sheet(sheet_data, root)
    animations: Dict[str, AnimationSequence] = {}
    for name, anim_data in animations_data.items():
        if not isinstance(anim_data, MutableMapping):
            raise AssetManifestError(f"Animation {name!r} must be a mapping of properties.")
        animations[name] = _parse_animation(name, anim_data)

    if not animations:
        raise AssetManifestError("Manifest must define at least one animation.")

    return AssetManifest(sprite_sheet=sprite_sheet, animations=animations)


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _read_png_size(data: bytes) -> Tuple[int, int]:
    if len(data) < 24 or not data.startswith(PNG_SIGNATURE):
        raise AssetManifestError("Sprite sheets must be valid PNG files.")
    # IHDR chunk follows the signature. Its first 8 bytes are width/height.
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if width <= 0 or height <= 0:
        raise AssetManifestError("Sprite sheet reported non-positive dimensions.")
    return width, height


def _load_sprite_sheet(path: Path) -> SpriteSheet:
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise AssetManifestError(f"Sprite sheet image {path} could not be found.") from exc
    except OSError as exc:
        raise AssetManifestError(f"Failed to load sprite sheet image {path}.") from exc

    width, height = _read_png_size(data)
    return SpriteSheet(path=path, width=width, height=height, data=data)


def _calculate_grid(sheet: SpriteSheet, config: SpriteSheetConfig) -> Tuple[int, int]:
    usable_width = sheet.width - 2 * config.margin
    usable_height = sheet.height - 2 * config.margin

    if usable_width <= 0 or usable_height <= 0:
        raise AssetManifestError(
            "Sprite sheet is too small for the configured margin and frame size."
        )

    if config.frame_width > usable_width or config.frame_height > usable_height:
        raise AssetManifestError(
            "Frame dimensions are larger than the usable sprite sheet area."
        )

    step_x = config.frame_width + config.spacing
    step_y = config.frame_height + config.spacing

    columns = 1 + max(0, (usable_width - config.frame_width) // step_x)
    rows = 1 + max(0, (usable_height - config.frame_height) // step_y)

    return columns, rows


def _slice_sprite_sheet(sheet: SpriteSheet, config: SpriteSheetConfig) -> List[SpriteFrame]:
    columns, rows = _calculate_grid(sheet, config)
    frames: List[SpriteFrame] = []

    for row in range(rows):
        for column in range(columns):
            left = config.margin + column * (config.frame_width + config.spacing)
            top = config.margin + row * (config.frame_height + config.spacing)
            box = (left, top, left + config.frame_width, top + config.frame_height)
            frames.append(SpriteFrame(index=len(frames), box=box))

    if not frames:
        raise AssetManifestError(
            "Sprite sheet dimensions and configuration produced zero frames; "
            "check frame size, margin, and spacing."
        )

    return frames


def load_assets(manifest: AssetManifest) -> LoadedAssets:
    """Load image data for the provided manifest."""

    sprite_sheet = _load_sprite_sheet(manifest.sprite_sheet.image)
    frames = _slice_sprite_sheet(sprite_sheet, manifest.sprite_sheet)

    animations: Dict[str, LoadedAnimation] = {}
    for name, animation in manifest.animations.items():
        try:
            frame_images = [frames[index] for index in animation.frames]
        except IndexError as exc:
            raise AssetManifestError(
                f"Animation {name!r} references a frame that does not exist in the sprite sheet."
            ) from exc
        animations[name] = LoadedAnimation(
            name=name,
            frames=frame_images,
            frame_duration=animation.frame_duration,
            loop=animation.loop,
        )

    return LoadedAssets(sprite_sheet=sprite_sheet, animations=animations)


def load_assets_from_directory(directory: Path, manifest_name: str = "manifest.json") -> LoadedAssets:
    """Load assets given a directory containing a manifest and sprite sheet."""

    manifest_path = directory / manifest_name
    manifest = load_manifest(manifest_path)
    return load_assets(manifest)

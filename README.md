# Astrocat Lobby

Astrocat Lobby is a tiny reference project that tracks a roster of astronaut cats
and the missions they are scheduled to fly. The package ships with a reusable
service layer, a simple JSON-backed controller, and an ergonomic command-line
interface.

## Installation

```bash
pip install .
```

This uses the configuration in `pyproject.toml` to build the package with
[`hatchling`](https://hatch.pypa.io/).

## Command-line interface

The package exposes a console script named `astrocatlobby`. Example usage:

```bash
# Register a new astro-cat
astrocatlobby register Nova Captain

# Assign a mission
astrocatlobby assign Nova "Inspect moon base"

# Show the current roster
astrocatlobby summary
```

By default the CLI stores its state in `~/.astrocatlobby.json`. You can override
this with the `--storage` flag:

```bash
astrocatlobby --storage /tmp/cats.json summary
```

## Python API

You can also embed the lobby in another application via the service layer:

```python
from astrocatlobby import LobbyService

service = LobbyService()
service.register_cat("Nova", "Captain")
service.assign_mission("Nova", "Inspect moon base")
print(service.summary_lines())
```

## Tests

The project uses `pytest` for testing. Install the optional test dependencies
and run the suite with:

```bash
pip install .[test]
pytest
```

The CLI tests exercise the command in-process, so they run quickly and do not
require writing to user directories.

## Game assets

The experimental arcade client in `astrocatlobby.game.client` loads its sprite
animations from a manifest-driven asset pack. To prepare a pack, create a
directory containing a sprite sheet image and a `manifest.json` file with the
following structure:

```json
{
  "sprite_sheet": {
    "image": "cats.png",
    "frame_width": 32,
    "frame_height": 32,
    "margin": 0,
    "spacing": 0
  },
  "animations": {
    "idle": {
      "frames": [0, 1, 2, 1],
      "frame_duration": 0.12,
      "loop": true
    },
    "pounce": {
      "frames": [8, 9, 10, 11, 12],
      "frame_duration": 0.08,
      "loop": false
    }
  }
}
```

The frame indices reference tiles sliced from the sprite sheet using the
dimensions, margin and spacing specified in the manifest. Sprite sheets should
be PNG images so the loader can determine their dimensions. When running the
client you can point to a custom asset pack by supplying the directory via the
`--assets` flag:

```bash
python -m astrocatlobby.game.client --assets /path/to/asset-pack
```

If your pack uses a different manifest filename you can provide it with
`--manifest custom.json`.

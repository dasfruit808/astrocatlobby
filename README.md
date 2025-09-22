# Astrocat Lobby

Astrocat Lobby is a tiny reference project that tracks a roster of astronaut cats
and the missions they are scheduled to fly. The package ships with a reusable
service layer, a simple JSON-backed controller, and an ergonomic command-line
interface. It also includes a Maple Story-inspired side scrolling web lobby
that you can launch locally.

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

## Maple Story-style lobby

Launch the virtual lobby with the bundled static server:

```bash
astrocatlobby-game
```

Open the printed URL in your browser. Use your arrow keys to move and press the
space bar to jump or interact with crew members and terminals.

### Bring your own art

The repository intentionally ships without the binary art assets so you can
drop in your own sprites. Before launching the lobby, add PNG files with the
following names to `astrocatlobby/game/static/assets/`:

* `background.png`
* `foreground.png`
* `interact.png`
* `npc.png`
* `player_idle.png`
* `player_jump.png`

You can swap in any artwork as long as the filenames match; the game will load
them automatically at runtime.

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

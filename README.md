# Astrocat Lobby

Astrocat Lobby is a tiny reference project that tracks a roster of astronaut cats
and the missions they are scheduled to fly. The package ships with a reusable
service layer, a simple JSON-backed controller, and an ergonomic command-line
interface. It now also includes a Maple Story-inspired side scrolling web lobby
that you can launch locally once you provide your own sprite art.

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

Follow these steps to explore the side scrolling lobby experience:

1. **Collect your sprites.** The game looks for the following PNG files inside
   `astrocatlobby/game/static/assets/` and falls back to in-browser placeholder
   art if any are missing so you can explore immediately:
   * `background.png`
   * `foreground.png`
   * `interact.png`
   * `npc.png`
   * `player_idle.png`
   * `player_jump.png`

   The canvas renders at 900×540 pixels. Background and foreground layers that
   are at least that wide will tile cleanly as you walk. Character sprites are
   drawn into a 64×64 box, so framing them with a little transparent padding
   helps them read well in-game. When placeholders are in use a status card
   above the canvas lists which filenames still need art.

2. **Drop the art in place.** Copy or create the PNGs in the
   `astrocatlobby/game/static/assets/` folder. A `.gitkeep` placeholder keeps
   the directory in version control, so you only need to supply the actual art
   files themselves.

3. **Launch the lobby.** You can either execute the module directly during
   development:

   ```bash
   python -m astrocatlobby.game
   ```

   or, after installing the package, use the convenience script:

   ```bash
   astrocatlobby-game
   ```

   The command prints the local URL of the static server. Open it in a browser
   and use the arrow keys to move while tapping the space bar to jump or interact
   with consoles and crew members. A heads-up status panel confirms once all
   sprites are loaded or highlights any files that are still using placeholder
   art.

4. **Customize as needed.** The static files live under
   `astrocatlobby/game/static/`. You can tweak `styles.css`, edit the HUD layout
   in `index.html`, or expand the gameplay loop in `game.js` (for example to add
   new interactable crew members or adjust platform layout) without touching any
   build tooling.

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

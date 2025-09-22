"""Console entry point for the Astrocat Lobby game."""

from __future__ import annotations

from .client import GameClient


def main() -> None:
    """Launch the lobby game using the default configuration."""

    client = GameClient()
    client.start()


if __name__ == "__main__":
    main()

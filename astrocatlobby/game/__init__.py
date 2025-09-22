"""Game package for Astrocat Lobby.

This module exposes the :class:`GameClient` which provides an optional
pygame-powered experience for the project.  The rest of the package
contains small abstractions that make the game loop testable even when
pygame is not installed in the execution environment.
"""

from .client import GameClient

__all__ = ["GameClient"]

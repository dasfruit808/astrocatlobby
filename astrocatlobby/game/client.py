"""Public entry point for launching the Astrocat Lobby game."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

from .engine import GameEngine
from .scenes import Camera, Player, SideScrollingScene, TileMap, create_default_scene

DEFAULT_MAP: Sequence[str] = (
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "...............####.....................",
    "........................................",
    "##############################....######",
    "........................................",
)


@dataclass
class GameClient:
    """High level wrapper around :class:`GameEngine` and :class:`SideScrollingScene`."""

    engine: GameEngine = field(default_factory=GameEngine)
    scene: Optional[SideScrollingScene] = None

    def __post_init__(self) -> None:
        if self.scene is None:
            self.scene = self.create_scene_from_layout(DEFAULT_MAP)

    # --- Scene construction ---------------------------------------------
    def create_scene_from_layout(self, layout: Sequence[str]) -> SideScrollingScene:
        tile_map = TileMap(layout)
        player_start_x = tile_map.tile_size * 2
        player_start_y = tile_map.tile_size * 4
        player = Player(x=player_start_x, y=player_start_y)
        camera = Camera(width=self.engine.state.width, height=self.engine.state.height)
        return SideScrollingScene(tile_map=tile_map, player=player, camera=camera)

    def load_scene(self, layout: Sequence[str]) -> None:
        self.scene = self.create_scene_from_layout(layout)

    # --- Game loop ------------------------------------------------------
    def start(self) -> None:
        if not self.scene:
            self.scene = create_default_scene()
        self.engine.run(self.scene)


__all__ = ["GameClient"]

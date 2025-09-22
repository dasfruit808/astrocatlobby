"""Scene implementations used by the Astrocat Lobby game client."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .engine import BaseScene

Tile = Tuple[int, int, int]
Color = Tuple[int, int, int]

# Basic palette
BACKGROUND_COLOR: Color = (25, 25, 40)
TILE_COLOR: Color = (80, 200, 120)
PLAYER_COLOR: Color = (240, 240, 255)


@dataclass
class Camera:
    width: int
    height: int
    x: float = 0
    y: float = 0

    def follow(self, target_x: float, target_y: float) -> None:
        self.x = max(0.0, target_x - self.width / 2)
        self.y = max(0.0, target_y - self.height / 2)


@dataclass
class Player:
    x: float
    y: float
    vx: float = 0
    vy: float = 0
    on_ground: bool = False

    def apply_gravity(self, dt: float, gravity: float = 1200.0) -> None:
        self.vy += gravity * dt

    def move(self, dt: float) -> None:
        self.x += self.vx * dt
        self.y += self.vy * dt


class TileMap:
    """Simple tile map represented as a matrix of ``0``/``1`` values."""

    def __init__(self, layout: Sequence[str], tile_size: int = 32) -> None:
        self.layout = [list(row) for row in layout]
        self.rows = len(layout)
        self.cols = len(layout[0]) if layout else 0
        self.tile_size = tile_size

    def tiles(self) -> List[Tile]:
        solid: List[Tile] = []
        for row_index, row in enumerate(self.layout):
            for col_index, value in enumerate(row):
                if value == "#":
                    solid.append(
                        (
                            col_index * self.tile_size,
                            row_index * self.tile_size,
                            self.tile_size,
                        )
                    )
        return solid

    def clamp_position(self, player: Player) -> None:
        max_x = (self.cols - 1) * self.tile_size
        max_y = (self.rows - 1) * self.tile_size
        player.x = max(0, min(player.x, max_x))
        if player.y > max_y:
            player.y = max_y
            player.vy = 0
            player.on_ground = True


class SideScrollingScene(BaseScene):
    """A small platformer scene with a scrolling camera."""

    requires_backend = True

    def __init__(self, tile_map: TileMap, player: Player, camera: Optional[Camera] = None) -> None:
        super().__init__()
        self.map = tile_map
        self.player = player
        self.camera = camera or Camera(width=800, height=600)
        self.gravity = 1600.0
        self.jump_speed = -650.0
        self.move_speed = 250.0

    # --- Lifecycle ------------------------------------------------------
    def startup(self) -> None:
        if self.engine and self.engine.backend:
            backend = self.engine.backend
            backend.font.init()
            self._font = backend.font.Font(None, 24)
        else:
            self._font = None

    def shutdown(self) -> None:
        self._font = None

    # --- Game loop ------------------------------------------------------
    def poll_events(self) -> float:
        dt = super().poll_events()
        if self.engine and self.engine.backend:
            backend = self.engine.backend
            keys = backend.key.get_pressed()
            self.handle_input(keys)
        return dt

    def update(self, dt: float) -> None:
        self.player.apply_gravity(dt, gravity=self.gravity)
        self.player.move(dt)
        self.map.clamp_position(self.player)
        self.camera.follow(self.player.x, self.player.y)

    def render(self) -> None:
        if not self.engine or not self.engine.backend:
            # Running in headless mode: nothing to render.
            return

        backend = self.engine.backend
        screen = self.engine.state.screen
        screen.fill(BACKGROUND_COLOR)

        # Draw tiles
        for tile_x, tile_y, tile_size in self.map.tiles():
            rect = backend.Rect(tile_x - self.camera.x, tile_y - self.camera.y, tile_size, tile_size)
            backend.draw.rect(screen, TILE_COLOR, rect)

        # Draw player
        player_rect = backend.Rect(
            self.player.x - self.camera.x,
            self.player.y - self.camera.y,
            self.map.tile_size,
            self.map.tile_size,
        )
        backend.draw.rect(screen, PLAYER_COLOR, player_rect)

        if self._font:
            text = self._font.render("Astrocat Lobby", True, PLAYER_COLOR)
            screen.blit(text, (20, 20))

        backend.display.flip()

    # --- Input ----------------------------------------------------------
    def handle_input(self, key_state: Sequence[bool]) -> None:
        if not self.engine or not self.engine.backend:
            return

        backend = self.engine.backend
        if key_state[backend.K_LEFT] or key_state[backend.K_a]:
            self.player.vx = -self.move_speed
        elif key_state[backend.K_RIGHT] or key_state[backend.K_d]:
            self.player.vx = self.move_speed
        else:
            self.player.vx = 0

        if (key_state[backend.K_SPACE] or key_state[backend.K_UP]) and self.player.on_ground:
            self.player.vy = self.jump_speed
            self.player.on_ground = False


def create_default_scene() -> SideScrollingScene:
    layout = [
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
    ]
    tile_map = TileMap(layout)
    player = Player(x=tile_map.tile_size * 2, y=tile_map.tile_size * 4)
    camera = Camera(width=800, height=600)
    return SideScrollingScene(tile_map, player, camera)


__all__ = [
    "Camera",
    "Player",
    "SideScrollingScene",
    "TileMap",
    "create_default_scene",
]

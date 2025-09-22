"""Utility classes for managing the game loop and backend integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from types import ModuleType
from typing import Callable, Optional

BackendInitHook = Callable[["GameEngine"], None]


class MissingBackendError(RuntimeError):
    """Raised when the user tries to start the game without pygame installed."""


@dataclass
class EngineState:
    """Runtime state shared between the engine and active scenes."""

    backend: Optional[ModuleType]
    screen: Optional[object] = None
    clock: Optional[object] = None
    should_exit: bool = False
    fps: int = 60
    width: int = 800
    height: int = 600


@dataclass
class GameEngine:
    """Minimal pygame-style engine abstraction.

    The engine keeps track of display properties and exposes a ``run`` method
    that executes a typical render/update loop.  The pygame dependency is
    optional: if it is not installed the engine still performs logical
    updates so unit tests can interact with the scene without a graphical
    backend.
    """

    width: int = 800
    height: int = 600
    fps: int = 60
    init_hook: Optional[BackendInitHook] = None
    _state: EngineState = field(init=False, repr=False)

    def __post_init__(self) -> None:
        backend = self._import_backend()
        self._state = EngineState(
            backend=backend,
            fps=self.fps,
            width=self.width,
            height=self.height,
        )

    @staticmethod
    def _import_backend() -> Optional[ModuleType]:
        try:
            import pygame  # type: ignore

            return pygame
        except ModuleNotFoundError:
            return None

    @property
    def backend(self) -> Optional[ModuleType]:
        return self._state.backend

    @property
    def state(self) -> EngineState:
        return self._state

    def initialise(self) -> None:
        """Initialise the backend if available and run a custom hook."""

        if self.backend:
            self.backend.init()
            self._state.screen = self.backend.display.set_mode((self.width, self.height))
            self.backend.display.set_caption("Astrocat Lobby")
            self._state.clock = self.backend.time.Clock()

        if self.init_hook:
            self.init_hook(self)

    def run(self, scene: "BaseScene") -> None:
        """Run the update/render loop until the scene requests an exit."""

        if self.backend is None and scene.requires_backend:
            raise MissingBackendError(
                "pygame is required for this scene but is not installed. "
                "Install `pygame` to launch the lobby game."
            )

        scene.bind_engine(self)
        self.initialise()
        scene.startup()

        while not self._state.should_exit:
            dt = scene.poll_events()
            scene.update(dt)
            scene.render()

        scene.shutdown()
        if self.backend:
            self.backend.quit()


class BaseScene:
    """Small protocol for scenes used by :class:`GameEngine`."""

    requires_backend: bool = True

    def __init__(self) -> None:
        self.engine: Optional[GameEngine] = None

    # --- Engine binding -------------------------------------------------
    def bind_engine(self, engine: GameEngine) -> None:
        self.engine = engine

    # --- Lifecycle hooks ------------------------------------------------
    def startup(self) -> None:
        """Perform scene initialisation."""

    def shutdown(self) -> None:
        """Clean up resources when the game exits."""

    # --- Game loop methods ----------------------------------------------
    def poll_events(self) -> float:
        """Poll backend events and return elapsed time in seconds."""

        if not self.engine:
            return 0.0

        backend = self.engine.backend
        if backend:
            elapsed_ms = self.engine.state.clock.tick(self.engine.state.fps)
            for event in backend.event.get():
                if event.type == backend.QUIT:
                    self.engine.state.should_exit = True
            return elapsed_ms / 1000.0

        # When no backend is available we simply progress by one frame.
        return 1.0 / self.engine.state.fps

    def update(self, dt: float) -> None:
        """Update the scene logic for the current frame."""

    def render(self) -> None:
        """Render the scene using the active backend."""


__all__ = [
    "BaseScene",
    "EngineState",
    "GameEngine",
    "MissingBackendError",
]

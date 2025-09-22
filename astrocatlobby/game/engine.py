"""Simple interaction engine for the Astrocat lobby."""
from __future__ import annotations

from typing import Iterable, List, Sequence, Set

from ..models import Interaction, LobbyObject, PlayerState


class GameEngine:
    """Coordinate player movement, collisions and interactions."""

    def __init__(
        self,
        objects: Sequence[LobbyObject],
        player_state: PlayerState,
        *,
        interaction_key: str = "space",
    ) -> None:
        self._objects: List[LobbyObject] = list(objects)
        self.player_state = player_state
        self.interaction_key = interaction_key

    @property
    def objects(self) -> Sequence[LobbyObject]:
        """Return the registered lobby objects."""

        return tuple(self._objects)

    def move_player(self, dx: float, dy: float) -> bool:
        """Attempt to move the player, preventing collisions with blocking objects.

        Returns ``True`` if the movement is successful, ``False`` otherwise.
        """

        if dx == dy == 0:
            return False

        proposed_hitbox = self.player_state.offset_hitbox(dx, dy)
        if any(obj.blocking and obj.would_collide(proposed_hitbox) for obj in self._objects):
            return False

        self.player_state.move(dx, dy)
        return True

    def colliding_objects(self) -> List[LobbyObject]:
        """Return lobby objects whose hitboxes intersect with the player."""

        return [obj for obj in self._objects if obj.collides_with(self.player_state)]

    def handle_input(self, pressed_keys: Iterable[str]) -> List[Interaction]:
        """Process a collection of pressed keys and fire relevant interactions."""

        pressed: Set[str] = {key.lower() for key in pressed_keys}
        triggered: List[Interaction] = []
        if self.interaction_key.lower() not in pressed:
            return triggered

        for obj in self.colliding_objects():
            if obj.interaction and obj.interaction.trigger(self.player_state, obj):
                triggered.append(obj.interaction)
        return triggered

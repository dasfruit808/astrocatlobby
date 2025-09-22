"""Data models used by the Astrocat Lobby."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Tuple


@dataclass
class AstroCat:
    """Represents an astronaut cat registered with the lobby."""

    name: str
    rank: str
    missions: List[str] = field(default_factory=list)

    def assign_mission(self, mission: str) -> None:
        """Assign a new mission to the cat."""
        mission = mission.strip()
        if not mission:
            raise ValueError("Mission name cannot be empty.")
        self.missions.append(mission)

    def to_dict(self) -> Dict[str, object]:
        """Return a serialisable representation of the cat."""
        return {
            "name": self.name,
            "rank": self.rank,
            "missions": list(self.missions),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "AstroCat":
        """Create a cat instance from serialised data."""
        missions = list(data.get("missions", []))
        return cls(name=str(data["name"]), rank=str(data["rank"]), missions=missions)

    def summary(self) -> str:
        """Return a human readable description of the cat's status."""
        if self.missions:
            mission_report = ", ".join(self.missions)
        else:
            mission_report = "No missions assigned"
        return f"{self.name} ({self.rank}) — {mission_report}"


def serialise_cats(cats: Iterable[AstroCat]) -> List[Dict[str, object]]:
    """Serialise an iterable of cats for persistence."""
    return [cat.to_dict() for cat in cats]


def deserialise_cats(data: Iterable[Dict[str, object]]) -> List[AstroCat]:
    """Load cats from serialised data."""
    return [AstroCat.from_dict(item) for item in data]


Hitbox = Tuple[float, float, float, float]
InteractionCallback = Callable[["PlayerState", "LobbyObject"], None]


def _calculate_hitbox(position: Tuple[float, float], size: Tuple[float, float]) -> Hitbox:
    """Return a hitbox tuple (left, top, right, bottom) for the given geometry."""

    x, y = position
    width, height = size
    return (x, y, x + width, y + height)


def _overlaps(first: Hitbox, second: Hitbox) -> bool:
    """Return ``True`` when the two hitboxes overlap."""

    left_a, top_a, right_a, bottom_a = first
    left_b, top_b, right_b, bottom_b = second
    return not (
        right_a <= left_b
        or right_b <= left_a
        or bottom_a <= top_b
        or bottom_b <= top_a
    )


@dataclass
class PlayerState:
    """Represents the player's avatar location and facing direction."""

    position: Tuple[float, float]
    size: Tuple[float, float]
    facing: str = "down"

    def move(self, dx: float, dy: float) -> None:
        """Move the player by the delta amount and update facing when applicable."""

        x, y = self.position
        self.position = (x + dx, y + dy)
        if dx == dy == 0:
            return

        if abs(dx) > abs(dy):
            self.facing = "right" if dx > 0 else "left"
        elif dy != 0:
            self.facing = "down" if dy > 0 else "up"

    @property
    def hitbox(self) -> Hitbox:
        """Return the current hitbox occupied by the player."""

        return _calculate_hitbox(self.position, self.size)

    def offset_hitbox(self, dx: float, dy: float) -> Hitbox:
        """Return the hitbox representing a potential movement."""

        x, y = self.position
        width, height = self.size
        return _calculate_hitbox((x + dx, y + dy), (width, height))


@dataclass
class Interaction:
    """Configuration describing how a lobby object reacts to player input."""

    callback: InteractionCallback
    prompt: Optional[str] = None
    once: bool = False
    _has_triggered: bool = field(default=False, init=False, repr=False)

    def can_trigger(self) -> bool:
        """Return ``True`` if the interaction is eligible to fire."""

        return not (self.once and self._has_triggered)

    def trigger(self, player: PlayerState, lobby_object: "LobbyObject") -> bool:
        """Fire the configured callback when allowed.

        Returns ``True`` if the callback was invoked, ``False`` otherwise.
        """

        if not self.can_trigger():
            return False
        self.callback(player, lobby_object)
        self._has_triggered = True
        return True


@dataclass
class LobbyObject:
    """An interactable object placed inside the lobby scene."""

    identifier: str
    position: Tuple[float, float]
    size: Tuple[float, float]
    interaction: Optional[Interaction] = None
    blocking: bool = False

    @property
    def hitbox(self) -> Hitbox:
        """Return the object's current hitbox."""

        return _calculate_hitbox(self.position, self.size)

    def collides_with(self, player: PlayerState) -> bool:
        """Return ``True`` if the object's hitbox intersects with the player's."""

        return _overlaps(self.hitbox, player.hitbox)

    def would_collide(self, hitbox: Hitbox) -> bool:
        """Return ``True`` if the supplied hitbox would overlap the object."""

        return _overlaps(self.hitbox, hitbox)

"""Data models used by the Astrocat Lobby."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List


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

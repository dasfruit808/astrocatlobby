"""Business logic for managing astro-cats."""
from __future__ import annotations

from collections import OrderedDict
from typing import Dict, Iterable, List, MutableMapping, Optional

from .models import AstroCat, deserialise_cats, serialise_cats


class LobbyService:
    """Service layer for registering cats and managing missions."""

    def __init__(self, cats: Optional[Iterable[AstroCat]] = None) -> None:
        self._cats: "OrderedDict[str, AstroCat]" = OrderedDict()
        if cats:
            for cat in cats:
                self._cats[cat.name] = cat

    def register_cat(self, name: str, rank: str) -> AstroCat:
        """Register a new cat with the given rank."""
        if name in self._cats:
            raise ValueError(f"A cat named {name!r} is already registered.")
        cat = AstroCat(name=name, rank=rank)
        self._cats[name] = cat
        return cat

    def assign_mission(self, name: str, mission: str) -> AstroCat:
        """Assign a mission to an existing cat."""
        try:
            cat = self._cats[name]
        except KeyError as exc:
            raise ValueError(f"Unknown cat: {name!r}") from exc
        cat.assign_mission(mission)
        return cat

    def get_cat(self, name: str) -> AstroCat:
        """Return a registered cat."""
        try:
            return self._cats[name]
        except KeyError as exc:
            raise ValueError(f"Unknown cat: {name!r}") from exc

    def list_cats(self) -> List[AstroCat]:
        """Return all registered cats in registration order."""
        return list(self._cats.values())

    def to_dict(self) -> Dict[str, object]:
        """Serialise the lobby state."""
        return {"cats": serialise_cats(self._cats.values())}

    @classmethod
    def from_dict(cls, data: MutableMapping[str, object]) -> "LobbyService":
        """Create a service from serialised state."""
        cats_data = data.get("cats", [])
        cats = deserialise_cats(cats_data)
        return cls(cats=cats)

    def summary_lines(self) -> List[str]:
        """Return a textual summary for each cat."""
        cats = self.list_cats()
        if not cats:
            return ["No cats registered."]
        return [cat.summary() for cat in cats]

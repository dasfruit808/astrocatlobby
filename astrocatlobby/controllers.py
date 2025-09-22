"""High level orchestration for the Astrocat Lobby."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Optional

from .models import AstroCat
from .services import LobbyService


class LobbyController:
    """Controller that coordinates persistence and the service layer."""

    def __init__(
        self,
        service: Optional[LobbyService] = None,
        storage_path: Optional[Path] = None,
    ) -> None:
        self.service = service or LobbyService()
        self._storage_path = storage_path

    @property
    def storage_path(self) -> Optional[Path]:
        """Return the configured storage path."""
        return self._storage_path

    def load(self) -> None:
        """Load state from storage if available."""
        if not self._storage_path or not self._storage_path.exists():
            return
        data = json.loads(self._storage_path.read_text(encoding="utf-8"))
        self.service = LobbyService.from_dict(data)

    def save(self) -> None:
        """Persist the current state to storage."""
        if not self._storage_path:
            return
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        data = self.service.to_dict()
        self._storage_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def register_cat(self, name: str, rank: str) -> AstroCat:
        """Register a new cat and persist the change."""
        cat = self.service.register_cat(name=name, rank=rank)
        self.save()
        return cat

    def assign_mission(self, name: str, mission: str) -> AstroCat:
        """Assign a mission to a cat and persist the change."""
        cat = self.service.assign_mission(name=name, mission=mission)
        self.save()
        return cat

    def list_cats(self) -> Iterable[AstroCat]:
        """Return all registered cats."""
        return self.service.list_cats()

    def summary(self) -> str:
        """Return a formatted summary of the lobby."""
        return "\n".join(self.service.summary_lines())

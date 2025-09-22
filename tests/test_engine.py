"""Tests for the lobby interaction engine."""
from __future__ import annotations

from astrocatlobby.game.engine import GameEngine
from astrocatlobby.models import Interaction, LobbyObject, PlayerState


def test_interaction_triggers_when_overlapping_and_pressing_key():
    triggered = []

    def callback(player: PlayerState, obj: LobbyObject) -> None:
        triggered.append((player.position, obj.identifier))

    player = PlayerState(position=(0, 0), size=(1, 1))
    console = LobbyObject(
        identifier="console",
        position=(0, 0),
        size=(1, 1),
        interaction=Interaction(callback=callback),
    )
    engine = GameEngine([console], player)

    fired = engine.handle_input(["SPACE"])

    assert triggered == [((0, 0), "console")]
    assert fired == [console.interaction]


def test_interaction_does_not_trigger_without_overlap_or_keypress():
    fired = []

    def callback(_: PlayerState, __: LobbyObject) -> None:
        fired.append(True)

    player = PlayerState(position=(5, 5), size=(1, 1))
    trophy = LobbyObject(
        identifier="trophy",
        position=(0, 0),
        size=(1, 1),
        interaction=Interaction(callback=callback),
    )
    engine = GameEngine([trophy], player)

    assert engine.handle_input(["space"]) == []
    assert fired == []

    # Now overlap but without pressing the key.
    player.position = (0, 0)
    assert engine.handle_input([]) == []
    assert fired == []


def test_interaction_only_triggers_once_when_configured():
    count = 0

    def callback(_: PlayerState, __: LobbyObject) -> None:
        nonlocal count
        count += 1

    player = PlayerState(position=(0, 0), size=(1, 1))
    poster = LobbyObject(
        identifier="poster",
        position=(0, 0),
        size=(1, 1),
        interaction=Interaction(callback=callback, once=True),
    )
    engine = GameEngine([poster], player)

    assert engine.handle_input(["space"]) == [poster.interaction]
    assert count == 1

    # Subsequent presses should not trigger the callback again.
    assert engine.handle_input(["space"]) == []
    assert count == 1


def test_player_movement_blocked_by_solid_objects():
    player = PlayerState(position=(0, 0), size=(1, 1))
    wall = LobbyObject(
        identifier="wall",
        position=(1, 0),
        size=(1, 1),
        blocking=True,
    )
    engine = GameEngine([wall], player)

    # Attempting to move into the wall should fail.
    moved = engine.move_player(1, 0)
    assert moved is False
    assert player.position == (0, 0)

    # Moving in a free direction should succeed.
    moved = engine.move_player(0, 1)
    assert moved is True
    assert player.position == (0, 1)

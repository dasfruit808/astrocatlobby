"""Command line interface for the Astrocat Lobby."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable, List, Optional

from .controllers import LobbyController

DEFAULT_STORAGE = Path.home() / ".astrocatlobby.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage the Astrocat Lobby")
    parser.add_argument(
        "--storage",
        type=Path,
        default=DEFAULT_STORAGE,
        help="Path to the JSON file used to store lobby data.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    register = subparsers.add_parser("register", help="Register a new astro-cat")
    register.add_argument("name", help="Name of the cat")
    register.add_argument("rank", help="Rank or title of the cat")

    assign = subparsers.add_parser("assign", help="Assign a mission to a cat")
    assign.add_argument("name", help="Name of the cat")
    assign.add_argument("mission", help="Description of the mission")

    subparsers.add_parser("summary", help="Show a summary of the lobby")

    return parser


def _ensure_controller(storage: Path) -> LobbyController:
    controller = LobbyController(storage_path=storage)
    controller.load()
    return controller


def _print_lines(lines: Iterable[str]) -> None:
    for line in lines:
        print(line)


def main(argv: Optional[List[str]] = None) -> int:
    """Run the CLI."""
    parser = build_parser()
    args = parser.parse_args(argv)

    controller = _ensure_controller(args.storage)

    if args.command == "register":
        cat = controller.register_cat(args.name, args.rank)
        print(f"Registered {cat.name} with rank {cat.rank}.")
        return 0
    if args.command == "assign":
        cat = controller.assign_mission(args.name, args.mission)
        print(f"Assigned mission to {cat.name}: {cat.missions[-1]}")
        return 0
    if args.command == "summary":
        summary = controller.summary()
        _print_lines(summary.splitlines())
        if not summary:
            print("No cats registered.")
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())

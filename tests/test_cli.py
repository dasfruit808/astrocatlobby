from pathlib import Path

import pytest

from astrocatlobby import cli


@pytest.mark.parametrize("command", [["summary"]])
def test_summary_on_empty_state(tmp_path: Path, capsys, command):
    storage = tmp_path / "state.json"
    exit_code = cli.main(["--storage", str(storage), *command])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "No cats registered" in captured.out


def test_register_and_assign_via_cli(tmp_path: Path, capsys):
    storage = tmp_path / "state.json"

    exit_code = cli.main([
        "--storage",
        str(storage),
        "register",
        "Nova",
        "Captain",
    ])
    assert exit_code == 0

    exit_code = cli.main([
        "--storage",
        str(storage),
        "assign",
        "Nova",
        "Inspect moon base",
    ])
    assert exit_code == 0

    exit_code = cli.main(["--storage", str(storage), "summary"])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "Nova" in captured.out
    assert "Inspect moon base" in captured.out

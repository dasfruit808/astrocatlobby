"""Launch a tiny static web server that hosts the Astrocat lobby game."""

from __future__ import annotations

import argparse
import contextlib
import http.server
import os
import socketserver
from pathlib import Path
from typing import Iterator


def _candidate_ports(start: int) -> Iterator[int]:
    """Yield a sequence of candidate ports starting at ``start``.

    The helper allows us to gracefully fall back to the next available port if
    the default is already in use. The iteration is intentionally short because
    we only need one working port to serve the static files.
    """

    for offset in range(10):
        yield start + offset


class _StaticDirectoryHandler(http.server.SimpleHTTPRequestHandler):
    """A request handler that always serves from the packaged static assets."""

    def __init__(self, *args, directory: str | None = None, **kwargs):  # type: ignore[override]
        static_dir = Path(__file__).with_name("static")
        super().__init__(*args, directory=str(static_dir), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - match base signature
        """Silence the default stdout logging for a cleaner console experience."""

        pass


def _serve(port: int) -> socketserver.TCPServer:
    handler = _StaticDirectoryHandler
    server = socketserver.TCPServer(("127.0.0.1", port), handler, bind_and_activate=False)
    with contextlib.suppress(OSError):
        server.allow_reuse_address = True
    server.server_bind()
    server.server_activate()
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000, help="Port to bind the static server to")
    args = parser.parse_args()

    for port in _candidate_ports(args.port):
        try:
            with _serve(port) as httpd:
                address, bound_port = httpd.server_address
                host = "localhost" if address in {"127.0.0.1", "0.0.0.0"} else address
                print(f"Serving Astrocat Lobby game on http://{host}:{bound_port}")
                print("Press Ctrl+C to stop the server.")
                httpd.serve_forever()
                return
        except OSError as exc:  # Port in use, try next one.
            if exc.errno != getattr(os, "EADDRINUSE", None):
                raise
            continue
    raise RuntimeError("Unable to bind a port for the Astrocat Lobby game server")


if __name__ == "__main__":  # pragma: no cover - manual invocation entry point
    main()

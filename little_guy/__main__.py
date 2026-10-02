"""Command-line entry point for ``python -m little_guy``."""

from __future__ import annotations

import argparse
from pathlib import Path

from .server import serve


def main() -> None:
    default_data = Path.home() / ".local" / "share" / "my-lil-guys-for-suno"
    default_source = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Run the local Little Guy Machine composition notebook.")
    parser.add_argument("--host", default="127.0.0.1", help="Interface to bind (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8000, help="Port to serve on (default: 8000).")
    parser.add_argument(
        "--database",
        type=Path,
        default=default_data / "library.sqlite3",
        help=f"SQLite library location (default: {default_data / 'library.sqlite3'}).",
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=default_source,
        help="Directory containing exported Little Guy Markdown archives.",
    )
    args = parser.parse_args()
    serve(args.host, args.port, args.database.expanduser(), args.source_dir.expanduser())


if __name__ == "__main__":
    main()

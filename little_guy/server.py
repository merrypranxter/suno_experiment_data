"""Local-only HTTP interface for the Little Guy Machine notebook."""

from __future__ import annotations

import json
import logging
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from .composer import build_prompt
from .store import SQLiteStore

MAX_REQUEST_BYTES = 256_000
WEB_ROOT = Path(__file__).with_name("web")


class LittleGuyServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], store: SQLiteStore):
        self.store = store
        super().__init__(address, RequestHandler)


class RequestHandler(BaseHTTPRequestHandler):
    server: LittleGuyServer
    server_version = "LittleGuyMachine/0.1"

    def do_GET(self) -> None:
        route = urlsplit(self.path)
        path = route.path
        if path == "/api/stats":
            self._json(self.server.store.stats())
            return
        if path == "/api/engines":
            self._json(self.server.store.engines())
            return
        if path == "/api/sessions":
            self._json(self.server.store.list_sessions())
            return
        if path == "/api/runs":
            query = parse_qs(route.query)
            search = query.get("q", [""])[0]
            starred = query.get("starred", [""])[0].casefold() in {"1", "true", "yes"}
            session_id = query.get("session_id", [""])[0]
            try:
                limit = int(query.get("limit", ["300"])[0])
            except ValueError:
                limit = 300
            self._json(self.server.store.list_runs(search, starred, limit, session_id))
            return
        if path.startswith("/api/runs/"):
            run_id, _, action = unquote(path[len("/api/runs/") :]).partition("/")
            if action == "export":
                markdown = self.server.store.markdown_export(run_id)
                if markdown is None:
                    self._json({"error": "Run not found."}, 404)
                else:
                    self._send(
                        markdown.encode("utf-8"),
                        "text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{quote(run_id, safe="")}.md"'},
                    )
                return
            run = self.server.store.get_run(run_id)
            self._json(run if run is not None else {"error": "Run not found."}, 200 if run else 404)
            return
        self._static(path)

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/preview":
            try:
                prompt = build_prompt(self._read_json())
            except ValueError as exc:
                self._json({"error": str(exc)}, 400)
                return
            self._json({"prompt": prompt})
            return
        if path != "/api/runs":
            self._json({"error": "Not found."}, 404)
            return
        try:
            payload = self._read_json()
            run = self.server.store.add_prompt_run(payload)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
            return
        self._json(run, 201)

    def do_PATCH(self) -> None:
        path = urlsplit(self.path).path
        if not path.startswith("/api/runs/"):
            self._json({"error": "Not found."}, 404)
            return
        run_id = unquote(path[len("/api/runs/") :])
        if "/" in run_id:
            self._json({"error": "Not found."}, 404)
            return
        try:
            updated = self.server.store.update_run(run_id, self._read_json())
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
            return
        self._json(updated if updated is not None else {"error": "Run not found."}, 200 if updated else 404)

    def _read_json(self) -> dict:
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid request size.") from exc
        if size < 0 or size > MAX_REQUEST_BYTES:
            raise ValueError("Request is too large.")
        try:
            payload = json.loads(self.rfile.read(size) or b"{}")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Request body must be valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    def _static(self, request_path: str) -> None:
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        target = (WEB_ROOT / relative).resolve()
        try:
            target.relative_to(WEB_ROOT.resolve())
        except ValueError:
            self._json({"error": "Not found."}, 404)
            return
        if not target.is_file():
            self._json({"error": "Not found."}, 404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self._send(target.read_bytes(), content_type)

    def _json(self, value: object, status: int = 200) -> None:
        content = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self._send(content, "application/json; charset=utf-8", status)

    def _send(self, content: bytes, content_type: str, status: int = 200, headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: object) -> None:
        logging.info("%s - %s", self.address_string(), format % args)


def serve(host: str, port: int, database: Path, source_dir: Path) -> None:
    store = SQLiteStore(database)
    imported = store.import_archives(source_dir)
    app = LittleGuyServer((host, port), store)
    print(f"Little Guy Machine is ready at http://{host}:{app.server_port}")
    print(f"Imported {imported} new runs. Library: {database}")
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Little Guy Machine.")
    finally:
        app.server_close()

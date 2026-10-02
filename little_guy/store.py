"""SQLite persistence for imported archives and newly composed prompts."""

from __future__ import annotations

import json
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

from .archive import load_archives
from .composer import DIMENSIONS, build_prompt


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _run_id() -> str:
    return f"run_{int(time.time() * 1000)}_{secrets.token_hex(3)}"


def _session_id() -> str:
    return f"session_{int(time.time() * 1000)}_{secrets.token_hex(3)}"


def _decode(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    result = dict(row)
    for key in ("stack", "reality_engines", "composition_engines", "metrics", "tags", "metadata", "form_data"):
        result[key] = json.loads(result[key] or "{}") if key in {"metrics", "metadata", "form_data"} else json.loads(result[key] or "[]")
    result["starred"] = bool(result["starred"])
    return result


class SQLiteStore:
    def __init__(self, database: Path):
        self.database = database
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    created TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'created'
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    session_id TEXT REFERENCES sessions(id),
                    created TEXT NOT NULL,
                    source_path TEXT NOT NULL DEFAULT '',
                    title TEXT NOT NULL DEFAULT '',
                    seed TEXT NOT NULL DEFAULT '',
                    energy INTEGER,
                    model TEXT NOT NULL DEFAULT '',
                    stack TEXT NOT NULL DEFAULT '[]',
                    reality_engines TEXT NOT NULL DEFAULT '[]',
                    composition_engines TEXT NOT NULL DEFAULT '[]',
                    metrics TEXT NOT NULL DEFAULT '{}',
                    fingerprint TEXT NOT NULL DEFAULT '',
                    style TEXT NOT NULL DEFAULT '',
                    lyrics TEXT NOT NULL DEFAULT '',
                    caption TEXT NOT NULL DEFAULT '',
                    prompt TEXT NOT NULL DEFAULT '',
                    starred INTEGER NOT NULL DEFAULT 0,
                    feedback TEXT NOT NULL DEFAULT '',
                    tags TEXT NOT NULL DEFAULT '[]',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    form_data TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS runs_created_idx ON runs(created DESC);
                CREATE INDEX IF NOT EXISTS runs_session_idx ON runs(session_id);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def import_archives(self, directory: Path) -> int:
        imported = 0
        with self._connect() as connection:
            for run in load_archives(directory):
                session_id = run["session_id"] or None
                if session_id:
                    connection.execute(
                        "INSERT OR IGNORE INTO sessions (id, created, title, source) VALUES (?, ?, ?, ?)",
                        (session_id, run["created"] or _now(), f"Imported session · {session_id}", "archive"),
                    )
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO runs (
                        id, session_id, created, source_path, title, seed, energy, model, stack,
                        reality_engines, composition_engines, metrics, fingerprint, style, lyrics,
                        caption, starred, feedback, tags, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run["id"],
                        session_id,
                        run["created"] or _now(),
                        run["source_path"],
                        run["title"],
                        run["seed"],
                        run["energy"],
                        run["model"],
                        json.dumps(run["stack"]),
                        json.dumps(run["reality_engines"]),
                        json.dumps(run["composition_engines"]),
                        json.dumps(run["metrics"]),
                        run["fingerprint"],
                        run["style"],
                        run["lyrics"],
                        run["caption"],
                        int(run["starred"]),
                        run["feedback"],
                        json.dumps(run["tags"]),
                        json.dumps(run["metadata"]),
                    ),
                )
                imported += cursor.rowcount
        return imported

    def list_runs(self, query: str = "", starred: bool = False, limit: int = 300) -> list[dict[str, Any]]:
        clauses: list[str] = []
        values: list[Any] = []
        if starred:
            clauses.append("starred = 1")
        if query.strip():
            clauses.append(
                "(title LIKE ? OR seed LIKE ? OR fingerprint LIKE ? OR source_path LIKE ? OR style LIKE ? OR lyrics LIKE ?)"
            )
            needle = f"%{query.strip()[:120]}%"
            values.extend([needle] * 6)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT * FROM runs {where} ORDER BY created DESC, id DESC LIMIT ?",
                (*values, max(1, min(limit, 500))),
            ).fetchall()
        return [run for row in rows if (run := _decode(row)) is not None]

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return _decode(row)

    def add_prompt_run(self, data: dict[str, Any]) -> dict[str, Any]:
        prompt = build_prompt(data)
        created = _now()
        session_id = str(data.get("session_id") or "").strip() or _session_id()
        title = str(data.get("session_title") or "New composition session").strip()[:120]
        run_id = _run_id()
        seed = str(data.get("seed", "")).strip()
        dimensions = data.get("dimensions") if isinstance(data.get("dimensions"), dict) else {}
        composition_engines = [
            item.strip()
            for item in data.get("operators", "").splitlines()
            if isinstance(item, str) and item.strip()
        ] if isinstance(data.get("operators"), str) else []
        form_data = {key: data.get(key) for key in ("dimensions", "anchor", "operators", "cast", "arrangement", "constraints")}
        with self._connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO sessions (id, created, title) VALUES (?, ?, ?)",
                (session_id, created, title),
            )
            connection.execute(
                """
                INSERT INTO runs (
                    id, session_id, created, title, seed, energy, model, composition_engines,
                    prompt, form_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    session_id,
                    created,
                    seed[:180] or "Untitled composition",
                    seed,
                    int(data.get("energy", 3)),
                    str(data.get("model", "")).strip()[:100],
                    json.dumps(composition_engines),
                    prompt,
                    json.dumps(form_data),
                ),
            )
        run = self.get_run(run_id)
        assert run is not None
        return run

    def update_run(self, run_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        allowed = {"starred", "feedback", "tags"}
        updates = {key: value for key, value in data.items() if key in allowed}
        if "starred" in updates:
            updates["starred"] = int(bool(updates["starred"]))
        if "feedback" in updates:
            updates["feedback"] = str(updates["feedback"])[:4000]
        if "tags" in updates:
            tags = updates["tags"]
            if isinstance(tags, str):
                tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
            if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
                raise ValueError("Tags must be text.")
            updates["tags"] = json.dumps([tag.strip()[:60] for tag in tags[:20] if tag.strip()])
        if updates:
            assignment = ", ".join(f"{column} = ?" for column in updates)
            with self._connect() as connection:
                connection.execute(
                    f"UPDATE runs SET {assignment} WHERE id = ?",
                    (*updates.values(), run_id),
                )
        return self.get_run(run_id)

    def stats(self) -> dict[str, int]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*) AS runs,
                       COUNT(DISTINCT session_id) AS sessions,
                       SUM(CASE WHEN starred = 1 THEN 1 ELSE 0 END) AS starred,
                       COUNT(DISTINCT source_path) AS archives
                FROM runs
                """
            ).fetchone()
        return {key: int(row[key] or 0) for key in ("runs", "sessions", "starred", "archives")}

    def engines(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute("SELECT stack, reality_engines, composition_engines FROM runs").fetchall()
        names: set[str] = set()
        for row in rows:
            for column in ("stack", "reality_engines", "composition_engines"):
                names.update(item for item in json.loads(row[column] or "[]") if item)
        return sorted(names, key=str.casefold)

    def markdown_export(self, run_id: str) -> str | None:
        run = self.get_run(run_id)
        if run is None:
            return None
        fields = (
            ("Run ID", run["id"]),
            ("Created", run["created"]),
            ("Session ID", run["session_id"] or "—"),
            ("Seed", run["seed"] or "—"),
            ("Energy", run["energy"] or "—"),
            ("Model", run["model"] or "—"),
            ("Reality engines", " → ".join(run["reality_engines"]) or "(none)"),
            ("Composition engines", " → ".join(run["composition_engines"]) or "(none)"),
            ("Starred", "Yes" if run["starred"] else "No"),
            ("Feedback", run["feedback"] or "None"),
        )
        output = ["# LITTLE GUY MACHINE — RUN", ""]
        output.extend(f"**{name}:** {value}" for name, value in fields)
        output.extend(
            [
                "",
                "## STYLE",
                "",
                "```text",
                run["style"] or "(Not recorded yet)",
                "```",
                "",
                "## LYRICS / CONTROL",
                "",
                "```text",
                run["lyrics"] or "(Not recorded yet)",
                "```",
                "",
                "## CAPTION",
                "",
                "```text",
                run["caption"] or "(Not recorded yet)",
                "```",
            ]
        )
        if run["prompt"]:
            output.extend(["", "## COMPOSITION PROMPT", "", "```text", run["prompt"], "```"])
        return "\n".join(output) + "\n"

    @staticmethod
    def dimension_labels() -> tuple[tuple[str, str], ...]:
        return DIMENSIONS

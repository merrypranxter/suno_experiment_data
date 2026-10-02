"""Import the repository's Markdown run archives without changing their source files."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any


RUN_HEADING = re.compile(r"(?m)^# LITTLE GUY MACHINE — RUN\s*$")
FIELD = re.compile(r"(?m)^\*\*([^*\n]+):\*\*\s*(.*)$")
SECTION = re.compile(r"(?m)^##\s+([^\n]+)\s*$")
ARROW = re.compile(r"\s*(?:→|->)\s*")


def _section(block: str, name: str) -> str:
    matches = list(SECTION.finditer(block))
    wanted = name.casefold()
    for index, match in enumerate(matches):
        if match.group(1).strip().casefold() != wanted:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
        content = block[match.end() : end].strip()
        fenced = re.search(r"```[^\n]*\n(.*?)```", content, re.S)
        return (fenced.group(1) if fenced else content).strip()
    return ""


def _list(value: str) -> list[str]:
    value = value.strip()
    if not value or value.casefold() in {"(none)", "none"}:
        return []
    return [part.strip() for part in ARROW.split(value) if part.strip()]


def parse_archive(text: str, source_path: str = "") -> list[dict[str, Any]]:
    """Parse run headings and the common structured sections in exported archives."""
    headings = list(RUN_HEADING.finditer(text))
    runs: list[dict[str, Any]] = []
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        block = text[heading.end() : end].strip()
        fields = {match.group(1).strip(): match.group(2).strip() for match in FIELD.finditer(block)}
        run_id = fields.get("Run ID")
        if not run_id:
            digest = hashlib.sha1(f"{source_path}:{index}".encode()).hexdigest()[:12]
            run_id = f"import_{digest}"

        raw_metrics = fields.get("Music seed stack", "")
        metrics = {
            key: int(value)
            for key, value in re.findall(r"\b([A-Za-z][\w-]*)\s*[=:]\s*(\d{1,3})\b", raw_metrics)
            if 0 <= int(value) <= 100
        }
        reality = fields.get("Reality engines", "")
        composition = fields.get("Composition engines", "")
        created = fields.get("Created", fields.get("Started", ""))
        title = fields.get("Seed", "") or fields.get("Musical fingerprint", "") or run_id
        runs.append(
            {
                "id": run_id,
                "session_id": fields.get("Session ID", ""),
                "created": created,
                "source_path": source_path,
                "title": title[:180],
                "seed": fields.get("Seed", ""),
                "energy": _energy(fields.get("Energy", "")),
                "model": fields.get("Model", ""),
                "stack": _list(fields.get("Stack", "")),
                "reality_engines": _list(reality),
                "composition_engines": _list(composition),
                "metrics": metrics,
                "fingerprint": fields.get("Musical fingerprint", ""),
                "style": _section(block, "STYLE"),
                "lyrics": _section(block, "LYRICS / CONTROL"),
                "caption": _section(block, "CAPTION"),
                "starred": fields.get("Starred", "").casefold() in {"yes", "true"},
                "feedback": "" if fields.get("Feedback", "").casefold() == "none" else fields.get("Feedback", ""),
                "tags": _list(fields.get("Feedback tags", "")),
                "metadata": fields,
            }
        )
    return runs


def _energy(value: str) -> int | None:
    match = re.search(r"\b([1-5])\b", value)
    return int(match.group(1)) if match else None


def load_archives(directory: Path) -> list[dict[str, Any]]:
    """Read Markdown files directly inside a source directory in a stable order."""
    runs: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        runs.extend(parse_archive(text, path.name))
    return runs

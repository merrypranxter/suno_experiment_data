from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from little_guy.archive import parse_archive
from little_guy.composer import build_prompt
from little_guy.server import LittleGuyServer
from little_guy.store import SQLiteStore


SAMPLE_RUN = """# LITTLE GUY MACHINE — RUN

**Run ID:** run_123_sample
**Created:** 2026-09-30T12:00:00Z
**Session ID:** session_123_sample
**Stack:** recall-mold → anchor-survival
**Reality engines:** (none)
**Composition engines:** sound-santur-persian → gesture-chest-percussion
**Music seed stack:** recipes=ANCHOR UNDER SIEGE | stemminess=74 | coupling=82
**Seed:** A clock that forgets how to tick
**Energy:** 4
**Model:** procedural-synthesizer
**Starred:** Yes
**Feedback:** The little pulse stayed legible.
**Feedback tags:** pulse, anchor
**Musical fingerprint:** Deadpan clockwork art-rock

## STYLE

```text
Dry strings and a stubborn pulse.
```

## LYRICS / CONTROL

```text
[Intro]
The clock forgets to tick.
```

## CAPTION

```text
A clockwork song with an invariant pulse.
```
"""


class ArchiveTests(unittest.TestCase):
    def test_parses_archive_metadata_lists_and_output_sections(self) -> None:
        runs = parse_archive(SAMPLE_RUN, "sample.md")
        self.assertEqual(len(runs), 1)
        run = runs[0]
        self.assertEqual(run["id"], "run_123_sample")
        self.assertEqual(run["session_id"], "session_123_sample")
        self.assertEqual(run["energy"], 4)
        self.assertEqual(run["stack"], ["recall-mold", "anchor-survival"])
        self.assertEqual(run["reality_engines"], [])
        self.assertEqual(run["composition_engines"], ["sound-santur-persian", "gesture-chest-percussion"])
        self.assertEqual(run["metrics"], {"stemminess": 74, "coupling": 82})
        self.assertTrue(run["starred"])
        self.assertEqual(run["tags"], ["pulse", "anchor"])
        self.assertIn("stubborn pulse", run["style"])
        self.assertIn("forget", run["lyrics"])
        self.assertIn("invariant pulse", run["caption"])

    def test_generates_stable_ids_for_runs_without_an_exported_id(self) -> None:
        text = SAMPLE_RUN.replace("**Run ID:** run_123_sample\n", "")
        first = parse_archive(text, "same.md")[0]["id"]
        second = parse_archive(text, "same.md")[0]["id"]
        other_file = parse_archive(text, "other.md")[0]["id"]
        self.assertEqual(first, second)
        self.assertNotEqual(first, other_file)


class ComposerTests(unittest.TestCase):
    def test_blueprint_keeps_assignments_and_rules_separate(self) -> None:
        prompt = build_prompt(
            {
                "seed": "A clock that forgets how to tick",
                "energy": 4,
                "dimensions": {
                    "harmony": "freeze on an unresolved chord",
                    "rhythm": "double activity without changing the base pulse",
                },
                "anchor": "a three-note whistle",
                "operators": ["Let the crowd inherit the pulse after the second interruption."],
                "cast": "One dry narrator; a crowd joins in stages.",
            }
        )
        self.assertIn("SEPARATE MUSICAL JURISDICTIONS", prompt)
        self.assertIn("HARMONY: freeze on an unresolved chord", prompt)
        self.assertIn("RHYTHM: double activity", prompt)
        self.assertIn("three-note whistle", prompt)
        self.assertIn("crowd inherit the pulse", prompt)
        self.assertIn("LYRICS / CONTROL", prompt)

    def test_rejects_missing_seed_and_out_of_range_energy(self) -> None:
        with self.assertRaisesRegex(ValueError, "seed"):
            build_prompt({"seed": "  "})
        with self.assertRaisesRegex(ValueError, "1 to 5"):
            build_prompt({"seed": "A seed", "energy": 9})


class StoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.archive_dir = root / "archives"
        self.archive_dir.mkdir()
        (self.archive_dir / "sample.md").write_text(SAMPLE_RUN, encoding="utf-8")
        self.store = SQLiteStore(root / "library.sqlite3")

    def test_import_is_idempotent_searchable_and_editable(self) -> None:
        self.assertEqual(self.store.import_archives(self.archive_dir), 1)
        self.assertEqual(self.store.import_archives(self.archive_dir), 0)
        self.assertEqual(self.store.stats(), {"runs": 1, "sessions": 1, "starred": 1, "archives": 1})
        matches = self.store.list_runs("stubborn pulse")
        self.assertEqual([run["id"] for run in matches], ["run_123_sample"])
        updated = self.store.update_run("run_123_sample", {"starred": False, "feedback": "Keep the clock pulse.", "tags": "clock, pulse"})
        self.assertFalse(updated["starred"])
        self.assertEqual(updated["tags"], ["clock", "pulse"])

    def test_saved_prompt_can_be_exported(self) -> None:
        run = self.store.add_prompt_run({"seed": "A clock that forgets how to tick", "energy": 5, "anchor": "a whistle"})
        self.assertTrue(run["id"].startswith("run_"))
        self.assertIn("a whistle", run["prompt"])
        markdown = self.store.markdown_export(run["id"])
        self.assertIn("## COMPOSITION PROMPT", markdown)
        self.assertIn("LYRICS / CONTROL", markdown)

    def test_runs_can_continue_in_an_existing_session(self) -> None:
        first = self.store.add_prompt_run({"seed": "First variation", "session_title": "Clock studies"})
        second = self.store.add_prompt_run(
            {"seed": "Second variation", "session_title": "Ignored title", "session_id": first["session_id"]}
        )
        self.assertEqual(first["session_id"], second["session_id"])
        self.assertEqual(len(self.store.list_runs(session_id=first["session_id"])), 2)
        sessions = self.store.list_sessions()
        created = next(session for session in sessions if session["id"] == first["session_id"])
        self.assertEqual(created["title"], "Clock studies")
        self.assertEqual(created["run_count"], 2)


class ApiTests(unittest.TestCase):
    def test_preview_create_feedback_and_export(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = SQLiteStore(Path(temp) / "library.sqlite3")
            server = LittleGuyServer(("127.0.0.1", 0), store)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
            base = f"http://127.0.0.1:{server.server_port}"

            with urlopen(base) as response:
                self.assertIn("text/html", response.headers["Content-Type"])
                self.assertIn("Composition library", response.read().decode())

            preview_request = Request(
                f"{base}/api/preview",
                data=json.dumps({"seed": "A clockwork moth", "energy": 3}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(preview_request) as response:
                self.assertIn("COMPOSITION BLUEPRINT", json.load(response)["prompt"])

            create_request = Request(
                f"{base}/api/runs",
                data=json.dumps({"seed": "A clockwork moth", "energy": 3}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(create_request) as response:
                self.assertEqual(response.status, 201)
                run = json.load(response)

            update_request = Request(
                f"{base}/api/runs/{run['id']}",
                data=json.dumps({"starred": True}).encode(),
                headers={"Content-Type": "application/json"},
                method="PATCH",
            )
            with urlopen(update_request) as response:
                self.assertTrue(json.load(response)["starred"])

            with urlopen(f"{base}/api/runs/{run['id']}/export") as response:
                self.assertIn("text/markdown", response.headers["Content-Type"])
                self.assertIn("COMPOSITION PROMPT", response.read().decode())


if __name__ == "__main__":
    unittest.main()

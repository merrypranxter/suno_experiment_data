"""Turn composition controls into a structured, Suno-ready instruction."""

from __future__ import annotations

from typing import Any


DIMENSIONS = (
    ("harmony", "Harmony"),
    ("melody", "Melody"),
    ("rhythm", "Rhythm"),
    ("timbre", "Timbre / atmosphere"),
    ("vocals", "Vocal behavior"),
    ("performance", "Performance attitude"),
)


def build_prompt(data: dict[str, Any]) -> str:
    seed = _clean(data.get("seed"))
    if not seed:
        raise ValueError("Add a seed or subject before building a composition prompt.")

    try:
        energy = int(data.get("energy", 3))
    except (TypeError, ValueError) as exc:
        raise ValueError("Energy must be a number from 1 to 5.") from exc
    if not 1 <= energy <= 5:
        raise ValueError("Energy must be a number from 1 to 5.")

    dimensions = data.get("dimensions") or {}
    sections = [
        "MY LIL GUYS FOR SUNO — COMPOSITION BLUEPRINT",
        "",
        "SEED",
        seed,
        "",
        f"ENERGY: {energy}/5",
        f"MODEL NOTE: {_clean(data.get('model')) or 'Choose a model in Suno'}",
        "",
        "SEPARATE MUSICAL JURISDICTIONS",
        "Do not blend the assignments into genre soup. Keep each system's rules audible, "
        "let them negotiate through specific musical events, and preserve their differences.",
    ]
    for key, label in DIMENSIONS:
        assignment = _clean(dimensions.get(key))
        if assignment:
            sections.append(f"{label.upper()}: {assignment}")

    anchor = _clean(data.get("anchor"))
    if anchor:
        sections.extend(
            [
                "",
                "ANCHOR / INVARIANT",
                f"{anchor} Keep this identity recognizable through the changes; mutate its "
                "surroundings more than the anchor itself.",
            ]
        )

    operators = _lines(data.get("operators"))
    if operators:
        sections.extend(["", "COMPOSITION OPERATORS"])
        sections.extend(f"- {operator}" for operator in operators)

    cast = _clean(data.get("cast"))
    if cast:
        sections.extend(["", "CAST AND ROLE OWNERSHIP", cast])

    arrangement = _clean(data.get("arrangement"))
    if arrangement:
        sections.extend(["", "EVENT-DRIVEN ARRANGEMENT", arrangement])

    constraints = _clean(data.get("constraints"))
    if constraints:
        sections.extend(["", "CONSTRAINTS", constraints])

    sections.extend(
        [
            "",
            "OUTPUT",
            "Return three clearly separated sections:",
            "1. STYLE — a concise, specific sound-world and production description.",
            "2. LYRICS / CONTROL — a complete, performable composition with section labels, "
            "instrument/voice roles, concrete musical actions, transitions, and consequences. "
            "Make the rules operational, not decorative.",
            "3. CAPTION — a compact summary of the governing systems and their interaction.",
            "",
            "Keep the result musically legible. Make each strange event have a cause, let an "
            "identifiable anchor survive, and favor excitement with structural clarity over "
            "randomness for its own sake.",
        ]
    )
    return "\n".join(sections)


def _clean(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _lines(value: Any) -> list[str]:
    if isinstance(value, list):
        return [line.strip() for line in value if isinstance(line, str) and line.strip()]
    return [line.strip(" \t-*") for line in _clean(value).splitlines() if line.strip(" \t-*")]

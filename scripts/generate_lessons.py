#!/usr/bin/env python3
"""Build only provable, playable Sudoku lessons from independently verified traces.

A lesson never invents candidate masks. A domain is the exact *intermediate*
state before a recorded deduction in the no-guess solver, not a fabricated
list of possible digits. Missing methods are omitted instead of published
with a misleading answer.
"""
from __future__ import annotations

import json
from pathlib import Path

from technique_catalog import METHODS
from variant_logic import count_solutions, houses
from technique_catalog import replay_trace

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/puzzles/variants"
OUTPUT = ROOT / "src/lesson-fixtures.js"

# Each lesson needs a genuinely matching solver step, not just a solution
# containing its final digit. Repeated topics deliberately share a method.
LESSON_METHODS = {
    1: "peer_elimination", 2: "hidden_single",
    3: "naked_subset", 4: "naked_subset", 5: "hidden_subset",
    6: "locked_candidate", 7: "x_wing", 8: "swordfish",
    9: "jellyfish", 10: "xy_wing", 11: "xyz_wing",
    12: "skyscraper", 13: "killer_sum", 14: "killer_outie",
    15: "thermo", 16: "mixed_consecutive_partition",
    17: "renban", 18: "whisper", 19: "arrow",
    20: "region_sum", 21: "entropic", 22: "modular",
    23: "entropic_modular_cross", 24: "between",
    25: "mixed_consecutive_partition",
}


def given_values(puzzle):
    n = len(puzzle["cells"])
    return {r*n+c: int(cell["value"])
            for r, row in enumerate(puzzle["cells"])
            for c, cell in enumerate(row) if cell.get("value")}


def clue_domains(n, givens):
    units = houses(n)
    peers = [set().union(*(set(unit) for unit in units if i in unit)) - {i}
             for i in range(n*n)]
    return [{givens[i]} if i in givens else
            set(range(1, n+1)) - {givens[j] for j in peers[i] if j in givens}
            for i in range(n*n)]


def focus_cells(n, cell, source):
    found = {cell}
    units = houses(n)
    if isinstance(source, int) and 0 <= source < len(units):
        found.update(units[source])
    elif isinstance(source, dict):
        def visit(value, key=""):
            if isinstance(value, dict):
                for k, v in value.items():
                    visit(v, k.lower())
            elif isinstance(value, (list, tuple)):
                for item in value:
                    visit(item, key)
            elif (isinstance(value, int) and not isinstance(value, bool)
                  and 0 <= value < n*n and
                  ("cell" in key or key in
                   ("pivot", "pincer", "wing", "a", "b", "tip", "base"))):
                found.add(value)
        visit(source)
    return sorted(found)


def make_fixture(id_, puzzle, masks, step, step_index=0):
    n = len(puzzle["cells"])
    solution = list(map(int, puzzle["metadata"]["solution"]))
    givens = given_values(puzzle)
    cell = step["cell"]
    removed = list(step["removed"])
    if not removed or cell in givens or not removed[0] in masks[cell]:
        raise ValueError(f"Invalid lesson step {id_}")
    if len(masks) != n*n or any(not domain or
                                solution[i] not in domain
                                for i, domain in enumerate(masks)):
        raise ValueError(f"Untruthful lesson candidates {id_}")
    # The solved grid itself is a perfect all-different witness for every
    # house, so the notorious eight {1,2,8} + one {3,6,9} case fails.
    digits = list(range(1, n+1))
    for unit in houses(n):
        if sorted(solution[i] for i in unit) != digits:
            raise ValueError(f"Invalid completed Sudoku {id_}")
        if set().union(*(masks[i] for i in unit)) != set(digits):
            raise ValueError(f"Impossible house domains in lesson {id_}")
    if id_ == 3 and step["source"].get("size") != 2:
        raise ValueError("Not a naked pair")
    if id_ == 4 and step["source"].get("size") != 3:
        raise ValueError("Not a naked triple")
    kind = "fill" if step["method"] == "hidden_single" else "remove"
    if kind == "fill":
        remaining = list(step["remaining"])
        if len(remaining) != 1:
            raise ValueError("A hidden single must force exactly one digit")
        digit = remaining[0]
    else:
        digit = removed[0]
        if digit == solution[cell]:
            raise ValueError("The lesson tries to remove the true answer")
    return {
        "id": id_, "n": n, "puzzle": puzzle,
        "masks": [sorted(domain) for domain in masks],
        "goal": {"index": cell, "digit": str(digit), "kind": kind},
        "focus": focus_cells(n, cell, step.get("source")),
        "method": step["method"],
        "nameZh": METHODS[step["method"]][0],
        "proof": {"method": step["method"], "source": step.get("source"),
                  "removed": removed, "remaining": step["remaining"],
                  "stepIndex": step_index},
    }


def matching_example(id_, step):
    if step["method"] != LESSON_METHODS[id_]:
        return False
    size = step.get("source")
    if id_ in (3, 4, 5):
        if not isinstance(size, dict):
            return False
        expected = {3: 2, 4: 3, 5: 2}[id_]
        if size.get("size") != expected:
            return False
    return True


def collect_report_examples():
    report = json.loads((SOURCE / "validation.json").read_text(encoding="utf-8"))
    examples = {}
    for detail in report["puzzles"]:
        puzzle = json.loads((SOURCE / (detail["id"] + ".json"))
                            .read_text(encoding="utf-8"))
        n = detail["size"]
        givens = given_values(puzzle)
        trace = detail["trace"]
        solution = list(map(int, puzzle["metadata"]["solution"]))
        replayed = replay_trace(n, givens, trace)
        if any(domain != {solution[i]} for i, domain in enumerate(replayed)):
            raise ValueError("Workshop trace does not reconstruct its solution")
        # The source generator already asserts independent uniqueness.
        masks = [set(range(1, n+1)) for _ in range(n*n)]
        for cell, digit in givens.items():
            masks[cell] = {digit}
        for index, step in enumerate(trace):
            for id_, method in LESSON_METHODS.items():
                if id_ in (1, 2) or id_ in examples:
                    continue
                if not matching_example(id_, step):
                    continue
                if step["cell"] in givens:
                    continue
                if len(masks[step["cell"]]) < 2:
                    continue
                try:
                    examples[id_] = make_fixture(
                        id_, puzzle, masks, step, index)
                except ValueError:
                    pass
            cell, removed = step["cell"], set(step["removed"])
            if not removed <= masks[cell]:
                raise ValueError("Trace removes a nonexistent candidate")
            masks[cell].difference_update(removed)
            if sorted(masks[cell]) != step["remaining"]:
                raise ValueError("Mismatched trace replay")
    return examples


# A deterministic, independently unique standard Sudoku with a genuine
# hidden single at R5C7. The exact current candidates there are {6,7}.
SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
SOLUTION = SOLUTION.translate(str.maketrans("67", "76"))
GIVENS = "034008002760000040198000076050670423420053090613004800900500000000010030345000100"


def anchor_examples():
    n = 9
    base = {i: int(digit) for i, digit in enumerate(GIVENS) if digit != "0"}
    if any(int(SOLUTION[i]) != v for i, v in base.items()):
        raise ValueError("The anchored lesson gives conflict with its solution")
    if count_solutions(9, base, []) != 1:
        raise ValueError("The anchored lesson is not uniquely solvable")
    regions = [[[(r+dr), (c+dc)] for dr in range(3) for dc in range(3)]
               for r in (0, 3, 6) for c in (0, 3, 6)]
    def board(givens):
        return {
            "cells": [[{"value": str(givens[r*9+c])} if r*9+c in givens
                      else {} for c in range(9)] for r in range(9)],
            "regions": regions, "cages": [], "lines": [],
            "arrows": [], "overlays": [], "underlays": [],
            "metadata": {"solution": SOLUTION, "rules":
                         "标准数独：每行、每列及每个 3×3 宫包含数字 1 至 9。"},
        }
    masks = clue_domains(n, base)
    cell = 4*9+6
    row = [4*9+c for c in range(9)]
    if masks[cell] != {6, 7} or [i for i in row if 6 in masks[i]] != [cell]:
        raise ValueError("The R5C7 hidden-single demonstration is invalid")
    hidden = make_fixture(
        2, board(base), masks, {"method": "hidden_single", "cell": cell,
           "removed": [7], "remaining": [6], "source": 4})
    # A basic peer elimination, as an *unprocessed* pencil mark. All other
    # candidates are computed from the givens; only the target's pending
    # elimination remains in the candidate state.
    given_1 = dict(base, **{0: 5})
    basic_masks = clue_domains(n, given_1)
    target = 3  # R1C4
    if target in given_1 or int(SOLUTION[target]) == 5:
        raise ValueError("Invalid peer-elimination example")
    basic_masks[target].add(5)
    basic = make_fixture(
        1, board(given_1), basic_masks,
        {"method": "peer_elimination", "cell": target,
         "removed": [5], "remaining": sorted(basic_masks[target] - {5}),
         "source": 0})
    return {1: basic, 2: hidden}


def generate():
    examples = collect_report_examples()
    examples.update(anchor_examples())
    for id_, fixture in examples.items():
        if fixture["method"] != LESSON_METHODS[id_]:
            raise ValueError("Mismatched lesson technique")
    OUTPUT.write_text(
        "// Generated by scripts/generate_lessons.py; do not edit.\n"
        "export const LESSON_FIXTURES = Object.freeze(" +
        json.dumps(examples, ensure_ascii=False, separators=(",", ":")) +
        ");\n", encoding="utf-8")
    print(f"Generated {len(examples)}/25 proof-backed lesson boards. "
          f"Unavailable (never faked): {sorted(set(LESSON_METHODS) - set(examples))}")
    return examples


if __name__ == "__main__":
    generate()

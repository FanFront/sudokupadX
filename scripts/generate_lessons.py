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
from variant_logic import count_solutions, deduce, houses
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


def focus_cells(n, cell, source, method, constraints=()):
    """Highlight coordinates from a proof, never interpret axis/line IDs as cells."""
    found = {cell}
    units = houses(n)
    if isinstance(source, int):
        if method in ("peer_elimination", "hidden_single") and 0 <= source < len(units):
            found.update(units[source])
        elif 0 <= source < len(constraints):
            found.update(constraints[source]["cells"])
    elif isinstance(source, dict):
        if method in ("x_wing", "swordfish", "jellyfish", "squirmbag"):
            # Fish base/cover contain row/column numbers, not cell IDs.
            vertical = bool(source.get("vertical"))
            for base in source.get("base", ()):
                for cover in source.get("cover", ()):
                    index = cover*n+base if vertical else base*n+cover
                    if 0 <= index < n*n:
                        found.add(index)
            return sorted(found)
        for label in ("house", "sourceHouse", "targetHouse"):
            house = source.get(label)
            if isinstance(house, int) and 0 <= house < len(units):
                found.update(units[house])
        for label in ("line", "cage", "entropic", "modular"):
            cid = source.get(label)
            if isinstance(cid, int) and 0 <= cid < len(constraints):
                found.update(constraints[cid]["cells"])
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
                   ("pivot", "pincer", "wing", "a", "b", "tip",
                    "groups", "group", "segments", "roof", "pincers"))):
                found.add(value)
        visit(source)
    return sorted(found)


def make_fixture(id_, puzzle, masks, step, step_index=0, constraints=()):
    n = len(puzzle["cells"])
    solution = list(map(int, puzzle["metadata"]["solution"]))
    givens = given_values(puzzle)
    cell = step["cell"]
    removed = list(step["removed"])
    direct_fill = step["method"] in ("full_house", "last_digit", "naked_single")
    if (cell in givens or (not removed and not direct_fill) or
            any(digit not in masks[cell] for digit in removed)):
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
    kind = "fill" if step["method"] in ("hidden_single", "full_house",
                "last_digit", "naked_single") else "remove"
    if kind == "fill":
        remaining = list(step["remaining"])
        if len(remaining) != 1:
            raise ValueError("A fill proof must force exactly one digit")
        digit = remaining[0]
        # A Full House, Last Digit or Naked Single is already a valid
        # *placement*, not an artificial elimination of 1..9 candidates.
        if not removed and (not direct_fill or masks[cell] != {digit}):
            raise ValueError("A direct fill must have a real singleton domain")
    else:
        digit = removed[0]
        if digit == solution[cell]:
            raise ValueError("The lesson tries to remove the true answer")
    return {
        "id": id_, "n": n, "puzzle": puzzle,
        "masks": [sorted(domain) for domain in masks],
        "goal": {"index": cell, "digit": str(digit), "kind": kind},
        "focus": focus_cells(n, cell, step.get("source"),
                             step["method"], constraints),
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


def collect_report_examples(with_methods=False):
    report = json.loads((SOURCE / "validation.json").read_text(encoding="utf-8"))
    examples = {}
    method_examples = {}
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
        # Check the finished puzzle independently, even when this script
        # is run against an old report without regenerating that source.
        if count_solutions(n, givens, detail["constraints"]) != 1:
            raise ValueError("Workshop lesson source is not uniquely solvable")
        masks = [set(range(1, n+1)) for _ in range(n*n)]
        for cell, digit in givens.items():
            masks[cell] = {digit}
        for index, step in enumerate(trace):
            # The public Sudopedia curriculum can reuse a proof only when
            # its exact named method was executed on this same grid.
            # Generic subset methods also preserve their exact cardinality.
            if step["cell"] not in givens and len(masks[step["cell"]]) > 1:
                method = step["method"]
                source = step.get("source")
                size = source.get("size") if isinstance(source, dict) else None
                keys = [method] + ([f"{method}:{size}"] if
                                   isinstance(size, int) else [])
                if any(key not in method_examples for key in keys):
                    try:
                        fixture = make_fixture(0, puzzle, masks, step, index,
                                               detail["constraints"])
                        for key in keys:
                            method_examples.setdefault(key, fixture)
                    except ValueError:
                        pass
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
                        id_, puzzle, masks, step, index,
                        detail["constraints"])
                except ValueError:
                    pass
            cell, removed = step["cell"], set(step["removed"])
            if not removed <= masks[cell]:
                raise ValueError("Trace removes a nonexistent candidate")
            masks[cell].difference_update(removed)
            if sorted(masks[cell]) != step["remaining"]:
                raise ValueError("Mismatched trace replay")
    return (examples, method_examples) if with_methods else examples


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
    # A genuine unprocessed peer elimination from the same no-guess
    # solver trace as the variant workshop; no hand-added fake candidate.
    given_1 = dict(base)
    given_1[0] = 5
    basic_masks = [set(range(1, n+1)) for _ in range(n*n)]
    for cell, digit in given_1.items():
        basic_masks[cell] = {digit}
    target = 3  # R1C4
    basic = None
    for step in deduce(n, given_1, [], trace=True)["trace"]:
        if (step["method"] == "peer_elimination" and
                step["cell"] == target and 5 in step["removed"]):
            basic = make_fixture(1, board(given_1), basic_masks, step)
            # Choose 5 from the solver's actual list of removed candidates;
            # deleting any one of them is a valid step of this lesson.
            basic["goal"]["digit"] = "5"
            break
        basic_masks[step["cell"]].difference_update(step["removed"])
    if basic is None:
        raise ValueError("The peer elimination no longer appears in solver proof")
    return {1: basic, 2: hidden}



def anchored_line_examples():
    """Build genuine one-rule deductions on a known unique 9x9 Sudoku.

    The three short paths are checked against the completed grid. Every
    deduction is performed by the very same variant propagator used by
    the actual no-guess solver; no answer is taken from solution metadata.
    """
    from generate_variants import render
    from variant_lines import (propagate_group, propagate_region,
                               region_segments, line_class)

    n = 9
    solution = list(map(int, SOLUTION))
    base = {i: int(digit) for i, digit in enumerate(GIVENS) if digit != "0"}
    regions = [[[(r+dr), (c+dc)] for dr in range(3) for dc in range(3)]
               for r in (0, 3, 6) for c in (0, 3, 6)]
    specifications = [
        # R7C2..C5: 7+1=5+3, with the last cell still unfilled.
        (20, "region_sum", [55, 56, 57, 58], [55, 56, 57], 58),
        # R9C3..C5: 5 is mid, 2 low, 8 high.
        (21, "entropic", [74, 75, 76], [74, 76], 75),
        # R8C2..C4: 8/6/4 occupy three different mod-three classes.
        (22, "modular", [64, 65, 66], [64, 66], 65),
    ]
    result = {}
    for number, method, path, anchors, target in specifications:
        constraint = {"type": method, "cells": path}
        constraints = [constraint]
        if method == "region_sum":
            segments = region_segments(n, path)
            totals = [sum(solution[i] for i in piece) for piece in segments]
            if len(segments) != 2 or len(set(totals)) != 1:
                raise ValueError("Invalid anchored region-sum line")
        elif len({line_class(n, solution[i], method) for i in path}) != 3:
            raise ValueError("Anchored category line contradicts the solution")

        givens = dict(base)
        for i in anchors:
            givens[i] = solution[i]
        if target in givens:
            raise ValueError("The lesson goal must remain editable")
        if count_solutions(n, givens, constraints) != 1:
            raise ValueError("Anchored line practice is not uniquely solvable")
        masks = clue_domains(n, givens)
        snapshots = []
        def reduce(cell, allowed, name, source):
            allowed = set(allowed)
            removed = masks[cell] - allowed
            if not removed:
                return False
            if not allowed & masks[cell]:
                raise ValueError("Variant proof emptied a candidate set")
            snapshot = [set(domain) for domain in masks]
            masks[cell].intersection_update(allowed)
            snapshots.append((snapshot, {"method": name, "cell": cell,
                "removed": sorted(removed), "remaining": sorted(masks[cell]),
                "source": source}))
            return True

        if method == "region_sum":
            propagate_region(n, masks, constraint, 0, reduce)
        else:
            propagate_group(n, masks, constraint, 0, reduce)

        witness = next(((snapshot, step) for snapshot, step in snapshots
                        if step["cell"] == target
                        and step["method"] == method), None)
        if witness is None:
            raise ValueError(f"Anchored lesson {number} lacks its stated proof")
        cages, lines, underlays, overlays, arrows = render(n, constraints)
        puzzle = {
            "cells": [[{"value": str(givens[r*n+c])} if r*n+c in givens
                      else {} for c in range(n)] for r in range(n)],
            "regions": regions, "cages": cages, "lines": lines,
            "arrows": arrows, "overlays": overlays, "underlays": underlays,
            "metadata": {"solution": SOLUTION, "rules":
                         "标准数独：每行、每列及每个 3×3 宫包含 1 至 9；" +
                         {"region_sum": "区域和线各宫线段之和相等。",
                          "entropic": "熵线连续三格各占低中高一组。",
                          "modular": "模三线连续三格各占一种余数。"}[method]}
        }
        snapshot, step = witness
        result[number] = make_fixture(
            number, puzzle, snapshot, step, constraints=constraints)
    return result



def anchored_classic_examples():
    """Unique full Sudoku givens with genuinely provable classic deductions.

    Every candidate comes from row/column/box givens and every removal is
    produced by the same classic technique procedure as the generator.
    The concrete givens were selected for technique geometry, never their
    supposed answer; acceptance independently counts the full solutions.
    """
    from itertools import combinations
    from classic_techniques import (basic_fish, xy_wings, xyz_wings,
                                    skyscrapers)

    examples = {
        # Naked triple in row five, candidate 2 eliminated at R5C6.
        4: ("naked_subset",
            "530008910002090000108300500800671400000850690013904057000006004006400035005280000", 41),
        # Swordfish of digit 3 on three rows and columns.
        8: ("swordfish",
            "030008912700005040098300000059071000400803691000004807000506000000019000340200060", 52),
        # XY-Wing on three two-candidate cells.
        10: ("xy_wing",
             "500700010002090048008040570059071403007803001600904057000506000280010700305000109", 71),
        # XYZ-Wing pivot and pincers do not all share a house, so the
        # pattern cannot be replaced by a trivial naked triple.
        11: ("xyz_wing",
             "500060910762195040008340000000671020427850690600000000001506004080009035300200000", 80),
        # Skyscraper of digit 1 with a shared strong-link base.
        12: ("skyscraper",
             "530008910002090000108300500800671400000850690013904057000006004006400035005280000", 69),
    }
    n = 9
    regions = [[[(r+dr), (c+dc)] for dr in range(3) for dc in range(3)]
               for r in (0, 3, 6) for c in (0, 3, 6)]
    expected_solution = list(map(int, SOLUTION))
    result = {}
    for number, (method, clues, target) in examples.items():
        if len(clues) != 81:
            raise ValueError("Classic lesson clue string has wrong length")
        givens = {i: int(digit) for i, digit in enumerate(clues)
                  if digit != "0"}
        if any(expected_solution[i] != digit for i, digit in givens.items()):
            raise ValueError("Classic lesson clue disagrees with solution")
        if count_solutions(n, givens, []) != 1:
            raise ValueError("Classic lesson has non-unique answer")
        masks = clue_domains(n, givens)
        snapshots = []
        def reduce(cell, allowed, name, source):
            allowed = set(allowed)
            removed = masks[cell] - allowed
            if not removed:
                return False
            if not allowed & masks[cell]:
                raise ValueError("Classic proof emptied a candidate set")
            snapshot = [set(domain) for domain in masks]
            masks[cell].intersection_update(allowed)
            snapshots.append((snapshot, {"method": name, "cell": cell,
                "removed": sorted(removed), "remaining": sorted(masks[cell]),
                "source": source}))
            return True

        if method == "naked_subset":
            for house_id, unit in enumerate(houses(n)):
                unsolved = [i for i in unit if len(masks[i]) > 1]
                for selected in combinations(unsolved, 3):
                    digits = set().union(*(masks[i] for i in selected))
                    if len(digits) != 3:
                        continue
                    for cell in unit:
                        if cell not in selected:
                            reduce(cell, masks[cell] - digits, "naked_subset",
                                   {"house": house_id, "size": 3,
                                    "cells": list(selected),
                                    "digits": sorted(digits)})
        elif method == "swordfish":
            basic_fish(n, masks, reduce, maximum=3)
        elif method == "xy_wing":
            xy_wings(n, masks, reduce)
        elif method == "xyz_wing":
            xyz_wings(n, masks, reduce)
        elif method == "skyscraper":
            skyscrapers(n, masks, reduce)

        witness = next(((before, step) for before, step in snapshots
                        if step["cell"] == target
                        and step["method"] == method), None)
        if witness is None:
            raise ValueError(f"No real {method} deduction in lesson {number}")
        # Validate every recorded elimination against the completed grid,
        # including deductions earlier than the selected demonstration.
        if any(expected_solution[step["cell"]] in step["removed"]
               for _, step in snapshots):
            raise ValueError("Classic technique removed an actual solution")
        puzzle = {
            "cells": [[{"value": str(givens[r*n+c])} if r*n+c in givens
                      else {} for c in range(n)] for r in range(n)],
            "regions": regions, "cages": [], "lines": [],
            "arrows": [], "overlays": [], "underlays": [],
            "metadata": {"solution": SOLUTION, "rules":
                         "标准数独：每行、每列及每个 3×3 宫包含 1 至 9。"}
        }
        before, step = witness
        result[number] = make_fixture(
            number, puzzle, before, step, constraints=[])
    return result



def certified_single_examples():
    """Generate three *different named* basic deductions from a complete
    solution. They are real uniquely solvable puzzles, not impossible masks:
    the full house, global last digit and naked single conditions are checked
    from the givens independently of any solution value being guessed.
    """
    solution = list(map(int, SOLUTION))
    n = 9
    target = 4*n+6
    companion = 4*n+2
    regions = [[[(r+dr), (c+dc)] for dr in range(3) for dc in range(3)]
               for r in (0,3,6) for c in (0,3,6)]
    result = {}
    for method, holes in (
            ("full_house", {target}),
            ("last_digit", {target, companion}),
            ("naked_single", {target, companion})):
        givens = {i: digit for i, digit in enumerate(solution) if i not in holes}
        if count_solutions(n, givens, []) != 1:
            raise ValueError("A basic lesson pattern is not unique")
        if method == "full_house":
            if sum(i not in givens for i in range(4*n,5*n)) != 1:
                raise ValueError("Not a full house")
        if method == "last_digit":
            if sum(value == solution[target] for value in givens.values()) != 8:
                raise ValueError("Not a global last digit")
        if method == "naked_single":
            if clue_domains(n, givens)[target] != {solution[target]}:
                raise ValueError("Not a naked single")
        puzzle = {
            "cells": [[{"value":str(givens[r*n+c])} if r*n+c in givens
                       else {} for c in range(n)] for r in range(n)],
            "regions":regions,"cages":[],"lines":[],"arrows":[],
            "overlays":[],"underlays":[],
            "metadata":{"solution":SOLUTION,"rules":
                        "标准数独：每行、每列和每个 3×3 宫恰好有 1–9。"}
        }
        masks = clue_domains(n, givens)
        # The printed givens already eliminate peer-conflicting digits.
        # Do not fabricate a 1..9 target domain simply to show a single.
        digit = solution[target]
        if masks[target] != {digit}:
            raise ValueError("Direct placement has a non-singleton domain")
        step = {"method":method,"cell":target,
                "removed":[], "remaining":[digit],
                "source":{"house":4, "cells":sorted(holes)}}
        fixture = make_fixture(0, puzzle, masks, step)
        result[method] = fixture
    return result


def is_standard_fixture(fixture):
    """Standard lessons should have no variant constraints or drawings."""
    puzzle = fixture["puzzle"]
    return (not any(puzzle.get(key) for key in
                    ("cages", "lines", "arrows", "overlays", "underlays"))
            and not puzzle.get("metadata", {}).get("solverRules"))


def standardize_classic_example(number, fixture):
    """Replace a workshop variant with a genuine classical proof if possible.

    Removing variant drawings alone is unsound: a solver candidate snapshot
    can rely on those constraints. Recompute the entire deduction trace
    without variants and validate uniqueness *before* exporting any step.
    """
    if is_standard_fixture(fixture):
        return fixture
    if number > 12:
        return fixture  # The later curriculum deliberately trains variants.
    n = fixture["n"]
    givens = given_values(fixture["puzzle"])
    if count_solutions(n, givens, []) != 1:
        return fixture
    proof = deduce(n, givens, [], trace=True)
    if not proof["solved"]:
        return fixture
    solution = list(map(int, fixture["puzzle"]["metadata"]["solution"]))
    if proof["values"] != solution:
        return fixture
    shape = {4: (2, 2), 6: (2, 3), 9: (3, 3)}[n]
    h, w = shape
    puzzle = {
        "cells": [[{"value": str(givens[r*n+c])} if r*n+c in givens
                   else {} for c in range(n)] for r in range(n)],
        "regions": [[(r+dr, c+dc) for dr in range(h) for dc in range(w)]
                    for r in range(0, n, h) for c in range(0, n, w)],
        "cages": [], "lines": [], "arrows": [],
        "overlays": [], "underlays": [],
        "metadata": {"solution": "".join(map(str, solution)),
                     "rules": "标准数独：每行、每列及每个宫包含 1 至 N。"}
    }
    masks = [set(range(1, n+1)) for _ in range(n*n)]
    for cell, digit in givens.items():
        masks[cell] = {digit}
    for index, step in enumerate(proof["trace"]):
        if matching_example(number, step) and step["cell"] not in givens:
            try:
                return make_fixture(number, puzzle, masks, step,
                                    index, constraints=[])
            except ValueError:
                pass
        masks[step["cell"]].difference_update(step["removed"])
    return fixture


def find_standard_classic_patterns(examples):
    """Look for honest classical exercises on already-verified standard grids.

    Technique-specific detectors inspect only candidate domains derived from
    visible givens. A witness is accepted only if the same standard Sudoku
    has an independently confirmed unique solution. No variant rule is
    retained or secretly used in a standard practice.
    """
    from itertools import combinations
    from classic_techniques import hidden_subsets, basic_fish

    needed = {3, 5, 6, 7, 9}
    result = {}
    source_puzzles = [fixture["puzzle"] for fixture in examples.values()
                      if is_standard_fixture(fixture)]
    for puzzle in source_puzzles:
        if not needed - result.keys():
            break
        n = len(puzzle["cells"])
        givens = given_values(puzzle)
        if n != 9 or count_solutions(n, givens, []) != 1:
            continue
        solution = list(map(int, puzzle["metadata"]["solution"]))
        for number in sorted(needed - result.keys()):
            method = LESSON_METHODS[number]
            masks = clue_domains(n, givens)
            witnesses = []

            def reduce(cell, allowed, name, source):
                removed = masks[cell] - set(allowed)
                if not removed:
                    return False
                if solution[cell] in removed:
                    raise ValueError("Classical pattern eliminates a true digit")
                before = [set(domain) for domain in masks]
                masks[cell].difference_update(removed)
                witnesses.append((before, {
                    "method": name, "cell": cell,
                    "removed": sorted(removed),
                    "remaining": sorted(masks[cell]), "source": source,
                }))
                return True

            if number == 3:  # Genuine naked pair in a single house.
                for house_id, unit in enumerate(houses(n)):
                    unsolved = [i for i in unit if len(masks[i]) > 1]
                    for pair in combinations(unsolved, 2):
                        digits = masks[pair[0]] | masks[pair[1]]
                        if len(digits) != 2:
                            continue
                        for cell in unit:
                            if cell not in pair:
                                reduce(cell, masks[cell] - digits, "naked_subset",
                                       {"house": house_id, "size": 2,
                                        "cells": list(pair),
                                        "digits": sorted(digits)})
            elif number == 5:
                hidden_subsets(n, houses(n), masks, reduce)
            elif number == 6:
                units = houses(n)
                for a, first in enumerate(units):
                    for b in range(a+1, len(units)):
                        common = set(first) & set(units[b])
                        if len(common) < 2 or len(common) >= n:
                            continue
                        for source_id, dest_id in ((a, b), (b, a)):
                            for digit in range(1,n+1):
                                positions = [i for i in units[source_id]
                                             if digit in masks[i]]
                                if positions and all(i in common for i in positions):
                                    for cell in units[dest_id]:
                                        if cell not in common:
                                            reduce(cell, masks[cell]-{digit},
                                                   "locked_candidate",
                                                   {"sourceHouse":source_id,
                                                    "targetHouse":dest_id,
                                                    "digit":digit})
            elif number in (7, 9):
                basic_fish(n, masks, reduce, maximum=4)

            for before, step in witnesses:
                if not matching_example(number, step):
                    continue
                try:
                    result[number] = make_fixture(
                        number, puzzle, before, step, constraints=[])
                    break
                except ValueError:
                    continue
    return result


def generate():
    examples, method_examples = collect_report_examples(with_methods=True)
    examples.update(anchor_examples())
    examples.update(anchored_line_examples())
    examples.update(anchored_classic_examples())
    # Seek additional authentic pair/hidden-pair/locked/fish patterns using
    # only independent, uniquely solvable classic Sudoku givens.
    examples.update(find_standard_classic_patterns(examples))
    # For classic techniques, drop variant clues only if a new standard-only
    # solver trace independently reproduces the same named deduction.
    for number in range(1, 13):
        examples[number] = standardize_classic_example(number, examples[number])
    # Prefer genuine standard Sudoku fixtures over workshop variants for
    # Sudopedia's classic topics, including named subset cardinalities.
    for fixture in examples.values():
        method = fixture["method"]
        source = fixture["proof"].get("source")
        size = source.get("size") if isinstance(source, dict) else None
        keys = [method] + ([f"{method}:{size}"] if isinstance(size, int) else [])
        for key in keys:
            previous = method_examples.get(key)
            if previous is None or (is_standard_fixture(fixture) and
                                    not is_standard_fixture(previous)):
                method_examples[key] = fixture
    method_examples.update(certified_single_examples())
    for id_, fixture in examples.items():
        if fixture["method"] != LESSON_METHODS[id_]:
            raise ValueError("Mismatched lesson technique")
    OUTPUT.write_text(
        "// Generated by scripts/generate_lessons.py; do not edit.\n"
        "export const LESSON_FIXTURES = Object.freeze(" +
        json.dumps(examples, ensure_ascii=False, separators=(",", ":")) +
        ");\nexport const TECHNIQUE_FIXTURES = Object.freeze(" +
        json.dumps(method_examples, ensure_ascii=False, separators=(",", ":")) +
        ");\n", encoding="utf-8")
    print(f"Generated {len(examples)}/25 proof-backed lesson boards. "
          f"Unavailable (never faked): {sorted(set(LESSON_METHODS) - set(examples))}")
    return examples


if __name__ == "__main__":
    generate()

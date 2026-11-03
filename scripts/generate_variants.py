#!/usr/bin/env python3
"""Generate a connected family of 4x4, 6x6 and 9x9 mixed-variant Sudokus.

The family shares killer cage, increasing thermometer and Kropki dot rules.
Puzzle construction is randomized, but acceptance requires a full no-guess
deduction proof plus independent mathematical uniqueness. No assumption
chains, trial-and-error, or hidden solution peeking are used by the proof.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from variant_logic import BOXES, VARIANTS, count_solutions, deduce, houses

FAMILY = "variant-workshop"
SIZES = (4, 6, 9)
LABELS = {4: "First Sparks", 6: "The Circuit", 9: "The Engine"}
MIN_GIVENS = {4: 3, 6: 8, 9: 22}
MAX_GIVENS = {4: 12, 6: 23, 9: 45}


def make_solution(n, rng):
    h, w = BOXES[n]

    def shuffle_axis(block):
        bands = list(range(n // block))
        rng.shuffle(bands)
        result = []
        for band in bands:
            inner = list(range(block))
            rng.shuffle(inner)
            result.extend(band * block + x for x in inner)
        return result

    rows, cols = shuffle_axis(h), shuffle_axis(w)
    numbers = list(range(1, n+1))
    rng.shuffle(numbers)
    return [numbers[(rows[r]*w + rows[r]//h + cols[c]) % n]
            for r in range(n) for c in range(n)]


def neighbors(n, i):
    r, c = divmod(i, n)
    for dr, dc in ((-1, 0), (0, -1), (0, 1), (1, 0)):
        rr, cc = r+dr, c+dc
        if 0 <= rr < n and 0 <= cc < n:
            yield rr*n+cc


def make_constraints(n, solution, rng):
    """Place solution-consistent geometry, with no visually ambiguous dot edge."""
    constraints = []
    occupied_cages = set()
    cage_lengths = {4: (2,), 6: (2, 3), 9: (2, 3, 2)}[n]
    for cage_index, length in enumerate(cage_lengths):
        options = []
        for a in range(n*n):
            for b in neighbors(n, a):
                if b in occupied_cages or a in occupied_cages:
                    continue
                base = [a, b]
                choices = [base] if length == 2 else [
                    base + [c] for cell in base for c in neighbors(n, cell)
                    if c not in base and c not in occupied_cages
                ]
                for cells in choices:
                    if len(set(solution[i] for i in cells)) == len(cells):
                        options.append(cells)
        if cage_index == 0:
            # Every chapter reuses the exact same two-cell sum-five motif.
            options = [cells for cells in options
                       if sum(solution[i] for i in cells) == 5]
        if not options:
            raise ValueError("No available killer cage geometry")
        cells = list(rng.choice(options))
        occupied_cages.update(cells)
        constraints.append({"type": "killer", "cells": cells,
                            "sum": sum(solution[i] for i in cells)})

    thermo_count = 1 if n < 9 else 2
    used_thermo = set()
    thermo_edges = set()
    for thermometer_index in range(thermo_count):
        # A three-cell rising line is a repeated visual/rule motif.
        length = 3 if thermometer_index == 0 else 4
        paths = []

        def visit(path):
            if len(path) == length:
                paths.append(path)
                return
            for next_cell in neighbors(n, path[-1]):
                if next_cell not in path and next_cell not in used_thermo and (
                    solution[next_cell] > solution[path[-1]]
                ):
                    visit(path + [next_cell])

        for start in range(n*n):
            if start not in used_thermo and solution[start] <= n-length+1:
                visit([start])
        if not paths:
            raise ValueError("No available rising thermometer")
        path = rng.choice(paths)
        used_thermo.update(path)
        thermo_edges.update(frozenset((a, b)) for a, b in zip(path, path[1:]))
        constraints.append({"type": "thermo", "cells": path})

    dot_count = {4: 1, 6: 2, 9: 3}[n]
    dot_edges = set()
    for k in range(dot_count):
        options = []
        for a in range(n*n):
            for b in neighbors(n, a):
                edge = frozenset((a, b))
                if a > b or edge in dot_edges or edge in thermo_edges:
                    continue
                x, y = solution[a], solution[b]
                kind = "white" if abs(x-y) == 1 else (
                    "black" if max(x, y) == 2*min(x, y) else None
                )
                if kind:
                    options.append((a, b, kind))
        if k == 0:
            # Every puzzle includes at least one white consecutive dot.
            options = [edge for edge in options if edge[2] == "white"]
        if not options:
            raise ValueError("No available Kropki dot")
        a, b, kind = rng.choice(options)
        dot_edges.add(frozenset((a, b)))
        constraints.append({"type": "kropki", "kind": kind, "cells": [a, b]})
    return constraints


def dig(n, solution, constraints, rng):
    """Greedy removal; retain only deductions with a complete logical proof."""
    clues = dict(enumerate(solution))
    order = list(clues)
    rng.shuffle(order)
    for cell in order:
        if len(clues) <= MIN_GIVENS[n]:
            break
        digit = clues.pop(cell)
        try:
            acceptable = deduce(n, clues, constraints, trace=False)
            if not acceptable["solved"] or acceptable["values"] != solution:
                clues[cell] = digit
        except ValueError:
            clues[cell] = digit
    return clues


def quality(n, clues, constraints, solution):
    """Check a genuine variant dependency, not merely decorative constraints."""
    if len(clues) > MAX_GIVENS[n]:
        return None
    try:
        proof = deduce(n, clues, constraints)
        ordinary = deduce(n, clues, [])
    except ValueError:
        return None
    if not proof["solved"] or proof["values"] != solution or ordinary["solved"]:
        return None
    used = {name for name, count in proof["techniques"].items()
            if count and name in ("killer_sum", "thermo", "kropki")}
    if len(used) < 2:
        return None
    essential = []
    for kind in VARIANTS:
        subset = [c for c in constraints if c["type"] != kind]
        try:
            if not deduce(n, clues, subset, trace=False)["solved"]:
                essential.append(kind)
        except ValueError:
            # A contradiction cannot be used as an ablation success.
            return None
    if not essential or count_solutions(n, clues, constraints) != 1:
        return None
    return {"proof": proof, "used": sorted(used), "essential": essential}


def point(n, index):
    return [index//n, index%n]


def render(n, constraints):
    cages, lines, underlays, overlays = [], [], [], []
    for clue in constraints:
        cells = clue["cells"]
        if clue["type"] == "killer":
            cages.append({"cells": [point(n, i) for i in cells],
                          "value": str(clue["sum"]), "unique": True,
                          "outlineC": "#3e668b", "fontC": "#234e73"})
        elif clue["type"] == "thermo":
            coords = [[r+.5, c+.5] for r, c in
                      (point(n, i) for i in cells)]
            lines.append({"wayPoints": coords, "color": "#b89acb",
                          "thickness": 20, "target": "underlay"})
            underlays.append({
                "center": coords[0], "width": .65, "height": .65,
                "rounded": True, "backgroundColor": "#b89acb",
                "borderColor": "#7c5b9a", "borderSize": 1
            })
        else:
            a, b = (point(n, i) for i in cells)
            is_white = clue["kind"] == "white"
            overlays.append({
                "center": [(a[0]+b[0])/2+.5, (a[1]+b[1])/2+.5],
                "width": .22, "height": .22, "rounded": True,
                "backgroundColor": "#ffffff" if is_white else "#28262d",
                "borderColor": "#28262d", "borderSize": 1.3
            })
    return cages, lines, underlays, overlays


def puzzle(n, clues, solution, constraints, quality_info, seed):
    identifier = f"{FAMILY}-{n}"
    cages, lines, underlays, overlays = render(n, constraints)
    br, bc = BOXES[n]
    regions = [[[r+dr, c+dc] for dr in range(br) for dc in range(bc)]
               for r in range(0, n, br) for c in range(0, n, bc)]
    other = [f"{FAMILY}-{m}" for m in SIZES if m != n]
    rules = (
        f"第 {SIZES.index(n)+1}/3 关 · 共通规则：每行、每列及 {br}×{bc} 宫包含 1–{n}。"
        "虚线杀手笼数字和等于角标，笼内数字不重复。温度计从圆头开始严格递增。"
        "白点两侧数字相差 1；黑点两侧数字为 1:2；不是所有满足关系的位置都有点。"
        "\nRules: standard row/column/box Sudoku; killer cages have the "
        "marked sum with no repeated digits; thermometers increase from "
        "bulb to tip; white Kropki dots mean consecutive digits, black "
        "dots mean a 1:2 ratio. Unmarked adjacent pairs are unrestricted."
        "\nRelated chapters: " + ", ".join("sudokupadx:puzzle/" + x for x in other)
    )
    return {
        "id": identifier,
        "cells": [[{"value": str(clues[r*n+c])} if r*n+c in clues else {}
                   for c in range(n)] for r in range(n)],
        "regions": regions, "cages": cages, "lines": lines,
        "underlays": underlays, "overlays": overlays,
        "metadata": {
            "title": f"规则工坊 {SIZES.index(n)+1} · {n}×{n} — {LABELS[n]}",
            "author": "SudokuPadX Procedural Generator",
            "rules": rules,
            "solution": "".join(map(str, solution)),
            "msgcorrect": "Solved without guessing! Explore the next variant chapter.",
            "variantFamily": FAMILY,
            "variantTypes": list(VARIANTS),
            "relatedPuzzles": other,
            "generatorSeed": seed,
            "logicProfile": {
                "requiresGuessing": False,
                "usedVariantRules": quality_info["used"],
                "necessaryVariantTypes": quality_info["essential"],
                "techniques": quality_info["proof"]["techniques"]
            }
        }
    }


def build(seed, attempts=120):
    rng = random.Random(seed)
    puzzles, details = [], []
    for n in SIZES:
        for attempt in range(1, attempts+1):
            solution = make_solution(n, rng)
            try:
                constraints = make_constraints(n, solution, rng)
                clues = dig(n, solution, constraints, rng)
                accepted = quality(n, clues, constraints, solution)
            except ValueError:
                continue
            if accepted is not None:
                break
        else:
            raise RuntimeError(f"No meaningful no-guess {n}x{n} variant "
                               f"after {attempts} attempts")
        game = puzzle(n, clues, solution, constraints, accepted, seed)
        puzzles.append(game)
        details.append({
            "id": game["id"], "size": n, "attempt": attempt,
            "givens": len(clues), "constraints": constraints,
            "used": accepted["used"], "necessary": accepted["essential"],
            "techniques": accepted["proof"]["techniques"],
            "trace": accepted["proof"]["trace"]
        })
    return puzzles, {"seed": seed, "family": FAMILY, "puzzles": details}


def validate(puzzles, report):
    assert len(puzzles) == len(SIZES)
    assert [len(p["cells"]) for p in puzzles] == list(SIZES)
    assert all(p["metadata"]["variantFamily"] == FAMILY for p in puzzles)
    assert len(report["puzzles"]) == 3
    for n, game, details in zip(SIZES, puzzles, report["puzzles"]):
        solution = list(map(int, game["metadata"]["solution"]))
        clues = {r*n+c: int(cell["value"])
                 for r, row in enumerate(game["cells"]) for c, cell in enumerate(row)
                 if cell}
        constraints = details["constraints"]
        assert len(solution) == n*n
        assert {clue["type"] for clue in constraints} == set(VARIANTS)
        assert count_solutions(n, clues, constraints) == 1
        for house in houses(n):
            assert sorted(solution[i] for i in house) == list(range(1, n+1))
        assert deduce(n, clues, constraints)["values"] == solution
        assert not deduce(n, clues, [])["solved"]
        assert game["metadata"]["logicProfile"]["requiresGuessing"] is False
        assert len(details["used"]) >= 2 and details["necessary"]
        assert len(game["cages"]) > 0 and len(game["lines"]) > 0
        assert len(game["overlays"]) > 0


def export(output, puzzles, report):
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for game in puzzles:
        filename = game["id"] + ".json"
        (output / filename).write_text(
            json.dumps(game, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        entries.append({
            "id": game["id"], "title": game["metadata"]["title"],
            "kind": "standalone", "group": FAMILY,
            "file": f"puzzles/variants/{filename}"
        })
    (output / "catalog-entries.json").write_text(
        json.dumps({"items": entries}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    (output / "validation.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261103)
    parser.add_argument("--attempts", type=int, default=120)
    parser.add_argument("--output", type=Path, default=Path("public/puzzles/variants"))
    args = parser.parse_args()
    puzzles, report = build(args.seed, args.attempts)
    validate(puzzles, report)
    export(args.output, puzzles, report)
    print(json.dumps([{k: v for k, v in item.items()
                       if k not in ("trace", "constraints")}
                      for item in report["puzzles"]], indent=2))


if __name__ == "__main__":
    main()

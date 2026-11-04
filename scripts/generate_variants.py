#!/usr/bin/env python3
"""Generate a connected family of 4x4, 6x6 and 9x9 mixed-variant Sudokus.

The family shares killer cage, increasing thermometer and Kropki dot rules.
Puzzle construction is randomized, but acceptance requires a full no-guess
deduction proof plus independent mathematical uniqueness. No assumption
chains, trial-and-error, or hidden solution peeking are used by the proof.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import random
from pathlib import Path

from variant_logic import BOXES, VARIANTS, count_solutions, deduce, houses
from line_generation import add_line_motifs
from technique_catalog import (METHODS, GUIDE_URL, lesson_profile,
                               minimum_tier, replay_trace, technique_tier)

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
    if n in (6, 9):
        # Preserve consecutive three-digit groups across stacks, so
        # genuinely different partition motifs can be constructed from
        # Kropki chains and Renban lines instead of random decoration.
        block_order = list(range(n//3))
        rng.shuffle(block_order)
        numbers = []
        for band in block_order:
            digits = list(range(3*band+1, 3*band+4))
            if rng.choice((True, False)):
                digits.reverse()
            numbers.extend(digits)
        cols = []
        stacks = list(range(n//3))
        rng.shuffle(stacks)
        for stack in stacks:
            inner = [0, 1, 2]
            if rng.choice((True, False)):
                inner.reverse()
            cols.extend(stack*3+i for i in inner)
    else:
        rng.shuffle(numbers)
    return [numbers[(rows[r]*w + rows[r]//h + cols[c]) % n]
            for r in range(n) for c in range(n)]


def neighbors(n, i):
    r, c = divmod(i, n)
    for dr, dc in ((-1, 0), (0, -1), (0, 1), (1, 0)):
        rr, cc = r+dr, c+dc
        if 0 <= rr < n and 0 <= cc < n:
            yield rr*n+cc


def cage(n, solution, cells, **extra):
    if len(set(solution[i] for i in cells)) != len(cells):
        raise ValueError("Cage contains repeated digits")
    return {"type": "killer", "cells": list(cells),
            "sum": sum(solution[i] for i in cells), **extra}


def house_sum_geometry(n, solution, rng, constraints, occupied, motif_row=None):
    """Make actual near-tilings for the house sum rule, not generic cages."""
    height, width = BOXES[n]
    boxes = [(r, c) for r in range(0, n, height)
             for c in range(0, n, width)]
    rng.shuffle(boxes)

    if n >= 6:
        # Crossing cage: exactly one cell outside a box. A whole box
        # covered by disjoint cages reveals the outie by subtraction.
        candidates = [(r, c) for r, c in boxes if c+width < n
                      and (motif_row is None or
                           not r <= motif_row < r+height)]
        if not candidates:
            candidates = [(r, c) for r, c in boxes if c+width < n]
        if not candidates:
            raise ValueError("No outie box geometry")
        r0, c0 = rng.choice(candidates)
        bridge_row = r0 + height//2
        crossing_cell = bridge_row*n + c0+width-1
        outie = crossing_cell + 1
        for r in range(r0, r0+height):
            cells = [r*n+c for c in range(c0, c0+width)]
            if r == bridge_row:
                internal = cells[:-1]
                crossing = [crossing_cell, outie]
                constraints.append(cage(n, solution, internal,
                                        motif="house_outie"))
                constraints.append(cage(n, solution, crossing,
                                        motif="house_outie",
                                        outie=outie))
                occupied.update(internal+crossing)
            else:
                constraints.append(cage(n, solution, cells,
                                        motif="house_outie"))
                occupied.update(cells)

    # Innie: cages wholly inside another box cover all but one or two
    # cells, leaving a known residual sum, i.e. an invisible mini-cage.
    choices = [(r, c) for r, c in boxes
               if all((r+dr)*n+c+dc not in occupied
                      for dr in range(height) for dc in range(width))
               and (motif_row is None or not r <= motif_row < r+height)]
    if not choices:
        choices = [(r, c) for r, c in boxes
                   if all((r+dr)*n+c+dc not in occupied
                          for dr in range(height) for dc in range(width))]
    if not choices:
        raise ValueError("No free box for innie")
    r0, c0 = rng.choice(choices)
    if n == 4:
        runs = [[r0*n+c0, r0*n+c0+1]]
    elif n == 6:
        runs = [[r0*n+c for c in range(c0, c0+3)],
                [(r0+1)*n+c for c in range(c0, c0+2)]]
    else:
        runs = [[r0*n+c for c in range(c0, c0+3)],
                [(r0+1)*n+c for c in range(c0, c0+2)],
                [(r0+2)*n+c for c in range(c0, c0+2)]]
    for cells in runs:
        constraints.append(cage(n, solution, cells, motif="house_innie"))
        occupied.update(cells)


def add_renban_cage_motif(n, solution, rng, constraints, occupied):
    """A shared Renban and Killer cage fixes a consecutive interval."""
    if n == 4:
        return
    options = paths_matching(
        n, solution, 3,
        lambda path: all(i not in occupied for i in path) and
        len({solution[i] for i in path}) == 3 and
        max(solution[i] for i in path)-min(solution[i] for i in path) == 2)
    if not options:
        raise ValueError("No free Renban-Killer intersection")
    choices = [path for path in options
               if sum(solution[i] for i in path) == (15 if n == 9 else 9)]
    path = list(rng.choice(choices or options))
    constraints.append({"type": "renban", "cells": path,
                        "motif": "renban_cage",
                        "protectCells": list(path)})
    constraints.append(cage(n, solution, path, motif="renban_cage"))
    occupied.update(path)


def make_constraints(n, solution, rng):
    """Construct human-solvable structural motifs before local clues."""
    constraints = []
    occupied_cages = set()
    dot_edges = set()
    motif_row = None

    if n in (6, 9):
        candidates = []
        for r in range(n):
            chains = [[n*r+3*g+j for j in range(3)]
                      for g in range(n//3)]
            if n == 9:
                valid = all(abs(solution[a]-solution[b]) == 1
                            for chain in chains
                            for a, b in zip(chain, chain[1:]))
            else:
                first, second = chains
                valid = (all(abs(solution[a]-solution[b]) == 1
                             for a, b in zip(first, first[1:]))
                         and max(solution[i] for i in second)-
                         min(solution[i] for i in second) == 2
                         and len({solution[i] for i in second}) == 3)
            if valid:
                candidates.append((r, chains))
        if not candidates:
            raise ValueError("No consecutive-house motif")
        motif_row, chains = rng.choice(candidates)
        chain_count = 3 if n == 9 else 1
        for chain in chains[:chain_count]:
            for a, b in zip(chain, chain[1:]):
                dot_edges.add(frozenset((a, b)))
                constraints.append({"type": "kropki", "kind": "white",
                                    "cells": [a, b],
                                    "protectCell": chain[1]})
        if n == 6:
            constraints.append({"type": "renban", "cells": chains[1],
                                "motif": "mixed_partition"})

    # Reconstructed by the solver directly from the visible cage shapes.
    house_sum_geometry(n, solution, rng, constraints,
                       occupied_cages, motif_row)
    add_renban_cage_motif(n, solution, rng, constraints, occupied_cages)

    cage_lengths = {4: (2,), 6: (2,), 9: (2, 3)}[n]
    for cage_index, length in enumerate(cage_lengths):
        options = []
        for a in range(n*n):
            for b in neighbors(n, a):
                if b in occupied_cages or a in occupied_cages:
                    continue
                base = [a, b]
                shapes = [base] if length == 2 else [
                    base + [c] for cell in base for c in neighbors(n, cell)
                    if c not in base and c not in occupied_cages]
                for cells in shapes:
                    if len(set(solution[i] for i in cells)) == len(cells):
                        options.append(cells)
        if cage_index == 0:
            options = [cells for cells in options
                       if sum(solution[i] for i in cells) == 5]
        if not options:
            raise ValueError("No free sum-five killer cage geometry")
        cells = list(rng.choice(options))
        occupied_cages.update(cells)
        constraints.append(cage(n, solution, cells))

    thermo_count = 1 if n < 9 else 2
    used_thermo = set()
    thermo_edges = set()
    for thermometer_index in range(thermo_count):
        length = 3 if thermometer_index == 0 else 4
        paths = []

        def visit(path):
            if len(path) == length:
                if not any(frozenset((a, b)) in dot_edges
                           for a, b in zip(path, path[1:])):
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
    for k in range(dot_count):
        options = []
        for a in range(n*n):
            for b in neighbors(n, a):
                edge = frozenset((a, b))
                if (a > b or edge in dot_edges or edge in thermo_edges or
                        (motif_row is not None and
                         a//n == motif_row and b//n == motif_row)):
                    continue
                x, y = solution[a], solution[b]
                kind = "white" if abs(x-y) == 1 else (
                    "black" if max(x, y) == 2*min(x, y) else None)
                if kind:
                    options.append((a, b, kind))
        if k == 0 and n == 4:
            options = [edge for edge in options if edge[2] == "white"]
        if not options:
            raise ValueError("No available Kropki dot")
        a, b, kind = rng.choice(options)
        dot_edges.add(frozenset((a, b)))
        constraints.append({"type": "kropki", "kind": kind, "cells": [a, b]})
    add_extra_geometry(n, solution, rng, constraints)
    add_line_motifs(n, solution, rng, constraints, paths_matching, cage)
    return constraints


def paths_matching(n, solution, length, predicate):
    """All short, orthogonally connected, non-repeating fitting paths."""
    paths = []
    def visit(path):
        if len(path) == length:
            if predicate(path):
                paths.append(path)
            return
        for next_cell in neighbors(n, path[-1]):
            if next_cell not in path:
                visit(path + [next_cell])
    for start in range(n*n):
        visit([start])
    return paths


def add_extra_geometry(n, solution, rng, constraints):
    # These are authored from a solved grid *before* clue deletion; the
    # independent logic engine must later prove they offer useful moves.
    length = 3 if n < 9 else 4
    runs = paths_matching(
        n, solution, length,
        lambda p: len({solution[i] for i in p}) == length and
        max(solution[i] for i in p) -
        min(solution[i] for i in p) == length-1)
    if not runs and length == 4:
        length = 3
        runs = paths_matching(
            n, solution, length,
            lambda p: len({solution[i] for i in p}) == length and
            max(solution[i] for i in p) -
            min(solution[i] for i in p) == length-1)
    if not runs:
        raise ValueError("No renban pattern")
    preferred = [p for p in runs if len({i//n for i in p}) > 1]
    constraints.append({"type": "renban",
                        "cells": list(rng.choice(preferred or runs))})

    # A German whisper requires a difference of at least five, hence
    # it belongs in the 9x9 chapter rather than changing the rule by size.
    if n == 9:
        whispers = []
        for size in (4, 3, 2):
            whispers = paths_matching(
                n, solution, size,
                lambda p: all(abs(solution[a]-solution[b]) >= 5
                              for a, b in zip(p, p[1:])))
            if whispers:
                break
        if not whispers:
            raise ValueError("No German whisper")
        constraints.append({"type": "whisper",
                            "cells": list(rng.choice(whispers))})

    arrows = paths_matching(
        n, solution, 3,
        lambda p: solution[p[0]] == solution[p[1]] + solution[p[2]])
    if not arrows:
        raise ValueError("No arrow")
    constraints.append({"type": "arrow", "cells": list(rng.choice(arrows))})

    pairs = [(a, b, solution[a]+solution[b])
             for a in range(n*n) for b in neighbors(n, a)
             if a < b and solution[a]+solution[b] in (5, 10)]
    if not pairs:
        raise ValueError("No XV pair")
    a, b, total = rng.choice(pairs)
    constraints.append({"type": "xv", "sum": total, "cells": [a, b]})


def dig(n, solution, constraints, rng):
    """Remove motif targets first, keeping every deletion logically solvable.

    Removing a whole collection of important cells simultaneously is
    unnecessarily brittle: a puzzle may tolerate each deletion in
    isolation but not all at once. Test each target separately, then
    greedily remove ordinary givens without guessing or backtracking.
    """
    clues = dict(enumerate(solution))
    protected = {c["outie"] for c in constraints if "outie" in c}
    protected.update(c["protectCell"] for c in constraints
                     if "protectCell" in c)
    for clue in constraints:
        protected.update(clue.get("protectCells", []))
    forced = {cell for clue in constraints
              for cell in clue.get("forcedGivens", [])}
    protected.difference_update(forced)
    targets = sorted(protected)
    rng.shuffle(targets)
    others = [cell for cell in clues
              if cell not in protected and cell not in forced]
    rng.shuffle(others)
    for cell in targets + others:
        if len(clues) <= MIN_GIVENS[n]:
            break
        digit = clues.pop(cell, None)
        if digit is None:
            continue
        try:
            acceptable = deduce(n, clues, constraints, trace=False)
            if not acceptable["solved"] or acceptable["values"] != solution:
                clues[cell] = digit
        except ValueError:
            clues[cell] = digit
    return clues


def quality(n, clues, constraints, solution, diagnostic=None,
            focus_method=None, required_min_tier=1):
    """Check a genuine variant dependency, not merely decorative constraints."""
    def reject(reason):
        if diagnostic is not None:
            diagnostic[reason] += 1
        return None

    if len(clues) > MAX_GIVENS[n]:
        return reject("too many givens")
    try:
        proof = deduce(n, clues, constraints)
        ordinary = deduce(n, clues, [])
    except ValueError:
        return reject("deduction contradiction")
    if not proof["solved"] or proof["values"] != solution:
        return reject("full deduction incomplete")
    if focus_method:
        if not proof["techniques"].get(focus_method):
            return reject("focused technique not used: " + focus_method)
        # A lesson should be finishable at the target technique's
        # curriculum tier. A *harder* general chain can sometimes
        # reproduce a named shorter pattern; do not use that as a reason
        # to reject a good lower-tier lesson.
        target_tier = technique_tier(focus_method)
        if not deduce(n, clues, constraints, trace=False,
                      max_tier=target_tier)["solved"]:
            return reject("focused puzzle needs higher-tier techniques")
        # Under this curriculum (the selected tier and simpler methods),
        # the selected technique must actually be necessary.
        without = deduce(n, clues, constraints, trace=False,
                         max_tier=target_tier,
                         disabled_methods=(focus_method,))
        if without["solved"]:
            return reject("focused technique is redundant: " + focus_method)
    if ordinary["solved"]:
        return reject("classic solves without variants")
    kind_for_method = {"killer_sum": "killer", "killer_innie": "killer",
                       "region_sum": "region_sum",
                       "region_sum_killer_bridge": "region_sum",
                       "entropic": "entropic",
                       "modular": "modular",
                       "entropic_modular_cross": "entropic",
                       "between": "between",
                       "between_renban": "between",
                       "killer_outie": "killer", "renban_sum_lock": "renban",
                       "mixed_consecutive_partition": "renban",
                       "thermo": "thermo",
                       "kropki": "kropki", "kropki_partition": "kropki",
                       "renban": "renban", "whisper": "whisper",
                       "arrow": "arrow", "xv": "xv"}
    used = {kind_for_method[name] for name, count in
            proof["techniques"].items() if count and name in kind_for_method}
    # A cross-rule deduction necessarily uses *both* authored families;
    # counting it for only one would misrepresent the proof profile.
    for method, families in {
        "region_sum_killer_bridge": ("region_sum", "killer"),
        "entropic_modular_cross": ("entropic", "modular"),
        "between_renban": ("between", "renban"),
        "mixed_consecutive_partition": ("renban", "kropki"),
    }.items():
        if proof["techniques"].get(method):
            used.update(families)
    if len(used) < (3 if n == 9 else 2):
        return reject("too few variant families")
    if n == 9 and not proof["techniques"].get("kropki_partition"):
        return reject("partition technique unused")
    if n == 6 and not proof["techniques"].get("mixed_consecutive_partition"):
        return reject("mixed Kropki-Renban partition unused")
    if not used.intersection({"renban", "whisper", "arrow", "xv"}):
        return reject("new techniques unused")
    structural_names = ("killer_innie", "killer_outie",
                        "renban_sum_lock", "mixed_consecutive_partition",
                        "region_sum_killer_bridge", "entropic_modular_cross",
                        "between_renban")
    structural = {name: proof["techniques"].get(name, 0)
                  for name in structural_names
                  if proof["techniques"].get(name, 0)}
    if n in (6, 9) and len(structural) < 2:
        return reject("structural motifs did not contribute")
    if n in (6, 9) and not structural.get("killer_outie"):
        return reject("Killer outie deduction unused")
    if n in (6, 9) and not structural.get("renban_sum_lock"):
        return reject("Renban-Killer interval deduction unused")
    if not structural.get("region_sum_killer_bridge"):
        return reject("Region-sum Killer bridge unused")
    if n in (6, 9):
        if not structural.get("entropic_modular_cross"):
            return reject("Entropic-modular intersection unused")
        if not any(step["method"] == "entropic_modular_cross"
                   and len(step["remaining"]) == 1
                   for step in proof["trace"]):
            return reject("Entropic-modular crossing did not resolve a cell")
        if not structural.get("between_renban"):
            return reject("Between-Renban intersection unused")

    essential = []
    for kind in VARIANTS:
        subset = [c for c in constraints if c["type"] != kind]
        try:
            if not deduce(n, clues, subset, trace=False)["solved"]:
                essential.append(kind)
        except ValueError:
            # A contradiction cannot be used as an ablation success.
            return reject("ablation contradiction")
    if not essential:
        return reject("no variant family is essential")
    if count_solutions(n, clues, constraints) != 1:
        return reject("nonunique")
    aha = [{"method": step["method"], "cell": step["cell"],
            "digit": step["remaining"][0], "source": step["source"]}
           for step in proof["trace"]
           if step["method"] in ("entropic_modular_cross",
                                 "region_sum_killer_bridge",
                                 "between_renban",
                                 "kropki_partition")
           and len(step["remaining"]) == 1]
    education = lesson_profile(n, proof)
    education["focusTechnique"] = focus_method
    education["requestedMinimumTier"] = required_min_tier
    education["minimumTier"] = minimum_tier(n, clues, constraints, deduce)
    if education["minimumTier"] is None:
        return reject("curriculum cannot fully solve puzzle")
    if education["minimumTier"] < required_min_tier:
        return reject("curriculum is easier than requested level")
    return {"proof": proof, "used": sorted(used),
            "essential": essential, "structural": structural,
            "aha": aha[:8], "education": education}


def point(n, index):
    return [index//n, index%n]


def render(n, constraints):
    cages, lines, underlays, overlays, arrows = [], [], [], [], []
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
        elif clue["type"] == "kropki":
            a, b = (point(n, i) for i in cells)
            is_white = clue["kind"] == "white"
            overlays.append({
                "center": [(a[0]+b[0])/2+.5, (a[1]+b[1])/2+.5],
                "width": .22, "height": .22, "rounded": True,
                "backgroundColor": "#ffffff" if is_white else "#28262d",
                "borderColor": "#28262d", "borderSize": 1.3
            })
        elif clue["type"] in ("renban", "whisper", "region_sum",
                               "entropic", "modular", "between"):
            coords = [[r+.5, c+.5] for r, c in
                      (point(n, i) for i in cells)]
            style = {
                "renban": ("#85a8d8", 16),
                "whisper": ("#7abe9a", 12),
                "region_sum": ("#3b619c", 10),
                "entropic": ("#d8a752", 10),
                "modular": ("#45a8ab", 10),
                "between": ("#a783d6", 8),
            }
            color, width = style[clue["type"]]
            lines.append({"wayPoints": coords, "target": "underlay",
                          "thickness": width, "color": color})
            if clue["type"] == "between":
                for end in (coords[0], coords[-1]):
                    underlays.append({
                        "center": end, "width": .72, "height": .72,
                        "rounded": True, "backgroundColor": "#f8f3ff",
                        "borderColor": color, "borderSize": 2})
        elif clue["type"] == "arrow":
            coords = [[r+.5, c+.5] for r, c in
                      (point(n, i) for i in cells)]
            arrows.append({"wayPoints": coords, "color": "#d29754",
                           "thickness": 4, "headLength": .18})
            underlays.append({"center": coords[0], "width": .75,
                              "height": .75, "rounded": True,
                              "backgroundColor": "#fff6e4",
                              "borderColor": "#d29754", "borderSize": 2})
        elif clue["type"] == "xv":
            a, b = (point(n, i) for i in cells)
            overlays.append({
                "center": [(a[0]+b[0])/2+.5, (a[1]+b[1])/2+.5],
                "width": .35, "height": .35, "rounded": True,
                "backgroundColor": "#fff9db", "borderColor": "#ae8c35",
                "borderSize": 1.2, "text": "V" if clue["sum"] == 5 else "X",
                "textColor": "#614e18", "fontSize": 18
            })
    return cages, lines, underlays, overlays, arrows


def puzzle(n, clues, solution, constraints, quality_info, seed):
    identifier = f"{FAMILY}-{n}"
    cages, lines, underlays, overlays, arrows = render(n, constraints)
    br, bc = BOXES[n]
    regions = [[[r+dr, c+dc] for dr in range(br) for dc in range(bc)]
               for r in range(0, n, br) for c in range(0, n, bc)]
    other = [f"{FAMILY}-{m}" for m in SIZES if m != n]
    rules = (
        f"第 {SIZES.index(n)+1}/3 关 · 共通规则：每行、每列及 {br}×{bc} 宫包含 1–{n}。"
        "虚线杀手笼数字和等于角标，笼内数字不重复。温度计从圆头开始严格递增。"
        "白点两侧数字相差 1；黑点两侧数字为 1:2；不是所有满足关系的位置都有点。"
        "蓝色连续线包含一组连续数字（顺序任意）；绿色耳语线相邻数字至少相差 5。"
        "橙色箭头路径之和等于圆圈数字；V/X 标记两格之和为 5/10。"
        f"每个完整行、列、宫的数字和都是 {n*(n+1)//2}："
        "可利用几乎填满一个宫的杀手笼推算剩余格或跨宫格（Innies/Outies）。"
        "当杀手笼与连续线覆盖相同格子时，笼和能确定连续数字的范围。"
        "白点三连格与连续线共同覆盖 6×6 的一整行时，会分成 123 与 456 两组；"
        "9×9 的三组白点三连格则会分成 123、456、789。"
        "深蓝色区域和线以宫界分段，各段数字和相等；金色熵线任意连续三格"
        "分别来自低中高三组（六宫用12/34/56，九宫用123/456/789）；"
        "青绿色模三线任意连续三格的除以3余数互不相同；"
        "淡紫色两端圈线的内部数字严格介于两端圈中的数字之间。"
        "交叉熵线与模三线可确定交点的数字类别；"
        "区域和线的一段若覆盖一整个杀手笼，可把笼和传递给其它分段。"
        "\nRules: standard row/column/box Sudoku; killer cages have the "
        "marked sum with no repeated digits; thermometers increase from "
        "bulb to tip; white Kropki dots mean consecutive digits, black "
        "dots mean a 1:2 ratio. Unmarked adjacent pairs are unrestricted. "
        "Blue renban lines contain consecutive digits in any order; green "
        "German whisper lines differ by at least five between neighbors; "
        "orange arrows sum along the shaft to the circle; V/X pairs sum "
        "to 5/10. Three white-dot triples covering one house partition "
        "digits into 123, 456 and 789. "
        "All rows, columns and boxes total n(n+1)/2; nearly tiled "
        "houses enable Killer innie/outie deductions. A Renban also "
        "covered by one Killer cage has a sum-constrained consecutive "
        "set. Mixed Renban/Kropki triples partition a 6x6 house into "
        "123 and 456. "
        "Dark-blue region-sum lines have equal sums within each "
        "successive box segment. Gold entropic lines have one digit "
        "from each low/mid/high group in any consecutive triple "
        "(12/34/56 in 6x6, 123/456/789 in 9x9). Teal modular lines "
        "have one each of the residue classes modulo 3 in every three "
        "cells. Violet between lines have interior values strictly "
        "between their circled endpoints. Crossed lines and Killer "
        "segments are designed to create explicit deductions."
        "\n中文解题技巧教程（含例题与候选数排除过程）："
        + GUIDE_URL +
        "\nRelated chapters: " + ", ".join("sudokupadx:puzzle/" + x for x in other)
    )
    return {
        "id": identifier,
        "cells": [[{"value": str(clues[r*n+c])} if r*n+c in clues else {}
                   for c in range(n)] for r in range(n)],
        "regions": regions, "cages": cages, "lines": lines,
        "underlays": underlays, "overlays": overlays, "arrows": arrows,
        "metadata": {
            "title": f"规则工坊 {SIZES.index(n)+1} · {n}×{n} — {LABELS[n]}",
            "author": "SudokuPadX Procedural Generator",
            "rules": rules,
            "solution": "".join(map(str, solution)),
            "msgcorrect": "Solved without guessing! Explore the next variant chapter.",
            "variantFamily": FAMILY,
            "variantTypes": sorted({c["type"] for c in constraints}),
            "relatedPuzzles": other,
            "generatorSeed": seed,
            "logicProfile": {
                "requiresGuessing": False,
                "usedVariantRules": quality_info["used"],
                "necessaryVariantTypes": quality_info["essential"],
                "techniques": quality_info["proof"]["techniques"],
                "structuralMotifs": quality_info["structural"],
                "ahaMoments": quality_info["aha"],
                "education": quality_info["education"]
            }
        }
    }


def build(seed, attempts=120, focus_method=None, focus_size=9,
          min_tier=1):
    """Generate a family; optionally demand a real use of one taught technique.

    A focus is a *filter*, never a fake label. Some rare techniques may
    require more attempts or different motif templates and can fail
    explicitly rather than returning an unrelated puzzle.
    """
    if focus_method is not None and focus_method not in METHODS:
        raise ValueError("Unknown focus technique: " + focus_method)
    if focus_size not in SIZES:
        raise ValueError("Focus size must be 4, 6 or 9")
    if min_tier not in (1, 2, 3, 4):
        raise ValueError("Minimum tier must be 1 through 4")
    rng = random.Random(seed)
    puzzles, details = [], []
    for n in SIZES:
        failures = Counter()
        for attempt in range(1, attempts+1):
            solution = make_solution(n, rng)
            try:
                constraints = make_constraints(n, solution, rng)
                # Verify that every authored constraint agrees with the
                # completed grid before expensive clue digging begins.
                deduce(n, dict(enumerate(solution)), constraints, trace=False)
                clues = dig(n, solution, constraints, rng)
                accepted = quality(n, clues, constraints, solution, failures,
                                   focus_method if n == focus_size else None,
                                   min_tier if n == focus_size else 1)
            except ValueError as exc:
                failures[str(exc)] += 1
                continue
            if accepted is not None:
                break
            failures["quality gates"] += 1
        else:
            raise RuntimeError(f"No meaningful no-guess {n}x{n} variant "
                               f"after {attempts} attempts: {dict(failures)}")
        game = puzzle(n, clues, solution, constraints, accepted, seed)
        puzzles.append(game)
        details.append({
            "id": game["id"], "size": n, "attempt": attempt,
            "givens": len(clues), "constraints": constraints,
            "used": accepted["used"], "necessary": accepted["essential"],
            "techniques": accepted["proof"]["techniques"],
            "structural": accepted["structural"],
            "aha": accepted["aha"],
            "education": accepted["education"],
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
        expected = {"killer", "thermo", "kropki", "renban", "arrow",
                    "xv", "region_sum"}
        if n >= 6:
            expected.update(("entropic", "modular", "between"))
            for method in ("region_sum_killer_bridge",
                           "entropic_modular_cross", "between_renban"):
                assert details["techniques"].get(method, 0) > 0
        if n == 9:
            expected.add("whisper")
            assert details["techniques"].get("kropki_partition", 0) > 0
        assert {clue["type"] for clue in constraints} == expected
        assert count_solutions(n, clues, constraints) == 1
        for house in houses(n):
            assert sorted(solution[i] for i in house) == list(range(1, n+1))
        assert deduce(n, clues, constraints)["values"] == solution
        replayed = replay_trace(n, clues, details["trace"])
        assert all(len(mask) == 1 for mask in replayed)
        assert [next(iter(mask)) for mask in replayed] == solution
        assert not deduce(n, clues, [])["solved"]
        assert game["metadata"]["logicProfile"]["requiresGuessing"] is False
        assert details["education"]["guideUrl"] == GUIDE_URL
        assert details["education"]["minimumTier"] in (1, 2, 3, 4)
        assert details["education"]["techniquePath"]
        assert game["metadata"]["logicProfile"]["education"] == details["education"]
        assert len(details["used"]) >= 2 and details["necessary"]
        assert len(game["cages"]) > 0 and len(game["lines"]) > 0
        assert len(game["overlays"]) > 0 and len(game["arrows"]) > 0


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
    parser.add_argument("--focus-technique", choices=sorted(METHODS))
    parser.add_argument("--focus-size", type=int, choices=SIZES, default=9)
    parser.add_argument("--min-tier", type=int, choices=(1, 2, 3, 4), default=1)
    parser.add_argument("--output", type=Path, default=Path("public/puzzles/variants"))
    args = parser.parse_args()
    puzzles, report = build(args.seed, args.attempts,
                            args.focus_technique, args.focus_size, args.min_tier)
    validate(puzzles, report)
    export(args.output, puzzles, report)
    print(json.dumps([{k: v for k, v in item.items()
                       if k not in ("trace", "constraints")}
                      for item in report["puzzles"]], indent=2))


if __name__ == "__main__":
    main()

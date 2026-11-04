"""Deterministic, no-guess deduction and independent uniqueness checks for mixed Sudokus.

Supported sizes: 4x4 (2x2), 6x6 (2x3), 9x9 (3x3).
Supported clue types: killer sums, increasing thermometers, Kropki white/black.
The deduction engine NEVER branches; solution counting branches separately.
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations, product

from variant_techniques import EXTRA_VARIANTS, propagate_extra, kropki_triple_partitions
from variant_structures import (sum_structures, propagate_sum_structures,
                                mixed_consecutive_partitions)
from variant_lines import (LINE_VARIANTS, validate_line, propagate_line,
                           propagate_cross, propagate_region_killer,
                           propagate_between_renban)
from classic_techniques import (hidden_subsets, basic_fish, xy_wings,
                                xyz_wings, skyscrapers)
from technique_catalog import technique_tier


BOXES = {4: (2, 2), 6: (2, 3), 9: (3, 3)}
VARIANTS = ("killer", "thermo", "kropki") + EXTRA_VARIANTS + LINE_VARIANTS


def houses(n):
    if n not in BOXES:
        raise ValueError("Only 4x4, 6x6, and 9x9 Sudokus are supported")
    h, w = BOXES[n]
    rows = [tuple(r * n + c for c in range(n)) for r in range(n)]
    cols = [tuple(r * n + c for r in range(n)) for c in range(n)]
    boxes = [tuple((r + dr) * n + c + dc for dr in range(h) for dc in range(w))
             for r in range(0, n, h) for c in range(0, n, w)]
    return rows + cols + boxes


def validate_constraints(n, constraints):
    for constraint in constraints:
        kind = constraint.get("type")
        cells = constraint.get("cells", [])
        if kind not in VARIANTS or len(cells) != len(set(cells)) or any(
            not isinstance(cell, int) or cell not in range(n*n) for cell in cells
        ):
            raise ValueError("Invalid variant cells or type")
        if kind == "killer":
            if not 2 <= len(cells) <= 3 or not isinstance(constraint.get("sum"), int):
                raise ValueError("Invalid killer sum")
        elif kind in ("thermo", "renban", "whisper", "arrow") + LINE_VARIANTS:
            if kind in LINE_VARIANTS:
                validate_line(n, constraint)
            elif not 2 <= len(cells) <= min(5, n):
                raise ValueError("Invalid variant line")
            if kind == "arrow" and len(cells) < 3:
                raise ValueError("An arrow needs a circle and at least two shaft cells")
            if kind == "whisper" and n < 6:
                raise ValueError("German whispers are not useful on this grid")
            if any(abs(a//n-b//n)+abs(a%n-b%n) != 1
                   for a, b in zip(cells, cells[1:])):
                raise ValueError("Variant paths must be orthogonally connected")
        elif kind in ("kropki", "xv"):
            if len(cells) != 2:
                raise ValueError("Invalid pair")
            a, b = cells
            if abs(a//n-b//n)+abs(a%n-b%n) != 1:
                raise ValueError("Pair marks must connect adjacent cells")
            if kind == "kropki" and constraint.get("kind") not in ("white", "black"):
                raise ValueError("Invalid Kropki dot")
            if kind == "xv" and constraint.get("sum") not in (5, 10):
                raise ValueError("XV pairs must sum to 5 or 10")


def deduce(n, givens, constraints, domains=None, trace=True, max_tier=None,
           disabled_methods=()):
    """Propagate human-readable local rules; never assume a candidate.

    The trace lists the actual candidate removals or hidden single placements,
    and is independent of any known answer supplied by the generator.
    """
    if max_tier is not None and max_tier not in (1, 2, 3, 4):
        raise ValueError("Technique tier must be 1 through 4")
    units = houses(n)
    validate_constraints(n, constraints)
    structural_rules = sum_structures(n, units, constraints)
    intersections = []
    for a, first in enumerate(units):
        for b, second in enumerate(units):
            if a >= b:
                continue
            common = set(first) & set(second)
            if 1 < len(common) < n:
                intersections.append((a, b, common))
    if domains is None:
        if any(not isinstance(i, int) or i not in range(n*n) or
               not isinstance(d, int) or d not in range(1, n+1)
               for i, d in givens.items()):
            raise ValueError("Invalid given")
        masks = [set(range(1, n+1)) for _ in range(n*n)]
        for i, d in givens.items():
            masks[i] = {d}
    else:
        masks = [set(domain) for domain in domains]
        if len(masks) != n*n or any(not s or s - set(range(1, n+1)) for s in masks):
            raise ValueError("Invalid domains")

    proof, counts = [], Counter()

    def reduce(cell, allowed, method, source):
        if method in disabled_methods or (max_tier is not None
                                           and technique_tier(method, source) > max_tier):
            return False
        removed = masks[cell] - allowed
        if not removed:
            return False
        masks[cell].intersection_update(allowed)
        if not masks[cell]:
            raise ValueError("Contradiction: no possible digit")
        if trace:
            proof.append({"method": method, "cell": cell,
                          "removed": sorted(removed),
                          "remaining": sorted(masks[cell]),
                          "source": source})
        counts[method] += 1
        return True

    while True:
        # Global motifs are recognizable without local candidate guessing.
        # Resolve these before separate per-line rules so each meaningful
        # cross-rule breakthrough is recorded in the trace.
        changed = mixed_consecutive_partitions(
            n, units, masks, constraints, reduce)
        changed |= propagate_cross(n, masks, constraints, reduce)
        changed |= propagate_region_killer(n, masks, constraints, reduce)
        changed |= propagate_between_renban(n, masks, constraints, reduce)
        for house_id, unit in enumerate(units):
            fixed = [next(iter(masks[i])) for i in unit if len(masks[i]) == 1]
            if len(set(fixed)) != len(fixed):
                raise ValueError("Contradiction: repeated digit in a house")
            taken = set(fixed)
            for i in unit:
                if len(masks[i]) > 1:
                    changed |= reduce(i, masks[i] - taken,
                                      "peer_elimination", house_id)
            for digit in range(1, n+1):
                cells = [i for i in unit if digit in masks[i]]
                if not cells:
                    raise ValueError("Contradiction: a house is missing a digit")
                if len(cells) == 1:
                    changed |= reduce(cells[0], {digit},
                                      "hidden_single", house_id)
            # Naked pairs and triples are direct all-different deductions,
            # never hypothetical branch guesses.
            unsolved = [i for i in unit if len(masks[i]) > 1]
            for size in range(2, min(4, n-1)+1):
                for chosen in combinations(unsolved, size):
                    digits = set().union(*(masks[i] for i in chosen))
                    if len(digits) != size:
                        continue
                    for i in unit:
                        if i not in chosen:
                            changed |= reduce(i, masks[i] - digits,
                                              "naked_subset",
                                              {"house": house_id, "size": size,
                                               "cells": list(chosen),
                                               "digits": sorted(digits)})

        # Classical consequences of variant restrictions: subsets,
        # 2/3/4-line fish, and three-cell wing patterns. These are
        # unconditional deductions, never hypothetical branch guesses.
        changed |= hidden_subsets(n, units, masks, reduce)
        changed |= basic_fish(n, masks, reduce)
        changed |= xy_wings(n, masks, reduce)
        changed |= xyz_wings(n, masks, reduce)
        changed |= skyscrapers(n, masks, reduce)

        # A candidate confined to a row/box intersection cannot occur
        # elsewhere in the other house (pointing / claiming).
        for first_id, second_id, common in intersections:
            for digit in range(1, n+1):
                for source_id, destination_id in (
                    (first_id, second_id), (second_id, first_id)
                ):
                    positions = [cell for cell in units[source_id]
                                 if digit in masks[cell]]
                    if positions and all(cell in common for cell in positions):
                        for cell in units[destination_id]:
                            if cell not in common:
                                changed |= reduce(
                                    cell, masks[cell] - {digit},
                                    "locked_candidate",
                                    {"sourceHouse": source_id,
                                     "targetHouse": destination_id,
                                     "digit": digit})

        # The sum of a complete Sudoku house is always n*(n+1)/2.
        # Apply reconstructed house-wide and cross-constraint motifs
        # before local checks so their logical contribution is traceable.
        changed |= propagate_sum_structures(n, masks, structural_rules, reduce)

        for index, clue in enumerate(constraints):
            kind, cells = clue["type"], clue["cells"]
            if kind == "killer":
                supports = [set() for _ in cells]
                for choices in product(*(sorted(masks[i]) for i in cells)):
                    if sum(choices) != clue["sum"] or len(set(choices)) != len(choices):
                        continue
                    for support, d in zip(supports, choices):
                        support.add(d)
                for i, allowed in zip(cells, supports):
                    changed |= reduce(i, allowed, "killer_sum", index)
            elif kind in ("thermo", "kropki"):
                edges = list(zip(cells, cells[1:])) if kind == "thermo" else [
                    (cells[0], cells[1])
                ]
                for a, b in edges:
                    if kind == "thermo":
                        allowed_pairs = [(x, y) for x in masks[a] for y in masks[b]
                                         if x < y]
                    elif clue["kind"] == "white":
                        allowed_pairs = [(x, y) for x in masks[a] for y in masks[b]
                                         if abs(x-y) == 1]
                    else:
                        allowed_pairs = [(x, y) for x in masks[a] for y in masks[b]
                                         if max(x, y) == 2 * min(x, y)]
                    method = "thermo" if kind == "thermo" else "kropki"
                    changed |= reduce(a, {x for x, _ in allowed_pairs}, method, index)
                    changed |= reduce(b, {y for _, y in allowed_pairs}, method, index)
            elif kind in LINE_VARIANTS:
                changed |= propagate_line(n, masks, clue, index, reduce)
            else:
                changed |= propagate_extra(n, masks, clue, index, reduce)

        changed |= kropki_triple_partitions(n, units, masks, constraints, reduce)
        if not changed:
            break
    return {"solved": all(len(s) == 1 for s in masks),
            "domains": masks, "values": [next(iter(s)) for s in masks]
            if all(len(s) == 1 for s in masks) else None,
            "trace": proof, "techniques": dict(sorted(counts.items()))}


def count_solutions(n, givens, constraints, limit=2):
    """Exact solver for uniqueness only; its branching never informs deduction."""
    if limit < 1:
        raise ValueError("Solution limit must be positive")

    def branch(domains):
        try:
            result = deduce(n, {}, constraints, domains, trace=False)
        except ValueError:
            return 0
        if result["solved"]:
            return 1
        masks = result["domains"]
        cell = min((i for i in range(n*n) if len(masks[i]) > 1),
                   key=lambda i: len(masks[i]))
        total = 0
        for digit in sorted(masks[cell]):
            child = [set(s) for s in masks]
            child[cell] = {digit}
            total += branch(child)
            if total >= limit:
                return limit
        return total

    try:
        start = [set(range(1, n+1)) for _ in range(n*n)]
        for i, digit in givens.items():
            if i not in range(n*n) or digit not in range(1, n+1):
                return 0
            start[i] = {digit}
        return branch(start)
    except ValueError:
        return 0

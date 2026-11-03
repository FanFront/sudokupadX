"""Deterministic, no-guess deduction and independent uniqueness checks for mixed Sudokus.

Supported sizes: 4x4 (2x2), 6x6 (2x3), 9x9 (3x3).
Supported clue types: killer sums, increasing thermometers, Kropki white/black.
The deduction engine NEVER branches; solution counting branches separately.
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations, product

from variant_techniques import EXTRA_VARIANTS, propagate_extra, kropki_triple_partitions


BOXES = {4: (2, 2), 6: (2, 3), 9: (3, 3)}
VARIANTS = ("killer", "thermo", "kropki") + EXTRA_VARIANTS


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
        elif kind in ("thermo", "renban", "whisper", "arrow"):
            if not 2 <= len(cells) <= min(5, n):
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


def deduce(n, givens, constraints, domains=None, trace=True):
    """Propagate human-readable local rules; never assume a candidate.

    The trace lists the actual candidate removals or hidden single placements,
    and is independent of any known answer supplied by the generator.
    """
    units = houses(n)
    validate_constraints(n, constraints)
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
        removed = masks[cell] - allowed
        if not removed:
            return False
        masks[cell].intersection_update(allowed)
        if not masks[cell]:
            raise ValueError("Contradiction: no possible digit")
        if trace:
            proof.append({"method": method, "cell": cell,
                          "removed": sorted(removed), "source": source})
        counts[method] += 1
        return True

    while True:
        changed = False
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
            for size in (2, 3):
                for chosen in combinations(unsolved, size):
                    digits = set().union(*(masks[i] for i in chosen))
                    if len(digits) != size:
                        continue
                    for i in unit:
                        if i not in chosen:
                            changed |= reduce(i, masks[i] - digits,
                                              "naked_subset", house_id)

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

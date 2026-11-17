"""Additional Sudopedia patterns with unconditional, replayable eliminations.

Each function works on candidate domains only. No solved grid, hypothetical
assumptions, uniqueness premise or search branches are consulted.
"""
from collections import defaultdict
from itertools import combinations

from classic_techniques import BOXES, peer_sets
from als_techniques import als_groups


def finned_fish(n, masks, reduce, maximum=4):
    """Finned/Sashimi X-Wing, Swordfish and Jellyfish.

    A base line contributes one digit. If all extra positions (fins) lie in
    one box, a cover target seeing every fin is impossible: if any fin is
    true it conflicts directly; otherwise the remaining k base lines form
    a k-cover fish. A missing core position is the Sashimi case.
    """
    if n != 9:
        return False
    changed = False
    h, w = BOXES[n]
    names = {2: "x_wing", 3: "swordfish", 4: "jellyfish"}
    for digit in range(1, n + 1):
        for vertical in (False, True):
            at = (lambda base, cover:
                  cover * n + base if vertical else base * n + cover)
            positions = {
                base: {cover for cover in range(n)
                       if digit in masks[at(base, cover)]}
                for base in range(n)
            }
            for size in range(2, min(maximum, 4) + 1):
                bases = [base for base in range(n)
                         if 2 <= len(positions[base]) <= size + 3]
                for defining in combinations(bases, size):
                    union = set().union(*(positions[base] for base in defining))
                    if len(union) <= size or len(union) > size + 3:
                        continue
                    for covers in combinations(sorted(union), size):
                        coverage = set(covers)
                        fins = sorted(
                            at(base, cover) for base in defining
                            for cover in positions[base] - coverage)
                        if not fins or len(fins) > 3:
                            continue
                        box = lambda cell: ((cell // n) // h, (cell % n) // w)
                        if len({box(cell) for cell in fins}) != 1:
                            continue
                        sashimi = any(not positions[base] & coverage
                                      for base in defining)
                        prefix = "sashimi_" if sashimi else "finned_"
                        method = prefix + names[size]
                        source = {
                            "digit": digit, "base": list(defining),
                            "cover": list(covers), "vertical": vertical,
                            "finCells": fins,
                            "sashimi": sashimi
                        }
                        peers = peer_sets(n)
                        for other in range(n):
                            if other in defining:
                                continue
                            for cover in covers:
                                target = at(other, cover)
                                if digit in masks[target] and all(
                                        target in peers[fin] for fin in fins):
                                    changed |= reduce(
                                        target, masks[target] - {digit},
                                        method, source)
    return changed


def empty_rectangles(n, masks, reduce):
    """The box's cross and an outside conjugate pair force a row exclusion."""
    if n != 9:
        return False
    changed = False
    h, w = BOXES[n]
    for digit in range(1, n + 1):
        # Transposition handles both ER orientations with the same proof.
        for transpose in (False, True):
            at = (lambda row, col:
                  col * n + row if transpose else row * n + col)
            bh, bw = (w, h) if transpose else (h, w)
            for top in range(0, n, bh):
                for left in range(0, n, bw):
                    rows = range(top, top + bh)
                    cols = range(left, left + bw)
                    candidates = [
                        (r, c) for r in rows for c in cols
                        if digit in masks[at(r, c)]
                    ]
                    if len(candidates) < 2:
                        continue
                    for crossing_row in rows:
                        for crossing_col in cols:
                            if not all(r == crossing_row or c == crossing_col
                                       for r, c in candidates):
                                continue
                            # Both arms of the cross must exist.
                            if not any(r == crossing_row and c != crossing_col
                                       for r, c in candidates):
                                continue
                            if not any(c == crossing_col and r != crossing_row
                                       for r, c in candidates):
                                continue
                            for outer in range(n):
                                if outer in rows:
                                    continue
                                pair = [
                                    c for c in range(n)
                                    if digit in masks[at(outer, c)]
                                ]
                                if len(pair) != 2 or crossing_col not in pair:
                                    continue
                                other = next(c for c in pair if c != crossing_col)
                                if other in cols:
                                    continue  # target must be outside the box
                                target = at(crossing_row, other)
                                if digit not in masks[target]:
                                    continue
                                source = {
                                    "digit": digit,
                                    "crossCell": at(crossing_row, crossing_col),
                                    "boxCells": [at(r, c) for r, c in candidates],
                                    "strongLink": [at(outer, c) for c in pair],
                                    "transpose": transpose
                                }
                                changed |= reduce(
                                    target, masks[target] - {digit},
                                    "empty_rectangle", source)
    return changed


def wxyz_wings(n, masks, reduce):
    """A four-cell WXYZ-Wing, as a four-cell restricted-candidate wing.

    Across four unsolved cells with exactly four digits, if the positions
    of EACH digit except Z mutually see one another, at most three cells
    can use non-Z digits. At least one Z position must therefore be true.
    A target seeing every Z position can eliminate Z.
    """
    if n != 9:
        return False
    changed = False
    peers = peer_sets(n)
    cells = [i for i, domain in enumerate(masks)
             if 2 <= len(domain) <= 4]
    for pivot in cells:
        if len(masks[pivot]) < 3:
            continue
        arms = [i for i in cells if i in peers[pivot]
                and len(masks[i]) <= 3]
        for selected in combinations(arms, 3):
            group = (pivot,) + selected
            union = set().union(*(masks[cell] for cell in group))
            if len(union) != 4:
                continue
            if any(all(b in peers[a] for b in group if b != a)
                   for a in group):
                # Whole group need not be disjoint, but avoid calling a
                # local naked quad a WXYZ-Wing.
                if all(b in peers[a] for a, b in combinations(group, 2)):
                    continue
            for digit in sorted(union):
                if not all(
                    b in peers[a]
                    for other in union - {digit}
                    for a, b in combinations(
                        [cell for cell in group if other in masks[cell]], 2)
                ):
                    continue
                zcells = [cell for cell in group if digit in masks[cell]]
                targets = set(range(n*n)) - set(group)
                for cell in zcells:
                    targets &= peers[cell]
                source = {
                    "digit": digit, "pivot": pivot,
                    "wingCells": list(selected), "zCandidates": zcells,
                    "digits": sorted(union)
                }
                for target in sorted(targets):
                    if digit in masks[target]:
                        changed |= reduce(
                            target, masks[target] - {digit},
                            "wxyz_wing", source)
    return changed


def als_xy_wings(n, masks, units, reduce):
    """Three small ALS groups linked by two distinct restricted commons.

    For A--X--B--Y--C, if B has X then A cannot have X and must have
    every other A digit; otherwise B has Y, C cannot have Y, and C
    must have every other C digit. Thus A or C contains common Z.
    """
    if n != 9:
        return False
    peers = peer_sets(n)
    groups = sorted(als_groups(n, masks, units, maximum_cells=2),
                    key=lambda item: (len(item[0]), item[0]))[:120]
    # For every centre ALS, list neighbouring ALSs with a restricted
    # common digit. Pair links are symmetric.
    links = defaultdict(list)
    for i, j in combinations(range(len(groups)), 2):
        ca, da, _ = groups[i]
        cb, db, _ = groups[j]
        if set(ca) & set(cb):
            continue
        for digit in sorted(da & db):
            pos_a = [cell for cell in ca if digit in masks[cell]]
            pos_b = [cell for cell in cb if digit in masks[cell]]
            if all(b in peers[a] for a in pos_a for b in pos_b):
                links[i].append((j, digit))
                links[j].append((i, digit))
    changed = False
    for middle, neighbors in links.items():
        for (a, x), (c, y) in combinations(neighbors, 2):
            if a == c or x == y:
                continue
            acells, adigits, _ = groups[a]
            bcells, _, _ = groups[middle]
            ccells, cdigits, _ = groups[c]
            if set(acells) & set(ccells):
                continue
            for z in sorted((adigits & cdigits) - {x, y}):
                zcells = [cell for cell in acells + ccells
                          if z in masks[cell]]
                targets = set(range(n*n)) - set(acells + bcells + ccells)
                for cell in zcells:
                    targets &= peers[cell]
                source = {
                    "restricted": [x, y], "digit": z,
                    "alsA": list(acells), "alsB": list(bcells),
                    "alsC": list(ccells), "zCandidates": zcells
                }
                for target in sorted(targets):
                    if z in masks[target]:
                        changed |= reduce(
                            target, masks[target] - {z},
                            "als_xy_wing", source)
    return changed

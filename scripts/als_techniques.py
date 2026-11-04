"""A bounded ALS-XZ (Almost Locked Set) human deduction.

For N cells in a house to be an ALS, their candidate union must contain
exactly N+1 distinct digits. If two disjoint ALS groups share X and all
X-candidates in A see all X-candidates in B (restricted common X), at
least one group contains every other common digit Z. A cell that sees
all Z positions in both groups can delete Z. No trial assignments.
"""
from itertools import combinations

from classic_techniques import peer_sets


def als_groups(n, masks, units, maximum_cells=3):
    found = {}
    for house_id, unit in enumerate(units):
        unsolved = [cell for cell in unit if 1 < len(masks[cell]) <= maximum_cells+1]
        for size in range(1, min(maximum_cells, len(unsolved))+1):
            for cells in combinations(unsolved, size):
                digits = set.union(*(masks[cell] for cell in cells))
                if len(digits) != size+1:
                    continue
                key = frozenset(cells)
                # A repeated ALS in a row and box only needs one source.
                if key not in found:
                    found[key] = (tuple(cells), frozenset(digits), house_id)
    return list(found.values())


def als_xz(n, masks, units, reduce):
    """Enumerate short (1–3 cell) ALS-XZ bridges, bounded for human clarity."""
    changed = False
    peers = peer_sets(n)
    groups = als_groups(n, masks, units)
    # Large collections of ALS lead to unhelpful combinatorial fishing.
    # Retain short groups preferentially, with a deterministic budget.
    groups.sort(key=lambda item: (len(item[0]), item[0]))
    groups = groups[:240]
    for (acells, adigits, ahouse), (bcells, bdigits, bhouse) in combinations(groups, 2):
        if set(acells) & set(bcells):
            continue
        common = adigits & bdigits
        if len(common) < 2:
            continue
        for x in sorted(common):
            ax = [cell for cell in acells if x in masks[cell]]
            bx = [cell for cell in bcells if x in masks[cell]]
            if not all(b in peers[a] for a in ax for b in bx):
                continue
            for z in sorted(common - {x}):
                az = [cell for cell in acells if z in masks[cell]]
                bz = [cell for cell in bcells if z in masks[cell]]
                source = {"restricted": x, "digit": z,
                          "alsA": list(acells), "alsB": list(bcells),
                          "houses": [ahouse, bhouse],
                          "zCandidates": sorted(set(az+bz))}
                for target in range(n*n):
                    if target in acells or target in bcells or z not in masks[target]:
                        continue
                    if all(target in peers[cell] for cell in az+bz):
                        changed |= reduce(target, masks[target]-{z},
                                          "als_xz", source)
    return changed

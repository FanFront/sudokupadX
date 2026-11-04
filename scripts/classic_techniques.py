"""Human-readable classic Sudoku deductions from the Sudopedia catalogue.

Only unconditional candidate eliminations: no branching, uniqueness
assumption, contradiction-based guessing, or access to a solved grid.
"""
from itertools import combinations


BOXES = {4: (2, 2), 6: (2, 3), 9: (3, 3)}


def peer_sets(n):
    height, width = BOXES[n]
    result = []
    for i in range(n*n):
        r, c = divmod(i, n)
        r0, c0 = r // height * height, c // width * width
        peers = ({r*n+j for j in range(n)} |
                 {j*n+c for j in range(n)} |
                 {(r0+dr)*n+c0+dc for dr in range(height)
                  for dc in range(width)})
        peers.discard(i)
        result.append(peers)
    return result


def hidden_subsets(n, units, masks, reduce):
    """Sudopedia Hidden Pair/Triple/Quad."""
    changed = False
    for house_id, unit in enumerate(units):
        digits = [digit for digit in range(1, n+1)
                  if not any(masks[cell] == {digit} for cell in unit)]
        positions = {digit: {cell for cell in unit if digit in masks[cell]}
                     for digit in digits}
        for size in range(2, min(4, n-1)+1):
            for selected in combinations(digits, size):
                cells = set.union(*(positions[digit] for digit in selected))
                if len(cells) != size:
                    continue
                allowed = set(selected)
                for cell in cells:
                    changed |= reduce(cell, allowed, "hidden_subset",
                                      {"house": house_id, "size": size,
                                       "digits": list(selected),
                                       "cells": sorted(cells)})
    return changed


def basic_fish(n, masks, reduce, maximum=5):
    """X-Wing, Swordfish and Jellyfish as 2/3/4-line basic fish.

    In k defining rows (or columns), all positions for digit d
    belong to exactly k covering columns (or rows). Every cover must
    place d inside the defining set, so outside cover candidates die.
    """
    names = {2: "x_wing", 3: "swordfish", 4: "jellyfish",
             5: "squirmbag"}
    changed = False
    for digit in range(1, n+1):
        for vertical in (False, True):
            positions = {}
            for base in range(n):
                cover = {axis for axis in range(n)
                         if digit in masks[
                             axis*n+base if vertical else base*n+axis]}
                if 2 <= len(cover) <= min(maximum, n-1):
                    positions[base] = cover
            for size in range(2, min(maximum, n-1)+1):
                eligible = [base for base, cover in positions.items()
                            if len(cover) <= size]
                for defining in combinations(eligible, size):
                    covers = set.union(*(positions[base] for base in defining))
                    if len(covers) != size:
                        continue
                    source = {"digit": digit, "base": list(defining),
                              "cover": sorted(covers), "vertical": vertical}
                    for other in range(n):
                        if other in defining:
                            continue
                        for position in sorted(covers):
                            cell = (position*n+other if vertical
                                    else other*n+position)
                            changed |= reduce(cell, masks[cell] - {digit},
                                              names[size], source)
    return changed


def x_wings(n, masks, reduce):
    """Compatibility entry point for existing callers."""
    return basic_fish(n, masks, reduce, maximum=2)


def xy_wings(n, masks, reduce):
    """A bivalue XY pivot and XZ/YZ pincers exclude Z from common peers."""
    changed = False
    peers = peer_sets(n)
    bivalue = [i for i, domain in enumerate(masks) if len(domain) == 2]
    for pivot in bivalue:
        p = masks[pivot]
        arms = [i for i in bivalue if i in peers[pivot]
                and len(p & masks[i]) == 1]
        for a, b in combinations(arms, 2):
            pa, pb = p & masks[a], p & masks[b]
            shared = (masks[a] & masks[b]) - p
            if pa == pb or len(shared) != 1:
                continue
            z = next(iter(shared))
            for cell in sorted((peers[a] & peers[b]) - {pivot, a, b}):
                changed |= reduce(cell, masks[cell] - {z}, "xy_wing",
                                  {"pivot": pivot, "pincers": [a, b],
                                   "digit": z})
    return changed


def xyz_wings(n, masks, reduce):
    """A three-candidate pivot XYZ and two XZ/YZ pincers force Z nearby."""
    changed = False
    peers = peer_sets(n)
    pivots = [i for i, domain in enumerate(masks) if len(domain) == 3]
    bivalue = [i for i, domain in enumerate(masks) if len(domain) == 2]
    for pivot in pivots:
        p = masks[pivot]
        arms = [i for i in bivalue if i in peers[pivot] and masks[i] <= p]
        for a, b in combinations(arms, 2):
            shared = masks[a] & masks[b]
            if len(shared) != 1 or masks[a] | masks[b] != p:
                continue
            z = next(iter(shared))
            for cell in sorted(peers[pivot] & peers[a] & peers[b]):
                changed |= reduce(cell, masks[cell] - {z}, "xyz_wing",
                                  {"pivot": pivot, "pincers": [a, b],
                                   "digit": z})
    return changed


def skyscrapers(n, masks, reduce):
    """Two strong links sharing a base line force at least one roof."""
    changed = False
    peers = peer_sets(n)
    for digit in range(1, n+1):
        for vertical in (False, True):
            positions = {}
            for house in range(n):
                candidates = {axis for axis in range(n)
                              if digit in masks[
                                  axis*n+house if vertical else house*n+axis]}
                if len(candidates) == 2:
                    positions[house] = candidates
            for first, second in combinations(positions, 2):
                shared = positions[first] & positions[second]
                if len(shared) != 1:
                    continue
                first_tip = next(iter(positions[first] - shared))
                second_tip = next(iter(positions[second] - shared))
                a = first_tip*n+first if vertical else first*n+first_tip
                b = second_tip*n+second if vertical else second*n+second_tip
                source = {"digit": digit, "base": [first, second],
                          "roof": [a, b], "vertical": vertical}
                for cell in sorted(peers[a] & peers[b]):
                    if cell not in (a, b):
                        changed |= reduce(cell, masks[cell] - {digit},
                                          "skyscraper", source)
    return changed


def finned_x_wings(n, masks, reduce):
    """A two-line fish with one clustered fin group.

    Base line A has digit d only in columns u,v. On line B the same
    columns plus fins all lie in the *same box* as the B-u candidate.
    A candidate outside line B in column u within the fin box can
    be excluded: either A-u is true (column removal), or A-v is
    true and the B placement occupies that box.
    """
    changed = False
    h, w = BOXES[n]

    def box(cell):
        r, c = divmod(cell, n)
        return (r//h, c//w)

    for digit in range(1, n+1):
        for vertical in (False, True):
            def cell(base, cover):
                return cover*n+base if vertical else base*n+cover

            positions = {
                base: {col for col in range(n)
                       if digit in masks[cell(base, col)]}
                for base in range(n)
            }
            bases = [base for base, cols in positions.items() if len(cols) == 2]
            for a in bases:
                covers = positions[a]
                for b in range(n):
                    if a == b or len(positions[b]) <= 2 or not covers <= positions[b]:
                        continue
                    fins = positions[b] - covers
                    if len(fins) > 3:
                        continue
                    for cover in sorted(covers):
                        anchor = cell(b, cover)
                        if not all(box(cell(b, fin)) == box(anchor) for fin in fins):
                            continue
                        source = {"digit": digit, "baseLines": [a,b],
                                  "covers": sorted(covers),
                                  "finCells": [cell(b, fin) for fin in sorted(fins)],
                                  "cover": cover, "vertical": vertical}
                        for other in range(n):
                            if other in (a,b):
                                continue
                            target = cell(other,cover)
                            if box(target) == box(anchor):
                                changed |= reduce(target, masks[target]-{digit},
                                                  "finned_x_wing", source)
    return changed

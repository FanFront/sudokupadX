"""Motif-first authoring for modern Sudoku line constraints.

Each motif connects multiple marks; clue removal is separately verified by
a deduction-only solver so decorative/unused motifs are rejected.
"""
from variant_lines import box_id, line_class, region_segments


def generate_region_sum(n, solution, rng, constraints, paths, cage):
    # A 2+2 region-sum crossing has equal totals and a 2-cell Killer cage
    # on one side. The cage sum is then transferred across the border.
    options = []
    for length in (4, 5):
        options = paths(
            n, solution, length,
            lambda path: (
                len(region_segments(n, path)) == 2
                and 2 <= len(region_segments(n, path)[0]) <= 3
                and 1 <= len(region_segments(n, path)[1]) <= 3
                and box_id(n, path[0]) != box_id(n, path[-1])
                and sum(solution[i] for i in region_segments(n, path)[0])
                == sum(solution[i] for i in region_segments(n, path)[1])))
        if options:
            break
    if not options:
        raise ValueError("Cannot place equal-sum region crossing")
    # Avoid adding the very same cage twice if another motif already did it.
    path = list(rng.choice(options))
    pieces = region_segments(n, path)
    if not any(c["type"] == "killer"
               and set(c["cells"]) == set(pieces[0])
               for c in constraints):
        constraints.append(cage(n, solution, pieces[0],
                                motif="region_sum_killer_bridge"))
    constraints.append({
        "type": "region_sum", "cells": path,
        "motif": "region_sum_killer_bridge",
        "protectCells": list(pieces[1])
    })


def generate_entropic_modular_cross(n, solution, rng, constraints, paths):
    # A single placed digit on each line fixes that line's class phase;
    # the crossing digit is then restricted to the intersection of the
    # two classes. No answer digits are embedded in solver metadata.
    epaths = paths(
        n, solution, 4,
        lambda path: len({line_class(n, solution[i], "entropic")
                         for i in path[:3]}) == 3
        and line_class(n, solution[path[0]], "entropic")
        == line_class(n, solution[path[3]], "entropic"))
    mpaths = paths(
        n, solution, 4,
        lambda path: len({line_class(n, solution[i], "modular")
                         for i in path[:3]}) == 3
        and line_class(n, solution[path[0]], "modular")
        == line_class(n, solution[path[3]], "modular"))
    if not epaths or not mpaths:
        raise ValueError("No entropic or modular 4-cell path")
    choices = []
    modular_by_cell = {}
    for path in mpaths:
        for cell in path:
            modular_by_cell.setdefault(cell, []).append(path)
    # Sample a bounded, reproducible number of candidate paths.
    rng.shuffle(epaths)
    for epath in epaths[:240]:
        for crossing in epath:
            for mpath in modular_by_cell.get(crossing, []):
                if len(set(epath) & set(mpath)) != 1:
                    continue
                ea = next((i for i in epath if i != crossing), None)
                ma = next((i for i in mpath if i != crossing
                           and i != ea), None)
                if ea is None or ma is None:
                    continue
                # Bias towards paths with visually clear right-angle crossings.
                choices.append((epath, mpath, crossing, ea, ma))
                if len(choices) == 500:
                    break
            if len(choices) >= 500:
                break
        if len(choices) >= 500:
            break
    if not choices:
        raise ValueError("No entropic-modular crossing")
    epath, mpath, crossing, ea, ma = rng.choice(choices)
    constraints.extend((
        {"type": "entropic", "cells": list(epath),
         "motif": "entropic_modular_cross",
         "forcedGivens": [ea], "protectCells": [crossing]},
        {"type": "modular", "cells": list(mpath),
         "motif": "entropic_modular_cross",
         "forcedGivens": [ma], "protectCells": [crossing]}
    ))


def generate_between_renban(n, solution, rng, constraints, paths):
    options = []
    for length in ((5, 4) if n == 9 else (4, 5)):
        options = paths(
            n, solution, length,
            lambda path: (
                len({solution[i] for i in path[1:-1]}) == length - 2
                and (max(solution[i] for i in path[1:-1])
                     - min(solution[i] for i in path[1:-1]) == length - 3)
                and min(solution[path[0]], solution[path[-1]])
                < min(solution[i] for i in path[1:-1])
                and max(solution[path[0]], solution[path[-1]])
                > max(solution[i] for i in path[1:-1])))
        if options:
            break
    if not options:
        raise ValueError("No Between-Renban motif")
    path = list(rng.choice(options))
    interior = path[1:-1]
    if not any(c["type"] == "renban"
               and set(c["cells"]) == set(interior)
               for c in constraints):
        constraints.append({
            "type": "renban", "cells": list(interior),
            "motif": "between_renban"})
    constraints.append({
        "type": "between", "cells": path,
        "motif": "between_renban",
        "protectCells": list(path)
    })


def add_line_motifs(n, solution, rng, constraints, paths, cage):
    generate_region_sum(n, solution, rng, constraints, paths, cage)
    if n >= 6:
        generate_entropic_modular_cross(n, solution, rng, constraints, paths)
        generate_between_renban(n, solution, rng, constraints, paths)

"""Deductive propagators for region-sum, entropic, modular and between lines.

All deductions use printed constraints and current domains only; none branches
on a hypothesis or consults the generator's answer.
"""
from itertools import permutations, product

LINE_VARIANTS = ("region_sum", "entropic", "modular", "between")
BOXES = {4: (2, 2), 6: (2, 3), 9: (3, 3)}


def box_id(n, cell):
    h, w = BOXES[n]
    row, col = divmod(cell, n)
    return row // h * (n // w) + col // w


def region_segments(n, path):
    """Box boundaries split a line into successive equal-sum pieces."""
    segments = []
    for cell in path:
        if not segments or box_id(n, segments[-1][-1]) != box_id(n, cell):
            segments.append([cell])
        else:
            segments[-1].append(cell)
    return segments


def validate_line(n, clue):
    kind, cells = clue["type"], clue["cells"]
    if kind == "region_sum":
        if len(cells) < 3 or len(cells) > 7 or len(region_segments(n, cells)) < 2:
            raise ValueError("Region-sum must cross a box boundary")
    elif kind in ("entropic", "modular"):
        if n not in (6, 9) or not 3 <= len(cells) <= 7:
            raise ValueError("Entropic and modular require 6x6 or 9x9")
    elif kind == "between":
        if n not in (6, 9) or not 4 <= len(cells) <= 7:
            raise ValueError("Between lines need two endpoints and two interiors")


def line_class(n, digit, kind):
    return (digit - 1) // (n // 3) if kind == "entropic" else (digit - 1) % 3


def group_orders(n, masks, cells, kind):
    for order in permutations(range(3)):
        if all(any(line_class(n, digit, kind) == order[index % 3]
                   for digit in masks[cell])
               for index, cell in enumerate(cells)):
            yield order


def propagate_group(n, masks, clue, index, reduce):
    cells, kind = clue["cells"], clue["type"]
    support = [set() for _ in cells]
    for order in group_orders(n, masks, cells, kind):
        for position, cell in enumerate(cells):
            support[position].update(
                digit for digit in masks[cell]
                if line_class(n, digit, kind) == order[position % 3])
    changed = False
    for cell, allowed in zip(cells, support):
        changed |= reduce(cell, allowed, kind, index)
    return changed


def propagate_cross(n, masks, constraints, reduce):
    """Crossed entropic/modular lines jointly restrict their shared digits."""
    changed = False
    e_lines = [(i, c["cells"]) for i, c in enumerate(constraints)
               if c["type"] == "entropic"]
    m_lines = [(i, c["cells"]) for i, c in enumerate(constraints)
               if c["type"] == "modular"]
    for eid, epath in e_lines:
        eorders = list(group_orders(n, masks, epath, "entropic"))
        for mid, mpath in m_lines:
            common = sorted(set(epath) & set(mpath))
            if not common:
                continue
            morders = list(group_orders(n, masks, mpath, "modular"))
            support = {cell: set() for cell in common}
            for eorder in eorders:
                for morder in morders:
                    assignment = {}
                    for cell in common:
                        eclass = eorder[epath.index(cell) % 3]
                        mclass = morder[mpath.index(cell) % 3]
                        options = {digit for digit in masks[cell]
                                   if line_class(n, digit, "entropic") == eclass
                                   and line_class(n, digit, "modular") == mclass}
                        if not options:
                            break
                        assignment[cell] = options
                    if len(assignment) == len(common):
                        for cell, values in assignment.items():
                            support[cell].update(values)
            for cell in common:
                changed |= reduce(cell, support[cell], "entropic_modular_cross",
                                  {"entropic": eid, "modular": mid})
    return changed


def propagate_region(n, masks, clue, index, reduce):
    segments = region_segments(n, clue["cells"])
    options = []
    common_sums = None
    for segment in segments:
        assignments = [(sum(digits), digits)
                       for digits in product(*(sorted(masks[cell]) for cell in segment))
                       if len(set(digits)) == len(digits)]
        options.append(assignments)
        sums = {total for total, _ in assignments}
        common_sums = sums if common_sums is None else common_sums & sums
    changed = False
    for segment, assignments in zip(segments, options):
        support = [set() for _ in segment]
        for total, digits in assignments:
            if total in common_sums:
                for allowed, digit in zip(support, digits):
                    allowed.add(digit)
        for cell, allowed in zip(segment, support):
            changed |= reduce(cell, allowed, "region_sum",
                              {"line": index, "segments": segments})
    return changed


def propagate_region_killer(n, masks, constraints, reduce):
    """A Killer matching one region segment fixes all other segment sums."""
    cages = [(index, frozenset(c["cells"]), c["sum"])
             for index, c in enumerate(constraints) if c["type"] == "killer"]
    changed = False
    for line_id, line in enumerate(constraints):
        if line["type"] != "region_sum":
            continue
        segments = region_segments(n, line["cells"])
        for cage_id, members, total in cages:
            if members not in (frozenset(piece) for piece in segments):
                continue
            for segment in segments:
                support = [set() for _ in segment]
                for digits in product(*(sorted(masks[cell]) for cell in segment)):
                    if sum(digits) == total and len(set(digits)) == len(digits):
                        for allowed, digit in zip(support, digits):
                            allowed.add(digit)
                for cell, allowed in zip(segment, support):
                    changed |= reduce(cell, allowed, "region_sum_killer_bridge",
                                      {"line": line_id, "cage": cage_id,
                                       "sum": total})
    return changed


def peers(n, a, b):
    return a // n == b // n or a % n == b % n or box_id(n, a) == box_id(n, b)


def between_assignments(n, masks, cells, renban=False):
    a, z = cells[0], cells[-1]
    middle = cells[1:-1]
    for lo_end in sorted(masks[a]):
        for hi_end in sorted(masks[z]):
            lo, hi = sorted((lo_end, hi_end))
            choices = [sorted(d for d in masks[cell] if lo < d < hi)
                       for cell in middle]
            if not all(choices):
                continue
            for values in product(*choices):
                if renban and (len(set(values)) != len(values)
                               or max(values)-min(values) != len(values)-1):
                    continue
                digits = (lo_end, *values, hi_end)
                if any(digits[i] == digits[j] and peers(n, x, y)
                       for i, x in enumerate(cells)
                       for j, y in enumerate(cells) if j > i):
                    continue
                yield digits


def propagate_between(n, masks, clue, index, reduce):
    cells = clue["cells"]
    support = [set() for _ in cells]
    for digits in between_assignments(n, masks, cells):
        for allowed, digit in zip(support, digits):
            allowed.add(digit)
    changed = False
    for cell, allowed in zip(cells, support):
        changed |= reduce(cell, allowed, "between", index)
    return changed


def propagate_between_renban(n, masks, constraints, reduce):
    """Exact Between interiors that are Renban lines restrict both bulbs."""
    lines = [(i, c["cells"]) for i, c in enumerate(constraints)
             if c["type"] == "between"]
    renbans = [(i, frozenset(c["cells"])) for i, c in enumerate(constraints)
               if c["type"] == "renban"]
    changed = False
    for line_id, cells in lines:
        for renban_id, members in renbans:
            if members != frozenset(cells[1:-1]):
                continue
            support = [set() for _ in cells]
            for digits in between_assignments(n, masks, cells, renban=True):
                for allowed, digit in zip(support, digits):
                    allowed.add(digit)
            for cell, allowed in zip(cells, support):
                changed |= reduce(cell, allowed, "between_renban",
                                  {"between": line_id, "renban": renban_id})
    return changed


def propagate_line(n, masks, clue, index, reduce):
    kind = clue["type"]
    if kind in ("entropic", "modular"):
        return propagate_group(n, masks, clue, index, reduce)
    if kind == "region_sum":
        return propagate_region(n, masks, clue, index, reduce)
    if kind == "between":
        return propagate_between(n, masks, clue, index, reduce)
    return False

"""Short, proof-carrying Sudoku chain and coloring deductions.

These are bounded *positive inference* patterns, never trial-and-error:
every elimination follows from linked candidate relations regardless of
which branch of the deduction is true. Trace sources include the cells
and digit needed to explain the reasoning to a human.
"""
from collections import defaultdict, deque
from itertools import combinations

from classic_techniques import peer_sets


def strong_links(n, masks, units):
    """All conjugate pairs: two remaining positions for one digit in a house."""
    result = defaultdict(dict)
    for house_id, house in enumerate(units):
        for digit in range(1, n+1):
            cells = [cell for cell in house if digit in masks[cell]]
            if len(cells) == 2:
                a, b = cells
                result[digit].setdefault(tuple(sorted((a, b))), []).append(house_id)
    return result


def two_string_kites(n, masks, units, reduce):
    """A row and column conjugate pair join by a weak box connection.

    If the two inner ends cannot both be digit d, one outer tip must
    contain d. Thus every cell seeing both outer tips excludes d.
    """
    changed = False
    peers = peer_sets(n)
    h, w = {4:(2,2), 6:(2,3), 9:(3,3)}[n]
    for digit in range(1, n+1):
        row_pairs, col_pairs = [], []
        for row in range(n):
            cells = [row*n+col for col in range(n) if digit in masks[row*n+col]]
            if len(cells) == 2:
                row_pairs.append((row, cells))
        for col in range(n):
            cells = [row*n+col for row in range(n) if digit in masks[row*n+col]]
            if len(cells) == 2:
                col_pairs.append((col, cells))
        for row_id, row_cells in row_pairs:
            for col_id, col_cells in col_pairs:
                for row_inside, row_outside in ((0, 1), (1, 0)):
                    for col_inside, col_outside in ((0, 1), (1, 0)):
                        a, tip_a = row_cells[row_inside], row_cells[row_outside]
                        b, tip_b = col_cells[col_inside], col_cells[col_outside]
                        if a == b or tip_a == tip_b or b not in peers[a]:
                            continue
                        # The central weak link must be a box relation,
                        # not a coincidental same-row/same-col overlap.
                        if a//n == b//n or a%n == b%n:
                            continue
                        if (a//n//h, a%n//w) != (b//n//h, b%n//w):
                            continue
                        source = {"digit": digit, "row": row_id, "column": col_id,
                                  "inner": [a, b], "tips": [tip_a, tip_b]}
                        for target in sorted(peers[tip_a] & peers[tip_b]):
                            if target not in (a, b, tip_a, tip_b):
                                changed |= reduce(
                                    target, masks[target]-{digit},
                                    "two_string_kite", source)
    return changed


def w_wings(n, masks, units, reduce):
    """Bivalue AB endpoints and a strong A link force B at one endpoint."""
    changed = False
    peers = peer_sets(n)
    pair_cells = defaultdict(list)
    for cell, domain in enumerate(masks):
        if len(domain) == 2:
            pair_cells[frozenset(domain)].append(cell)
    links = strong_links(n, masks, units)
    for digits, cells in pair_cells.items():
        if len(cells) < 2:
            continue
        for a, b in combinations(cells, 2):
            if b in peers[a]:
                continue  # Local naked pair, not a W-Wing.
            for link_digit in sorted(digits):
                other = next(d for d in digits if d != link_digit)
                for (p, q), houses in links.get(link_digit, {}).items():
                    if len({a, b, p, q}) != 4:
                        continue
                    if not ((p in peers[a] and q in peers[b]) or
                            (q in peers[a] and p in peers[b])):
                        continue
                    source = {"digit": other, "linkDigit": link_digit,
                              "endpoints": [a, b], "strongLink": [p, q],
                              "houses": houses}
                    for cell in sorted(peers[a] & peers[b]):
                        if cell not in (p, q):
                            changed |= reduce(
                                cell, masks[cell] - {other}, "w_wing", source)
    return changed


def _color_components(nodes, adjacency):
    """Two-color parity from strong links; skip incompatible/degenerate graphs."""
    visited = set()
    for node in sorted(nodes):
        if node in visited:
            continue
        colors = {node: 0}
        queue = deque([node])
        consistent = True
        while queue:
            a = queue.popleft()
            for b in sorted(adjacency.get(a, ())):
                if b in colors:
                    if colors[b] == colors[a]:
                        consistent = False
                    continue
                colors[b] = 1 - colors[a]
                queue.append(b)
        visited.update(colors)
        if consistent and len(colors) >= 4:
            yield colors


def simple_colors(n, masks, units, reduce):
    """Color trap/wrap on a connected single-digit strong-link component."""
    changed = False
    peers = peer_sets(n)
    links = strong_links(n, masks, units)
    for digit in range(1, n+1):
        graph = defaultdict(set)
        for a, b in links.get(digit, {}):
            graph[a].add(b)
            graph[b].add(a)
        for colors in _color_components(graph, graph):
            by_color = ({cell for cell, shade in colors.items() if shade == 0},
                        {cell for cell, shade in colors.items() if shade == 1})
            source = {"digit": digit, "colors": [sorted(c) for c in by_color]}
            # If two same-colored candidates see each other, all nodes
            # of that color must be false (the opposite color is true).
            for shade, cells in enumerate(by_color):
                if any(b in peers[a] for a, b in combinations(sorted(cells), 2)):
                    for target in sorted(cells):
                        changed |= reduce(target, masks[target]-{digit},
                                          "color_wrap", {**source, "falseColor": shade})
            # If an uncolored cell sees both colors, both possible
            # assignments to the component exclude that cell.
            for cell in range(n*n):
                if cell in colors or digit not in masks[cell]:
                    continue
                if all(peers[cell] & color for color in by_color):
                    changed |= reduce(cell, masks[cell]-{digit},
                                      "color_trap", source)
    return changed


def remote_pairs(n, masks, reduce):
    """An even number of {A,B} cells with opposite-color endpoints.

    Along each peer edge, two identical bivalue cells are opposite.
    A target seeing one endpoint of each parity cannot be A or B.
    """
    changed = False
    peers = peer_sets(n)
    groups = defaultdict(list)
    for cell, domain in enumerate(masks):
        if len(domain) == 2:
            groups[frozenset(domain)].append(cell)
    for digits, cells in groups.items():
        if len(cells) < 4:
            continue
        graph = {cell: peers[cell] & set(cells) for cell in cells}
        for colors in _color_components(cells, graph):
            zero = [c for c, color in colors.items() if color == 0]
            one = [c for c, color in colors.items() if color == 1]
            if len(colors) < 4:
                continue
            for a in zero:
                for b in one:
                    if b in peers[a]:
                        continue  # A naked-pair alternative is simpler.
                    source = {"pair": sorted(digits), "endpoints": [a, b],
                              "component": sorted(colors),
                              "colors": [sorted(zero), sorted(one)]}
                    for target in sorted(peers[a] & peers[b] - set(colors)):
                        changed |= reduce(target, masks[target] - digits,
                                          "remote_pairs", source)
    return changed


def xy_chains(n, masks, reduce, max_length=6):
    """A bounded bivalue XY-chain, each step a readable direct implication.

    If the start cell does not contain endpoint digit Z, every link
    forces the next cell's alternate value, ending in Z at the other
    endpoint. Hence at least one endpoint is Z. No contradiction probe.
    """
    changed = False
    peers = peer_sets(n)
    bv = [i for i, domain in enumerate(masks) if len(domain) == 2]
    # Long chains among dozens of bivalue cells become search puzzles;
    # keep this method fast, bounded and human-readable.
    if len(bv) > 34:
        return False
    bvset = set(bv)
    for start in bv:
        for endpoint_digit in sorted(masks[start]):
            start_forced = next(d for d in masks[start] if d != endpoint_digit)
            queue = deque([(start, start_forced, (start,))])
            explored = 0
            while queue and explored < 1800:
                cell, forced, path = queue.popleft()
                explored += 1
                if len(path) >= max_length:
                    continue
                for nxt in sorted(peers[cell] & bvset):
                    if nxt in path or forced not in masks[nxt]:
                        continue
                    next_forced = next(d for d in masks[nxt] if d != forced)
                    updated = path + (nxt,)
                    if next_forced == endpoint_digit and len(updated) >= 4:
                        source = {"digit": endpoint_digit, "chain": list(updated)}
                        for target in sorted(peers[start] & peers[nxt]):
                            if target not in updated:
                                changed |= reduce(
                                    target, masks[target]-{endpoint_digit},
                                    "xy_chain", source)
                    elif len(updated) < max_length:
                        queue.append((nxt, next_forced, updated))
    return changed


def x_chains(n, masks, units, reduce):
    """Five-link single-digit alternating strong/weak inference chains.

    Strong -> weak -> strong -> weak -> strong implies at least one of
    the endpoints contains the digit; common peers can remove it.
    Length is deliberately fixed to 5 for a short, teachable proof.
    """
    changed = False
    peers = peer_sets(n)
    links = strong_links(n, masks, units)
    for digit in range(1, n+1):
        adjacency = defaultdict(set)
        for a, b in links.get(digit, {}):
            adjacency[a].add(b)
            adjacency[b].add(a)
        if not adjacency:
            continue
        candidates = {cell for cell in range(n*n) if digit in masks[cell]}
        for start in sorted(adjacency):
            # Edge types: S-W-S-W-S, never speculative casework.
            queue = deque([(start, (start,))])
            explored = 0
            while queue and explored < 1800:
                cell, path = queue.popleft()
                explored += 1
                if len(path) == 6:
                    if cell == start:
                        continue
                    source = {"digit": digit, "chain": list(path),
                              "edges": "S-W-S-W-S"}
                    for target in sorted(peers[start] & peers[cell]):
                        if target not in path:
                            changed |= reduce(target, masks[target]-{digit},
                                              "x_chain", source)
                    continue
                edge_is_strong = len(path) % 2 == 1
                neighbors = (adjacency[cell] if edge_is_strong
                             else peers[cell] & candidates)
                for nxt in sorted(neighbors):
                    if nxt not in path:
                        queue.append((nxt, path+(nxt,)))
    return changed

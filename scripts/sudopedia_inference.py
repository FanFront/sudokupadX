"""Explainable candidate inference graph and Sudopedia coloring extensions.

Each graph edge is either a *strong* (at least one literal true) or
*weak* (not both true) inference. No trial assignments or assumptions
of puzzle uniqueness occur in these routines.
"""
from collections import defaultdict, deque
from itertools import combinations
from classic_techniques import BOXES, peer_sets


def inference_graph(n, masks, units):
    """Make cell-digit literals and their conjugate/bivalue XOR links."""
    strong = defaultdict(set)
    edge_sources = {}
    for cell, domain in enumerate(masks):
        if len(domain) == 2:
            x, y = sorted(domain)
            a, b = (cell, x), (cell, y)
            strong[a].add(b)
            strong[b].add(a)
            edge_sources[frozenset((a, b))] = {'cell': cell}
    for house_id, unit in enumerate(units):
        for digit in range(1, n + 1):
            cells = [cell for cell in unit if digit in masks[cell]]
            if len(cells) == 2:
                a, b = (cells[0], digit), (cells[1], digit)
                strong[a].add(b)
                strong[b].add(a)
                edge_sources.setdefault(frozenset((a, b)), {'house': house_id})
    return strong, edge_sources


def _weak(a, b, peers):
    return ((a[0] == b[0] and a[1] != b[1]) or
            (a[1] == b[1] and b[0] in peers[a[0]]))


def _color_components(adjacency, minimum=2):
    visited = set()
    for start in sorted(adjacency):
        if start in visited:
            continue
        colors = {start: 0}
        queue = deque([start])
        valid = True
        while queue:
            node = queue.popleft()
            for peer in sorted(adjacency[node]):
                if peer in colors:
                    if colors[peer] == colors[node]:
                        valid = False
                else:
                    colors[peer] = colors[node] ^ 1
                    queue.append(peer)
        visited.update(colors)
        if valid and len(colors) >= minimum:
            yield colors


def alternating_inference_chains(n, masks, units, reduce,
                                 max_links=7, max_explored=4500):
    """AIC: S-W-S[-W-S...] yields a strong link between its endpoints.

    A candidate weakly linked to both endpoints must be false.
    The recorded path gives the exact literals and alternating edge kinds.
    """
    strong, sources = inference_graph(n, masks, units)
    if not strong:
        return False
    peers = peer_sets(n)
    active = sorted(strong)
    active_set = set(active)
    # Indexed weak links avoid scanning every candidate for every chain.
    weak_full = {
        node: ({(node[0], d) for d in masks[node[0]] if d != node[1]} |
               {(cell, node[1]) for cell in peers[node[0]]
                if node[1] in masks[cell]})
        for node in active
    }
    weak_graph = {node: weak_full[node] & active_set for node in active}
    changed = False
    total = 0
    for start in active:
        queue = deque([(start, (start,))])
        explored = 0
        while queue and explored < 240 and total < max_explored:
            node, path = queue.popleft()
            explored += 1
            total += 1
            edge_count = len(path) - 1
            if edge_count >= 3 and edge_count % 2:
                source = {'chain': [list(x) for x in path],
                          'edges': '-'.join('S' if j % 2 == 0 else 'W'
                                            for j in range(edge_count)),
                          'conjugates': [
                              sources.get(frozenset((path[j], path[j+1])))
                              for j in range(0, edge_count, 2)]}
                # Endpoints are strongly linked; any literal excluding
                # both endpoints is false. This also supports multi-digit
                # AIC deductions, which X-Chain alone cannot find.
                for target, digit in sorted(weak_full[start] & weak_full[node]):
                    if (target, digit) in path or digit not in masks[target]:
                        continue
                    if reduce(target, masks[target] - {digit}, 'aic', source):
                        return True
            if edge_count >= max_links:
                continue
            next_nodes = strong[node] if edge_count % 2 == 0 else weak_graph[node]
            for nxt in sorted(next_nodes):
                if nxt not in path:
                    queue.append((nxt, path + (nxt,)))
        if total >= max_explored:
            break
    return changed


def medusa_3d(n, masks, units, reduce):
    """3D Medusa: parity coloring of *all* strong candidate implications.

    A color class is globally true or globally false within its component.
    Same-color weak clashes falsify one class; outside literals seeing a
    member of both colors are false under either assignment.
    """
    strong, _ = inference_graph(n, masks, units)
    if not strong:
        return False
    peers = peer_sets(n)
    for colors in _color_components(strong, minimum=4):
        if len({d for _, d in colors}) < 2:
            continue  # ordinary single-digit coloring
        sides = [{node for node, color in colors.items() if color == shade}
                 for shade in (0, 1)]
        source = {'colors': [[list(node) for node in sorted(side)]
                             for side in sides]}
        for shade, side in enumerate(sides):
            if any(_weak(a, b, peers) for a, b in combinations(sorted(side), 2)):
                for cell, digit in sorted(side):
                    if reduce(cell, masks[cell] - {digit}, 'medusa_wrap',
                              {**source, 'falseColor': shade}):
                        return True
        for cell, domain in enumerate(masks):
            for digit in sorted(domain):
                literal = (cell, digit)
                if literal in colors:
                    continue
                if all(any(_weak(literal, other, peers) for other in side)
                       for side in sides):
                    if reduce(cell, masks[cell] - {digit}, 'medusa_trap', source):
                        return True
    return False


def multi_colors(n, masks, units, reduce):
    """Multi-Colors / Color Wing with two independent parity clusters.

    If both colors of cluster A each conflict with color B0, B0 is
    impossible because exactly one color of A must be true.
    """
    strong, _ = inference_graph(n, masks, units)
    peers = peer_sets(n)
    for digit in range(1, n + 1):
        graph = {node: {other for other in strong[node]
                        if other[1] == digit}
                 for node in strong if node[1] == digit}
        components = list(_color_components(graph))
        for a, b in combinations(components, 2):
            sides_a = [{node for node, shade in a.items() if shade == color}
                       for color in (0, 1)]
            for shade in (0, 1):
                side_b = {node for node, color in b.items() if color == shade}
                if all(any(_weak(x, y, peers) for x in first for y in side_b)
                       for first in sides_a):
                    source = {'digit': digit,
                              'first': [[c for c, d in sorted(side)]
                                        for side in sides_a],
                              'second': [[c for c, d in sorted(
                                  {node for node, color in b.items() if color == j})]
                                         for j in (0, 1)],
                              'falseColor': shade}
                    for cell, _ in sorted(side_b):
                        if reduce(cell, masks[cell] - {digit},
                                  'multi_colors', source):
                            return True
    return False


def empty_rectangles(n, masks, units, reduce):
    """The empty-rectangle strong-link pattern, both orientations.

    In a box, every d lies on an L-cross (row r or column c).
    A conjugate pair X,Y outside the box has X on row r. If X is true,
    d in the box must lie on column c; if X is false, Y is true.
    A candidate T at the intersection of Y's row and column c is
    therefore impossible. The transposed orientation is symmetric.
    """
    if n != 9:
        return False
    peers = peer_sets(n)
    h, w = BOXES[n]
    for digit in range(1, n + 1):
        for box_id, unit in enumerate(units[2*n:]):
            box_cells = set(unit)
            possible = [cell for cell in unit if digit in masks[cell]]
            if len(possible) < 2:
                continue
            rows = sorted({cell // n for cell in unit})
            cols = sorted({cell % n for cell in unit})
            for row in rows:
                for col in cols:
                    if not all(cell // n == row or cell % n == col
                               for cell in possible):
                        continue
                    if not any(cell // n == row and cell % n != col
                               for cell in possible):
                        continue
                    if not any(cell % n == col and cell // n != row
                               for cell in possible):
                        continue
                    for outer_col in range(n):
                        if outer_col in cols:
                            continue
                        x = row * n + outer_col
                        if digit not in masks[x]:
                            continue
                        conjugates = [cell for cell in units[n+outer_col]
                                      if digit in masks[cell]]
                        if len(conjugates) != 2 or x not in conjugates:
                            continue
                        y = next(c for c in conjugates if c != x)
                        target = (y // n)*n + col
                        if (target in box_cells or target == y or
                                digit not in masks[target]):
                            continue
                        source = {'box': box_id, 'digit': digit,
                                  'crossRow': row, 'crossColumn': col,
                                  'strongLink': [x, y],
                                  'orientation': 'column'}
                        if reduce(target, masks[target]-{digit},
                                  'empty_rectangle', source):
                            return True
                    for outer_row in range(n):
                        if outer_row in rows:
                            continue
                        x = outer_row * n + col
                        if digit not in masks[x]:
                            continue
                        conjugates = [cell for cell in units[outer_row]
                                      if digit in masks[cell]]
                        if len(conjugates) != 2 or x not in conjugates:
                            continue
                        y = next(c for c in conjugates if c != x)
                        target = row*n + (y % n)
                        if (target in box_cells or target == y or
                                digit not in masks[target]):
                            continue
                        source = {'box': box_id, 'digit': digit,
                                  'crossRow': row, 'crossColumn': col,
                                  'strongLink': [x, y],
                                  'orientation': 'row'}
                        if reduce(target, masks[target]-{digit},
                                  'empty_rectangle', source):
                            return True
    return False

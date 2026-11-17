"""Proof-producing multi-digit chains and 3D Medusa.

Candidate graph edges:
- strong: exactly one of two endpoints is true (bivalue cell or bilocal
  digit in one house);
- weak: two candidates cannot both be true (same cell or peer digits).

Every reported elimination has a finite alternating/colouring certificate.
The algorithm does not assume a candidate and recursively solve the puzzle.
"""
from collections import defaultdict, deque
from itertools import combinations

from classic_techniques import peer_sets


def candidate_graph(n, masks, units):
    """Return all nodes, strong/weak adjacency and peers for 9x9 Sudoku."""
    peers = peer_sets(n)
    nodes = {(cell, digit) for cell, domain in enumerate(masks)
             if len(domain) > 1 for digit in domain}
    strong = defaultdict(set)
    weak = defaultdict(set)

    def connect(graph, a, b):
        if a != b and a in nodes and b in nodes:
            graph[a].add(b)
            graph[b].add(a)

    for cell, domain in enumerate(masks):
        if len(domain) <= 1:
            continue
        for a, b in combinations(sorted(domain), 2):
            connect(weak, (cell,a), (cell,b))
        if len(domain) == 2:
            a, b = sorted(domain)
            connect(strong, (cell,a), (cell,b))

    for house in units:
        for digit in range(1,n+1):
            cells = [cell for cell in house if (cell,digit) in nodes]
            for a, b in combinations(cells, 2):
                connect(weak, (a,digit), (b,digit))
            if len(cells) == 2:
                connect(strong, (cells[0],digit), (cells[1],digit))
    return nodes, strong, weak, peers


def medusa_3d(n, masks, units, reduce):
    """Colour complementary candidates across cells and houses.

    Both colours alternate through every strong edge. A weak link
    between two same-coloured nodes invalidates that entire colour.
    An outside candidate weakly linked to each colour is also false.
    """
    if n != 9:
        return False
    nodes, strong, weak, _ = candidate_graph(n,masks,units)
    changed = False
    unseen = set(strong)
    while unseen:
        origin = min(unseen)
        colors = {origin:0}
        queue = deque([origin])
        unseen.discard(origin)
        while queue:
            node = queue.popleft()
            for other in strong[node]:
                if other not in colors:
                    colors[other] = 1-colors[node]
                    unseen.discard(other)
                    queue.append(other)
        if len(colors) < 4 or len({digit for _,digit in colors}) < 2:
            continue
        shades = [{node for node, shade in colors.items() if shade == k}
                  for k in (0,1)]
        source = {
            "nodes": [{"cell":cell,"digit":digit,"color":shade}
                      for (cell,digit),shade in sorted(colors.items())],
            "nodeCells": sorted({cell for cell,_ in colors})
        }
        # Any weakly connected nodes in one colour cannot both be true,
        # whereas a colour's complementary assignment says both are true.
        for shade, group in enumerate(shades):
            if any(b in weak[a] for a,b in combinations(sorted(group),2)):
                for cell, digit in sorted(group):
                    changed |= reduce(
                        cell, masks[cell] - {digit},
                        "medusa_3d", {**source, "falseColor":shade,
                                      "reason":"wrap"})
        # Outside candidate is incompatible with either global colouring.
        for cell, digit in sorted(nodes - set(colors)):
            candidate = (cell,digit)
            if all(weak[candidate] & group for group in shades):
                changed |= reduce(
                    cell, masks[cell] - {digit},
                    "medusa_3d", {**source, "reason":"trap"})
    return changed


def aic_chains(n, masks, units, reduce, maximum_links=7):
    """Alternating Inference Chains across different digits.

    S-W-S[-W-S...] guarantees that at least one endpoint is true.
    If endpoints have the same digit, common peers can exclude it.
    Endpoints in one cell can instead confine that cell to two digits.
    Searches only bounded human-readable chains, never what-if branches.
    """
    if n != 9:
        return False
    nodes, strong, weak, peers = candidate_graph(n,masks,units)
    # Dense nearly-empty grids are inappropriate for advanced chain hints.
    if len(nodes) > 300:
        return False
    changed = False
    for start in sorted(strong):
        queue = deque([(start,(start,))])
        expanded = 0
        while queue and expanded < 1100:
            node, path = queue.popleft()
            expanded += 1
            if len(path) - 1 >= maximum_links:
                continue
            edge_type = "S" if len(path) % 2 else "W"
            neighbors = strong[node] if edge_type == "S" else weak[node]
            for other in sorted(neighbors):
                if other in path:
                    continue
                chain = path + (other,)
                links = len(chain) - 1
                if links >= 3 and links % 2 == 1:
                    first_cell, first_digit = start
                    last_cell, last_digit = other
                    targets = []
                    if first_digit == last_digit and first_cell != last_cell:
                        targets = [
                            (cell,first_digit)
                            for cell in sorted(peers[first_cell] & peers[last_cell])
                            if cell not in {c for c,_ in chain}
                            and first_digit in masks[cell]
                        ]
                    elif first_cell == last_cell and first_digit != last_digit:
                        targets = [
                            (first_cell,digit)
                            for digit in sorted(masks[first_cell] -
                                                {first_digit,last_digit})
                        ]
                    if targets:
                        source = {
                            "chain":[{"cell":cell,"digit":digit}
                                     for cell,digit in chain],
                            "nodeCells":[cell for cell,_ in chain],
                            "edges":"-".join("S" if j%2==0 else "W"
                                             for j in range(links)),
                            "endpoints":[list(start),list(other)]
                        }
                        for cell,digit in targets:
                            changed |= reduce(
                                cell, masks[cell] - {digit},
                                "aic", source)
                if links < maximum_links:
                    queue.append((other,chain))
    return changed

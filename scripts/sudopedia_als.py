"""Short ALS inference families from the Sudopedia solving catalogue.

ALS nodes use N cells with N+1 candidates. If a digit is absent from
an ALS, every other digit in its candidate union must occur somewhere
in that ALS. A restricted common digit (RCD) between disjoint ALS nodes
cannot occur in both nodes. These two facts justify every step below.
"""
from collections import defaultdict
from itertools import product

from als_techniques import als_groups
from classic_techniques import peer_sets


def _nodes(n, masks, units, maximum=155):
    groups = als_groups(n, masks, units, maximum_cells=3)
    groups.sort(key=lambda g: (len(g[0]), g[0]))
    return [(frozenset(cells), frozenset(digits), house)
            for cells, digits, house in groups[:maximum]]


def _rcd(a, b, masks, peers):
    """All genuine restricted common digits between disjoint ALS nodes."""
    acells, adigits, _ = a
    bcells, bdigits, _ = b
    if acells & bcells:
        return ()
    result = []
    for digit in sorted(adigits & bdigits):
        apos = [c for c in acells if digit in masks[c]]
        bpos = [c for c in bcells if digit in masks[c]]
        if all(y in peers[x] for x in apos for y in bpos):
            result.append(digit)
    return tuple(result)


def _links(nodes, masks, peers):
    graph = defaultdict(list)
    for a in range(len(nodes)):
        for b in range(a+1, len(nodes)):
            for digit in _rcd(nodes[a], nodes[b], masks, peers):
                graph[a].append((b, digit))
                graph[b].append((a, digit))
    return graph


def _targets(nodes, ends, z, masks, peers):
    positions = sorted({cell for index in ends
                        for cell in nodes[index][0] if z in masks[cell]})
    if not positions:
        return ()
    return sorted(set.intersection(*(peers[cell] for cell in positions)) -
                  set().union(*(set(nodes[index][0]) for index in ends)))


def als_xy_wings(n, masks, units, reduce, maximum=140, budget=8500):
    """ALS-XY-Wing: A -(X)- B -(Y)- C forces a shared Z in A or C."""
    nodes = _nodes(n, masks, units, maximum)
    peers = peer_sets(n)
    links = _links(nodes, masks, peers)
    explored = 0
    for center in sorted(links):
        for (a, x), (c, y) in product(links[center], repeat=2):
            if explored >= budget:
                return False
            explored += 1
            if a >= c or x == y or nodes[a][0] & nodes[c][0]:
                continue
            common = nodes[a][1] & nodes[c][1] - {x, y}
            for z in sorted(common):
                source = {'alsA': sorted(nodes[a][0]),
                          'alsB': sorted(nodes[center][0]),
                          'alsC': sorted(nodes[c][0]),
                          'links': [x, y], 'digit': z,
                          'houses': [nodes[i][2] for i in (a, center, c)]}
                for cell in _targets(nodes, (a, c), z, masks, peers):
                    if z in masks[cell] and reduce(
                            cell, masks[cell] - {z}, 'als_xy_wing', source):
                        return True
    return False


def als_xy_chains(n, masks, units, reduce, maximum=110, budget=8500):
    """Four-ALS chain with three explicit pairwise RCD links.

    If A lacks Z it contains X, so B lacks X and contains Y,
    C lacks Y and contains W, D lacks W and therefore contains Z.
    Hence an outside candidate seeing every endpoint Z can be removed.
    """
    nodes = _nodes(n, masks, units, maximum)
    peers = peer_sets(n)
    links = _links(nodes, masks, peers)
    explored = 0
    for a in sorted(links):
        for b, x in links[a]:
            for c, y in links[b]:
                if a == c or x == y:
                    continue
                if nodes[a][0] & nodes[c][0]:
                    continue
                for d, w in links[c]:
                    explored += 1
                    if explored >= budget:
                        return False
                    if d in (a, b, c) or y == w:
                        continue
                    if any(nodes[d][0] & nodes[i][0] for i in (a, b)):
                        continue
                    common = nodes[a][1] & nodes[d][1] - {x, w}
                    for z in sorted(common):
                        source = {'als': [sorted(nodes[i][0])
                                           for i in (a, b, c, d)],
                                  'restricted': [x, y, w],
                                  'digit': z}
                        for cell in _targets(nodes, (a, d), z, masks, peers):
                            if z in masks[cell] and reduce(
                                    cell, masks[cell]-{z},
                                    'als_xy_chain', source):
                                return True
    return False


def death_blossoms(n, masks, units, reduce, maximum=150, petal_limit=10):
    """A three-candidate stem with three different RCD petal ALS nodes.

    Whichever of the stem's digits is true, its matching petal excludes
    that digit and must contain the common blossom digit Z. A target
    seeing every Z placement in every petal can therefore delete Z.
    """
    nodes = _nodes(n, masks, units, maximum)
    peers = peer_sets(n)
    for stem, stem_digits in enumerate(masks):
        if len(stem_digits) != 3:
            continue
        digits = tuple(sorted(stem_digits))
        eligible = []
        for x in digits:
            matching = [i for i, (cells, ds, _) in enumerate(nodes)
                        if x in ds and len(cells) <= 2 and
                        stem not in cells and
                        all(c in peers[stem] for c in cells if x in masks[c])]
            eligible.append(matching[:petal_limit])
        if any(not matches for matches in eligible):
            continue
        for indices in product(*eligible):
            if len(set(indices)) != 3:
                continue
            cells = [nodes[i][0] for i in indices]
            if any(a & b for a, b in
                   ((cells[0], cells[1]), (cells[0], cells[2]),
                    (cells[1], cells[2]))):
                continue
            common = set.intersection(*(set(nodes[i][1]) for i in indices)) - set(digits)
            for z in sorted(common):
                positions = sorted({cell for i in indices
                                    for cell in nodes[i][0] if z in masks[cell]})
                if not positions:
                    continue
                source = {'stem': stem, 'stemDigits': list(digits),
                          'petals': [sorted(nodes[i][0]) for i in indices],
                          'digit': z}
                targets = set.intersection(*(peers[cell] for cell in positions))
                for target in sorted(targets - set().union(*cells) - {stem}):
                    if z in masks[target] and reduce(target, masks[target] - {z},
                                                      'death_blossom', source):
                        return True
    return False

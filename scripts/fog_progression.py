"""Generate fog from an executable human-logic solving path.

The original Sudokuvania puzzles illuminate individual cells in response to
correct entries. We first plan a singles-only route, then reveal every needed
given before its next deduction. Each fog stage is replayed independently.
"""
from __future__ import annotations


def neighbors(local):
    r, c = divmod(local, 9)
    return [(r+dr)*9 + c+dc for dr in (-1, 0, 1) for dc in (-1, 0, 1)
            if (dr or dc) and 0 <= r+dr < 9 and 0 <= c+dc < 9]


def immediate_singles(known, peers, units):
    """Return forced next digits using only known entries; never guess."""
    candidates, moves = {}, {}
    for i in range(81):
        if i in known:
            continue
        forbidden = {known[j] for j in peers[i] if j in known}
        possible = set(range(1, 10)) - forbidden
        if not possible:
            return {}
        candidates[i] = possible
        if len(possible) == 1:
            moves[i] = next(iter(possible))
    for unit in units:
        missing = set(range(1, 10)) - {known[j] for j in unit if j in known}
        for digit in missing:
            places = [j for j in unit
                      if j in candidates and digit in candidates[j]]
            if len(places) == 1:
                loc = places[0]
                if loc in moves and moves[loc] != digit:
                    return {}
                moves[loc] = digit
    return moves


def logical_path(clues, answer, boss_cell, peers, units):
    """A fully checked plan before boss, then after its missing digit."""
    known = dict(clues)
    before, after = [], []
    previous = None

    def pick(moves):
        return min(moves, key=lambda i: (
            0 if previous is None else
            abs(i//9 - previous//9) + abs(i%9 - previous%9), i))

    while True:
        possible = {i: digit for i, digit in
                    immediate_singles(known, peers, units).items()
                    if i != boss_cell}
        if not possible:
            break
        loc = pick(possible)
        if answer[loc] != possible[loc]:
            raise ValueError('Invalid pre-boss deduction')
        known[loc] = possible[loc]
        before.append(loc)
        previous = loc

    if boss_cell in known:
        raise ValueError('Boss cell can be solved without its boss')
    known[boss_cell] = answer[boss_cell]
    while len(known) < 81:
        possible = immediate_singles(known, peers, units)
        if not possible:
            raise ValueError('Singles-only path stalls after boss')
        loc = pick(possible)
        if answer[loc] != possible[loc]:
            raise ValueError('Invalid post-boss deduction')
        known[loc] = possible[loc]
        after.append(loc)
        previous = loc
    return before, after


def strengthen_clues(clues, answer, boss_cell, overlaps, peers, units,
                     count_solutions, singles, max_givens=44):
    """Improve logical playability while preserving two boss-free solutions."""
    clues = dict(clues)
    while len(clues) <= max_givens:
        try:
            before, after = logical_path(clues, answer, boss_cell, peers, units)
            if len(before) >= 3:
                return clues, before, after
        except ValueError:
            pass
        if len(clues) == max_givens:
            break
        baseline = len(singles(clues | {boss_cell: answer[boss_cell]}))
        options = []
        for loc in range(81):
            if loc in clues or loc in overlaps or loc == boss_cell:
                continue
            # Even with every shared overlap known, adding this clue must
            # still leave at least two distinct main-Sudoku solutions.
            if count_solutions(clues | overlaps | {loc:answer[loc]}) < 2:
                continue
            scored = len(singles(clues |
                {boss_cell: answer[boss_cell], loc: answer[loc]}))
            options.append((scored-baseline,loc))
        if not options:
            break
        # The largest gain is preferred. Ties are deterministic.
        best = max(options, key=lambda item: (item[0], -item[1]))[1]
        clues[best] = answer[best]
    raise ValueError('No complete singles-only route while preserving '
                     'the indispensable boss cell')


def needed_givens(target, already_visible, all_clues, earlier_moves, peers, units):
    """Compute a small subset of hidden givens needed for this deduction."""
    base = dict(earlier_moves) | {
        loc:all_clues[loc] for loc in already_visible}
    if target in immediate_singles(base, peers, units):
        return set()
    needed = set(all_clues) - already_visible
    if target not in immediate_singles(
        base | {loc:all_clues[loc] for loc in needed}, peers, units):
        raise ValueError('Next move requires an unrevealed answer')
    for loc in sorted(tuple(needed)):
        candidate = needed - {loc}
        if target in immediate_singles(
            base | {j:all_clues[j] for j in candidate},peers,units):
            needed = candidate
    return needed


def add_progressive_fog(world, clues, solutions, boss_cells, positions,
                        rng, shared_solved_cells, count_solutions, singles,
                        peers, units):
    """Build only reveals backed by a verified, visible-data solving path."""
    rules, plans = [], []

    def at(g,local):
        top,left=positions[g]
        r,c=divmod(local,9)
        return [top+r,left+c]

    for g in range(4):
        answer=solutions[g]
        good,before,after=strengthen_clues(
            clues[g],answer,boss_cells[g],shared_solved_cells(solutions,g),
            peers,units,count_solutions,singles)
        clues[g] = good
        for loc,digit in good.items():
            r,c=at(g,loc)
            assert not world['cells'][r][c] or \
                   world['cells'][r][c]['value']==str(digit)
            world['cells'][r][c]={'value':str(digit)}

        path=before+after
        assert len(before)>=3 and len(path)+len(good)+1==81
        visible_givens=set()
        previous_moves={}
        opening=set()
        triggered={}
        for step,loc in enumerate(path):
            new_clues=needed_givens(
                loc,visible_givens,good,previous_moves,peers,units)
            visible_givens.update(new_clues)
            if step==0:
                opening.update(visible_givens)
                opening.add(loc)
            else:
                previous = boss_cells[g] if step == len(before) \
                    else path[step-1]
                triggered.setdefault(previous,set()).update(new_clues)
                triggered[previous].add(loc)
            previous_moves[loc]=answer[loc]
            # The boss reward is available in the planned continuation,
            # but never to any pre-boss deduction.
            if step==len(before)-1:
                previous_moves[boss_cells[g]]=answer[boss_cells[g]]

        # Each legitimate player-entered value illuminates a small patch.
        for loc in path:
            triggered.setdefault(loc,set()).update(
                j for j in neighbors(loc) if j != boss_cells[g])
        triggered.setdefault(boss_cells[g],set()).update(
            j for j in neighbors(boss_cells[g]) if j != boss_cells[g])

        # The boss itself appears only after three forced entries have been
        # entered. It remains *unfillable* until the linked boss is solved.
        milestones=before[:3]
        triggered_rules = []
        for loc, targets in triggered.items():
            triggered_rules.append({
                'chapter':g,
                'cells':[at(g,loc)],
                'values':[str(answer[loc])],
                'reveals':[at(g,j) for j in sorted(targets)]
            })
        triggered_rules.append({
            'chapter':g,
            'cells':[at(g,j) for j in milestones],
            'values':[str(answer[j]) for j in milestones],
            'reveals':[at(g,boss_cells[g])]
        })
        # The last legitimate deduction clears any still-hidden clue cells.
        # Previous steps generally reveal nearly all via local neighborhoods.
        possible_visible=set(opening)|{boss_cells[g]}
        for targets in triggered.values():
            possible_visible.update(targets)
        missing=set(range(81))-possible_visible
        if missing:
            last=at(g,path[-1])
            next(rule for rule in triggered_rules if rule['cells']==[last])[
                'reveals'].extend(at(g,j) for j in sorted(missing))
        rules.extend(triggered_rules)

        initial=sorted(opening)
        assert 2<=len(initial)<40
        plans.append({
            'seed':[at(g,j) for j in initial],
            'milestones':[at(g,j) for j in milestones],
            'before':[at(g,j) for j in before],
            'after':[at(g,j) for j in after],
            'givens':len(good)
        })

    world['foglight']=plans[0]['seed']
    for g in range(3):
        world['metadata']['bossGates'][g]['reveals']=plans[g+1]['seed']
    world['metadata']['generatedFogRules']=rules
    world['metadata']['generatedFogPlan']=plans
    world['metadata']['rules'] += (
        ' Correctly filling visible cells reveals nearby cells and the '
        'clues needed for the next logical deduction. Every fog stage '
        'has a verified solution path based on *revealed* information. '
        'The embedded boss cell appears after three forced entries.'
    )
    return plans


def validate_fog_walk(world,positions,solutions,boss_cells,peers,units):
    """Simulate visible-only human deductions for EVERY step of EVERY grid."""
    plans=world['metadata']['generatedFogPlan']
    rules=world['metadata']['generatedFogRules']
    for g,plan in enumerate(plans):
        top,left=positions[g]
        def local(pair):
            row,col=pair
            return (row-top)*9+(col-left)
        given={}
        for loc in range(81):
            row,col=top+loc//9,left+loc%9
            cell=world['cells'][row][col]
            if cell:
                given[loc]=int(cell['value'])
        visible={local(p) for p in plan['seed']}
        entered={i:given[i] for i in visible if i in given}
        order=[local(p) for p in plan['before']+plan['after']]
        before_count=len(plan['before'])
        assert len(order)+len(given)+1==81
        local_rules=[
            (tuple(local(p) for p in rule['cells']),
             tuple(int(v) for v in rule['values']),
             {local(p) for p in rule['reveals']})
            for rule in rules if rule['chapter']==g
        ]

        def refresh():
            changed=True
            while changed:
                changed=False
                for inputs,values,reveals in local_rules:
                    if all(i in visible and i not in given and
                           entered.get(i)==digit
                           for i,digit in zip(inputs,values)):
                        discovered=reveals-visible
                        if discovered:
                            visible.update(discovered)
                            changed=True
                entered.update({i:given[i] for i in visible if i in given})

        refresh()
        for step,target in enumerate(order):
            if step==before_count:
                assert boss_cells[g] in visible, \
                    f'Chapter {g+1}: boss has not been discovered'
                entered[boss_cells[g]]=solutions[g][boss_cells[g]]
                refresh()
            assert target in visible, \
                f'Chapter {g+1}: next forced cell {target} is still fogged'
            moves=immediate_singles(entered,peers,units)
            assert moves.get(target)==solutions[g][target], (
                f'Chapter {g+1}: visible-only deduction stalls at step {step}')
            entered[target]=moves[target]
            refresh()

        assert boss_cells[g] in entered
        assert len(entered)==81, f'Chapter {g+1}: unsolved cells remain'
        assert len(visible)==81, f'Chapter {g+1}: unrevealed cells remain'
    return True

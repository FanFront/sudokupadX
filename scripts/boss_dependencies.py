"""Attach boss-dependent map gates outside classic Sudoku houses.

All authored boss rewards are independent of the map's row/column/box
constraints. Fog changes only after the player has *finished* the boss and
entered the reward digit in the corresponding map gate.
"""

def attach_boss_dependencies(world, bosses, seed, positions):
    rows = len(world['cells'])
    cols = len(world['cells'][0])
    solution = list(world['metadata']['solution'])
    assert len(positions) == len(bosses) == 4

    gate_positions = [(top + 4, left + 9) for top, left in positions[:3]]
    # The final grid reaches the map's bottom/right edges. Put its boss
    # cell immediately above it, outside *all* four 9x9 Sudoku houses.
    gate_positions.append((positions[3][0] - 1, positions[3][1] + 7))
    chapter_names = ['The Gate', 'The Archives', 'The Observatory', 'The Citadel']
    gates = []
    for i, (boss, (r, c)) in enumerate(zip(bosses, gate_positions)):
        assert 0 <= r < rows and 0 <= c < cols
        assert all(not (top <= r < top + 9 and left <= c < left + 9)
                   for top, left in positions)
        assert solution[r*cols+c] == '.'
        assert not world['cells'][r][c]

        boss_solution = boss['metadata']['solution']
        assert len(boss_solution) == 81
        reward = boss_solution[40]  # R5C5, explicitly withheld as a given
        assert boss['cells'][4][4] == {}
        assert reward in '123456789'

        boss_id = boss['id']
        gates.append({
            'bossId': boss_id,
            'seed': seed,
            'cell': [r, c],
            'reward': reward,
            'reveals': ([[rr, cc] for rr in range(positions[i+1][0], positions[i+1][0] + 9)
                         for cc in range(positions[i+1][1], positions[i+1][1] + 9)]
                        + [[*gate_positions[i+1]]]) if i < 3 else []
        })
        solution[r*cols+c] = reward
        boss['metadata']['bossLink'] = {
            'bossId': boss_id, 'parent': world['id'], 'seed': seed
        }
        boss['metadata']['rules'] = (
            'Classic 9x9 Sudoku. Complete this entire puzzle to earn your '
            'map gate code. Its digit is the value of R5C5. '
            'Return to the world map and enter it in the marked BOSS cell.'
        )
        boss['metadata']['msgcorrect'] = (
            f'{chapter_names[i]} guardian defeated! Your map gate code is '
            f'{reward} (the value of R5C5). Return to the world map, '
            'find the orange BOSS gate next to this chapter, and enter it.'
        )
        chapter_top, chapter_left = positions[i]
        world['metadata']['grids'][i]['rules'] = (
            'Standard 9x9 Sudoku: each row, column and outlined 3x3 box '
            'contains 1–9; grids overlap and share digits.\n'
            f'Chapter {i+1}: {chapter_names[i]}. '
            f'The BOSS gate is outside this grid at R{r+1}C{c+1}. '
            'It is not constrained by Sudoku rows, columns or boxes. '
            'Complete the linked boss to obtain its code (R5C5 in the '
            'boss puzzle), then enter it in the BOSS gate. '
            'A code cannot open the gate before the boss is completed.\n'
            f'Boss entrance: sudokupadx:puzzle/{boss_id}'
        )

    world['metadata']['solution'] = ''.join(solution)
    world['metadata']['bossGates'] = gates
    world['metadata']['rules'] = (
        'Four overlapping Sudoku chapters and four guardian bosses. '
        'The orange BOSS cells are OUTSIDE the Sudoku grids and have no '
        'row, column or box constraints. Solve each linked boss completely '
        'to earn its R5C5 gate code, then enter it in the corresponding '
        'orange BOSS cell to reveal the next chapter. The fourth guardian '
        'completes the world. Selecting a visible chapter opens its boss.'
    )
    # The old, directly deducible cellvalue fog triggers were the design bug.
    # New fog progression is driven by independently solved bosses in JS.
    world['triggereffect'] = []
    world['foglight'] = (
        [[r, c] for r in range(positions[0][0], positions[0][0] + 9)
         for c in range(positions[0][1], positions[0][1] + 9)]
        + [[*gate_positions[0]]]
    )
    world['underlays'] = [
        {'center': [r + 0.5, c + 0.5], 'width': 0.96, 'height': 0.96,
         'backgroundColor': '#f4ba73', 'borderColor': '#d07924',
         'borderSize': 3, 'rounded': True}
        for r, c in gate_positions
    ]
    return gates

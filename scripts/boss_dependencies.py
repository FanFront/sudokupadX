"""Attach full-boss-solution reward codes to gates outside Sudoku houses.

Rewards are derived from a cryptographic digest of all 81 solved digits,
not the digit in any designated boss cell. The game additionally requires
the boss to have been marked complete before accepting a reward code.
"""

import hashlib


REWARD_VERSION = 2


def completed_boss_reward(solution: str, boss_id: str, seed: int) -> str:
    """Deterministically turn an entire solved 9x9 grid into a one-digit reward.

    This is a *non-secret* code; its purpose is to make an individual cell
    insufficient to determine the reward, not to provide cryptographic DRM.
    The replayed SHA-256 hash also avoids accidentally returning R5C5, which
    would misleadingly suggest that the reward still came from that cell.
    """
    if (len(solution) != 81 or any(d not in '123456789' for d in solution)
            or not isinstance(seed, int) or not isinstance(boss_id, str)
            or not boss_id):
        raise ValueError('Expected a complete 81-digit boss solution, ID and seed')
    payload = f'SudokuPadX|boss-reward-v{REWARD_VERSION}|{seed}|{boss_id}|{solution}'
    for nonce in range(256):
        digest = hashlib.sha256(f'{payload}|{nonce}'.encode('ascii')).digest()
        digit = str(int.from_bytes(digest, 'big') % 9 + 1)
        if digit != solution[40]:
            return digit
    raise RuntimeError('Unable to derive a distinct boss reward')

def attach_boss_dependencies(world, bosses, seed, positions, boss_cells):
    """Make each boss reward an indispensable digit *inside* its 9x9 grid.

    The generator removes a pivotal clue from each map grid and verifies
    there are multiple Sudoku solutions even if every shared-overlap digit
    is supplied. Bosses are separately generated so their full-grid hash
    equals the withheld main-grid digit.
    """
    rows = len(world['cells'])
    cols = len(world['cells'][0])
    solution = world['metadata']['solution']
    assert len(positions) == len(boss_cells) == len(bosses) == 4

    gate_positions = []
    for (top, left), local in zip(positions, boss_cells):
        assert 0 <= local < 81
        r, c = top + local // 9, left + local % 9
        assert 0 <= r < rows and 0 <= c < cols
        # A boss cell belongs to exactly its own 9x9, NEVER an overlap.
        assert sum(t <= r < t + 9 and l <= c < l + 9
                   for t, l in positions) == 1
        gate_positions.append((r, c))

    chapter_names = ['The Gate', 'The Archives', 'The Observatory', 'The Citadel']
    gates = []
    for i, (boss, (r, c)) in enumerate(zip(bosses, gate_positions)):
        assert world['cells'][r][c] == {}, 'Boss cell must not be given'
        assert solution[r*cols+c] in '123456789'

        boss_solution = boss['metadata']['solution']
        assert len(boss_solution) == 81
        boss_id = boss['id']
        reward = completed_boss_reward(boss_solution, boss_id, seed)
        assert reward == solution[r*cols+c], 'Boss reward mismatches main Sudoku'

        gates.append({
            'bossId': boss_id,
            'seed': seed,
            'rewardVersion': REWARD_VERSION,
            'cell': [r, c],
            'reward': reward,
            'reveals': [[rr, cc] for rr in range(positions[i+1][0],
                                                positions[i+1][0] + 9)
                        for cc in range(positions[i+1][1],
                                        positions[i+1][1] + 9)]
                       if i < 3 else []
        })
        boss['metadata']['bossLink'] = {
            'bossId': boss_id, 'parent': world['id'], 'seed': seed,
            'rewardVersion': REWARD_VERSION
        }
        boss['metadata']['rules'] = (
            'Complete this 9x9 Sudoku to obtain a digit derived from all '
            '81 solved cells. That digit is an essential missing value '
            'in the orange BOSS cell of the main Sudoku. '
            'It cannot be uniquely determined from the main puzzle.'
        )
        boss['metadata']['msgcorrect'] = (
            f'{chapter_names[i]} guardian defeated! The missing Sudoku '
            f'digit is {reward}, calculated from the completed boss grid. '
            'Return to the main puzzle and fill its orange BOSS cell.'
        )
        world['metadata']['grids'][i]['rules'] = (
            'Standard Sudoku: rows, columns and 3x3 boxes each contain '
            'digits 1–9. Adjacent grids share their overlapping cells.\\n'
            f'Chapter {i+1}: {chapter_names[i]}. '
            f'The highlighted BOSS cell is R{r+1}C{c+1}, INSIDE '
            'this 9x9 Sudoku. Its value is deliberately ambiguous '
            'under the main Sudoku constraints alone, even with all '
            'overlapping cells known. Complete the linked boss '
            'puzzle to learn its essential missing digit.\\n'
            f'Boss entrance: sudokupadx:puzzle/{boss_id}'
        )

    # Keep the main Sudoku's actual cell values and solution intact.
    # In particular, the four reward cells obey normal Sudoku houses.
    world['metadata']['bossGates'] = gates
    world['metadata']['rules'] = (
        'Four overlapping Sudoku chapters with four embedded orange BOSS '
        'cells. Each BOSS cell is a regular Sudoku cell whose value cannot '
        'be uniquely deduced from the world grid—even with other chapters '
        'fully solved. Complete its linked boss for the missing digit. '
        'Entering the earned digit reveals the next chapter.'
    )
    world['triggereffect'] = []
    world['foglight'] = [
        [r, c] for r in range(positions[0][0], positions[0][0] + 9)
        for c in range(positions[0][1], positions[0][1] + 9)
    ]
    world['underlays'] = [
        {'center': [r + 0.5, c + 0.5], 'width': 0.96, 'height': 0.96,
         'backgroundColor': '#f4ba73', 'borderColor': '#d07924',
         'borderSize': 3, 'rounded': True}
        for r, c in gate_positions
    ]
    return gates

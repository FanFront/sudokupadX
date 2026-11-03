"""Regression tests for the deterministic SudokuPadX adventure generator."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import generate_adventure as gen
from boss_dependencies import completed_boss_reward


class GeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.world, cls.bosses, cls.report = gen.build(20261102)
        gen.validate(cls.world, cls.bosses, cls.report)

    def local(self, g):
        top, left = gen.POSITIONS[g]
        clues = {}
        solution = []
        for r in range(9):
            for c in range(9):
                local = r * 9 + c
                cell = self.world['cells'][top+r][left+c]
                if cell:
                    clues[local] = int(cell['value'])
                solution.append(int(self.world['metadata']['solution'][
                    (top+r)*gen.W+left+c]))
        return clues, solution

    def test_overlaps_and_valid_grids(self):
        self.assertEqual((gen.H, gen.W), (27, 27))
        self.assertEqual(self.report['overlaps'], [9, 9, 9])
        for g in range(4):
            _, answer = self.local(g)
            self.assertEqual(gen.count_solutions(dict(enumerate(answer))), 1)
            for other in range(4):
                other_answer = self.local(other)[1]
                for i, j in gen.overlap(g, other):
                    self.assertEqual(answer[i], other_answer[j])

    def test_boss_cells_are_essential_and_inside_their_sudoku(self):
        gates = self.world['metadata']['bossGates']
        self.assertEqual(self.report['grid_solutions_without_boss'], [2]*4)
        self.assertEqual(self.report['grid_solutions_with_boss'], [1]*4)
        self.assertLess(len(self.world['foglight']), 40)
        self.assertGreaterEqual(len(self.world['foglight']), 2)
        self.assertEqual(len(self.world['triggereffect']), 0)
        self.assertGreaterEqual(len(self.world['metadata']['generatedFogRules']), 100)
        self.assertEqual(len(self.world['metadata']['generatedFogPlan']), 4)
        self.assertEqual(len(self.world['underlays']), 4)
        for i, gate in enumerate(gates):
            r, c = gate['cell']
            # This is a normal Sudoku cell of exactly one grid; not a
            # special off-grid unlock token, and not an overlap shortcut.
            self.assertEqual(sum(
                top <= r < top+9 and left <= c < left+9
                for top, left in gen.POSITIONS), 1)
            top, left = gen.POSITIONS[i]
            self.assertTrue(top <= r < top+9 and left <= c < left+9)
            cell = (r-top)*9 + c-left
            self.assertNotIn(cell, gen.shared_solved_cells(
                [self.local(g)[1] for g in range(4)], i))
            self.assertEqual(self.world['cells'][r][c], {})

            clues, answer = self.local(i)
            all_overlaps = {j: answer[j] for other in range(4)
                            if other != i for j, _ in gen.overlap(i,other)}
            self.assertEqual(gen.count_solutions(clues | all_overlaps), 2,
                'Boss cell must remain ambiguous even if all other '
                'grid overlaps and givens are known')
            self.assertEqual(gen.count_solutions(
                clues | all_overlaps | {cell: answer[cell]}), 1)
            self.assertEqual(gen.count_solutions(
                clues | {cell: answer[cell]}), 1,
                'Supplying the boss digit must complete this unique Sudoku')

            boss = self.bosses[i]
            reward = completed_boss_reward(
                boss['metadata']['solution'], boss['id'], gate['seed'])
            self.assertEqual(gate['reward'], reward)
            self.assertEqual(str(answer[cell]), reward)
            self.assertEqual(self.world['metadata']['solution'][r*gen.W+c], reward)
            self.assertNotEqual(reward, boss['metadata']['solution'][40])
            self.assertEqual(gate['rewardVersion'], 3)
            self.assertEqual(boss['metadata']['bossLink']['rewardVersion'], 3)
            self.assertIn(reward, boss['metadata']['msgcorrect'])
            if i < 3:
                self.assertEqual(gate['reveals'],
                    self.world['metadata']['generatedFogPlan'][i+1]['seed'])
                self.assertLess(len(gate['reveals']), 40)
            else:
                self.assertEqual(gate['reveals'], [])
            self.assertEqual(len(
                self.world['metadata']['generatedFogPlan'][i]['milestones']), 3)
        self.assertNotIn(gates[0]['cell'], self.world['foglight'])

    def test_revealed_only_deduction_path_never_stalls(self):
        from fog_progression import validate_fog_walk
        all_solutions = [self.local(g)[1] for g in range(4)]
        boss_cells = []
        for g, gate in enumerate(self.world['metadata']['bossGates']):
            r, c = gate['cell']
            top, left = gen.POSITIONS[g]
            boss_cells.append((r-top)*9+c-left)
        self.assertTrue(validate_fog_walk(
            self.world, gen.POSITIONS, all_solutions, boss_cells,
            gen.PEERS, gen.UNITS))
        # No full-grid reveal: every chapter begins with a small pocket.
        self.assertTrue(all(2 <= n < 40 for n in self.report['fog_seed_sizes']))
        self.assertEqual(self.report['fog_starter_counts'], [3]*4)

    def test_reward_requires_complete_boss_solution_not_one_cell(self):
        boss = self.bosses[0]
        complete = boss['metadata']['solution']
        identifier = boss['id']
        code = completed_boss_reward(complete, identifier, 20261102)
        self.assertIn(code, '123456789')
        with self.assertRaises(ValueError):
            completed_boss_reward(complete[:-1], identifier, 20261102)
        with self.assertRaises(ValueError):
            completed_boss_reward(complete[:20] + '.' + complete[21:],
                                  identifier, 20261102)
        # Changing digits outside R5C5 affects the digest and eventually
        # affects the code. A direct-cell-only reward fails this test.
        alternative_codes = set()
        for i in range(0, 81, 3):
            if i == 40:
                continue
            modified = list(complete)
            modified[i] = str(int(modified[i]) % 9 + 1)
            alternative_codes.add(completed_boss_reward(
                ''.join(modified), identifier, 20261102))
        self.assertGreater(len(alternative_codes), 1)

    def test_boss_uniqueness_and_no_guess_human_solution(self):
        from human_solver import solve, has_aha_moment, SINGLES
        self.assertEqual(len(self.bosses), 4)
        self.assertEqual(self.report['boss_logic_solved'], [True]*4)
        for i, boss in enumerate(self.bosses):
            clues = {r*9+c: int(v['value'])
                     for r,row in enumerate(boss['cells'])
                     for c,v in enumerate(row) if v}
            self.assertEqual(gen.count_solutions(clues), 1)
            self.assertEqual(len(boss['metadata']['solution']), 81)
            answer = list(map(int, boss['metadata']['solution']))
            proof = solve(clues, answer)
            self.assertTrue(proof['solved'])
            self.assertTrue(has_aha_moment(proof))
            self.assertEqual(proof['values'], dict(enumerate(answer)))
            self.assertEqual(proof['trace'], self.report['boss_logic_trace'][i])
            self.assertEqual(proof['techniques'], self.report['boss_logic_methods'][i])
            profile = boss['metadata']['logicProfile']
            self.assertFalse(profile['requiresGuessing'])
            self.assertEqual(profile['techniques'], proof['techniques'])
            advanced = [step for step in proof['trace']
                        if step['method'] not in SINGLES]
            self.assertTrue(1 <= len(advanced) <= 5)
            self.assertEqual(profile['nonSingleSteps'], len(advanced))

    def test_unique_puzzle_can_still_require_guessing(self):
        from human_solver import solve, has_aha_moment
        # A notorious tough classic: unique, but beyond the deliberately
        # bounded human-technique set used for our generated bosses.
        grid = ('100007090030020008009600500005300900010080002'
                '600004000300000010040000007007000300')
        clues = {i:int(d) for i,d in enumerate(grid) if d != '0'}
        self.assertEqual(len(grid), 81)
        self.assertEqual(gen.count_solutions(clues), 1)
        deduction = solve(clues)
        self.assertFalse(deduction['solved'])
        self.assertFalse(has_aha_moment(deduction))

    def test_reproducible_and_export(self):
        other, bosses, report = gen.build(20261102)
        self.assertEqual((self.world, self.bosses, self.report), (other, bosses, report))
        self.assertEqual(report['grid_positions'], [list(position) for position in gen.POSITIONS])
        self.assertEqual(json.loads(json.dumps(report)), report)
        with tempfile.TemporaryDirectory() as dirname:
            out = Path(dirname)
            gen.export(out, other, bosses, report)
            catalog = json.loads((out/'catalog-entries.json').read_text())
            self.assertEqual(len(catalog['items']), 5)
            for item in catalog['items']:
                self.assertEqual(json.loads(
                    (out/Path(item['file']).name).read_text())['id'],item['id'])
            self.assertEqual(json.loads((out/'validation.json').read_text()),report)


if __name__ == '__main__':
    unittest.main()

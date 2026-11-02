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

    def test_inductive_global_uniqueness(self):
        for g in reversed(range(4)):
            clues, answer = self.local(g)
            if g < 3:
                downstream = {i: answer[i] for i, _ in gen.overlap(g, g+1)}
                previous = {i: answer[i] for i, _ in gen.overlap(g, g-1)} if g else {}
                self.assertEqual(gen.count_solutions(clues | previous), 2)
                self.assertEqual(gen.count_solutions(clues | downstream), 1)
            else:
                self.assertEqual(gen.count_solutions(clues), 1)

    def test_boss_codes_are_outside_sudoku_and_unlock_fog_in_order(self):
        self.assertEqual(len(self.world['foglight']), 82)
        self.assertEqual(len(self.world['triggereffect']), 0)
        self.assertEqual(len(self.world['underlays']), 4)
        gates = self.world['metadata']['bossGates']
        self.assertEqual(len(gates), 4)
        for i, gate in enumerate(gates):
            r,c = gate['cell']
            self.assertTrue(all(
                not (top <= r < top+9 and left <= c < left+9)
                for top,left in gen.POSITIONS
            ), 'Gate is accidentally deducible inside a Sudoku grid')
            self.assertEqual(self.world['cells'][r][c], {})
            boss = self.bosses[i]
            solved_grid = boss['metadata']['solution']
            reward = completed_boss_reward(solved_grid, boss['id'], gate['seed'])
            self.assertEqual(gate['reward'], reward)
            self.assertNotEqual(reward, solved_grid[40],
                                'Reward must not appear to be R5C5')
            self.assertEqual(gate['rewardVersion'], 2)
            self.assertEqual(self.world['metadata']['solution'][r*gen.W+c], reward)
            self.assertEqual(boss['metadata']['bossLink']['bossId'], boss['id'])
            self.assertEqual(boss['metadata']['bossLink']['rewardVersion'], 2)
            self.assertIn(reward, boss['metadata']['msgcorrect'])
            self.assertIn('entire', boss['metadata']['rules'])
            self.assertEqual(len(gate['reveals']), 82 if i < 3 else 0)
            if i:
                self.assertIn([r,c], gates[i-1]['reveals'])
        self.assertIn(gates[0]['cell'], self.world['foglight'])

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

    def test_boss_uniqueness_and_singles_resistance(self):
        self.assertEqual(len(self.bosses), 4)
        for boss in self.bosses:
            clues = {r*9+c: int(v['value'])
                     for r,row in enumerate(boss['cells'])
                     for c,v in enumerate(row) if v}
            self.assertEqual(gen.count_solutions(clues), 1)
            self.assertLessEqual(len(gen.singles(clues)), 55)
            self.assertEqual(len(boss['metadata']['solution']), 81)

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

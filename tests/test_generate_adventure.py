"""Regression tests for the deterministic SudokuPadX adventure generator."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import generate_adventure as gen


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
            reward = self.bosses[i]['metadata']['solution'][40]
            self.assertEqual(gate['reward'], reward)
            self.assertEqual(self.world['metadata']['solution'][r*gen.W+c], reward)
            self.assertEqual(self.bosses[i]['metadata']['bossLink']['bossId'],
                             self.bosses[i]['id'])
            self.assertEqual(self.bosses[i]['cells'][4][4], {})
            self.assertEqual(len(gate['reveals']), 82 if i < 3 else 0)
            if i:
                self.assertIn([r,c], gates[i-1]['reveals'])
        self.assertIn(gates[0]['cell'], self.world['foglight'])

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

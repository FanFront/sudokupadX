"""Regression tests for the deterministic SudokuPadX adventure generator."""
import json
import re
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

    def test_fog_and_no_guessing_beacons(self):
        self.assertEqual(len(self.world['foglight']), 81)
        self.assertEqual(len(self.world['triggereffect']), 3)
        self.assertEqual(len(self.world['underlays']), 3)
        for g, rule in enumerate(self.world['triggereffect']):
            clues, solution = self.local(g)
            cell = rule['trigger']['cell']
            self.assertEqual(cell, self.report['beacons'][g])
            match = re.fullmatch(r'r(\d+)c(\d+)', cell)
            self.assertIsNotNone(match)
            r, c = (int(match.group(i)) - 1 for i in (1, 2))
            top, left = gen.POSITIONS[g]
            local = (r-top)*9+c-left
            self.assertNotIn(local, clues)
            self.assertEqual(gen.singles(clues)[local], solution[local])
            coords = re.findall(r'r(\d+)c(\d+)', rule['effect']['cells'])
            self.assertEqual(len(coords), 81)
            target = {gen.global_index(g+1, i) for i in range(81)}
            self.assertEqual({(int(y)-1)*gen.W+int(x)-1 for y,x in coords}, target)

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

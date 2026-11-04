"""Checks the six fully generated, playable single-rule Sudoku puzzles."""
import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import generate_single_variants as generator
from variant_logic import deduce,count_solutions
from technique_catalog import replay_trace


class SingleRuleMinimalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder=ROOT/'public/puzzles/single-rule'
        cls.report=json.loads((folder/'validation.json').read_text(encoding='utf-8'))
        cls.catalog=json.loads((folder/'catalog-entries.json').read_text(encoding='utf-8'))
        cls.games=[
            json.loads((folder/(record['id']+'.json')).read_text(encoding='utf-8'))
            for record in cls.report['puzzles']
        ]

    def test_catalog_covers_six_distinct_variant_types(self):
        generator.validate(self.games,self.report)
        self.assertEqual([record['variant'] for record in self.report['puzzles']],
                         list(generator.RULES))
        self.assertEqual(len(self.catalog['items']),6)
        self.assertEqual(len({record['id'] for record in self.report['puzzles']}),6)

    def test_each_puzzle_has_a_real_unique_no_guess_solution(self):
        for game,record in zip(self.games,self.report['puzzles']):
            with self.subTest(kind=record['variant']):
                clues={r*9+c:int(cell['value'])
                       for r,row in enumerate(game['cells'])
                       for c,cell in enumerate(row) if cell}
                answer=list(map(int,game['metadata']['solution']))
                rules=record['constraints']
                self.assertEqual({clue['type'] for clue in rules},
                                 {record['variant']})
                self.assertEqual(len(clues),record['givens'])
                self.assertEqual(count_solutions(9,clues,rules),1)
                self.assertEqual(count_solutions(9,clues,[]),2)
                proof=deduce(9,clues,rules,max_tier=3)
                self.assertTrue(proof['solved'])
                self.assertEqual(proof['values'],answer)
                self.assertEqual(proof['trace'],record['logicTrace'])
                replay=replay_trace(9,clues,record['logicTrace'])
                self.assertEqual([next(iter(values)) for values in replay],answer)
                self.assertTrue(any(
                    proof['techniques'].get(name,0)>0
                    for name in generator.METHODS[record['variant']]))
                # Removing any surviving given must break the bounded
                # deduction path (local, not global minimum claim).
                for cell in clues:
                    smaller=dict(clues);del smaller[cell]
                    self.assertFalse(deduce(9,smaller,rules,trace=False,
                                            max_tier=3)['solved'],
                                     f'{game["id"]} removable clue R{cell//9+1}C{cell%9+1}')

    def test_rule_art_and_metadata_are_single_family(self):
        for game,record in zip(self.games,self.report['puzzles']):
            with self.subTest(kind=record['variant']):
                self.assertEqual(game['metadata']['variantTypes'],
                                 [record['variant']])
                self.assertFalse(game['metadata']['logicProfile']['requiresGuessing'])
                self.assertEqual(game['metadata']['logicProfile']['minimumTier'],
                                 record['minimumTier'])
                self.assertIn('标准数独',game['metadata']['rules'])
                self.assertEqual(len(game['regions']),9)
                self.assertEqual(len(game['cells']),9)


if __name__=='__main__':
    unittest.main()

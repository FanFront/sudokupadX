"""Regression: advertised advanced tiers must be mechanically necessary.

Never accept a difficulty tier from a label or from simply counting
constraints/givens. The lower-tier solver must stall on the actual board.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))

from variant_logic import deduce,count_solutions
from technique_catalog import replay_trace,technique_tier
import generate_advanced as advanced


class CertifiedAdvancedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder=ROOT/'public/puzzles/advanced'
        cls.report=json.loads((folder/'validation.json').read_text(encoding='utf-8'))
        cls.catalog=json.loads((folder/'catalog-entries.json').read_text(encoding='utf-8'))
        cls.games=[
            json.loads((folder/(entry['id']+'.json')).read_text(encoding='utf-8'))
            for entry in cls.report['puzzles']
        ]

    def test_all_four_titles_have_real_tier_three(self):
        self.assertEqual(len(self.report['puzzles']),4)
        self.assertEqual([entry['rule'] for entry in self.report['puzzles']],
                         [kind for kind,_tier in advanced.TARGETS])
        self.assertEqual(len(self.catalog['items']),4)
        self.assertEqual(len({p['id'] for p in self.games}),4)

    def test_difficulty_certificates_replay_and_necessity(self):
        for game,entry in zip(self.games,self.report['puzzles']):
            with self.subTest(id=entry['id']):
                n=9
                givens={r*n+c:int(cell['value'])
                        for r,row in enumerate(game['cells'])
                        for c,cell in enumerate(row) if cell}
                constraints=entry['rules']
                solution=list(map(int,game['metadata']['solution']))
                level=entry['minimumTier']
                self.assertEqual(level,3)
                self.assertEqual(len(givens),entry['givens'])
                self.assertEqual({rule['type'] for rule in constraints},
                                 {entry['rule']})
                self.assertFalse(deduce(n,givens,constraints,trace=False,
                                        max_tier=level-1)['solved'],
                                 'Tier 2 must NOT solve a tier-3 puzzle')
                proof=deduce(n,givens,constraints,max_tier=level)
                self.assertTrue(proof['solved'])
                self.assertEqual(proof['values'],solution)
                self.assertEqual(proof['trace'],entry['trace'])
                self.assertTrue(any(
                    technique_tier(step['method'],step['source'])==level
                    for step in proof['trace']))
                self.assertEqual([next(iter(mask)) for mask in
                                  replay_trace(n,givens,entry['trace'])],solution)
                self.assertEqual(count_solutions(n,givens,constraints),1)
                self.assertEqual(count_solutions(n,givens,[]),2)
                self.assertEqual(game['metadata']['logicProfile']['minimumTier'],level)
                self.assertFalse(game['metadata']['logicProfile']['requiresGuessing'])
                self.assertEqual(
                    set(game['metadata']['logicProfile']['certificate']['advancedMethods']),
                    set(entry['advancedMethods']))

    def test_unverified_tier_is_explicitly_rejected(self):
        game=self.games[0]
        entry=self.report['puzzles'][0]
        given={r*9+c:int(cell['value'])
               for r,row in enumerate(game['cells'])
               for c,cell in enumerate(row) if cell}
        solution=list(map(int,game['metadata']['solution']))
        self.assertIsNone(advanced.certificate(entry['rule'],2,solution,given,
                                               entry['rules']))


if __name__=='__main__':
    unittest.main()

"""Smoke-test the 9x9 batch builder with a real proof and catalog export."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import generate_batch9 as batch
from variant_logic import count_solutions, deduce


class GeneratedNineByNineTests(unittest.TestCase):
    def test_single_puzzle_keeps_real_variant_logic_and_valid_offline_format(self):
        games, report = batch.build(seed=batch.DEFAULT_SEED, count=1)
        batch.validate(games, report)
        game, entry = games[0], report['puzzles'][0]
        self.assertEqual(game['id'], 'generated-9x9-001')
        self.assertEqual(len(game['cells']), 9)
        self.assertEqual(len(game['regions']), 9)
        self.assertEqual(len(game['metadata']['solution']), 81)
        self.assertEqual(entry['minimumTier'],
                         game['metadata']['logicProfile']['education']['minimumTier'])
        self.assertTrue(entry['requiredVariants'])
        self.assertTrue(entry['structuralMotifs'])
        self.assertGreater(entry['deductionSteps'], 0)
        self.assertFalse(game['metadata']['logicProfile']['requiresGuessing'])
        self.assertIn('variant-workshop-9', game['metadata']['relatedPuzzles'])

        # The persisted puzzle is playable using its visible givens and
        # the constraints used to author it, not a memorized answer.
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            batch.export(output, games, report)
            catalog = json.loads((output / 'catalog-entries.json').read_text())
            self.assertEqual(len(catalog['items']), 1)
            self.assertEqual(catalog['items'][0]['kind'], 'standalone')
            self.assertEqual(catalog['items'][0]['tier'], entry['minimumTier'])
            self.assertTrue((output / 'generated-9x9-001.json').exists())
            self.assertEqual(json.loads((output / 'validation.json').read_text())['count'], 1)


if __name__ == '__main__':
    unittest.main()

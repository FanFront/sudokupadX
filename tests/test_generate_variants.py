"""Regression tests for mixed-constraint generated Sudoku chapters."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_variants as variants
from variant_logic import BOXES, count_solutions, deduce, houses


class VariantGeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.puzzles, cls.report = variants.build(20261103)
        variants.validate(cls.puzzles, cls.report)

    def test_all_three_sizes_and_multiple_shared_constraints(self):
        self.assertEqual([len(p["cells"]) for p in self.puzzles], [4, 6, 9])
        self.assertEqual(len({p["id"] for p in self.puzzles}), 3)
        kinds = []
        for game, detail in zip(self.puzzles, self.report["puzzles"]):
            kinds.append({clue["type"] for clue in detail["constraints"]})
            # A shared rule motif, not just three unrelated uses of a rule.
            cages = [c for c in detail["constraints"] if c["type"] == "killer"]
            thermos = [c for c in detail["constraints"] if c["type"] == "thermo"]
            dots = [c for c in detail["constraints"] if c["type"] == "kropki"]
            self.assertTrue(any(c["sum"] == 5 and len(c["cells"]) == 2
                                for c in cages))
            self.assertTrue(any(len(c["cells"]) == 3 for c in thermos))
            self.assertTrue(any(c["kind"] == "white" for c in dots))
            self.assertFalse(game["metadata"]["logicProfile"]["requiresGuessing"])
            self.assertEqual(game["metadata"]["variantFamily"], "variant-workshop")
            self.assertEqual(len(game["metadata"]["relatedPuzzles"]), 2)
            for linked in game["metadata"]["relatedPuzzles"]:
                self.assertIn("sudokupadx:puzzle/" + linked,
                              game["metadata"]["rules"])
        self.assertEqual(kinds, [set(("killer", "thermo", "kropki"))]*3)

    def test_each_unique_and_fully_deducible_without_guessing(self):
        for game, detail in zip(self.puzzles, self.report["puzzles"]):
            n = detail["size"]
            givens = {r*n+c: int(cell["value"])
                      for r, row in enumerate(game["cells"])
                      for c, cell in enumerate(row) if cell}
            constraints = detail["constraints"]
            answer = list(map(int, game["metadata"]["solution"]))
            proof = deduce(n, givens, constraints)
            self.assertTrue(proof["solved"])
            self.assertEqual(proof["values"], answer)
            self.assertEqual(proof["trace"], detail["trace"])
            self.assertEqual(proof["techniques"], detail["techniques"])
            self.assertEqual(count_solutions(n, givens, constraints), 1)
            # A purely classic Sudoku path must not make the variant decoration redundant.
            self.assertFalse(deduce(n, givens, [])["solved"])
            self.assertGreaterEqual(len(detail["used"]), 2)
            self.assertGreaterEqual(len(detail["necessary"]), 1)

    def test_relation_semantics(self):
        # Valid completed classic 4x4 Sudoku.
        solution = [1, 2, 3, 4,
                    3, 4, 1, 2,
                    2, 1, 4, 3,
                    4, 3, 2, 1]
        known = dict(enumerate(solution))
        self.assertEqual(count_solutions(4, known, []), 1)
        self.assertEqual(count_solutions(4, {}, [], limit=2), 2)
        self.assertEqual(deduce(4, {}, [{"type": "killer",
                         "cells": [0, 1], "sum": 3}])["domains"][0], {1, 2})
        self.assertEqual(deduce(4, {}, [{"type": "thermo",
                         "cells": [0, 1, 2]}])["domains"][0], {1, 2})
        self.assertEqual(deduce(4, {}, [{"type": "kropki",
                         "kind": "black", "cells": [0, 1]}])["domains"][0],
                         {1, 2, 4})
        self.assertEqual(count_solutions(4, {0: 1, 1: 1}, []), 0)
        with self.assertRaises(ValueError):
            deduce(4, {}, [{"type": "thermo", "cells": [0, 15]}])
        for n in (4, 6, 9):
            self.assertEqual(len(houses(n)), 3*n)
            self.assertEqual(len(houses(n)[0]), n)
            self.assertEqual(len(BOXES), 3)

    def test_export_catalog_and_determinism(self):
        other, report = variants.build(20261103)
        self.assertEqual(self.puzzles, other)
        self.assertEqual(self.report, report)
        with tempfile.TemporaryDirectory() as dirname:
            out = Path(dirname)
            variants.export(out, self.puzzles, self.report)
            catalog = json.loads((out / "catalog-entries.json").read_text())
            self.assertEqual(len(catalog["items"]), 3)
            for item in catalog["items"]:
                self.assertEqual(item["kind"], "standalone")
                self.assertEqual(json.loads((out / (item["id"]+".json")).read_text())["id"],
                                 item["id"])
            self.assertEqual(json.loads((out / "validation.json").read_text()), report)


if __name__ == "__main__":
    unittest.main()

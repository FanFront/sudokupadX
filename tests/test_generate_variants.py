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
        base = {"killer", "thermo", "kropki", "renban", "arrow", "xv",
                "region_sum"}
        additional = {"entropic", "modular", "between"}
        self.assertEqual(kinds,
                         [base, base | additional,
                          base | additional | {"whisper"}])
        for detail in self.report["puzzles"][1:]:
            self.assertGreaterEqual(len(detail["structural"]), 2)
            self.assertGreater(detail["techniques"].get("killer_outie", 0), 0)
            self.assertGreater(detail["techniques"].get(
                "region_sum_killer_bridge", 0), 0)
            self.assertGreater(detail["techniques"].get(
                "entropic_modular_cross", 0), 0)
            self.assertIn("modular", detail["used"])
            self.assertIn("entropic", detail["used"])
            self.assertTrue(any(moment["method"] == "entropic_modular_cross"
                                for moment in detail["aha"]))
            self.assertGreater(detail["techniques"].get(
                "between_renban", 0), 0)
        self.assertGreater(self.report["puzzles"][2]["techniques"].get(
            "kropki_partition", 0), 0)

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
            self.assertEqual(game["metadata"]["logicProfile"][
                "structuralMotifs"], detail["structural"])
            self.assertEqual(game["metadata"]["logicProfile"][
                "ahaMoments"], detail["aha"])
            self.assertTrue(all("remaining" in step
                                for step in detail["trace"]))

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
        self.assertEqual(deduce(4, {0: 1}, [{"type": "renban",
                         "cells": [0, 1, 2]}])["domains"][1], {2, 3})
        self.assertEqual(deduce(4, {0: 3}, [{"type": "arrow",
                         "cells": [0, 1, 2]}])["domains"][1], {1, 2})
        self.assertEqual(deduce(4, {0: 1}, [{"type": "xv",
                         "sum": 5, "cells": [0, 1]}])["domains"][1], {4})
        with self.assertRaises(ValueError):
            deduce(9, {0: 5}, [{"type": "whisper", "cells": [0, 1]}])
        whisper = deduce(9, {0: 1},
                        [{"type": "whisper", "cells": [0, 1, 2, 3]}])
        self.assertTrue(whisper["domains"][1])
        self.assertTrue(whisper["domains"][1].issubset({6, 7, 8, 9}))
        self.assertGreater(whisper["techniques"].get("whisper", 0), 0)
        self.assertTrue(whisper["domains"][2].issubset({2, 3, 4}))
        self.assertEqual(count_solutions(4, {0: 1, 1: 1}, []), 0)
        with self.assertRaises(ValueError):
            deduce(4, {}, [{"type": "thermo", "cells": [0, 15]}])
        for n in (4, 6, 9):
            self.assertEqual(len(houses(n)), 3*n)
            self.assertEqual(len(houses(n)[0]), n)
            self.assertEqual(len(BOXES), 3)

    def test_three_white_chains_partition_a_house(self):
        dots = [{"type": "kropki", "kind": "white", "cells": [a, a+1]}
                for a in (0, 1, 3, 4, 6, 7)]
        result = deduce(9, {0: 4}, dots)
        self.assertEqual([result["domains"][i] for i in range(3)],
                         [{4}, {5}, {6}])
        self.assertGreater(result["techniques"].get("kropki_partition", 0), 0)
        self.assertTrue(any(step["method"] == "kropki_partition"
                            for step in result["trace"]))

    def test_house_sum_innie_and_outie_are_real_deductions(self):
        # Box r1-2,c1-2 contains four cells, sum 10. The crossing
        # cage has one cell outside; total 3+8=11 reveals outie r2c3=1.
        rules = [
            {"type": "killer", "cells": [0, 1], "sum": 3},
            {"type": "killer", "cells": [4, 5, 6], "sum": 8},
        ]
        proof = deduce(4, {}, rules)
        self.assertEqual(proof["domains"][6], {1})
        self.assertGreater(proof["techniques"].get("killer_outie", 0), 0)
        # One 2-cell cage inside box implies the complementary two
        # cells sum to 7, even without an explicit cage there.
        inside = deduce(4, {}, [rules[0]])
        self.assertGreater(inside["techniques"].get("killer_innie", 0), 0)

    def test_renban_cage_and_mixed_partitions(self):
        renban = {"type": "renban", "cells": [0, 1, 2]}
        killer = {"type": "killer", "cells": [0, 1, 2], "sum": 15}
        proof = deduce(6, {}, [renban, killer])
        self.assertTrue(all(proof["domains"][cell] == {4, 5, 6}
                            for cell in (0, 1, 2)))
        self.assertGreater(proof["techniques"].get("renban_sum_lock", 0), 0)
        constraints = [
            {"type": "kropki", "kind": "white", "cells": [0, 1]},
            {"type": "kropki", "kind": "white", "cells": [1, 2]},
            {"type": "renban", "cells": [3, 4, 5]},
        ]
        partition = deduce(6, {}, constraints)
        self.assertEqual(partition["domains"][1], {2, 5})
        self.assertGreater(partition["techniques"].get(
            "mixed_consecutive_partition", 0), 0)

    def test_region_sum_transfer_from_killer(self):
        # R1C2,C3 and R1C4,C5 each contribute the same total.
        constraints = [
            {"type": "killer", "cells": [1, 2], "sum": 5},
            {"type": "region_sum", "cells": [1, 2, 3, 4]},
        ]
        proof = deduce(6, {}, constraints)
        self.assertTrue(proof["domains"][3].issubset({1, 2, 3, 4}))
        self.assertGreater(proof["techniques"].get(
            "region_sum_killer_bridge", 0), 0)
        self.assertEqual(count_solutions(6, {}, constraints, limit=1), 1)

    def test_modular_entropic_and_crossing(self):
        entropy = {"type": "entropic", "cells": [9, 10, 11, 12]}
        modulo = {"type": "modular", "cells": [1, 10, 19, 28]}
        proof = deduce(9, {9: 2, 11: 8, 1: 3, 19: 5},
                       [entropy, modulo])
        self.assertEqual(proof["domains"][10], {4})
        incomplete = deduce(9, {9: 2, 1: 3},
                            [entropy, modulo])
        self.assertGreater(len(incomplete["domains"][10]), 1,
                           "One anchor per line must not falsely fix the digit")
        self.assertGreater(proof["techniques"].get(
            "entropic_modular_cross", 0), 0)
        self.assertTrue(proof["domains"][11].issubset({7, 8, 9}))
        with self.assertRaises(ValueError):
            deduce(4, {}, [entropy])

    def test_between_and_renban_interaction(self):
        constraints = [
            {"type": "between", "cells": [0, 1, 2, 3, 4]},
            {"type": "renban", "cells": [1, 2, 3]},
        ]
        proof = deduce(9, {0: 1}, constraints)
        self.assertGreater(proof["techniques"].get("between_renban", 0), 0)
        self.assertNotIn(1, proof["domains"][2])
        self.assertNotIn(9, proof["domains"][2])

    def test_sudopedia_hidden_pair_and_x_wing(self):
        # Only two cells in the first row can hold 1 or 2.
        domains = [set(range(1, 10)) for _ in range(81)]
        for cell in range(2, 9):
            domains[cell].difference_update((1, 2))
        hidden = deduce(9, {}, [], domains=domains)
        self.assertEqual(hidden["domains"][0], {1, 2})
        self.assertEqual(hidden["domains"][1], {1, 2})
        self.assertGreater(hidden["techniques"].get("hidden_subset", 0), 0)
        # Rows 2 and 5 can place 9 only in columns 2 and 6,
        # therefore the other rows cannot put 9 in these columns.
        domains = [set(range(1, 10)) for _ in range(81)]
        for row in (1, 4):
            for col in range(9):
                if col not in (1, 5):
                    domains[row*9+col].discard(9)
        fish = deduce(9, {}, [], domains=domains)
        self.assertNotIn(9, fish["domains"][0*9+1])
        self.assertNotIn(9, fish["domains"][8*9+5])
        self.assertGreater(fish["techniques"].get("x_wing", 0), 0)

    def test_other_seeds_preserve_actual_motifs(self):
        for seed in (20261104, 20261105):
            with self.subTest(seed=seed):
                puzzles, report = variants.build(seed, attempts=80)
                variants.validate(puzzles, report)
                self.assertGreater(report["puzzles"][1]["techniques"].get(
                    "mixed_consecutive_partition", 0), 0)
                self.assertGreater(report["puzzles"][2]["techniques"].get(
                    "killer_outie", 0), 0)
                self.assertGreater(report["puzzles"][2]["techniques"].get(
                    "renban_sum_lock", 0), 0)
                for size in (1, 2):
                    for method in ("region_sum_killer_bridge",
                                   "entropic_modular_cross",
                                   "between_renban"):
                        self.assertGreater(report["puzzles"][size][
                            "techniques"].get(method, 0), 0)

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

"""Regression proofs for Sudopedia methods and Chinese learning metadata."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generate_variants as variants
from variant_logic import deduce
from technique_catalog import METHODS, GUIDE_URL, lesson_profile, minimum_tier


def blank():
    return [set(range(1, 10)) for _ in range(81)]


class ClassicCurriculumTests(unittest.TestCase):
    def test_naked_and_hidden_quad(self):
        masks = blank()
        masks[0], masks[1], masks[2], masks[3] = (
            {1, 3}, {3, 5}, {5, 8}, {1, 8})
        masks[4] = {1, 2, 3, 5, 8}
        solved = deduce(9, {}, [], domains=masks)
        self.assertEqual(solved["domains"][4], {2})
        self.assertTrue(any(s["method"] == "naked_subset"
                            and s["source"].get("size") == 4
                            for s in solved["trace"]))

        masks = blank()
        for cell in range(4, 9):
            masks[cell].difference_update((1, 3, 5, 8))
        hidden = deduce(9, {}, [], domains=masks)
        self.assertTrue(any(s["method"] == "hidden_subset"
                            and s["source"].get("size") == 4
                            for s in hidden["trace"]))

    def test_swordfish_and_jellyfish(self):
        masks = blank()
        for row, columns in ((0, (1, 4)), (3, (1, 8)), (7, (4, 8))):
            for col in range(9):
                if col not in columns:
                    masks[row*9+col].discard(6)
        result = deduce(9, {}, [], domains=masks)
        self.assertNotIn(6, result["domains"][2*9+1])
        self.assertNotIn(6, result["domains"][8*9+8])
        self.assertGreater(result["techniques"].get("swordfish", 0), 0)

        masks = blank()
        for row, columns in ((0, (0, 3)), (2, (3, 6)),
                             (5, (6, 8)), (7, (0, 8))):
            for col in range(9):
                if col not in columns:
                    masks[row*9+col].discard(2)
        result = deduce(9, {}, [], domains=masks)
        self.assertNotIn(2, result["domains"][1*9+0])
        self.assertNotIn(2, result["domains"][8*9+8])
        self.assertGreater(result["techniques"].get("jellyfish", 0), 0)

    def test_xy_and_xyz_wings(self):
        masks = blank()
        masks[10], masks[16], masks[55] = {1, 2}, {1, 5}, {2, 5}
        masks[61] = {3, 5, 8}
        result = deduce(9, {}, [], domains=masks)
        self.assertNotIn(5, result["domains"][61])
        self.assertGreater(result["techniques"].get("xy_wing", 0), 0)

        masks = blank()
        # Wing 2 sits outside the pivot's box so a simpler naked
        # triple cannot make the same deduction first.
        masks[10], masks[11], masks[28] = {1, 2, 5}, {1, 5}, {2, 5}
        masks[19] = {3, 5, 7}
        result = deduce(9, {}, [], domains=masks)
        self.assertNotIn(5, result["domains"][19])
        self.assertGreater(result["techniques"].get("xyz_wing", 0), 0)

    def test_skyscraper(self):
        masks = blank()
        for row, columns in ((1, (1, 6)), (5, (1, 7))):
            for col in range(9):
                if col not in columns:
                    masks[row*9+col].discard(7)
        result = deduce(9, {}, [], domains=masks)
        self.assertNotIn(7, result["domains"][4*9+6])
        self.assertGreater(result["techniques"].get("skyscraper", 0), 0)

    def test_tier_restrictions_do_not_fake_deductions(self):
        masks = blank()
        for row in (1, 4):
            for col in range(9):
                if col not in (1, 5):
                    masks[row*9+col].discard(9)
        basic = deduce(9, {}, [], domains=masks, max_tier=2)
        advanced = deduce(9, {}, [], domains=masks, max_tier=3)
        self.assertIn(9, basic["domains"][1])
        self.assertNotIn(9, advanced["domains"][1])
        self.assertGreater(advanced["techniques"].get("x_wing", 0), 0)
        with self.assertRaises(ValueError):
            deduce(9, {}, [], max_tier=5)

    def test_chinese_learning_path_and_real_method_filter(self):
        self.assertIn("xy_wing", METHODS)
        self.assertIn("swordfish", METHODS)
        self.assertIn("jellyfish", METHODS)
        self.assertIn("xyz_wing", METHODS)
        self.assertIn("skyscraper", METHODS)
        for method, (name, tier) in METHODS.items():
            self.assertTrue(name, method)
            self.assertIn(tier, (1, 2, 3, 4), method)
        proof = {"trace": [
            {"method": "xy_wing", "cell": 61, "removed": [5],
             "remaining": [3, 8], "source": {"pivot": 10}},
            {"method": "xy_wing", "cell": 62, "removed": [5],
             "remaining": [7, 9], "source": {"pivot": 10}},
        ]}
        route = lesson_profile(9, proof)
        self.assertEqual(route["guideUrl"], GUIDE_URL)
        self.assertEqual(route["techniquePath"][0]["cell"], "R7C8")
        self.assertEqual(route["techniquePath"][0]["nameZh"], "XY-Wing 三格翼")
        self.assertEqual(len(route["techniquePath"]), 1)
        self.assertEqual(route["maxUsedTier"], 3)
        with self.assertRaises(ValueError):
            lesson_profile(9, {"trace": [
                {"method": "unimplemented", "cell": 1, "removed": [5],
                 "remaining": [2], "source": {}}]})
        with self.assertRaises(ValueError):
            variants.build(20261103, focus_method="invented_method")

    def test_generator_has_a_complete_chinese_curriculum(self):
        puzzles, report = variants.build(20261103)
        for game, detail in zip(puzzles, report["puzzles"]):
            education = game["metadata"]["logicProfile"]["education"]
            self.assertEqual(education, detail["education"])
            self.assertEqual(education["guideUrl"], GUIDE_URL)
            self.assertGreater(len(education["techniquePath"]), 0)
            self.assertIn(education["minimumTier"], (1, 2, 3, 4))
            self.assertIn("中文解题技巧教程", game["metadata"]["rules"])
            self.assertTrue(all(step["nameZh"] in [v[0] for v in METHODS.values()]
                                for step in education["techniquePath"]))
        self.assertEqual(len(puzzles), 3)


if __name__ == "__main__":
    unittest.main()

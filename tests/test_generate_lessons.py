"""Proof-backed lesson safety regressions.

The original lesson 2 represented eight cells with {1,2,8} and one cell
with {3,6,9}. Such a row cannot contain 1..9 and must never be published.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_lessons import (LESSON_METHODS, anchor_examples,
                              collect_report_examples, make_fixture)
from variant_logic import houses


class VerifiedLessonsTests(unittest.TestCase):
    def test_every_exported_technique_matches_real_trace(self):
        all_examples = collect_report_examples()
        all_examples.update(anchor_examples())
        self.assertEqual(set(LESSON_METHODS), set(range(1, 26)))
        self.assertIn(1, all_examples)
        self.assertIn(2, all_examples)
        for number, fixture in all_examples.items():
            self.assertEqual(fixture["method"], LESSON_METHODS[number])
            self.assertEqual(fixture["proof"]["method"], fixture["method"])
            self.assertIn(fixture["goal"]["index"], fixture["focus"])
            self.assertTrue(fixture["proof"]["removed"])
            n = fixture["n"]
            solution = list(map(int, fixture["puzzle"]["metadata"]["solution"]))
            self.assertEqual(len(solution), n*n)
            masks = [set(values) for values in fixture["masks"]]
            for i in range(n*n):
                self.assertIn(solution[i], masks[i])
            for unit in houses(n):
                self.assertEqual(set().union(*(masks[i] for i in unit)),
                                 set(range(1, n+1)))
                self.assertEqual({solution[i] for i in unit},
                                 set(range(1, n+1)))

    def test_second_lesson_hidden_single_and_full_row_coverage(self):
        lesson = anchor_examples()[2]
        n = lesson["n"]
        target = 4*n+6
        self.assertEqual(lesson["goal"],
                         {"index": target, "digit": "6", "kind": "fill"})
        self.assertEqual(lesson["masks"][target], [6,7])
        row = [4*n+c for c in range(9)]
        self.assertEqual([i for i in row
                          if 6 in lesson["masks"][i]], [target])
        self.assertEqual(set().union(*(set(lesson["masks"][i]) for i in row)),
                         set(range(1,10)))

    def test_impossible_eight_cell_128_row_cannot_be_exported(self):
        lesson = anchor_examples()[2]
        n = 9
        target = 4*n+6
        fake = [set(values) for values in lesson["masks"]]
        for i in range(4*n,5*n):
            fake[i] = {3,6,9} if i == target else {1,2,8}
        self.assertNotEqual(set().union(*(fake[i] for i in range(4*n,5*n))),
                            set(range(1,10)))
        with self.assertRaises(ValueError):
            make_fixture(2, lesson["puzzle"], fake, {
                "method": "hidden_single", "cell": target,
                "source": 4, "removed": [3,9], "remaining": [6]})

    def test_synthetic_unproven_guess_is_rejected(self):
        lesson = anchor_examples()[2]
        fake = [set(values) for values in lesson["masks"]]
        # The completed solution puts 6 at the target, so restricting the
        # target to {3,9} cannot describe a legitimate intermediate state.
        fake[lesson["goal"]["index"]] = {3,9}
        with self.assertRaises(ValueError):
            make_fixture(2, lesson["puzzle"], fake, {
                "method": "hidden_single", "cell": lesson["goal"]["index"],
                "source": 4, "removed": [3], "remaining": [9]})


if __name__ == "__main__":
    unittest.main()

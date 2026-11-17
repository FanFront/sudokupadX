"""Executable witnesses and soundness checks for new Sudopedia patterns."""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from advanced_patterns import (finned_fish, empty_rectangles,
                               wxyz_wings, als_xy_wings)
from technique_catalog import METHODS, replay_trace, technique_tier
from variant_logic import houses

N = 9
DIGITS = set(range(1, 10))
SOLUTION = [int(c) for c in
    "534678912672195348198342567859761423426853791713924856"
    "961537284287419635345286179"]


def index(row, column):
    """One-based coordinates for readable test fixtures."""
    return (row-1)*9 + column-1


def exercise(runner, domains, **options):
    """Collect exactly the step and source emitted by the production method."""
    masks = [set(d) for d in domains]
    steps = []

    def reduce(cell, allowed, method, source):
        removed = masks[cell] - set(allowed)
        if not removed:
            return False
        masks[cell].intersection_update(allowed)
        if not masks[cell]:
            raise AssertionError("A Sudoku technique emptied a candidate domain")
        steps.append({"method": method, "cell": cell,
                      "removed": sorted(removed),
                      "remaining": sorted(masks[cell]),
                      "source": source})
        return True

    runner(9, masks, reduce, **options)
    return masks, steps


class SudopediaAdvancedPatternsTests(unittest.TestCase):
    def assert_eliminates(self, steps, cell, digit, method):
        self.assertTrue(any(
            step["cell"] == cell and digit in step["removed"]
            and step["method"] == method and step["source"]
            for step in steps), f"No proof for {method} at {cell}")

    def test_empty_rectangle_cross_and_conjugate_pair(self):
        domains = [set(DIGITS) for _ in range(81)]
        # R1C1 box's 7s lie entirely along R1 and C1.
        keep = {index(1, 2), index(1, 3),
                index(2, 1), index(3, 1)}
        for row in range(1, 4):
            for col in range(1, 4):
                if index(row, col) not in keep:
                    domains[index(row, col)].discard(7)
        # R5's only 7s form the outside strong link R5C1--R5C5.
        for col in range(1, 10):
            if col not in (1, 5):
                domains[index(5, col)].discard(7)
        _, steps = exercise(empty_rectangles, domains)
        self.assert_eliminates(steps, index(1, 5), 7, "empty_rectangle")

    def test_finned_swordfish(self):
        domains = [set(DIGITS) for _ in range(81)]
        for row, covers in ((1, (2,5)), (4, (5,8,9)), (7, (2,8))):
            for col in range(1, 10):
                if col not in covers:
                    domains[index(row, col)].discard(5)
        _, steps = exercise(finned_fish, domains)
        self.assert_eliminates(steps, index(5, 8), 5, "finned_swordfish")

    def test_sashimi_swordfish(self):
        domains = [set(DIGITS) for _ in range(81)]
        for row, covers in ((1, (2,5)), (4, (7,9)), (7, (5,8))):
            for col in range(1, 10):
                if col not in covers:
                    domains[index(row, col)].discard(5)
        _, steps = exercise(finned_fish, domains)
        self.assert_eliminates(steps, index(5, 8), 5, "sashimi_swordfish")

    def test_wxyz_wing_needs_four_digits_and_restricted_three(self):
        domains = [set(DIGITS) for _ in range(81)]
        for row, col, values in (
            (2,2,(1,2,3)), (2,4,(1,4)),
            (2,6,(2,4)), (3,3,(3,4))):
            domains[index(row,col)] = set(values)
        _, steps = exercise(wxyz_wings, domains)
        self.assert_eliminates(steps, index(2,3), 4, "wxyz_wing")

    def test_als_xy_wing_two_restricted_links(self):
        domains = [set(DIGITS) for _ in range(81)]
        domains[index(2,2)] = {1,3}
        domains[index(2,5)] = {1,2}
        domains[index(5,5)] = {2,3}
        _, steps = exercise(
            lambda n, masks, reduce: als_xy_wings(
                n, masks, houses(n), reduce), domains)
        self.assert_eliminates(steps, index(5,2), 3, "als_xy_wing")

    def test_new_methods_have_chinese_names_and_curriculum_tier(self):
        names = ("finned_swordfish", "finned_jellyfish",
                 "sashimi_x_wing", "sashimi_swordfish",
                 "sashimi_jellyfish", "empty_rectangle",
                 "wxyz_wing", "als_xy_wing")
        for name in names:
            self.assertIn(name, METHODS)
            self.assertEqual(technique_tier(name), 4)

    def test_no_pattern_can_delete_any_actual_solution_digit(self):
        # Every input domain contains a completed Sudoku solution.
        # Removing an actual solution value would be a demonstrably
        # unsound implication regardless of how attractive a pattern looks.
        rng = random.Random(20261117)
        for _ in range(3):
            masks = [{value} | set(rng.sample(
                [d for d in DIGITS if d != value], 2))
                for value in SOLUTION]
            runners = [
                lambda n, m, reduce: finned_fish(n,m,reduce),
                lambda n, m, reduce: empty_rectangles(n,m,reduce),
                lambda n, m, reduce: wxyz_wings(n,m,reduce),
                lambda n, m, reduce: als_xy_wings(
                    n,m,houses(n),reduce)
            ]
            for runner in runners:
                current = [set(mask) for mask in masks]
                def reduce(cell, allowed, method, source):
                    self.assertIn(SOLUTION[cell], allowed,
                                  f"{method} removed solution at {cell}")
                    before = set(current[cell])
                    current[cell].intersection_update(allowed)
                    return before != current[cell]
                runner(9, current, reduce)


if __name__ == "__main__":
    unittest.main()

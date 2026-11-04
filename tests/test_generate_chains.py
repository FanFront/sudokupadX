"""Sudopedia chain patterns: local proofs, no-guess traces and solution safety."""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chain_techniques import (two_string_kites, w_wings, simple_colors,
                              remote_pairs, xy_chains, x_chains)
from als_techniques import als_xz
from classic_techniques import basic_fish, finned_x_wings
from variant_logic import houses, deduce
from generate_variants import make_solution
from technique_catalog import METHODS, lesson_profile


def blank():
    return [set(range(1, 10)) for _ in range(81)]


def restrict(masks, digit, cells):
    """Keep one candidate only in listed cells within the stated house."""
    for cell in cells:
        masks[cell].discard(digit)


def run_method(method, masks):
    steps = []
    def reduce(cell, allowed, name, source):
        removed = masks[cell] - set(allowed)
        if not removed:
            return False
        masks[cell].difference_update(removed)
        if not masks[cell]:
            raise AssertionError("Technique removed every possible digit")
        steps.append((name, cell, sorted(removed), source))
        return True
    if method in (two_string_kites, w_wings, simple_colors, x_chains,
                  als_xz):
        method(9, masks, houses(9), reduce)
    else:
        method(9, masks, reduce)
    return steps


class SudopediaChainTests(unittest.TestCase):
    def test_two_string_kite(self):
        masks = blank()
        for col in range(9):
            if col not in (1, 7):
                masks[9+col].discard(4)  # Row 2: C2,C8.
        for row in range(9):
            if row not in (2, 7):
                masks[row*9+2].discard(4)  # Column 3: R3,R8.
        steps = run_method(two_string_kites, masks)
        self.assertNotIn(4, masks[7*9+7])  # R8C8 sees both outer tips.
        self.assertTrue(any(s[0] == "two_string_kite" and s[1] == 70
                            for s in steps))

    def test_w_wing(self):
        masks = blank()
        masks[10] = {1, 5}
        masks[61] = {1, 5}
        masks[55] = {2, 5, 8}
        for row in range(9):
            if row not in (1, 6):
                masks[row*9+4].discard(1)  # Column 5: R2C5,R7C5.
        steps = run_method(w_wings, masks)
        self.assertNotIn(5, masks[55])
        self.assertTrue(any(s[0] == "w_wing" and s[1] == 55 for s in steps))

    def test_remote_pairs(self):
        masks = blank()
        for cell in (10, 13, 49, 52):
            masks[cell] = {1, 5}
        masks[16] = {1, 5, 8}
        steps = run_method(remote_pairs, masks)
        self.assertEqual(masks[16], {8})
        self.assertTrue(any(s[0] == "remote_pairs" and s[1] == 16
                            for s in steps))

    def test_color_trap(self):
        masks = blank()
        # 7: R2C2--R2C5 (row), R2C5--R5C5 (column),
        # R5C5--R6C6 (middle box). R6C2 sees opposite colors.
        for col in range(9):
            if col not in (1, 4):
                masks[9+col].discard(7)
        for row in range(9):
            if row not in (1, 4):
                masks[row*9+4].discard(7)
        for row in range(3, 6):
            for col in range(3, 6):
                if row*9+col not in (40, 50):
                    masks[row*9+col].discard(7)
        steps = run_method(simple_colors, masks)
        self.assertNotIn(7, masks[46])  # R6C2
        self.assertTrue(any(s[0] == "color_trap" and s[1] == 46
                            for s in steps))

    def test_color_wrap(self):
        masks = blank()
        for col in range(9):
            if col not in (1, 2):
                masks[9+col].discard(7)
            if col not in (2, 7):
                masks[18+col].discard(7)
        for row in range(9):
            if row not in (1, 2):
                masks[row*9+2].discard(7)
        steps = run_method(simple_colors, masks)
        self.assertNotIn(7, masks[10])
        self.assertNotIn(7, masks[20])
        self.assertTrue(any(s[0] == "color_wrap" for s in steps))

    def test_xy_chain(self):
        masks = blank()
        for cell, values in ((10, {1, 2}), (13, {2, 3}),
                             (49, {3, 4}), (52, {1, 4})):
            masks[cell] = values
        masks[16] = {1, 6, 8}
        steps = run_method(xy_chains, masks)
        self.assertNotIn(1, masks[16])
        self.assertTrue(any(s[0] == "xy_chain" and s[1] == 16
                            and len(s[3]["chain"]) >= 4 for s in steps))

    def test_x_chain(self):
        masks = blank()
        # Strong: R2C2--R3C3 within top-left box;
        # R3C5--R8C5 within column 5;
        # R8C8--R9C9 within lower-right box.
        # Weak: R3C3--R3C5 and R8C5--R8C8.
        p0, p1, p2, p3, p4, p5 = 10, 20, 22, 67, 70, 80
        for row in range(3):
            for col in range(3):
                cell = row*9+col
                if cell not in (p0, p1):
                    masks[cell].discard(7)
        for row in range(9):
            cell = row*9+4
            if cell not in (p2, p3):
                masks[cell].discard(7)
        for row in range(6, 9):
            for col in range(6, 9):
                cell = row*9+col
                if cell not in (p4, p5):
                    masks[cell].discard(7)
        steps = run_method(x_chains, masks)
        self.assertNotIn(7, masks[17])  # R2C9 sees both endpoints.
        self.assertTrue(any(s[0] == "x_chain" and s[1] == 17
                            and len(s[3]["chain"]) == 6 for s in steps))

    def test_als_xz(self):
        masks = blank()
        # A = R2C2 {1,3} + R2C3 {3,5}: ALS 2 cells / 3 digits.
        # B = R4C2 {1,5}: ALS 1 cell / 2 digits.
        # Restricted X=1 occurs in the same column; target R4C3
        # sees every possible 5 from A and B.
        masks[10], masks[11], masks[28] = {1, 3}, {3, 5}, {1, 5}
        masks[29] = {4, 5, 7}
        steps = run_method(als_xz, masks)
        self.assertNotIn(5, masks[29])
        self.assertTrue(any(s[0] == "als_xz" and s[1] == 29 for s in steps))

    def test_finned_x_wing(self):
        masks = blank()
        # Row 1: 6 only in C4/C8.
        # Row 5: 6 in C4/C5(fin)/C8.
        # R4C4 belongs to the fin box and cover column C4.
        for col in range(9):
            if col not in (3, 7):
                masks[col].discard(6)
            if col not in (3, 4, 7):
                masks[4*9+col].discard(6)
        steps = run_method(finned_x_wings, masks)
        self.assertNotIn(6, masks[30])  # R4C4
        self.assertTrue(any(s[0] == "finned_x_wing" and s[1] == 30
                            for s in steps))

    def test_five_line_squirmbag(self):
        masks = blank()
        for row, cols in ((0, (0, 2)), (2, (2, 4)), (4, (4, 6)),
                          (6, (6, 8)), (8, (0, 8))):
            for col in range(9):
                if col not in cols:
                    masks[row*9+col].discard(8)
        steps = run_method(basic_fish, masks)
        self.assertNotIn(8, masks[9])  # R2C1
        self.assertTrue(any(s[0] == "squirmbag" and s[1] == 9
                            for s in steps))

    def test_randomized_solution_safety_for_every_new_technique(self):
        # Every random pencilmark superset contains one known valid complete
        # Sudoku solution. A sound technique cannot erase that digit.
        methods = (two_string_kites, w_wings, simple_colors,
                   remote_pairs, xy_chains, x_chains,
                   als_xz, finned_x_wings, basic_fish)
        rng = random.Random(20261104)
        for seed in range(5):
            solution = make_solution(9, rng)
            domains = []
            for digit in solution:
                masks = {digit}
                for other in range(1, 10):
                    if rng.random() < .32:
                        masks.add(other)
                domains.append(masks)
            for method in methods:
                current = [set(d) for d in domains]
                run_method(method, current)
                for cell, digit in enumerate(solution):
                    self.assertIn(digit, current[cell],
                                  (method.__name__, seed, cell))

    def test_all_method_names_are_taught_in_chinese(self):
        for name in ("two_string_kite", "w_wing", "color_trap",
                     "color_wrap", "xy_chain", "x_chain", "remote_pairs",
                     "als_xz", "finned_x_wing", "squirmbag"):
            self.assertIn(name, METHODS)
            self.assertTrue(METHODS[name][0])
        profile = lesson_profile(9, {"trace":[{
            "method": "xy_chain", "cell": 17, "removed": [7],
            "remaining": [1, 5], "source": {"chain": [1, 2, 3, 4]}}]})
        self.assertEqual(profile["techniquePath"][0]["nameZh"],
                         METHODS["xy_chain"][0])

    def test_tier_gating_prevents_advanced_method(self):
        masks = blank()
        for col in range(9):
            if col not in (1, 7):
                masks[9+col].discard(4)
        for row in range(9):
            if row not in (2, 7):
                masks[row*9+2].discard(4)
        basic = deduce(9, {}, [], domains=masks, max_tier=2)
        self.assertEqual(basic["techniques"].get("two_string_kite", 0), 0)
        advanced = deduce(9, {}, [], domains=masks, max_tier=3)
        self.assertNotIn(4, advanced["domains"][70])


if __name__ == "__main__":
    unittest.main()

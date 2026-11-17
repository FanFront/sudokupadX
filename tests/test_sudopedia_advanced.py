"""Regression proofs for the expanded Sudopedia deductions.

Pattern tests check a concrete, human-readable candidate elimination. The
randomized property test supplies a valid hidden complete Sudoku to every
method ONLY as an independent oracle: methods never receive that solution.
"""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

from variant_logic import houses, deduce
from generate_variants import make_solution
from sudopedia_patterns import (generalized_fish, extended_finned_fish,
                                wxyz_wings, sue_de_coq)
from sudopedia_inference import (alternating_inference_chains,
                                 medusa_3d, multi_colors, empty_rectangles)
from sudopedia_als import (als_xy_wings, als_xy_chains, death_blossoms)
from technique_catalog import METHODS, ADVANCED_METHODS, lesson_profile

METHODS_WITH_UNITS = (generalized_fish, sue_de_coq,
                      alternating_inference_chains, medusa_3d,
                      multi_colors, empty_rectangles, als_xy_wings,
                      als_xy_chains, death_blossoms)
ALL = (generalized_fish, extended_finned_fish, wxyz_wings, sue_de_coq,
       alternating_inference_chains, medusa_3d, multi_colors, empty_rectangles,
       als_xy_wings, als_xy_chains, death_blossoms)


def blank():
    return [set(range(1, 10)) for _ in range(81)]


def only(masks, digit, unit, allowed):
    for cell in unit:
        if cell not in allowed:
            masks[cell].discard(digit)


def execute(method, masks):
    steps = []
    def reduce(cell, allowed, name, source):
        removed = masks[cell] - set(allowed)
        if not removed:
            return False
        if not masks[cell] & set(allowed):
            raise AssertionError(f'{name} tried to empty R{cell//9+1}C{cell%9+1}')
        masks[cell].intersection_update(allowed)
        steps.append({'method': name, 'cell': cell,
                      'removed': sorted(removed), 'remaining': sorted(masks[cell]),
                      'source': source})
        return True
    if method in METHODS_WITH_UNITS:
        method(9, masks, houses(9), reduce)
    else:
        method(9, masks, reduce)
    return steps


def execute_until(method, masks, cell, digit, limit=36):
    """Proof detectors may emit an earlier valid elimination first."""
    result = []
    for _ in range(limit):
        if digit not in masks[cell]:
            break
        steps = execute(method, masks)
        result.extend(steps)
        if not steps:
            break
    return result


class SudopediaAdvancedTests(unittest.TestCase):
    def test_empty_rectangle_both_cross_and_conjugate(self):
        masks = blank()
        # Box 1: seven only in R2 or C2. Col 6: conjugates R2C6,R6C6.
        box = houses(9)[18]
        only(masks, 7, box, {9, 1, 19})
        only(masks, 7, houses(9)[9+5], {14, 50})
        steps = execute(empty_rectangles, masks)
        self.assertNotIn(7, masks[46])  # R6C2
        self.assertTrue(any(s['method'] == 'empty_rectangle' and s['cell'] == 46
                            for s in steps))

    def test_wxyz_wing_common_peer(self):
        masks = blank()
        masks[10] = {1, 2, 3, 4}
        masks[9] = {1, 4}
        masks[11] = {2, 4}
        masks[18] = {3, 4}
        masks[0] = {4, 7, 8}
        steps = execute(wxyz_wings, masks)
        self.assertNotIn(4, masks[0])
        self.assertTrue(any(s['method'] == 'wxyz_wing' and s['cell'] == 0
                            for s in steps))

    def test_sue_de_coq_two_sector_count(self):
        masks = blank()
        # Row 2 / box 1 intersection has 4 candidates in 2 cells.
        # The line-only and box-only bivalue wings partition all 4.
        masks[9], masks[10] = {1, 5}, {2, 8}
        masks[13], masks[0] = {1, 2}, {5, 8}
        steps = execute(sue_de_coq, masks)
        self.assertNotIn(1, masks[14])
        self.assertNotIn(2, masks[14])
        self.assertNotIn(5, masks[20])
        self.assertNotIn(8, masks[20])
        self.assertTrue(any(s['method'] == 'sue_de_coq' for s in steps))

    def test_franken_and_mutant_fish_count_distinct_houses(self):
        masks = blank()
        # Disjoint base row R1 and middle-left box. Both are covered by
        # columns C2/C5; top-middle box is an alternative cover with C2.
        only(masks, 7, houses(9)[0], {1, 4})
        only(masks, 7, houses(9)[21], {28, 37})
        steps = execute(generalized_fish, masks)
        self.assertNotIn(7, masks[55])  # Frankenstein: column C2
        self.assertNotIn(7, masks[12])  # Mutant: top-middle box
        self.assertTrue(any(s['method'] == 'franken_fish' for s in steps))
        self.assertTrue(any(s['method'] == 'mutant_fish' for s in steps))

    def test_sashimi_missing_fish_corner(self):
        masks = blank()
        only(masks, 6, houses(9)[0], {1, 2})  # C2, fin C3
        only(masks, 6, houses(9)[3], {28, 32})  # C2, C6
        # Cover columns are C2/C6; R1C3 is the only fin in box 1.
        steps = execute(extended_finned_fish, masks)
        self.assertNotIn(6, masks[10])  # R2C2 sees fin
        self.assertTrue(any(s['method'] == 'sashimi_fish' for s in steps))

    def test_finned_swordfish(self):
        masks = blank()
        for row, cols in ((0, (1, 2, 4)), (3, (4, 7)), (6, (1, 7))):
            only(masks, 6, houses(9)[row], {row*9+c for c in cols})
        steps = execute(extended_finned_fish, masks)
        self.assertNotIn(6, masks[10])
        self.assertTrue(any(s['method'] == 'finned_swordfish'
                            for s in steps))

    def test_aic_propagates_across_digits(self):
        masks = blank()
        masks[0] = {1, 2, 3}
        masks[1] = {1, 2, 4}
        masks[10] = {2, 5}
        only(masks, 1, houses(9)[0], {0, 1})
        only(masks, 2, houses(9)[9+1], {1, 10})
        steps = execute_until(alternating_inference_chains, masks, 0, 2)
        self.assertNotIn(2, masks[0])
        self.assertTrue(any(s['method'] == 'aic' and
                            'S-W-S' in s['source']['edges'] for s in steps))

    def test_3d_medusa_cross_digit_color_trap(self):
        masks = blank()
        masks[10], masks[13], masks[37] = {1, 2}, {1, 3}, {2, 3}
        only(masks, 1, houses(9)[1], {10, 13})
        only(masks, 2, houses(9)[9+1], {10, 37})
        steps = execute_until(medusa_3d, masks, 40, 3)
        self.assertNotIn(3, masks[40])  # sees B3 and C3 of opposite parity
        self.assertTrue(any(s['method'] == 'medusa_trap' and s['cell'] == 40
                            for s in steps))

    def test_als_xy_wing(self):
        masks = blank()
        masks[10] = {1, 3}
        masks[11] = {1, 2}
        masks[20] = {2, 3}
        masks[19] = {3, 4, 5}
        steps = execute_until(als_xy_wings, masks, 19, 3)
        self.assertNotIn(3, masks[19])
        self.assertTrue(any(s['method'] == 'als_xy_wing' and s['cell'] == 19
                            for s in steps))

    def test_als_xy_chain(self):
        masks = blank()
        for cell, domain in ((10, {1, 5}), (11, {1, 2}),
                             (20, {2, 3}), (29, {3, 5})):
            masks[cell] = domain
        masks[28] = {5, 6, 7}
        steps = execute_until(als_xy_chains, masks, 28, 5)
        self.assertNotIn(5, masks[28])
        self.assertTrue(any(s['method'] == 'als_xy_chain' and s['cell'] == 28
                            for s in steps))

    def test_death_blossom(self):
        masks = blank()
        masks[10] = {1, 2, 3}  # Stem
        masks[0], masks[1], masks[9] = {1, 7}, {2, 7}, {3, 7}
        masks[20] = {4, 7, 8}
        steps = execute_until(death_blossoms, masks, 20, 7)
        self.assertNotIn(7, masks[20])
        self.assertTrue(any(s['method'] == 'death_blossom' and s['cell'] == 20
                            for s in steps))

    def test_new_methods_have_chinese_proof_names(self):
        methods = ('franken_fish', 'mutant_fish', 'sashimi_fish',
                   'finned_swordfish', 'finned_jellyfish', 'wxyz_wing',
                   'sue_de_coq', 'aic', 'medusa_wrap', 'medusa_trap',
                   'multi_colors', 'empty_rectangle', 'als_xy_wing',
                   'als_xy_chain', 'death_blossom')
        for method in methods:
            self.assertIn(method, METHODS)
            self.assertIn(method, ADVANCED_METHODS)
            self.assertEqual(METHODS[method][1], 4)
        step = {'method': 'aic', 'cell': 20, 'removed': [7],
                'remaining': [1, 5], 'source':
                {'chain': [[0, 1], [1, 1], [1, 2], [10, 2]],
                 'edges': 'S-W-S'}}
        profile = lesson_profile(9, {'trace': [step]})
        self.assertEqual(profile['techniquePath'][0]['method'], 'aic')
        self.assertIn('交替推理链', profile['techniquePath'][0]['nameZh'])

    def test_no_solution_digit_ever_removed_in_randomized_supersets(self):
        rng = random.Random(20261117)
        for seed in range(3):
            solution = make_solution(9, rng)
            masks = []
            for true in solution:
                mask = {true} | {d for d in range(1, 10)
                                 if rng.random() < .24}
                masks.append(mask)
            for method in ALL:
                domains = [set(mask) for mask in masks]
                execute(method, domains)
                for cell, true in enumerate(solution):
                    self.assertIn(true, domains[cell],
                                  (method.__name__, seed, cell))


if __name__ == '__main__':
    unittest.main()

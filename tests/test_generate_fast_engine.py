"""Exactness and cache-isolation checks for the fast authoring solver."""
from itertools import product
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from variant_logic import (_distinct_sum_supports, _prepared_geometry,
                           count_solutions, deduce, houses)


def reference_supports(domains, total):
    """Deliberately simple independent exhaustive oracle."""
    support = [set() for _ in domains]
    for values in product(*domains):
        if sum(values) == total and len(set(values)) == len(values):
            for group, digit in zip(support, values):
                group.add(digit)
    return tuple(frozenset(group) for group in support)


class FastEngineTests(unittest.TestCase):
    def test_bounded_killer_support_equals_exhaustive_enumeration(self):
        rng = random.Random(8743)
        for n in (4, 9):
            for size in (1, 2, 3, 4, 5):
                for _ in range(18):
                    domains = tuple(
                        tuple(d for d in range(1, n + 1)
                              if rng.random() < .55) or (rng.randrange(1, n + 1),)
                        for _ in range(size)
                    )
                    total = rng.randrange(0, min(45, n * size + 1))
                    self.assertEqual(
                        _distinct_sum_supports(domains, total),
                        reference_supports(domains, total),
                        (n, size, domains, total),
                    )

    def test_cache_separates_cage_sums_and_reuses_identical_geometry(self):
        constraints = [{"type": "killer", "cells": [0, 1], "sum": 3}]
        import json
        key = lambda: json.dumps(constraints, sort_keys=True,
                                 separators=(',', ':'))
        before = _prepared_geometry.cache_info().hits
        geometry = _prepared_geometry(4, key())
        self.assertIs(geometry, _prepared_geometry(4, key()))
        self.assertGreater(_prepared_geometry.cache_info().hits, before)
        constraints[0]["sum"] = 4
        different = _prepared_geometry(4, key())
        self.assertIsNot(geometry, different)

    def test_fast_feasibility_agrees_with_complete_deduction(self):
        # The fast scheduler is allowed to produce a different *order* of
        # removals, but never a different logical closure or solved status.
        seed = {0: 1, 1: 2, 5: 4, 10: 4, 15: 1}
        rules = [{"type": "killer", "cells": [2, 3], "sum": 7}]
        for givens, constraints in (({}, []), (seed, []), ({}, rules)):
            for max_tier in (1, 2, 3, 4):
                a = deduce(4, givens, constraints, trace=False,
                           max_tier=max_tier)
                b = deduce(4, givens, constraints, trace=False,
                           max_tier=max_tier, fast=True)
                self.assertEqual(a["solved"], b["solved"])
                self.assertEqual(a["domains"], b["domains"])

    def test_complete_grid_never_searches_advanced_patterns(self):
        from unittest.mock import patch
        completed = [((row * 3 + row // 3 + col) % 9) + 1
                     for row in range(9) for col in range(9)]
        with patch("variant_logic.two_string_kites",
                   side_effect=AssertionError("unnecessary advanced search")):
            proof = deduce(9, dict(enumerate(completed)), [],
                           trace=True, max_tier=4)
        self.assertTrue(proof["solved"])
        self.assertEqual(proof["values"], completed)

    def test_exact_solution_count_does_not_need_advanced_patterns(self):
        # The exact counter uses exhaustive branching, independent of the
        # higher-tier human technique engine, even on an ambiguous board.
        seed = {0: 1, 1: 2, 2: 3, 4: 3, 5: 4, 6: 1,
                8: 2, 9: 1, 12: 4, 13: 3}
        self.assertEqual(count_solutions(4, seed, []), 1)
        self.assertEqual(count_solutions(4, {}, [], limit=2), 2)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Profile a *real* certified puzzle, without modifying the shipped library.

Usage:
    python3 scripts/profile_generator.py --count 1 --limit 40

The program intentionally runs the same generator/solver/uniqueness checks
as production. Nothing here bypasses proof certification.
"""
from __future__ import annotations

import argparse
import cProfile
import io
import pstats
import time

import generate_batch9


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--limit", type=int, default=35)
    parser.add_argument("--stats", help="Optional .prof output for SnakeViz")
    args = parser.parse_args()
    profile = cProfile.Profile()
    started = time.perf_counter()
    profile.enable()
    try:
        games, report = generate_batch9.build(
            count=args.count, progress=lambda item: print(item, flush=True)
        )
    finally:
        profile.disable()
    print(f"Certified {len(games)} puzzles in "
          f"{time.perf_counter() - started:.2f}s", flush=True)
    print("Difficulty tiers:", report["difficultyTiers"], flush=True)
    output = io.StringIO()
    pstats.Stats(profile, stream=output).strip_dirs().sort_stats(
        "cumtime").print_stats(args.limit)
    print(output.getvalue())
    if args.stats:
        profile.dump_stats(args.stats)


if __name__ == "__main__":
    main()

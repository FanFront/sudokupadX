#!/usr/bin/env python3
"""Build a deterministic, offline set of 9x9 mixed-variant logic Sudokus.

Reuse the workshop's *real* constraint authoring, no-guess solver and
independent solution counter. Never fill the library with unverified
random clue removals or cosmetic copies of the same solved grid.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random

import generate_variants as variants
from technique_catalog import replay_trace
from variant_logic import count_solutions, deduce, houses

GROUP = "generated-9x9"
DEFAULT_SEED = 20261104
DEFAULT_COUNT = 100
DEFAULT_OUTPUT = Path("public/puzzles/batch9")


def build(seed=DEFAULT_SEED, count=DEFAULT_COUNT, max_attempts=180, progress=None):
    """Return 100 independent puzzles and their reproducible proof summaries.

    Acceptance uses the same strict workshop gates: full logical solution
    without branching, unique mathematical solution, genuine dependence on
    variant rules, and actual cross-rule deductions. Repeated solved grids
    are rejected even when their givens happen to differ.
    """
    if not 1 <= count <= 1000:
        raise ValueError("Puzzle count must be between 1 and 1000")
    if max_attempts < 1:
        raise ValueError("Maximum attempts must be positive")
    rng = random.Random(seed)
    games, records = [], []
    seen_solutions = set()
    seen_puzzles = set()
    failures = Counter()
    for number in range(1, count + 1):
        for attempt in range(1, max_attempts + 1):
            solution = variants.make_solution(9, rng)
            solution_key = "".join(map(str, solution))
            if solution_key in seen_solutions:
                failures["repeated solved grid"] += 1
                continue
            try:
                constraints = variants.make_constraints(9, solution, rng)
                # Reject inconsistent geometry before spending time digging.
                deduce(9, dict(enumerate(solution)), constraints, trace=False)
                givens = variants.dig(9, solution, constraints, rng)
                accepted = variants.quality(9, givens, constraints, solution, failures)
            except ValueError as exc:
                failures[str(exc)] += 1
                continue
            if accepted is None:
                continue
            fingerprint = hashlib.sha256(json.dumps(
                {"givens": sorted(givens.items()), "constraints": constraints,
                 "solution": solution}, sort_keys=True,
                separators=(",", ":")).encode("utf-8")).hexdigest()
            if fingerprint in seen_puzzles:
                failures["duplicate puzzle"] += 1
                continue
            break
        else:
            raise RuntimeError(
                f"Only {len(games)}/{count} accepted 9x9 puzzles after "
                f"{max_attempts} attempts for slot {number}: {dict(failures)}"
            )

        identifier = f"{GROUP}-{number:03d}"
        game = variants.puzzle(9, givens, solution, constraints, accepted, seed)
        game["id"] = identifier
        game["metadata"]["title"] = f"九宫逻辑工坊 · 第 {number:03d} 题"
        game["metadata"]["variantFamily"] = GROUP
        game["metadata"]["generatorIndex"] = number
        game["metadata"]["generatorAttempt"] = attempt
        game["metadata"]["msgcorrect"] = "完成！本题已通过唯一解和纯逻辑求解验证。"
        related = [f"{GROUP}-{i:03d}" for i in
                   (number - 1, number + 1) if 1 <= i <= count]
        related.append("variant-workshop-9")
        game["metadata"]["relatedPuzzles"] = related
        original_rules = game["metadata"]["rules"].split("\nRelated chapters: ")[0]
        game["metadata"]["rules"] = (
            original_rules + "\n关联谜题：" +
            "、".join("sudokupadx:puzzle/" + name for name in related)
        )
        # Quality already verifies uniqueness and a complete no-guess proof.
        # Replay its eliminations from givens, never from the answer.
        domains = replay_trace(9, givens, accepted["proof"]["trace"])
        if any(len(values) != 1 or next(iter(values)) != solution[i]
               for i, values in enumerate(domains)):
            raise AssertionError(f"Invalid replay proof: {identifier}")
        seen_solutions.add(solution_key)
        seen_puzzles.add(fingerprint)
        games.append(game)
        records.append({
            "id": identifier,
            "attempt": attempt,
            "givens": len(givens),
            "solutionSha256": hashlib.sha256(solution_key.encode()).hexdigest(),
            "puzzleSha256": fingerprint,
            "variantTypes": game["metadata"]["variantTypes"],
            "requiredVariants": accepted["essential"],
            "usedVariants": accepted["used"],
            "techniques": accepted["proof"]["techniques"],
            "structuralMotifs": accepted["structural"],
            "minimumTier": accepted["education"]["minimumTier"],
            "deductionSteps": len(accepted["proof"]["trace"]),
            "proofSha256": hashlib.sha256(json.dumps(
                accepted["proof"]["trace"], ensure_ascii=False,
                sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest(),
        })
        if progress and (number % 10 == 0 or number == count):
            progress(f"Validated {number}/{count} unique 9x9 logic puzzles")

    report = {
        "generator": "scripts/generate_batch9.py",
        "seed": seed,
        "count": count,
        "type": GROUP,
        "difficultyTiers": dict(sorted(Counter(
            str(r["minimumTier"]) for r in records).items())),
        "failures": dict(sorted(failures.items())),
        "puzzles": records,
    }
    return games, report


def validate(games, report):
    if len(games) != report["count"] or len(report["puzzles"]) != len(games):
        raise AssertionError("Incorrect generated puzzle count")
    ids, signatures, answers = set(), set(), set()
    for game, record in zip(games, report["puzzles"]):
        if game["id"] != record["id"] or len(game["cells"]) != 9:
            raise AssertionError("Invalid generated 9x9 entry")
        if any(len(row) != 9 for row in game["cells"]):
            raise AssertionError("Invalid puzzle rows")
        if game["id"] in ids or record["puzzleSha256"] in signatures:
            raise AssertionError("Duplicate generated puzzle")
        answer = game["metadata"]["solution"]
        if len(answer) != 81 or answer in answers:
            raise AssertionError("Duplicate or invalid solved grid")
        if game["metadata"]["logicProfile"]["requiresGuessing"]:
            raise AssertionError("Puzzle requires guessing")
        if not record["requiredVariants"] or not record["structuralMotifs"]:
            raise AssertionError("Variant decoration did not contribute")
        ids.add(game["id"])
        signatures.add(record["puzzleSha256"])
        answers.add(answer)


def export(output, games, report):
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for game, record in zip(games, report["puzzles"]):
        name = game["id"] + ".json"
        (output / name).write_text(
            json.dumps(game, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        entries.append({
            "id": game["id"],
            "title": game["metadata"]["title"],
            "kind": "standalone",
            "group": GROUP,
            "tier": record["minimumTier"],
            "file": f"puzzles/batch9/{name}",
        })
    (output / "catalog-entries.json").write_text(
        json.dumps({"items": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (output / "validation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--attempts", type=int, default=180)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    games, report = build(args.seed, args.count, args.attempts, print)
    validate(games, report)
    export(args.output, games, report)
    print(f"Exported {len(games)} unique 9x9 puzzles to {args.output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Search for truly tier-3/4 Sudoku puzzles (not difficulty labels).

Build from visible, internally consistent variant rules and remove givens
only when the deduction-only solver can still finish. Search across both
rule density and clue-removal order; accept an exact target tier ONLY if
the previous tier stalls and the target tier solves without branching.

The original 100 puzzles and six sparse puzzles retain their stable IDs.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
from pathlib import Path
import random

import generate_variants as workshop
import generate_single_variants as single
from technique_catalog import lesson_profile, replay_trace, technique_tier
from variant_logic import count_solutions, deduce

FAMILY = "advanced-logic"
SEED = 20261106
OUTPUT = Path("public/puzzles/advanced")
# A smaller, more demanding collection. Each uses only one extra rule.
TARGETS = (
    ("kropki", 3),
    ("thermo", 3),
    ("killer", 3),
    ("renban", 3),
)
# Density bands ensure the rule is genuinely useful without solving every
# cell by itself. The variants are still authored from real solution geometry.
DENSITIES = (0.55, 0.40, 0.75, 0.30, 0.65, 0.90)


def can_solve(solution, givens, rules, tier):
    try:
        result = deduce(9, givens, rules, trace=False, max_tier=tier)
        return result["solved"] and result["values"] == solution
    except ValueError:
        return False


def dig(solution, rules, rng, tier):
    """One-pass monotone clue minimization under a fixed logic ceiling."""
    clues = dict(enumerate(solution))
    cells = list(clues)
    rng.shuffle(cells)
    for i in cells:
        value = clues.pop(i)
        if not can_solve(solution, clues, rules, tier):
            clues[i] = value
    return clues


def certificate(kind, tier, solution, clues, rules, require_uniqueness=True):
    """Exact, independently replayable difficulty certificate or None."""
    if len(clues) > 45 or not rules or len({c["type"] for c in rules}) != 1:
        return None
    if not can_solve(solution, clues, rules, tier):
        return None
    if can_solve(solution, clues, rules, tier-1):
        return None
    try:
        proof = deduce(9, clues, rules, max_tier=tier)
        if not proof["solved"] or proof["values"] != solution:
            return None
        advanced = [
            step for step in proof["trace"] if
            technique_tier(step["method"], step["source"]) == tier
        ]
        # The certificate is not merely "a solver stalled". A real
        # candidate-removing method of that exact tier must be in the proof.
        if not advanced:
            return None
        if require_uniqueness and (count_solutions(9, clues, rules) != 1 or
                                   count_solutions(9, clues, []) != 2):
            return None
        replayed = replay_trace(9, clues, proof["trace"])
        if any(len(mask) != 1 or next(iter(mask)) != solution[i]
               for i, mask in enumerate(replayed)):
            return None
        return {"proof":proof, "advanced":advanced}
    except ValueError:
        return None


def search_one(kind, tier, seed=SEED, attempts=16, verbose=False):
    if kind not in single.RULES:
        raise ValueError("Unrecognized variant rule: " + kind)
    if tier not in (3,4):
        raise ValueError("This advanced pack requires tier 3 or 4")
    rng = random.Random(seed + single.RULES.index(kind)*3211 + tier*7777)
    diagnostics = Counter()
    best = None
    for attempt in range(1, attempts+1):
        solution = workshop.make_solution(9, rng)
        try:
            authored = single.geometry(kind, solution, rng)
        except ValueError:
            diagnostics["bad_geometry"] += 1
            continue
        # Each layout is tried at one density, rather than spending many
        # expensive proof searches on essentially identical variants.
        density = DENSITIES[(attempt-1) % len(DENSITIES)]
        minimum = min(3, len(authored))
        count = max(minimum, min(len(authored), round(len(authored)*density)))
        selected = sorted(rng.sample(range(len(authored)), count))
        rules = [authored[i] for i in selected]
        try:
            # Authoring check; must not encode contradictory constraints.
            deduce(9, dict(enumerate(solution)), rules, trace=False)
            clues = dig(solution, rules, rng, tier)
            if len(clues) > 45:
                diagnostics["too_many_givens"] += 1
                continue
            if can_solve(solution, clues, rules, tier-1):
                diagnostics["lower_tier_solves"] += 1
                continue
            proof = certificate(kind, tier, solution, clues, rules,
                                require_uniqueness=True)
            if proof is None:
                diagnostics["proof_or_variant_rejected"] += 1
                continue
            if best is None or (len(clues), len(rules)) < (
                    len(best["givens"]), len(best["rules"])):
                best = {"solution":solution, "givens":clues, "rules":rules,
                        "proof":proof["proof"], "advanced":proof["advanced"],
                        "attempt":attempt, "density":density}
            if verbose:
                print(f"{kind} tier {tier}: candidate {attempt}, "
                      f"{len(clues)} givens, {len(rules)} marks",flush=True)
        except ValueError:
            diagnostics["contradiction"] += 1
    if verbose:
        print(f"{kind} tier {tier}: best="
              f"{len(best['givens']) if best else 'none'}; "
              f"rejected={dict(diagnostics)}",flush=True)
    if best is None:
        raise RuntimeError(
            f"Cannot certify a true level-{tier} {kind} Sudoku after "
            f"{attempts} attempts: {dict(diagnostics)}")
    return best


def _worker(spec):
    return search_one(*spec)


def export_entry(kind,tier,seed,data):
    index = TARGETS.index((kind,tier))+1 if (kind,tier) in TARGETS else 1
    identifier = f"{FAMILY}-{kind}-t{tier}"
    cages, lines, underlays, overlays, arrows = workshop.render(9,data["rules"])
    regions = [[[r+dr,c+dc] for dr in range(3) for dc in range(3)]
               for r in (0,3,6) for c in (0,3,6)]
    rules_text = (
        "标准数独：每行每列每宫填1–9，且本关仅包含一种额外规则。"
        + single.RULE_TEXT[kind]
        + f"\n认证技巧等级：{tier}。较低等级({tier-1})的无猜测求解器"
        "不能解完本题，但相应高阶技巧可以。"
        "\n挑战目的：找到真正的候选数排除结构，而不是通过试错枚举。"
    )
    game = {
        "id":identifier,
        "cells":[[{"value":str(data["givens"][r*9+c])}
                  if r*9+c in data["givens"] else {} for c in range(9)]
                 for r in range(9)],
        "regions":regions, "cages":cages,"lines":lines,
        "underlays":underlays,"overlays":overlays,"arrows":arrows,
        "metadata":{
            "title":f"高阶逻辑 {index} · {single.TITLES[kind]} · 级别 {tier}",
            "author":"SudokuPadX Logic Generator",
            "rules":rules_text,
            "solution":"".join(map(str,data["solution"])),
            "msgcorrect":"成功！本题已通过高阶、无需猜测的逻辑求解。",
            "variantFamily":FAMILY,
            "variantTypes":[kind],
            "generatorSeed":seed,
            "generatorAttempt":data["attempt"],
            "logicProfile":{
                "minimumTier":tier, "requiresGuessing":False,
                "techniques":data["proof"]["techniques"],
                "education":lesson_profile(9,data["proof"]),
                "certificate":{"lowerTierStalls":True,
                               "targetTierSolves":True,
                               "advancedMethods":list(dict.fromkeys(
                                   step["method"] for step in data["advanced"]))}
            }
        }
    }
    trace=data["proof"]["trace"]
    details={
        "id":identifier,"rule":kind,"minimumTier":tier,
        "givens":len(data["givens"]),"marks":len(data["rules"]),
        "advancedMethods":list(dict.fromkeys(step["method"] for step in data["advanced"])),
        "attempt":data["attempt"],"seed":seed,
        "ruleDensity":data["density"],
        "rules":data["rules"],"trace":trace,
        "fullSolutionSha256":hashlib.sha256(game["metadata"]["solution"].encode()).hexdigest()
    }
    return game,details


def build(seed=SEED,attempts=16,workers=4,targets=TARGETS,progress=None):
    specs=[(kind,tier,seed,attempts,False) for kind,tier in targets]
    if workers == 1 or len(specs)==1:
        raw=[_worker(spec) for spec in specs]
    else:
        with ProcessPoolExecutor(max_workers=min(workers,len(specs))) as pool:
            raw=list(pool.map(_worker,specs))
    pairs=[export_entry(kind,tier,seed,data)
           for (kind,tier),data in zip(targets,raw)]
    report={"seed":seed,"family":FAMILY,
            "puzzles":[details for _,details in pairs]}
    if progress:
        for entry in report["puzzles"]:
            progress(f"{entry['id']}: tier {entry['minimumTier']} confirmed; "
                     f"{entry['givens']} givens, {entry['marks']} rule marks, "
                     f"{', '.join(entry['advancedMethods'])}")
    return [game for game,_ in pairs],report


def export(folder,games,report):
    folder.mkdir(parents=True,exist_ok=True)
    items=[]
    for game,detail in zip(games,report["puzzles"]):
        filename=game["id"]+".json"
        (folder/filename).write_text(
            json.dumps(game,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        items.append({
            "id":game["id"],"title":game["metadata"]["title"],
            "kind":"standalone","group":FAMILY,
            "tier":detail["minimumTier"],"givens":detail["givens"],
            "file":f"puzzles/advanced/{filename}",
        })
    (folder/"catalog-entries.json").write_text(
        json.dumps({"items":items, "count":len(items)},indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")
    (folder/"validation.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed",type=int,default=SEED)
    parser.add_argument("--attempts",type=int,default=16)
    parser.add_argument("--workers",type=int,default=4)
    parser.add_argument("--kind",choices=single.RULES)
    parser.add_argument("--tier",type=int,choices=(3,4),default=3)
    parser.add_argument("--probe",action="store_true")
    parser.add_argument("--output",type=Path,default=OUTPUT)
    args=parser.parse_args()
    targets=((args.kind,args.tier),) if args.kind else TARGETS
    if args.probe:
        # Diagnose lower-tier collapses and success rates by rule density.
        for kind,tier in targets:
            data=search_one(kind,tier,args.seed,args.attempts,True)
            print("CERTIFIED",kind,tier,len(data["givens"]),flush=True)
        return
    games,report=build(args.seed,args.attempts,args.workers,targets,print)
    export(args.output,games,report)
    print(f"Exported {len(games)} certified advanced Sudoku puzzles",flush=True)


if __name__=="__main__":
    main()

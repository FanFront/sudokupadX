#!/usr/bin/env python3
"""Create six sparse, single-rule 9x9 Sudoku challenges with verified logic.

Each puzzle uses exactly one *variant family*, possibly repeated as several
visible cages/lines/dots. It still follows normal row/column/box Sudoku.
Clues are removed while a bounded no-guess solver can finish. Once an
individual deletion fails, this is clue-irreducible under that solver,
not a claim of the globally fewest clues across all possible puzzles.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import random

import generate_variants as workshop
from technique_catalog import lesson_profile, minimum_tier, replay_trace
from variant_logic import count_solutions, deduce, houses

FAMILY = "single-rule-lab"
DEFAULT_SEED = 20261105
OUTPUT = Path("public/puzzles/single-rule")
RULES = ("killer", "kropki", "thermo", "renban", "arrow", "whisper")
TITLES = {
    "killer": "极简杀手笼",
    "kropki": "黑白连锁",
    "thermo": "温度迷宫",
    "renban": "连续之径",
    "arrow": "箭头回响",
    "whisper": "高低耳语",
}
RULE_TEXT = {
    "killer": "所有虚线笼的数字之和等于角标，且同一个笼内数字不能重复。可以利用整宫总和45计算笼外数字。",
    "kropki": "白点两侧数字相差1，黑点两侧数字成1:2比例。没有标记的相邻格不受额外限制。注意白点三连格的分区。",
    "thermo": "温度计从圆头向末端严格递增；同一温度计上的数字不能相等。",
    "renban": "每条蓝色连续线由一组不重复且数值连续的数字组成，线上排列顺序不必递增。",
    "arrow": "橙色圆圈里的数字等于同一箭头线上其余各格的数字之和。箭头上的数字可以重复（只要不违反标准数独）。",
    "whisper": "每条绿色耳语线的任意相邻两格数字至少相差5，不要求整条线严格递增或递减。",
}
TARGET_MARKS = {"killer": 26, "kropki": 34, "thermo": 16,
                "renban": 16, "arrow": 17, "whisper": 17}
METHODS = {"killer": ("killer_sum", "killer_innie", "killer_outie"),
           "kropki": ("kropki", "kropki_partition"),
           "thermo": ("thermo",), "renban": ("renban",),
           "arrow": ("arrow",), "whisper": ("whisper",)}


def valid_path(kind, cells, solution):
    values = [solution[i] for i in cells]
    if kind == "thermo":
        return all(a < b for a, b in zip(values, values[1:]))
    if kind == "renban":
        return len(set(values)) == len(values) and max(values) - min(values) == len(values)-1
    if kind == "whisper":
        return all(abs(a-b) >= 5 for a, b in zip(values, values[1:]))
    if kind == "arrow":
        return values[0] == sum(values[1:])
    return False


def paths_for(kind, solution):
    """All short orthogonal patterns; keep the authored art inspectable."""
    lengths = {"thermo": (5, 4, 3), "renban": (5, 4, 3),
               "arrow": (4, 3), "whisper": (5, 4, 3)}[kind]
    found = []
    for length in lengths:
        options = workshop.paths_matching(
            9, solution, length, lambda cells: valid_path(kind, cells, solution))
        for path in options:
            # Renban and Whisper have no head; reverse paths are identical art.
            if kind in ("renban", "whisper") and path[0] > path[-1]:
                continue
            found.append(path)
    return found


def spread_paths(kind, solution, rng):
    paths = paths_for(kind, solution)
    if not paths:
        raise ValueError("No valid geometry for " + kind)
    rng.shuffle(paths)
    used_paths, coverage, used_edges = set(), Counter(), set()
    chosen = []
    for _ in range(TARGET_MARKS[kind]):
        candidates = []
        for path in paths:
            key = tuple(path)
            if key in used_paths:
                continue
            edges = {frozenset((a,b)) for a,b in zip(path, path[1:])}
            if edges & used_edges:
                continue
            if any(coverage[i] >= 2 for i in path):
                continue
            # Score repeated intersections heavily, prefer different rows/boxes
            overlap = sum(coverage[i] for i in path)
            box_ids = {i//27*3 + i%9//3 for i in path}
            candidates.append((overlap*100 + 6*max(0,len(path)-len(box_ids)-1)
                               - len(path)*5, path, edges))
        if not candidates:
            break
        minscore = min(score for score,_,_ in candidates)
        shortlist = [(p,e) for score,p,e in candidates if score <= minscore+10]
        path, edges = rng.choice(shortlist)
        used_paths.add(tuple(path))
        used_edges.update(edges)
        for i in path:
            coverage[i] += 1
        chosen.append({"type":kind,"cells":list(path)})
    if len(chosen) < max(5,TARGET_MARKS[kind]//2):
        raise ValueError("Insufficient visible " + kind + " geometry")
    return chosen


def kropki_geometry(solution, rng):
    constraints, used_edges, coverage = [], set(), Counter()
    motif_rows = []
    for row in range(9):
        groups = [[row*9+3*g+i for i in range(3)] for g in range(3)]
        if all(abs(solution[a]-solution[b]) == 1
               for triple in groups for a,b in zip(triple,triple[1:])):
            motif_rows.append(groups)
    rng.shuffle(motif_rows)
    # A row covered by three white-dot triples yields a real partition
    # deduction (123 / 456 / 789) and echoes sparse boss-style geometry.
    for groups in motif_rows[:2]:
        for triple in groups:
            for a,b in zip(triple,triple[1:]):
                edge=frozenset((a,b))
                if edge in used_edges:
                    continue
                used_edges.add(edge)
                constraints.append({"type":"kropki","kind":"white","cells":[a,b]})
                coverage[a] += 1
                coverage[b] += 1
    choices = []
    for a in range(81):
        for b in workshop.neighbors(9, a):
            if a >= b:
                continue
            x,y=solution[a], solution[b]
            white = abs(x-y)==1
            black = max(x,y)==2*min(x,y)
            if white or black:
                choices.append((a,b,"black" if black and (not white or rng.random() < 0.7) else "white"))
    rng.shuffle(choices)
    for _ in range(TARGET_MARKS["kropki"]-len(constraints)):
        available = [(coverage[a]+coverage[b], a,b,kind)
                     for a,b,kind in choices
                     if frozenset((a,b)) not in used_edges and
                     coverage[a]<4 and coverage[b]<4]
        if not available:
            break
        score=min(x[0] for x in available)
        _,a,b,kind=rng.choice([x for x in available if x[0]==score])
        used_edges.add(frozenset((a,b)))
        constraints.append({"type":"kropki","kind":kind,"cells":[a,b]})
        coverage[a]+=1
        coverage[b]+=1
    return constraints


def killer_geometry(solution, rng):
    constraints, occupied = [], set()
    workshop.house_sum_geometry(9, solution, rng, constraints, occupied)
    # Add non-overlapping, organically shaped cages. Small 2-3-cell cages
    # keep sum combination enumeration readable to both human and solver.
    options=[]
    for a in range(81):
        for b in workshop.neighbors(9,a):
            if b <= a:
                continue
            pairs=[(a,b)]
            triples=[]
            for endpoint in (a,b):
                for c in workshop.neighbors(9,endpoint):
                    if c!=a and c!=b:
                        triples.append((a,b,c))
            options.extend(pairs+triples)
    rng.shuffle(options)
    while len(constraints)<TARGET_MARKS["killer"]:
        valid = []
        for path in options:
            if any(i in occupied for i in path):
                continue
            if len({solution[i] for i in path})!=len(path):
                continue
            valid.append(path)
        if not valid:
            break
        # Longer cages cover the grid with fewer overprinted labels.
        preferred = [p for p in valid if len(p)==3] or valid
        path = rng.choice(preferred)
        constraints.append(workshop.cage(9,solution,path))
        occupied.update(path)
    return constraints


def geometry(kind, solution, rng):
    if kind == "killer":
        return killer_geometry(solution,rng)
    if kind == "kropki":
        return kropki_geometry(solution,rng)
    return spread_paths(kind,solution,rng)


def dig_minimal(solution, constraints, rng, max_tier=3):
    """Clue deletion is legal only if the no-guess solver still finishes."""
    givens=dict(enumerate(solution))
    indices=list(givens)
    rng.shuffle(indices)
    for cell in indices:
        digit=givens.pop(cell)
        try:
            proof=deduce(9,givens,constraints,trace=False,max_tier=max_tier)
            if not proof["solved"] or proof["values"]!=solution:
                givens[cell]=digit
        except ValueError:
            givens[cell]=digit
    return givens


def acceptable(kind, solution, constraints, givens):
    if len(givens)==81:
        return None
    try:
        proof=deduce(9,givens,constraints,max_tier=3)
        if not proof["solved"] or proof["values"]!=solution:
            return None
        # The variant must materially matter. Do not count ornamentation
        # that a standard Sudoku could still solve with the printed givens.
        if not any(proof["techniques"].get(method,0) for method in METHODS[kind]):
            return None
        if count_solutions(9,givens,[]) != 2:
            return None
        if count_solutions(9,givens,constraints) != 1:
            return None
        replayed=replay_trace(9,givens,proof["trace"])
        if any(len(mask)!=1 or next(iter(mask))!=solution[i]
               for i,mask in enumerate(replayed)):
            return None
        # Minimize under the bounded human logic, not just a uniqueness test.
        for i in givens:
            trial=dict(givens)
            del trial[i]
            if deduce(9,trial,constraints,trace=False,max_tier=3)["solved"]:
                return None
        tier=minimum_tier(9,givens,constraints,deduce)
        education=lesson_profile(9,proof)
    except (ValueError,AssertionError):
        return None
    return {"proof":proof,"tier":tier,"education":education}


def make_puzzle(kind, solution, constraints, givens, quality, seed, attempt):
    index=RULES.index(kind)+1
    identifier=f"{FAMILY}-{kind}"
    cages,lines,underlays,overlays,arrows=workshop.render(9,constraints)
    regions=[[[r+dr,c+dc] for dr in range(3) for dc in range(3)]
             for r in (0,3,6) for c in (0,3,6)]
    rules=(
        "标准数独：每行、每列、每个3×3宫都恰有1–9。"
        "\n本关只有一种额外规则，重复的线条或标记都遵循同一规则："
        +RULE_TEXT[kind]+
        "\n全程可以通过逻辑推理解决，无需猜测、试错或枚举假设。"
        "\n技巧说明：https://sudopedia.sudocue.net/index.php?title=Solving_technique"
    )
    return {
        "id":identifier,
        "cells":[[{"value":str(givens[r*9+c])} if r*9+c in givens else {}
                  for c in range(9)] for r in range(9)],
        "regions":regions,
        "cages":cages,"lines":lines,"underlays":underlays,
        "overlays":overlays,"arrows":arrows,
        "metadata":{
            "title":f"少提示·单规则挑战 {index} — {TITLES[kind]}",
            "author":"SudokuPadX Logic Generator",
            "rules":rules,
            "solution":"".join(map(str,solution)),
            "msgcorrect":"完成！本题仅采用一种变体规则，且全程可以纯逻辑解决。",
            "variantFamily":FAMILY,
            "variantTypes":[kind],
            "solverRules":workshop.hint_solver_rules(constraints),
            "generatorSeed":seed,
            "generatorAttempt":attempt,
            "givens":len(givens),
            "logicProfile":{
                "requiresGuessing":False,
                "minimumTier":quality["tier"],
                "techniques":quality["proof"]["techniques"],
                "education":quality["education"],
                "singleVariant":kind,
                "irreducibleWithinTier":3,
            }
        }
    }


def build_one(kind, seed=DEFAULT_SEED, attempts=2):
    if kind not in RULES:
        raise ValueError(f"Unknown single-variant rule {kind}")
    if attempts<1:
        raise ValueError("Number of attempts must be positive")
    rng=random.Random(seed + RULES.index(kind)*12347)
    best=None
    rejected=Counter()
    for attempt in range(1,attempts+1):
        solution=workshop.make_solution(9,rng)
        try:
            constraints=geometry(kind,solution,rng)
            deduce(9,dict(enumerate(solution)),constraints,trace=False)
            givens=dig_minimal(solution,constraints,rng)
            quality=acceptable(kind,solution,constraints,givens)
            if quality is None:
                rejected["quality check"]+=1
                continue
        except ValueError as exc:
            rejected[str(exc)]+=1
            continue
        if best is None or len(givens)<len(best[1]):
            best=(solution,givens,constraints,quality,attempt)
    if best is None:
        raise RuntimeError(f"No valid no-guess {kind} puzzle after {attempts} attempts: {dict(rejected)}")
    solution,givens,constraints,quality,attempt=best
    game=make_puzzle(kind,solution,constraints,givens,quality,seed,attempt)
    proof=quality["proof"]
    record={
        "id":game["id"],"variant":kind,"givens":len(givens),
        "marks":len(constraints),
        "seed":seed,"attempt":attempt,"minimumTier":quality["tier"],
        "techniques":proof["techniques"],
        "logicTrace":proof["trace"],
        "constraints":constraints,
        "solvedGridSha256":sha256(game["metadata"]["solution"].encode()).hexdigest(),
        "classicSolutionCount":2,"variantSolutionCount":1,
        "noGuess":True,"clueIrreducibleWithinTier":3,
    }
    return game,record


def build(seed=DEFAULT_SEED, attempts=2, workers=3, rules=RULES, progress=None):
    rules=tuple(rules)
    if not rules or len(set(rules))!=len(rules):
        raise ValueError("Expected distinct rule families")
    if workers<1:
        raise ValueError("Worker count must be positive")
    specs=[(kind,seed,attempts) for kind in rules]
    if len(specs)==1 or workers==1:
        results=[build_one(*spec) for spec in specs]
    else:
        with ProcessPoolExecutor(max_workers=min(workers,len(specs))) as pool:
            results=list(pool.map(_worker,specs))
    games=[game for game,_ in results]
    records=[record for _,record in results]
    report={"seed":seed,"family":FAMILY,"puzzles":records}
    validate(games,report)
    if progress:
        for record in records:
            progress(f'{record["variant"]}: {record["givens"]} givens / {record["marks"]} marks')
    return games,report


def _worker(args):
    return build_one(*args)


def validate(games,report):
    assert len(games)==len(report["puzzles"])
    assert len({p["id"] for p in games})==len(games)
    for game,entry in zip(games,report["puzzles"]):
        kind=entry["variant"]
        assert kind in RULES
        assert game["id"]==entry["id"]
        assert len(game["cells"])==9 and all(len(row)==9 for row in game["cells"])
        assert {c["type"] for c in entry["constraints"]}=={kind}
        assert game["metadata"]["variantTypes"]==[kind]
        assert entry["classicSolutionCount"]==2
        assert entry["variantSolutionCount"]==1
        assert entry["noGuess"]
        assert entry["clueIrreducibleWithinTier"]==3
        assert entry["minimumTier"] in (1,2,3)
        assert game["metadata"]["logicProfile"]["requiresGuessing"] is False


def export(folder,games,report):
    folder.mkdir(parents=True,exist_ok=True)
    items=[]
    for game,entry in zip(games,report["puzzles"]):
        filename=game["id"]+".json"
        (folder/filename).write_text(
            json.dumps(game,ensure_ascii=False,separators=(",",":"))+"\n",
            encoding="utf-8")
        items.append({"id":game["id"],"title":game["metadata"]["title"],
                      "kind":"standalone","group":FAMILY,
                      "tier":entry["minimumTier"],"givens":entry["givens"],
                      "file":f"puzzles/single-rule/{filename}"})
    (folder/"catalog-entries.json").write_text(
        json.dumps({"items":items},ensure_ascii=False,indent=2)+"\n",
        encoding="utf-8")
    (folder/"validation.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+"\n",
        encoding="utf-8")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed",type=int,default=DEFAULT_SEED)
    parser.add_argument("--attempts",type=int,default=2)
    parser.add_argument("--workers",type=int,default=3)
    parser.add_argument("--rule",choices=RULES,
                        help="Generate only one rule for diagnostics")
    parser.add_argument("--output",type=Path,default=OUTPUT)
    args=parser.parse_args()
    games,report=build(args.seed,args.attempts,args.workers,
                       (args.rule,) if args.rule else RULES,print)
    export(args.output,games,report)
    print(f"Exported {len(games)} clue-minimized single-rule 9x9 puzzles")


if __name__=="__main__":
    main()

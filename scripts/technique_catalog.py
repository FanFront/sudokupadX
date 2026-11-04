"""Stable Chinese vocabulary and learner-friendly technique tiers.

The catalogue is shared by the no-guess solver, generated puzzle metadata,
and the Chinese tutorial. Tier 1: basic constraints and singles; tier 2:
subsets and box/variant interactions; tier 3: short fish and wings; tier 4:
larger fish/XYZ-Wing. This is a curriculum, not an objective rating.
"""
GUIDE_URL = ("https://github.com/FanFront/sudokupadX/"
             "blob/main/docs/techniques.zh-CN.md")
ADVANCED_GUIDE_URL = ("https://github.com/FanFront/sudokupadX/"
                      "blob/main/docs/sudopedia-catalog.zh-CN.md")
ADVANCED_METHODS = frozenset({
    "two_string_kite", "w_wing", "remote_pairs", "color_trap",
    "color_wrap", "xy_chain", "x_chain", "als_xz",
    "finned_x_wing", "squirmbag",
})

# (Chinese name, curriculum tier). Every solver method is accounted for.
METHODS = {
    "peer_elimination": ("同行同列同宫排除", 1),
    "hidden_single": ("隐性唯一数", 1),
    "killer_sum": ("杀手笼组合", 1),
    "thermo": ("温度计递增", 1),
    "kropki": ("黑白点关系", 1),
    "renban": ("连续线", 1),
    "whisper": ("耳语线", 1),
    "arrow": ("箭头求和", 1),
    "xv": ("五与十标记", 1),
    "region_sum": ("区域和线", 1),
    "entropic": ("熵线", 1),
    "modular": ("模三线", 1),
    "between": ("夹心线", 1),
    "naked_subset": ("显性数对／数组", 2),
    "hidden_subset": ("隐性数对／数组", 2),
    "locked_candidate": ("区块锁定候选", 2),
    "killer_innie": ("杀手笼宫内余数", 2),
    "killer_outie": ("杀手笼宫外余数", 2),
    "renban_sum_lock": ("连续线与杀手笼", 2),
    "mixed_consecutive_partition": ("白点与连续线分组", 2),
    "kropki_partition": ("三段白点连续数分区", 2),
    "region_sum_killer_bridge": ("区域和线与杀手笼联动", 2),
    "entropic_modular_cross": ("熵线与模三线交叉", 2),
    "between_renban": ("夹心线与连续线联动", 2),
    "x_wing": ("X-Wing 双行列鱼", 3),
    "swordfish": ("Swordfish 三行列鱼", 3),
    "xy_wing": ("XY-Wing 三格翼", 3),
    "skyscraper": ("摩天楼", 3),
    "jellyfish": ("Jellyfish 四行列鱼", 4),
    "xyz_wing": ("XYZ-Wing 三格翼", 4),
    "two_string_kite": ("双线风筝 2-String Kite", 3),
    "w_wing": ("W-Wing 双数对翼", 3),
    "remote_pairs": ("远程数对 Remote Pairs", 3),
    "color_trap": ("双色标记：颜色陷阱", 4),
    "color_wrap": ("双色标记：颜色包围", 4),
    "xy_chain": ("XY-Chain 双候选链", 4),
    "x_chain": ("X-Chain 单数字链", 4),
    "als_xz": ("ALS-XZ 准锁定数组联动", 4),
    "finned_x_wing": ("鳍形 X-Wing", 4),
    "squirmbag": ("Squirmbag 五行列鱼", 4),
}


def technique_tier(method, source=None):
    if method in ("naked_subset", "hidden_subset") and isinstance(source, dict):
        if source.get("size") == 4:
            return 3
    return METHODS[method][1]


def lesson_profile(n, proof):
    """A small Chinese guided route grounded in *actual* candidate steps."""
    seen, path = set(), []
    for step in proof["trace"]:
        method = step["method"]
        if method not in METHODS:
            raise ValueError("Uncatalogued solver method: " + method)
        if method in seen:
            continue
        seen.add(method)
        cell = step["cell"]
        row, col = divmod(cell, n)
        path.append({
            "method": method,
            "nameZh": METHODS[method][0],
            "tier": technique_tier(method, step["source"]),
            "cell": f"R{row+1}C{col+1}",
            "removed": step["removed"],
            "remaining": step["remaining"],
            "source": step["source"],
            "guideUrl": ADVANCED_GUIDE_URL if method in ADVANCED_METHODS
                        else GUIDE_URL,
        })
    return {"guideUrl": GUIDE_URL,
            "advancedGuideUrl": ADVANCED_GUIDE_URL,
            "maxUsedTier": max((item["tier"] for item in path), default=1),
            "techniquePath": path}


def minimum_tier(n, clues, constraints, deduce):
    """Lowest *implemented* tier that completes the visible puzzle.

    Exact uniqueness counting remains an independent algorithm. Every
    tier solver is deduction-only, so a failure to solve means only that
    this curriculum cannot finish the puzzle at that tier.
    """
    for level in (1, 2, 3, 4):
        try:
            result = deduce(n, clues, constraints, trace=False, max_tier=level)
        except ValueError:
            continue
        if result["solved"]:
            return level
    return None



def replay_trace(n, givens, trace):
    """Independently reconstruct every state shown in a player's lesson.

    This validates *trace fidelity*, not the mathematical soundness of a
    technique. Soundness is separately established by solver rules/tests
    and independent puzzle uniqueness.
    """
    masks = [set(range(1, n+1)) for _ in range(n*n)]
    for cell, digit in givens.items():
        if cell not in range(n*n) or digit not in range(1, n+1):
            raise ValueError("Invalid given in learning trace")
        masks[cell] = {digit}
    for number, step in enumerate(trace):
        cell = step["cell"]
        method = step["method"]
        if cell not in range(n*n) or method not in METHODS:
            raise ValueError(f"Invalid technique step {number}")
        removed = set(step["removed"])
        if not removed or not removed <= masks[cell]:
            raise ValueError(f"Impossible removal at step {number}")
        masks[cell].difference_update(removed)
        if not masks[cell] or sorted(masks[cell]) != step["remaining"]:
            raise ValueError(f"Candidate state mismatch at step {number}")
    return masks

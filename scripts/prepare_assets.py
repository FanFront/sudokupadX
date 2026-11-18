#!/usr/bin/env python3
"""Build reproducible offline puzzle assets only when source code changes.

The frontend and its tests need the same generated JSON and lesson fixtures.
Use a fingerprint to avoid rebuilding them between npm prebuild/pretest.
The GitHub Actions cache persists these files across workflow runs.
Pass --force (or SUDOKUPADX_REGENERATE=1) for full regeneration.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STAMP = ROOT / "public/puzzles/.generator-fingerprint"
REQUIRED = (
    "src/lesson-fixtures.js",
    "public/puzzles/generated/catalog-entries.json",
    "public/puzzles/generated/generated-adventure-1.json",
    "public/puzzles/variants/validation.json",
    "public/puzzles/variants/catalog-entries.json",
    "public/puzzles/batch9/validation.json",
    "public/puzzles/batch9/catalog-entries.json",
    "public/puzzles/single-rule/validation.json",
    "public/puzzles/single-rule/catalog-entries.json",
    "public/puzzles/advanced/validation.json",
    "public/puzzles/advanced/catalog-entries.json",
)
GENERATORS = (
    ("generate_adventure.py",),
    ("generate_variants.py",),
    ("generate_lessons.py",),
    ("generate_batch9.py",),
    ("generate_single_variants.py",),
    ("generate_advanced.py", "--workers", "4"),
)


def fingerprint():
    digest = hashlib.sha256()
    files = sorted((ROOT / "scripts").glob("*.py"))
    files += sorted((ROOT / "docs").glob("*.zh-CN.md"))
    for source in files:
        digest.update(str(source.relative_to(ROOT)).encode("utf-8"))
        digest.update(b"\0")
        digest.update(source.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def complete():
    if not all((ROOT / path).is_file() for path in REQUIRED):
        return False
    batch = ROOT / "public/puzzles/batch9"
    if not all((batch / f"generated-9x9-{i:03d}.json").is_file()
               for i in range(1, 101)):
        return False
    singles = ROOT / "public/puzzles/single-rule"
    if not all((singles / f"single-rule-lab-{kind}.json").is_file()
               for kind in ("killer", "kropki", "thermo",
                            "renban", "arrow", "whisper")):
        return False
    advanced = ROOT / "public/puzzles/advanced"
    return all((advanced / f"advanced-logic-{kind}-t3.json").is_file()
               for kind in ("killer", "kropki", "thermo", "renban"))


def main():
    expected = fingerprint()
    force = "--force" in sys.argv[1:] or os.getenv("SUDOKUPADX_REGENERATE") == "1"
    if (not force and STAMP.is_file()
            and STAMP.read_text(encoding="utf-8").strip() == expected
            and complete()):
        print("Using generated offline puzzle asset cache", flush=True)
        return
    # Never accept an incomplete generation as a cache hit.
    STAMP.unlink(missing_ok=True)
    for args in GENERATORS:
        print(f"Generating offline assets: {args[0]}", flush=True)
        subprocess.run((sys.executable, "-u", str(ROOT / "scripts" / args[0]),
                        *args[1:]), cwd=ROOT, check=True)
    if not complete():
        raise RuntimeError("Offline puzzle asset generation is incomplete")
    STAMP.write_text(expected + "\n", encoding="utf-8")
    print("Generated and certified offline puzzle assets", flush=True)


if __name__ == "__main__":
    main()

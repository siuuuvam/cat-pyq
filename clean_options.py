#!/usr/bin/env python3
"""
Clean QA.json option values that contain the same mathematical answer
concatenated in multiple representations (LaTeX, plain text, HTML entities, etc.).

Strategy:
1. Detect duplication: option text is 'long' (>3 tokens) AND contains
   multiple segments where the same value appears in different forms.
2. For simple duplication (same value × N formats): keep one clean copy.
3. For genuinely multi-valued options (e.g. "x < -5 or 3 < x < 9"): flag manual review.
4. For set-notation with mixed LaTeX/HTML fragments: flag manual review.
"""

import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

BASE = r"C:\Users\soova\Desktop\CAT\PYQs\project pyq new\data"

# ── helpers ─────────────────────────────────────────────────────────────────

def normalize_spaces(s: str) -> str:
    """Collapse runs of whitespace to single space, strip ends."""
    return re.sub(r"[ \t]+", " ", s).strip()

def strip_unicode_artifacts(s: str) -> str:
    """Remove stray unicode replacement chars / zero-width spaces."""
    return re.sub(r"[\ufeff\u200b\u2011\u2013\u2014\u2015\u2019\u2018\u201c\u201d]+", "", s)

def strip_html_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s)

def is_bracket_like(s: str) -> bool:
    return bool(re.search(r"[\u201c\u201d\u00ab\u00bb\(\)\[\]\{\}]", s))

# ── value normalisation ─────────────────────────────────────────────────────

def _strip_parens_for_compare(s: str) -> str:
    s = s.strip()
    if s.startswith("(") and s.endswith(")"):
        inner = s[1:-1].strip()
        if re.match(r"^[\d\s\.,\-−<>]+$", inner):
            return inner
    return s

def normalise_for_compare(s: str) -> str:
    s = strip_unicode_artifacts(s)
    s = strip_html_tags(s)
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-")
    s = s.replace("≠", "!=").replace("≤", "<=").replace("≥", ">=")
    s = s.replace("−", "-").replace("–", "-")
    s = re.sub(r"\\[a-zA-Z]+\s*\{([^}]*)\}", r"\1", s)   # \frac{a}{b}→a b
    s = re.sub(r"\\left\(", "(", s)
    s = re.sub(r"\\right\)", ")", s)
    s = re.sub(r"\\[a-zA-Z]+", "", s)
    return s.strip()

def values_look_same(v1: str, v2: str) -> bool:
    """Return True if v1 and v2 appear to be the same mathematical value."""
    n1 = normalise_for_compare(v1)
    n2 = normalise_for_compare(v2)
    if n1 == n2:
        return True
    # also try stripping outer parentheses for interval-style values
    if _strip_parens_for_compare(n1) == _strip_parens_for_compare(n2):
        return True
    return False

# ── duplication detection ────────────────────────────────────────────────────

def get_option_segments(txt: str):
    """
    Try to split an option into its constituent 'value' segments.
    The scraper bug manifests as the same value repeated N times.
    Separators between repetitions are typically ' or ' or just spaces.
    Returns list of segments (strings), possibly with leading/trailing noise.
    """
    # Normalise whitespace first
    t = normalize_spaces(strip_unicode_artifacts(txt))
    # Split on ' or ' (the logical-OR separator that appears in inequality answers)
    segments = re.split(r"\s+or\s+", t)
    return [s.strip() for s in segments if s.strip()]

def has_duplicate_pattern(txt: str) -> bool:
    """
    True if the option text shows clear evidence of duplication:
    - Has > 3 whitespace-separated tokens, AND
    - Contains LaTeX fragments, AND
    - The same value appears in 2+ different representations.
    """
    tokens = txt.split()
    if len(tokens) <= 3:
        return False
    # Must have at least one latex-like fragment
    if not re.search(r"\\[a-zA-Z]+\{", txt):
        # Could still be repeated plain-text inequality like 'a > 5 a>5 a > 5'
        # Detect: same token pattern appears 2+ times
        uniq = set(tokens)
        if len(uniq) < len(tokens) * 0.5 and len(tokens) > 6:
            return True
        return False
    return True

def is_multi_value_option(segments: list) -> bool:
    """
    Return True if the segments represent genuinely different mathematical values
    (i.e. NOT just different formats of the same value).
    E.g. 'x < -5' and '3 < x < 9' are different values → multi-value.
    """
    if len(segments) <= 1:
        return False
    # Compare all pairs
    for i in range(len(segments)):
        for j in range(i + 1, len(segments)):
            if not values_look_same(segments[i], segments[j]):
                return True
    return False

def has_set_notation_bug(txt: str) -> bool:
    """
    Detect options that contain multiple distinct LaTeX values mixed with
    HTML-fragment artifacts (set notation bug).
    E.g. '\sqrt{x}, \sqrt{z} x  , z  and y \sqrt{y}'
    """
    t = strip_unicode_artifacts(txt)
    # Multiple LaTeX \command blocks
    n_latex = len(re.findall(r"\\[a-zA-Z]+\{", t))
    if n_latex < 2:
        return False
    # If there are multiple distinct \sqrt{X} with different X values, it's multi-value
    sqrt_vals = re.findall(r"\\sqrt\{([^}]+)\}", t)
    unique_sqrts = set(normalise_for_compare(v) for v in sqrt_vals)
    if len(unique_sqrts) > 1:
        return True
    # Multiple distinct \frac values
    frac_vals = re.findall(r"\\frac\{([^}]+)\}\{([^}]+)\}", t)
    unique_fracs = set()
    for num, den in frac_vals:
        unique_fracs.add(normalise_for_compare(f"{num}/{den}"))
    if len(unique_fracs) > 1:
        return True
    return False

# ── value extraction ─────────────────────────────────────────────────────────

def pick_best_form(segment: str) -> str:
    """
    From one 'segment' that may still contain multiple representations,
    extract the cleanest single value.
    Prefer: LaTeX with spaces > compact LaTeX > plain text.
    """
    t = strip_unicode_artifacts(segment)
    t = strip_html_tags(t)
    t = normalize_spaces(t)

    # Try to find a single LaTeX math expression
    # Patterns: \frac{..}{..}, \sqrt{..}, \left(..\right), plain inequalities
    latex_fracs = re.findall(r"\\[a-zA-Z]+\{[^}]+\}(?:\{[^}]+\})?", t)
    if latex_fracs:
        # Prefer the one that looks most like a complete value
        # e.g. '\frac{8}{3}' over '\frac{x^{7}}{x^{2\sqrt{3}}}'
        # (simple fractions and radicals are usually the bug; complex nested ones are not)
        for lf in latex_fracs:
            if re.match(r"^\\(?:frac|sqrt)\{[^}]+\}(?:\{[^}]+\})?$", lf.strip()):
                return lf.strip()

    # Look for compact LaTeX math at end of string (e.g., '3<a<4')
    compact = re.search(r"([\d<>=a-zA-Z\\]+<[\d<>=a-zA-Z\\]+<[\d<>=a-zA-Z\\]+)$", t)
    if compact:
        return compact.group(1).strip()

    # Look for standard form: 'num : num', 'num < num < num', 'a > num'
    m = re.search(
        r"(\d+\s*:\s*\d+|\d+\s*<\s*[a-zA-Z]\s*<\s*\d+|[a-zA-Z]\s*[<>]=?\s*\d+|\d+\s*[<>]=?\s*[a-zA-Z])$",
        t,
    )
    if m:
        return m.group(1).strip()

    # Interval: '( a , b )'
    m = re.search(r"(\(\s*[^)]+\s*\))$", t)
    if m:
        return m.group(1).strip()

    # Fallback: last non-trivial token
    tokens = t.split()
    if tokens:
        return tokens[-1]
    return t


def clean_option_value(txt: str) -> tuple[str, str]:
    """
    Clean a duplicated option value.
    Returns (cleaned_text, action) where action is one of:
      'cleaned'   – value was deduplicated
      'review'    – flagged for manual review (multi-value or set-notation)
      'unchanged' – no change needed
    """
    if not has_duplicate_pattern(txt):
        return txt, "unchanged"

    segments = get_option_segments(txt)

    # Check for multi-value (genuinely different values joined by 'or')
    if is_multi_value_option(segments):
        return txt, "review"

    # Check for set-notation / HTML fragment bug
    if has_set_notation_bug(txt):
        return txt, "review"

    # All segments represent the same value – pick the cleanest one
    if len(segments) >= 2:
        last_seg = segments[-1]
        best = pick_best_form(last_seg)
        if best and best != txt:
            return normalize_spaces(best), "cleaned"

    # Fallback: try splitting by spaces and deduplicate
    tokens = txt.split()
    if len(tokens) > 3:
        # Group every N tokens (N = len(tokens) / repetition_count)
        # Find the repetition count
        n = len(tokens)
        for rep_count in range(2, n // 2):
            if n % rep_count == 0:
                group_size = n // rep_count
                groups = [tokens[i * group_size : (i + 1) * group_size] for i in range(rep_count)]
                norms = [normalise_for_compare(" ".join(g)) for g in groups]
                if len(set(norms)) == 1:
                    best_group = groups[-1]
                    return normalize_spaces(" ".join(best_group)), "cleaned"

    return txt, "unchanged"


# ── main processing ──────────────────────────────────────────────────────────

def find_qa_files(base_dir: str) -> list:
    qa_files = []
    for year in sorted(os.listdir(base_dir)):
        yeardir = os.path.join(base_dir, year)
        if not os.path.isdir(yeardir):
            continue
        for slot in sorted(os.listdir(yeardir)):
            fpath = os.path.join(yeardir, slot, "QA.json")
            if os.path.isfile(fpath):
                qa_files.append(fpath)
    return qa_files


def process_files(qa_files: list, dry_run: bool = True) -> dict:
    results = {}
    per_file_counts = {}
    manual_review = []

    for fpath in qa_files:
        with open(fpath, encoding="utf-8") as fh:
            data = json.load(fh)

        cleaned_here = 0
        review_here = []

        for qi, q in enumerate(data.get("questions", [])):
            opts = q.get("options", [])
            if not opts:
                continue
            for opt in opts:
                old = opt.get("text", "")
                new, action = clean_option_value(old)
                if action == "cleaned" and new != old:
                    opt["text"] = new
                    cleaned_here += 1
                    results.setdefault(fpath, []).append(
                        {
                            "file": fpath,
                            "q_num": q.get("question_number", qi),
                            "q_idx": qi,
                            "opt_label": opt.get("label", ""),
                            "before": old,
                            "after": new,
                        }
                    )
                elif action == "review":
                    review_here.append(
                        {
                            "q_num": q.get("question_number", qi),
                            "q_idx": qi,
                            "opt_label": opt.get("label", ""),
                            "text": old,
                        }
                    )
                    manual_review.append(
                        {
                            "file": fpath,
                            "q_num": q.get("question_number", qi),
                            "q_idx": qi,
                            "opt_label": opt.get("label", ""),
                            "text": old,
                        }
                    )

        per_file_counts[fpath] = {"cleaned": cleaned_here, "review": len(review_here)}

        if cleaned_here > 0 and not dry_run:
            # backup before writing
            bak = fpath + ".bak"
            if not os.path.exists(bak):
                import shutil
                shutil.copy2(fpath, bak)
            with open(fpath, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)

    return per_file_counts, manual_review, results


# ── report ───────────────────────────────────────────────────────────────────

def print_report(per_file_counts, manual_review, results, sample_n=5):
    total_cleaned = sum(v["cleaned"] for v in per_file_counts.values())
    total_review = sum(v["review"] for v in per_file_counts.values())
    files_with_changes = [(k, v) for k, v in per_file_counts.items() if v["cleaned"] > 0]
    files_with_review = [(k, v) for k, v in per_file_counts.items() if v["review"] > 0]

    print(f"\n{'='*70}")
    print(f"CLEANING REPORT")
    print(f"{'='*70}")
    print(f"\nTotal QA files scanned : {len(per_file_counts)}")
    print(f"Files with cleaned opts: {len(files_with_changes)}")
    print(f"Total options cleaned  : {total_cleaned}")
    print(f"Total flagged review   : {total_review}")

    print(f"\n{'─'*70}")
    print("OPTIONS CLEANED PER FILE")
    print(f"{'─'*70}")
    if files_with_changes:
        for fpath, cnt_dict in sorted(files_with_changes):
            short = fpath.replace(BASE + os.sep, "")
            print(f"  {cnt_dict['cleaned']:4d}  {short}")
    else:
        print("  (none)")

    print(f"\n{'─'*70}")
    print("QUESTIONS FLAGGED FOR MANUAL REVIEW")
    print(f"{'─'*70}")
    if manual_review:
        for item in manual_review:
            short = item["file"].replace(BASE + os.sep, "")
            print(f"  {short}  q{item['q_num']}  opt {item['opt_label']}")
            print(f"    text: {repr(item['text'][:120])}")
    else:
        print("  (none)")

    print(f"\n{'─'*70}")
    print(f"SAMPLE FIXED ENTRIES (first {sample_n})")
    print(f"{'─'*70}")
    all_fixed = []
    for fpath, items in results.items():
        for item in items:
            all_fixed.append(item)
    for item in all_fixed[:sample_n]:
        short = item["file"].replace(BASE + os.sep, "")
        print(f"  [{short}] q{item['q_num']} opt {item['opt_label']}")
        print(f"    BEFORE: {repr(item['before'])}")
        print(f"    AFTER : {repr(item['after'])}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write cleaned files (default: dry-run)")
    parser.add_argument("--sample", type=int, default=5, help="Number of sample entries to show")
    args = parser.parse_args()

    qa_files = find_qa_files(BASE)
    print(f"Scanning {len(qa_files)} QA files...")
    per_file_counts, manual_review, results = process_files(qa_files, dry_run=not args.apply)
    print_report(per_file_counts, manual_review, results, sample_n=args.sample)

    if not args.apply:
        print(f"\n{'─'*70}")
        print("DRY RUN – no files modified. Re-run with --apply to write changes.")
        print(f"{'─'*70}")

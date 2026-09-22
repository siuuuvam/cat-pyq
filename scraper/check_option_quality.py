"""
Regression check: scan all option text in CAT PYQ data files for:
1. Leftover raw LaTeX syntax (backslashes in option text — these should be rendered by KaTeX)
2. Duplication patterns (same value repeated multiple times)
3. Zero-width spaces (artifacts from KaTeX rendering)

Run: python scraper/check_option_quality.py
"""
import json
import re
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
ZWS = '\u200B'
ZWJ = '\u2060'


def check_file(filepath):
    """Check a single JSON file for option quality issues."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    issues = []

    for q in data.get('questions', []):
        qnum = q.get('question_number', '?')
        for opt in q.get('options', []):
            text = opt.get('text', '')
            label = opt.get('label', '?')

            # Check 1: Zero-width spaces
            if ZWS in text or ZWJ in text:
                issues.append({
                    'type': 'zws',
                    'q': qnum,
                    'opt': label,
                    'text': text[:60]
                })

            # Check 2: Duplicate patterns (same substring repeated)
            if has_obvious_duplication(text):
                issues.append({
                    'type': 'duplicate',
                    'q': qnum,
                    'opt': label,
                    'text': text[:60]
                })

            # Check 3: Multiple backslash commands in a short option
            # (indicates multiple LaTeX expressions concatenated)
            bs_count = text.count('\\')
            if bs_count > 5 and len(text) < 80:
                issues.append({
                    'type': 'many_commands',
                    'q': qnum,
                    'opt': label,
                    'text': text[:60],
                    'count': bs_count
                })

    return issues


def has_obvious_duplication(text):
    """Check for obvious duplication patterns."""
    if not text:
        return False

    # Simple token duplication
    tokens = text.split()
    n = len(tokens)
    if n >= 4 and n % 2 == 0:
        half = n // 2
        if tokens[:half] == tokens[half:]:
            return True

    return False


def main():
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    json_files = sorted(glob.glob(os.path.join(DATA_DIR, '**', '*.json'), recursive=True))
    total_issues = 0
    total_files = 0

    for filepath in json_files:
        rel = os.path.relpath(filepath, DATA_DIR)
        issues = check_file(filepath)
        if issues:
            total_files += 1
            total_issues += len(issues)
            print(f"\n  {rel}: {len(issues)} issues")
            for iss in issues[:5]:
                print(f"    [{iss['type']}] Q{iss['q']}-{iss['opt']}: {iss['text']}")
            if len(issues) > 5:
                print(f"    ... and {len(issues) - 5} more")

    print(f"\n{'='*60}")
    if total_issues == 0:
        print("All option text is clean!")
    else:
        print(f"Found {total_issues} issues across {total_files} files")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()

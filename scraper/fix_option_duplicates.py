"""
Fix duplicated option text in CAT PYQ JSON data files.

The scraper produced option text with triple-concatenated representations:
  <rendered_text> <latex_source> <rendered_with_zero_width_spaces>

Strategy: Find the FIRST LaTeX backslash command in the text. Everything from
that backslash to the end of the LAST complete command (with balanced braces)
is the expression. Strip trailing junk by checking for duplicate numbers.

Run: python scraper/fix_option_duplicates.py
"""
import json
import re
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
ZWS = '\u200B'  # zero-width space


def extract_clean_option(text):
    """Extract clean LaTeX from duplicated option text."""
    if not text or not isinstance(text, str):
        return text

    has_bs = '\\' in text
    has_zws = ZWS in text

    if not has_bs and not has_zws:
        return text.strip()

    if has_bs:
        return extract_from_mixture(text)

    if has_zws:
        return text.replace(ZWS, '').strip()

    return text.strip()


def extract_from_mixture(text):
    """Extract LaTeX from text with backslashes + ZWS."""
    clean = text.replace(ZWS, '')
    first_bs = clean.find('\\')
    if first_bs < 0:
        return text.strip()

    raw = clean[first_bs:]

    # Find all backslash command spans (command + subscript/superscript + brace args)
    spans = find_command_spans(raw)

    if not spans:
        return raw.strip()

    # Core expression = from first char to end of last command span
    last_end = spans[-1][1]
    core = raw[:last_end]
    after = raw[last_end:]

    # Strip trailing junk: only strip if after has no balanced delimiters
    # and contains a number that's already in the core
    if after.strip():
        core_numbers = set(re.findall(r'\d+\.?\d*', core))
        after_numbers = set(re.findall(r'\d+\.?\d*', after))

        # If trailing content has delimiters like (), [], it's part of expression
        has_delims = bool(re.search(r'[()\[\]{}]', after))

        if not has_delims and after_numbers & core_numbers:
            # Trailing junk with duplicate numbers — strip it
            return core.strip()

    return core.strip()


def find_command_spans(text):
    """Find all LaTeX command spans in text. A span = \\command + sub/sup + brace args."""
    spans = []
    i = 0
    n = len(text)

    while i < n:
        if text[i] == '\\':
            start = i
            j = i + 1
            if j < n and text[j].isalpha():
                # Read command name
                while j < n and text[j].isalpha():
                    j += 1
                # Read subscript/superscript
                j = read_sub_sup(text, j)
                # Read brace args (for frac, sqrt, etc.)
                j = read_brace_args(text, j)
                spans.append((start, j))
                i = j
            elif j < n and text[j] in '{}':
                spans.append((start, j + 1))
                i = j + 1
            elif j < n:
                # Single-char command like \%, \,
                spans.append((start, j + 1))
                i = j + 1
            else:
                i += 1
        else:
            i += 1
    return spans


def read_sub_sup(text, i):
    """Read subscript/superscript after a command name."""
    n = len(text)
    while i < n and text[i] in '_^':
        i += 1
        if i < n and text[i] == '{':
            i = read_balanced_braces(text, i)
        elif i < n:
            i += 1  # single char subscript like _2
    return i


def read_brace_args(text, i):
    """Read brace-delimited arguments, skipping spaces between them."""
    n = len(text)
    while i < n:
        if text[i] == ' ':
            # Peek: skip spaces only if followed by { or \
            j = i + 1
            while j < n and text[j] == ' ':
                j += 1
            if j < n and text[j] in '{\\':
                i = j
                continue
            else:
                break
        elif text[i] == '{':
            i = read_balanced_braces(text, i)
        else:
            break
    return i


def read_balanced_braces(text, i):
    """Read a balanced {...} group starting at text[i] == '{'. Returns index after '}'."""
    n = len(text)
    depth = 1
    i += 1
    while i < n and depth > 0:
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
        i += 1
    return i


def has_duplication(text):
    """Check if option text likely has the duplication bug."""
    if not text or not isinstance(text, str):
        return False
    has_zws = ZWS in text
    has_bs = '\\' in text

    if has_bs and has_zws:
        return True
    if has_bs:
        idx = text.find('\\')
        before = text[:idx].strip()
        if before and len(before) > 1:
            return True

    tokens = text.split()
    if len(tokens) >= 4:
        half = len(tokens) // 2
        if len(tokens) % 2 == 0 and tokens[:half] == tokens[half:]:
            return True

    return False


def process_file(filepath):
    """Process a single JSON file and fix duplicated option text."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    fixed_count = 0
    changes = []

    for q in data.get('questions', []):
        for opt in q.get('options', []):
            original = opt.get('text', '')
            if has_duplication(original):
                fixed = extract_clean_option(original)
                if fixed != original and fixed:
                    opt['text'] = fixed
                    fixed_count += 1
                    changes.append({
                        'q': q.get('question_number'),
                        'label': opt.get('label'),
                        'before': original[:120],
                        'after': fixed[:120]
                    })

    if fixed_count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    return fixed_count, changes


def main():
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    total_fixed = 0
    total_files = 0
    all_changes = []

    json_files = sorted(glob.glob(os.path.join(DATA_DIR, '**', '*.json'), recursive=True))

    for filepath in json_files:
        rel = os.path.relpath(filepath, DATA_DIR)
        count, changes = process_file(filepath)
        if count > 0:
            total_files += 1
            total_fixed += count
            print(f"\n  {rel}: {count} options fixed")
            for c in changes[:3]:
                print(f"    Q{c['q']}-{c['label']}:")
                print(f"      BEFORE: {c['before']}")
                print(f"      AFTER:  {c['after']}")
            if len(changes) > 3:
                print(f"    ... and {len(changes) - 3} more")
            all_changes.extend(changes)

    print(f"\n{'='*60}")
    print(f"Total: {total_fixed} options fixed across {total_files} files")
    print(f"{'='*60}")

    if all_changes:
        print("\nBEFORE/AFTER EXAMPLES:")
        print("-" * 60)
        for c in all_changes[:15]:
            print(f"  Q{c['q']}-{c['label']}:")
            print(f"    BEFORE: {c['before']}")
            print(f"    AFTER:  {c['after']}")
            print()


if __name__ == '__main__':
    main()

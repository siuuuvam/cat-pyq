"""Patch existing JSON files to fix duplicated KaTeX text in options."""
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(r"C:\Users\soova\Desktop\CAT\PYQs\project pyq new")
DATA_DIR = PROJECT_ROOT / "data"


def find_matching_close(text, start):
    i = start
    depth = 1
    while i < len(text) and depth > 0:
        c = text[i]
        if c in '({[':
            depth += 1
        elif c in ')}]':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return start + 1


def extract_raw_latex(text):
    if '\\' not in text:
        return None

    m = re.search(r'[+\-]?\s*(\\[a-zA-Z]+)', text)
    if not m:
        return None

    start = m.start()
    raw_start = m.start(1)
    raw_end = find_matching_close(text, m.end(1) - 1)
    raw = text[raw_start:raw_end].strip()

    if not re.search(r'\\[a-zA-Z]', raw):
        return None
    return raw


def dedup_option_text(text):
    text = text.strip()
    if not text:
        return text

    words = text.split()
    if len(words) >= 2:
        mid = len(words) // 2
        first = ' '.join(words[:mid])
        second = ' '.join(words[mid:])
        if first == second:
            return first

    raw = extract_raw_latex(text)
    if raw:
        return raw

    return text


def patch_file(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    changed = False

    for q in data.get("questions", []):
        if q.get("options"):
            for opt in q["options"]:
                original = opt.get("text", "")
                fixed = dedup_option_text(original)
                if fixed != original:
                    opt["text"] = fixed
                    changed = True

        if q.get("question_text") and "<" not in q["question_text"]:
            original = q["question_text"]
            fixed = dedup_option_text(original)
            if fixed != original:
                q["question_text"] = fixed
                changed = True

        if q.get("explanation_text") and "<" not in q["explanation_text"]:
            original = q["explanation_text"]
            fixed = dedup_option_text(original)
            if fixed != original:
                q["explanation_text"] = fixed
                changed = True

    if changed:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Patched: {path}")
    else:
        print(f"No changes: {path}")


def main():
    json_files = sorted(DATA_DIR.rglob("*.json"))
    print(f"Found {len(json_files)} JSON files")
    for f in json_files:
        patch_file(f)
    print("Done.")


if __name__ == "__main__":
    main()

"""
CAT PYQ Scraper for aftergrad.in
=================================
Scrapes CAT past year questions and explanations from aftergrad.in.
Saves structured JSON and downloads question/explanation images.

Output paths:
  - JSON : data/{year}/slot-{n}/{SECTION}.json
  - Images: assets/images/{year}/slot-{n}/{section}/q{question_number}/{filename}
"""

import os
import re
import json
import time
import hashlib
import logging
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from PIL import Image

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "https://www.aftergrad.in"
OUTPUT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = OUTPUT_ROOT / "data"
IMAGES_DIR = OUTPUT_ROOT / "assets" / "images"

YEARS = list(range(2020, 2026))
SLOTS = ["slot-1", "slot-2", "slot-3"]
SECTIONS = ["VARC", "DILR", "QA"]

REQUEST_DELAY_MIN = 1.0
REQUEST_DELAY_MAX = 2.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def delay() -> None:
    """Sleep for a random duration between REQUEST_DELAY_MIN and REQUEST_DELAY_MAX."""
    time.sleep(REQUEST_DELAY_MIN + (time.time() % 1.0) * (REQUEST_DELAY_MAX - REQUEST_DELAY_MIN))


def absolute_url(url: str) -> str:
    """Resolve a possibly-relative URL against BASE_URL."""
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    return urllib.parse.urljoin(BASE_URL, url)


def sanitize_filename(name: str) -> str:
    """Remove characters that are unsafe in filenames."""
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def file_hash(filepath: Path) -> str:
    """Return MD5 hash of a file's contents."""
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_katex_annotations(element: BeautifulSoup) -> None:
    """Remove KaTeX MathML annotation elements that duplicate rendered text."""
    for mathml in element.find_all("span", class_="katex-mathml"):
        mathml.decompose()
    for annotation in element.find_all("annotation"):
        annotation.decompose()
    for mrow in element.find_all("mrow"):
        mrow.decompose()


# ---------------------------------------------------------------------------
# Image Downloading
# ---------------------------------------------------------------------------


def detect_image_ext(content: bytes, content_type: str = "") -> str:
    """Detect image extension from content magic bytes or Content-Type."""
    if content_type:
        ct = content_type.lower()
        if "jpeg" in ct or "jpg" in ct:
            return ".jpg"
        if "png" in ct:
            return ".png"
        if "gif" in ct:
            return ".gif"
        if "webp" in ct:
            return ".webp"
        if "svg" in ct:
            return ".svg"
        if "bmp" in ct:
            return ".bmp"
    if len(content) >= 12:
        magic = content[:12]
        if magic[:2] == b"\xff\xd8":
            return ".jpg"
        if magic[:4] == b"\x89PNG":
            return ".png"
        if magic[:6] in (b"GIF87a", b"GIF89a"):
            return ".gif"
        if magic[:4] == b"RIFF" and magic[8:12] == b"WEBP":
            return ".webp"
        if magic[:5] == b"<?xml" or magic[:4] == b"<svg":
            return ".svg"
        if magic[:2] == b"BM":
            return ".bmp"
    return ".img"


def download_image(img_url: str, dest_dir: Path) -> Optional[str]:
    """
    Download an image to dest_dir, deduplicating by content hash.

    Returns the relative path from project root (e.g. 'assets/images/...')
    or None if the download fails.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    parsed = urllib.parse.urlparse(img_url)
    filename = sanitize_filename(os.path.basename(parsed.path))

    if not filename or "." not in filename:
        qs = urllib.parse.parse_qs(parsed.query)
        if "url" in qs:
            orig_path = urllib.parse.unquote(qs["url"][0])
            filename = sanitize_filename(os.path.basename(orig_path))

    if not filename:
        filename = f"img_{int(time.time() * 1000)}"

    # Strip any existing extension — we'll add the correct one after download
    base_name = filename
    if "." in base_name:
        base_name = base_name.rsplit(".", 1)[0]

    dest_path_base = dest_dir / base_name

    # Skip if already downloaded (any extension)
    for existing in dest_dir.iterdir():
        if existing.is_file() and existing.stem == base_name:
            logger.debug("Image already exists, skipping: %s", existing)
            return str(existing.relative_to(OUTPUT_ROOT)).replace("\\", "/")

    try:
        delay()
        resp = requests.get(img_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()

        content = resp.content
        ext = detect_image_ext(content, resp.headers.get("Content-Type", ""))
        dest_path = dest_dir / f"{base_name}{ext}"

        # Deduplicate by content hash
        img_hash = hashlib.md5(content).hexdigest()
        for existing in dest_dir.iterdir():
            if existing.is_file() and existing != dest_path and file_hash(existing) == img_hash:
                logger.debug("Duplicate image detected, reusing: %s", existing)
                return str(existing.relative_to(OUTPUT_ROOT)).replace("\\", "/")

        dest_path.write_bytes(content)
        logger.info("Downloaded image: %s", dest_path)
        return str(dest_path.relative_to(OUTPUT_ROOT)).replace("\\", "/")

    except Exception as exc:
        logger.warning("Failed to download image %s: %s", img_url, exc)
        return None


# ---------------------------------------------------------------------------
# Parsing Helpers
# ---------------------------------------------------------------------------


def parse_difficulty(soup: BeautifulSoup) -> str:
    """
    Extract difficulty from a colored pill.
    Looks for <p aria-label="Difficulty: Hard">Hard</p> etc.
    """
    pill = soup.find("p", attrs={"aria-label": re.compile(r"Difficulty:", re.I)})
    if pill:
        text = pill.get_text(strip=True)
        return text if text else ""

    for cls in ["bg-green-200", "bg-green-100", "bg-amber-200", "bg-amber-100",
                "bg-yellow-200", "bg-yellow-100", "bg-red-200", "bg-red-100"]:
        el = soup.find("p", class_=re.compile(cls))
        if el:
            text = el.get_text(strip=True)
            if text:
                return text
    return ""


def parse_category_subtopic(soup: BeautifulSoup) -> Tuple[str, str]:
    """
    Parse category and sub-topic from blue pill.
    Expected format: 'VA > Odd One Out'
    """
    for cls in ["bg-blue-100", "bg-blue-200", "bg-blue-50"]:
        el = soup.find(class_=re.compile(cls))
        if not el:
            continue

        for sep_el in el.find_all("span"):
            if sep_el.get_text(strip=True) in (">", ">>", "&gt;", "›"):
                sep_el.decompose()

        texts = [t.strip() for t in el.stripped_strings if t.strip() and t.strip() not in (">", ">>", "›")]
        if len(texts) >= 2:
            return texts[0], texts[1]
        if len(texts) == 1:
            combined = texts[0]
            for sep in [">>", ">", "›"]:
                if sep in combined:
                    parts = combined.split(sep, 1)
                    if len(parts) == 2:
                        return parts[0].strip(), parts[1].strip()
    return "", ""


def inner_html(element: BeautifulSoup) -> str:
    if element is None:
        return ""
    return str(element.decode_contents()).strip()


def parse_passage(article: BeautifulSoup, dest_dir: Path) -> Tuple[str, str, List[str]]:
    """
    Extract passage HTML, type, and images from the question article.
    Returns HTML string to preserve tables, formatting, and structure.
    """
    passage_html = ""
    passage_type = "Unknown"
    image_paths: List[str] = []

    passage_div = None
    for attr_name in ["aria-label", "aria-labelledby"]:
        for pattern, ptype in [
            (r"Comprehension passage", "RC"),
            (r"DILR set|DILR Set", "DILR"),
            (r"QA set|QA Set", "QA"),
            (r"Set information|set-info", "DILR"),
            (r"Passage", "RC"),
            (r"Set", "DILR"),
        ]:
            passage_div = article.find("div", attrs={attr_name: re.compile(pattern, re.I)})
            if passage_div:
                passage_type = ptype
                break
        if passage_div:
            break

    if not passage_div:
        for cls in ["passage", "comprehension", "rc-text", "set-text"]:
            passage_div = article.find("div", class_=re.compile(cls, re.I))
            if passage_div:
                passage_type = "RC"
                break

    if passage_div:
        for img in passage_div.find_all("img"):
            src = img.get("src", "")
            abs_src = absolute_url(src)
            local = download_image(abs_src, dest_dir)
            if local:
                image_paths.append(local)
            img.decompose()

        clean_katex_annotations(passage_div)

        latex_container = passage_div.find("div", class_="responsive-latex-container")
        if latex_container:
            passage_html = inner_html(latex_container)
        else:
            passage_html = inner_html(passage_div)

    return passage_html, passage_type, image_paths


def parse_question_text(article: BeautifulSoup) -> str:
    """Extract the main question text from the article as HTML."""
    soup = BeautifulSoup(str(article), "lxml")

    for tag in soup.find_all(["script", "style"]):
        tag.decompose()

    for div in soup.find_all("div", attrs={"aria-label": re.compile(r"passage|set|comprehension", re.I)}):
        div.decompose()

    for selector in [
        {"aria-label": re.compile(r"reveal correct answer|solution explanation", re.I)},
    ]:
        for div in soup.find_all("div", selector):
            div.decompose()

    for a in soup.find_all("a"):
        if a.find(string=re.compile(r"Explanation", re.I)):
            a.decompose()

    for label in soup.find_all("label", string=re.compile(r"Entered answer", re.I)):
        label.decompose()

    for fieldset in soup.find_all("fieldset"):
        fieldset.decompose()

    for span in soup.find_all("span", class_=re.compile(r"bg-blue|bg-amber|bg-green|bg-red|bg-yellow")):
        span.decompose()
    for p in soup.find_all("p", class_=re.compile(r"bg-blue|bg-amber|bg-green|bg-red|bg-yellow")):
        p.decompose()
    for div in soup.find_all("div", class_=re.compile(r"bg-blue|bg-amber|bg-green|bg-red|bg-yellow")):
        div.decompose()

    for h in soup.find_all(["h1", "h2", "h3"]):
        h.decompose()

    clean_katex_annotations(soup)

    main_container = soup.find("div", attrs={"aria-labelledby": re.compile(r"question-(?!cat\d+-title)", re.I)})
    if not main_container:
        main_container = soup.find("div", class_=re.compile(r"question-content|question-body|latex-wrapper", re.I))
    if not main_container:
        main_container = soup.find("main")
    if not main_container:
        main_container = soup

    return inner_html(main_container)


def parse_options(article: BeautifulSoup) -> Tuple[List[Dict[str, str]], str]:
    """
    Parse options from the question article.

    Returns:
        (options_list, question_type)
        options_list: [{"label": "A", "text": "..."}, ...]
        question_type: "MCQ" or "TITA"
    """
    options: List[Dict[str, str]] = []
    question_type = "MCQ"

    fieldset = article.find("fieldset")
    if fieldset:
        labels = fieldset.find_all("label")
        for i, label in enumerate(labels):
            katex = label.find("span", class_="katex")
            if katex:
                annotation = katex.find("annotation", encoding="application/x-tex")
                if annotation and annotation.get_text(strip=True):
                    label_text = annotation.get_text(strip=True)
                else:
                    label_text = katex.get_text(separator=" ", strip=True)
            else:
                label_text = label.get_text(separator=" ", strip=True)
                label_text = re.sub(r"^\s*(?:[A-Da-d][.)]\s*|[\d]+[.)]?\s*)", "", label_text, count=1).strip()
            if not label_text or len(label_text) < 1:
                label_text = label.get_text(separator=" ", strip=True)
            options.append({"label": chr(65 + i), "text": label_text})
        return options, "MCQ"

    textarea = article.find("textarea")
    input_el = article.find("input", attrs={"type": re.compile(r"text|number", re.I)})
    entered_label = article.find("label", string=re.compile(r"Entered answer", re.I))
    if textarea or input_el or entered_label:
        return [], "TITA"

    return [], "TITA"


def parse_correct_answer(article: BeautifulSoup) -> str:
    """Extract the correct answer from the gray answer box."""
    gray_box = article.find("div", class_=re.compile(r"bg-gray-200|bg-gray-100|bg-gray-300"))
    if gray_box:
        text = gray_box.get_text(separator=" ", strip=True)
        text = re.sub(r"^(Correct Answer|Answer|Ans)[:\s]*", "", text, flags=re.I).strip()
        return text

    ans_el = article.find(attrs={"aria-label": re.compile(r"answer", re.I)})
    if ans_el:
        return ans_el.get_text(strip=True)

    return ""


# ---------------------------------------------------------------------------
# Listing Page Parsing
# ---------------------------------------------------------------------------


def parse_listing_page(html: str, year: int, slot: str, section: str) -> List[Dict[str, Any]]:
    """
    Parse the listing page HTML and return a list of question dicts.
    Each dict contains the data available from the listing page.
    """
    soup = BeautifulSoup(html, "lxml")
    questions: List[Dict[str, Any]] = []

    articles = soup.find_all("article", id=re.compile(r"question-[a-z0-9]*\d+", re.I))
    if not articles:
        articles = soup.find_all("article", class_=re.compile(r"question|post", re.I))

    logger.info("Found %d question articles on listing page", len(articles))

    for article in articles:
        try:
            q_data = parse_single_question_article(article, year, slot, section)
            if q_data:
                questions.append(q_data)
        except Exception as exc:
            logger.warning("Error parsing article: %s", exc)

    return questions


def parse_single_question_article(article: BeautifulSoup, year: int, slot: str, section: str) -> Optional[Dict[str, Any]]:
    """Parse a single <article> element into a question dict."""
    q_num_raw = article.get("id", "")
    q_num_match = re.search(r"-(\d+)$", q_num_raw)
    question_number = q_num_match.group(1) if q_num_match else ""

    if not question_number:
        logger.debug("Could not extract question number from article id: %s", q_num_raw)
        return None

    category_tag, sub_topic_tag = parse_category_subtopic(article)
    difficulty = parse_difficulty(article)

    # Passage
    q_img_dir = IMAGES_DIR / str(year) / slot / section.lower() / f"q{question_number}"
    passage_text, passage_type, passage_images = parse_passage(article, q_img_dir)

    # Question text
    question_text = parse_question_text(article)

    # Options
    options, question_type = parse_options(article)

    # Correct answer
    correct_answer = parse_correct_answer(article)

    # Explanation link
    expl_link = ""
    link_el = article.find("a", href=re.compile(rf"/{question_number}$"))
    if not link_el:
        link_el = article.find("a", string=re.compile(r"Explanation", re.I))
    if link_el:
        expl_link = absolute_url(link_el.get("href", ""))

    # Question-specific images (passage images were already downloaded in parse_passage)
    q_images: List[str] = []
    for img in article.find_all("img"):
        src = img.get("src", "")
        abs_src = absolute_url(src)
        local = download_image(abs_src, q_img_dir)
        if local and local not in q_images and local not in passage_images:
            q_images.append(local)

    source_listing_url = f"{BASE_URL}/past-year-questions/cat/{year}/{slot}/{section}/"

    return {
        "question_number": question_number,
        "section": section,
        "year": year,
        "slot": slot,
        "category_tag": category_tag,
        "sub_topic_tag": sub_topic_tag,
        "difficulty": difficulty,
        "_passage_text": passage_text,
        "_passage_type": passage_type,
        "_passage_images": passage_images,
        "question_text": question_text,
        "options": options,
        "question_type": question_type,
        "correct_answer": correct_answer,
        "images": q_images,
        "explanation_text": "",
        "explanation_images": [],
        "source_listing_url": source_listing_url,
        "source_explanation_url": expl_link,
    }


# ---------------------------------------------------------------------------
# Explanation Page Parsing
# ---------------------------------------------------------------------------


def parse_explanation_page(html: str, q_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse the explanation page HTML and update q_data in-place with:
        - correct_answer
        - explanation_text
        - explanation_images
    """
    soup = BeautifulSoup(html, "lxml")

    answer_span = soup.find("span", attrs={"aria-live": "polite"})
    if answer_span:
        text = answer_span.get_text(separator=" ", strip=True)
        q_data["correct_answer"] = text

    solution_section = soup.find(id=re.compile(r"solution", re.I))
    if not solution_section:
        solution_section = soup.find("div", class_=re.compile(r"solution", re.I))

    if solution_section:
        img_dir = IMAGES_DIR / str(q_data["year"]) / q_data["slot"] / q_data["section"].lower() / f"q{q_data['question_number']}"
        seen: set = set()
        expl_images: List[str] = []
        for img in solution_section.find_all("img"):
            src = img.get("src", "")
            abs_src = absolute_url(src)
            local = download_image(abs_src, img_dir)
            if local and local not in seen:
                seen.add(local)
                expl_images.append(local)
            img.decompose()

        q_data["explanation_images"] = expl_images

        clean_katex_annotations(solution_section)

        expl_div = solution_section.find("div", attrs={"aria-label": "Solution explanation"})
        if expl_div:
            q_data["explanation_text"] = inner_html(expl_div)
        else:
            raw_html = inner_html(solution_section)
            raw_html = re.sub(r"<[^>]*>\s*Solution\s*</[^>]*>", "", raw_html, flags=re.I).strip()
            q_data["explanation_text"] = raw_html
    else:
        q_data["explanation_text"] = ""

    return q_data


# ---------------------------------------------------------------------------
# Passage Grouping
# ---------------------------------------------------------------------------


def assign_passage_ids(questions: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Assign passage IDs to questions based on their captured passage text.

    Returns:
        (passages_dict, questions_list)
    """
    passages: Dict[str, Any] = {}
    passage_counter = 0
    passage_text_to_id: Dict[str, str] = {}

    for q in questions:
        ptext = q.get("_passage_text", "")
        if ptext and ptext.strip():
            if ptext not in passage_text_to_id:
                passage_counter += 1
                pid = f"passage_{passage_counter}"
                passage_text_to_id[ptext] = pid
                passages[pid] = {
                    "type": q.get("_passage_type", "Unknown"),
                    "text": ptext,
                    "images": q.get("_passage_images", []),
                    "question_numbers": [],
                }
            pid = passage_text_to_id[ptext]
            q["passage_id"] = pid
            passages[pid]["question_numbers"].append(int(q["question_number"]))
        else:
            passage_counter += 1
            pid = f"passage_{passage_counter}"
            q["passage_id"] = pid
            passages[pid] = {
                "type": "Unknown",
                "text": "",
                "images": q.get("images", []),
                "question_numbers": [int(q["question_number"])],
            }

    # Clean up internal keys
    for q in questions:
        q.pop("_passage_text", None)
        q.pop("_passage_type", None)
        q.pop("_passage_images", None)

    return passages, questions


# ---------------------------------------------------------------------------
# Paper Scraping
# ---------------------------------------------------------------------------


def scrape_paper(year: int, slot: str, section: str) -> Optional[Dict[str, Any]]:
    """
    Scrape a single paper (year/slot/section).

    Returns the paper dict or None if the section does not exist / fails.
    """
    url = f"{BASE_URL}/past-year-questions/cat/{year}/{slot}/{section}/"
    logger.info("Scraping listing page: %s", url)

    try:
        delay()
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.HTTPError as exc:
        if exc.response.status_code == 404:
            logger.warning("Page not found (404): %s — skipping.", url)
        else:
            logger.error("HTTP error fetching %s: %s", url, exc)
        return None
    except Exception as exc:
        logger.error("Error fetching %s: %s", url, exc)
        return None

    questions = parse_listing_page(resp.text, year, slot, section)

    if not questions:
        logger.warning("No questions found on %s — section may not exist.", url)
        return None

    logger.info("Found %d questions on listing page.", len(questions))

    # Scrape explanation pages
    for q in questions:
        expl_url = q.get("source_explanation_url", "")
        if not expl_url:
            logger.debug("No explanation URL for Q%s", q["question_number"])
            continue

        logger.info("Fetching explanation for Q%s: %s", q["question_number"], expl_url)
        try:
            delay()
            expl_resp = requests.get(expl_url, headers=HEADERS, timeout=30)
            expl_resp.raise_for_status()
            parse_explanation_page(expl_resp.text, q)
        except Exception as exc:
            logger.warning("Failed to fetch explanation for Q%s: %s", q["question_number"], exc)

    # Assign passage IDs
    passages, questions = assign_passage_ids(questions)

    # Build output structure
    paper: Dict[str, Any] = {
        "meta": {
            "year": year,
            "slot": slot,
            "section": section,
            "source_url": url,
            "total_questions": len(questions),
            "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "passages": passages,
        "questions": questions,
    }

    return paper


def save_paper(paper: Dict[str, Any]) -> Path:
    """Save the paper JSON to the appropriate data directory."""
    meta = paper["meta"]
    year = meta["year"]
    slot = meta["slot"]
    section = meta["section"]

    dest_dir = DATA_DIR / str(year) / slot
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / f"{section}.json"

    with open(dest_file, "w", encoding="utf-8") as f:
        json.dump(paper, f, indent=2, ensure_ascii=False)

    logger.info("Saved JSON: %s", dest_file)
    return dest_file


def paper_exists(year: int, slot: str, section: str) -> bool:
    """Check if the JSON for a paper already exists."""
    dest_file = DATA_DIR / str(year) / slot / f"{section}.json"
    return dest_file.exists()


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the scraper for all configured years, slots, and sections."""
    logger.info("=== CAT PYQ Scraper Started ===")
    logger.info("Data dir: %s", DATA_DIR)
    logger.info("Images dir: %s", IMAGES_DIR)

    total_papers = len(YEARS) * len(SLOTS) * len(SECTIONS)
    completed = 0
    skipped = 0
    failed = 0

    for year in YEARS:
        for slot in SLOTS:
            for section in SECTIONS:
                logger.info("-" * 60)
                logger.info("Processing: %s | %s | %s", year, slot, section)

                if paper_exists(year, slot, section):
                    logger.info("JSON already exists, skipping paper.")
                    skipped += 1
                    completed += 1
                    continue

                paper = scrape_paper(year, slot, section)
                if paper is None:
                    logger.warning("Failed to scrape paper: %s/%s/%s", year, slot, section)
                    failed += 1
                    completed += 1
                    continue

                save_paper(paper)
                completed += 1

    logger.info("=" * 60)
    logger.info("Scraping complete.")
    logger.info("Total papers: %d | Skipped: %d | Failed: %d", total_papers, skipped, failed)


if __name__ == "__main__":
    main()

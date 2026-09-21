import sys
sys.path.insert(0, r"C:\Users\soova\Desktop\CAT\PYQs\project pyq new\scraper")
from scrape import scrape_paper, save_paper

result = scrape_paper(2025, "slot-1", "VARC")
if result:
    save_paper(result)
    print("Saved successfully")
    print("Questions:", len(result["questions"]))
    print("Passages:", len(result["passages"]))
    for q in result["questions"][:3]:
        print(f"  Q{q['question_number']}: cat={q.get('category_tag')} sub={q.get('sub_topic_tag')} diff={q.get('difficulty')} type={q.get('question_type')} ans={q.get('correct_answer')}")
        print(f"    expl='{q.get('explanation_text','')[:80]}...'")
else:
    print("Scrape returned None")

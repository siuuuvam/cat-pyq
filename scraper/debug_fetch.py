import requests
from bs4 import BeautifulSoup

url = "https://www.aftergrad.in/past-year-questions/cat/2025/slot-1/VARC"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
resp = requests.get(url, headers=headers, timeout=30)
print("Status:", resp.status_code)
print("Length:", len(resp.text))

soup = BeautifulSoup(resp.text, "lxml")
articles = soup.find_all("article")
print("Articles found:", len(articles))

# Look for question-like IDs
all_with_id = soup.find_all(id=lambda x: x and "question" in x.lower())
print("Elements with 'question' in id:", len(all_with_id))
for el in all_with_id[:5]:
    print("  id:", el.get("id"), "tag:", el.name)

# Check if body has content
body = soup.find("body")
if body:
    text = body.get_text(strip=True)[:500]
    print("Body text preview:", text)

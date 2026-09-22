import asyncio
import json
import re
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def extract_from_dom(url, output_name):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        await page.goto(url, wait_until="networkidle")
        await asyncio.sleep(3)
        
        # Scroll to bottom to trigger lazy loading
        prev_height = 0
        for _ in range(10):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1)
            curr_height = await page.evaluate("document.body.scrollHeight")
            if curr_height == prev_height:
                break
            prev_height = curr_height
        
        # Scroll back to top
        await page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(1)
        
        # Get the full rendered HTML
        html = await page.content()
        
        # Save raw HTML
        with open(f'{output_name}_raw.html', 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"HTML saved: {len(html)} chars")
        
        # Parse with BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find the main content area
        main = soup.find('main') or soup.find('div', class_=re.compile('min-h-screen'))
        
        if not main:
            print("ERROR: Could not find main content area")
            await browser.close()
            return None
        
        # Extract all image URLs
        img_urls = set()
        for img in soup.find_all('img'):
            src = img.get('src', '') or img.get('data-src', '') or img.get('data-lazy-src', '')
            if src and not src.startswith('data:'):
                if not src.startswith('http'):
                    src = 'https://www.catmock.com' + src if src.startswith('/') else 'https://www.catmock.com/' + src
                img_urls.add(src)
        
        # Also check for background images in style attributes
        for elem in soup.find_all(style=re.compile('url\(')):
            style = elem.get('style', '')
            urls = re.findall(r'url\(["\']?([^"\')\s]+)["\']?\)', style)
            for u in urls:
                if not u.startswith('http'):
                    u = 'https://www.catmock.com' + u if u.startswith('/') else 'https://www.catmock.com/' + u
                img_urls.add(u)
        
        print(f"Found {len(img_urls)} unique images")
        
        # Extract text content for analysis
        text = main.get_text(separator=' ', strip=True)
        
        # Look for section headers
        sections = []
        for heading in main.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            sections.append(heading.get_text(strip=True))
        
        print(f"Sections found: {sections[:10]}")
        
        # Look for question containers
        # Questions might be in specific divs
        question_containers = main.find_all('div', class_=re.compile('question|pyq|paper|card|prose'))
        print(f"Question-like containers: {len(question_containers)}")
        
        # Save the main HTML for inspection
        with open(f'{output_name}_main.html', 'w', encoding='utf-8') as f:
            f.write(str(main))
        
        # Look for specific patterns in the text
        question_count = text.count('Question') + text.count('Q.')
        print(f"Question text occurrences: {question_count}")
        
        # Find the page title
        title = soup.find('title')
        if title:
            print(f"Page title: {title.get_text()}")
        
        # Extract the full innerHTML of the main content
        main_html = str(main)
        with open(f'{output_name}_main_content.html', 'w', encoding='utf-8') as f:
            f.write(main_html)
        
        await browser.close()
        
        return {
            'url': url,
            'html_length': len(html),
            'main_length': len(main_html),
            'images': list(img_urls),
            'sections': sections[:20],
            'text_preview': text[:1000]
        }

async def main():
    url = "https://www.catmock.com/pyq/cat/2025/all-sections-slot-1"
    result = await extract_from_dom(url, 'cat_2025_slot1')
    print(json.dumps(result, indent=2)[:3000])

asyncio.run(main())

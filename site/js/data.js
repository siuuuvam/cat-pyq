const DATA_BASE = '/data';

async function loadPaper(year, slot, section) {
  const url = `${DATA_BASE}/${year}/${slot}/${section}.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  return resp.json();
}

async function listAvailablePapers() {
  const papers = [];
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  const slots = ['slot-1', 'slot-2', 'slot-3'];
  const sections = ['VARC', 'DILR', 'QA'];

  for (const year of years) {
    for (const slot of slots) {
      for (const section of sections) {
        const url = `${DATA_BASE}/${year}/${slot}/${section}.json`;
        try {
          const resp = await fetch(url, { method: 'GET' });
          if (resp.ok) {
            papers.push({ year, slot, section });
          }
        } catch (e) {
          // skip missing
        }
      }
    }
  }
  return papers;
}

function getPassage(paper, passageId) {
  if (!passageId || !paper.passages) return null;
  return paper.passages[passageId] || null;
}

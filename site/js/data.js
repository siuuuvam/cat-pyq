const DATA_BASE = '/data';
const paperCache = {};

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function loadPaper(year, slot, section) {
  const key = `${year}-${slot}-${section}`;
  if (paperCache[key]) return paperCache[key];

  const url = `${DATA_BASE}/${year}/${slot}/${section}.json`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  const data = await resp.json();
  paperCache[key] = data;
  return data;
}

async function listAvailablePapers() {
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  const slots = ['slot-1', 'slot-2', 'slot-3'];
  const sections = ['VARC', 'DILR', 'QA'];

  const urls = [];
  for (const year of years) {
    for (const slot of slots) {
      for (const section of sections) {
        urls.push({ year, slot, section, url: `${DATA_BASE}/${year}/${slot}/${section}.json` });
      }
    }
  }

  const results = await Promise.allSettled(
    urls.map(u => fetchWithTimeout(u.url).then(resp => ({ ...u, ok: resp.ok })))
  );

  const papers = [];
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      papers.push({ year: result.value.year, slot: result.value.slot, section: result.value.section });
    }
  });

  return papers;
}

function getPassage(paper, passageId) {
  if (!passageId || !paper.passages) return null;
  return paper.passages[passageId] || null;
}

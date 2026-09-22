const DATA_BASE = '/data';
const paperCache = {};

async function fetchWithTimeout(url, timeout = 15000) {
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

function getPassage(paper, passageId) {
  if (!passageId || !paper.passages) return null;
  return paper.passages[passageId] || null;
}

import { SECTIONS } from './ExamController.js';

const DATA_BASE = '/data';
const cache = new Map();

export async function loadPaper(year, slot, section) {
  const key = `${year}-${slot}-${section}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${DATA_BASE}/${year}/${slot}/${section}.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  const data = await resp.json();
  cache.set(key, data);
  return data;
}

export async function loadSlotPapers(year, slot) {
  const results = await Promise.all(SECTIONS.map(async (sec) => {
    try {
      return [sec, await loadPaper(year, slot, sec)];
    } catch (e) {
      console.error(e);
      return [sec, null];
    }
  }));
  return Object.fromEntries(results);
}

export function questionAt(paper, index) {
  if (!paper || !paper.questions) return null;
  return paper.questions[index] || null;
}

export function countsFromPapers(papers) {
  const counts = {};
  for (const sec of SECTIONS) {
    counts[sec] = papers && papers[sec] && papers[sec].questions ? papers[sec].questions.length : 0;
  }
  return counts;
}

export const SECTIONS = ['VARC', 'DILR', 'QA'];

export const QState = Object.freeze({
  NOT_VISITED: 'NOT_VISITED',
  NOT_ANSWERED: 'NOT_ANSWERED',
  ANSWERED: 'ANSWERED',
  MARKED: 'MARKED',
  ANSWERED_MARKED: 'ANSWERED_MARKED',
});

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'catpyq_mock_v1_';
const DEFAULT_MINUTES = 40;

function createMemoryStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

export function getDefaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { /* private mode etc. */ }
  return createMemoryStorage();
}

export function slotLabel(slot) {
  return String(slot || '').replace('slot-', 'Slot ');
}

export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function normalizeMCQAnswer(ans) {
  if (ans == null) return '';
  const s = String(ans).trim().toLowerCase();
  const map = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', a: 'a', b: 'b', c: 'c', d: 'd' };
  if (map[s]) return map[s];
  const m = s.match(/(\d)/);
  if (m && map[m[1]]) return map[m[1]];
  return s.replace(/^option\s*/, '').trim().charAt(0) || '';
}

export function titaAnswersEqual(a, b) {
  if (a == null || b == null) return false;
  const sa = String(a).trim().toLowerCase().replace(/,/g, '');
  const sb = String(b).trim().toLowerCase().replace(/,/g, '');
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const na = Number(sa);
  const nb = Number(sb);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

export function evaluateQuestion(paperQ, saved) {
  if (saved == null || String(saved).trim() === '') {
    return { attempted: false, correct: false, marks: 0 };
  }
  if (!paperQ) return { attempted: true, correct: false, marks: 0 };
  const isTita = paperQ.question_type === 'TITA';
  const correct = isTita
    ? titaAnswersEqual(saved, paperQ.correct_answer)
    : normalizeMCQAnswer(saved) === normalizeMCQAnswer(paperQ.correct_answer);
  let marks = 0;
  if (correct) marks = 3;
  else if (!isTita) marks = -1;
  return { attempted: true, correct, marks };
}

function deriveState(q) {
  if (!q.visited) return QState.NOT_VISITED;
  if (q.saved != null) return q.marked ? QState.ANSWERED_MARKED : QState.ANSWERED;
  return q.marked ? QState.MARKED : QState.NOT_ANSWERED;
}

function freshQuestion() {
  return { visited: false, marked: false, saved: null, draft: null, state: QState.NOT_VISITED };
}

export function computeResults(state, papers) {
  const sections = {};
  const overall = { total: 0, attempted: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0 };
  for (const sec of SECTIONS) {
    const ss = state.sections[sec];
    const paper = papers ? papers[sec] : null;
    const r = {
      total: ss.count,
      attempted: 0,
      correct: 0,
      incorrect: 0,
      unattempted: 0,
      score: 0,
      maxScore: ss.count * 3,
      questions: [],
    };
    for (let i = 0; i < ss.count; i++) {
      const q = ss.questions[i];
      const pq = paper && paper.questions && paper.questions[i] ? paper.questions[i] : null;
      const ev = evaluateQuestion(pq, q.saved);
      if (ev.attempted) {
        r.attempted++;
        if (ev.correct) r.correct++;
        else r.incorrect++;
      } else {
        r.unattempted++;
      }
      r.score += ev.marks;
      r.questions.push({
        index: i,
        questionNumber: pq ? String(pq.question_number) : String(i + 1),
        questionType: pq ? pq.question_type : null,
        saved: q.saved,
        state: q.state,
        attempted: ev.attempted,
        correct: ev.correct,
        marks: ev.marks,
        correctAnswer: pq ? pq.correct_answer : null,
      });
    }
    sections[sec] = r;
    overall.total += r.total;
    overall.attempted += r.attempted;
    overall.correct += r.correct;
    overall.incorrect += r.incorrect;
    overall.unattempted += r.unattempted;
    overall.score += r.score;
    overall.maxScore += r.maxScore;
  }
  return { sections, overall };
}

export class ExamController {
  constructor(state, storage) {
    this.state = state;
    this.storage = storage || getDefaultStorage();
    this._listeners = new Set();
    this._lastTickAt = Date.now();
  }

  static storageKey(year, slot) {
    return `${STORAGE_PREFIX}${year}_${slot}`;
  }

  static hasAttempt({ year, slot, storage } = {}) {
    storage = storage || getDefaultStorage();
    try { return storage.getItem(ExamController.storageKey(year, slot)) != null; }
    catch (e) { return false; }
  }

  static clear({ year, slot, storage } = {}) {
    storage = storage || getDefaultStorage();
    try { storage.removeItem(ExamController.storageKey(year, slot)); } catch (e) { /* ignore */ }
  }

  static create({ year, slot, counts, candidateName = 'Candidate', minutesPerSection = DEFAULT_MINUTES, storage } = {}) {
    storage = storage || getDefaultStorage();
    const minutes = Number(minutesPerSection);
    const mins = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES;
    const sections = {};
    for (const sec of SECTIONS) {
      const count = Math.max(0, Math.floor(Number(counts && counts[sec]) || 0));
      sections[sec] = {
        count,
        currentIndex: 0,
        timeRemainingMs: Math.round(mins * 60000),
        locked: false,
        questions: Array.from({ length: count }, freshQuestion),
      };
    }
    const state = {
      version: STORAGE_VERSION,
      year,
      slot,
      candidateName: String(candidateName || '').trim().slice(0, 60) || 'Candidate',
      minutesPerSection: mins,
      createdAt: Date.now(),
      startedAt: Date.now(),
      submittedAt: null,
      submittedAuto: false,
      started: true,
      submitted: false,
      currentSection: SECTIONS[0],
      sections,
    };
    const c = new ExamController(state, storage);
    c.openCurrent();
    c.persist();
    return c;
  }

  static load({ year, slot, storage } = {}) {
    storage = storage || getDefaultStorage();
    let raw = null;
    try { raw = storage.getItem(ExamController.storageKey(year, slot)); }
    catch (e) { return null; }
    if (raw == null) return null;
    try {
      const state = JSON.parse(raw);
      if (!state || state.version !== STORAGE_VERSION) return null;
      if (!state.sections || !SECTIONS.every((s) => {
        const ss = state.sections[s];
        return ss && Array.isArray(ss.questions) && ss.questions.length === ss.count;
      })) return null;
      if (!SECTIONS.includes(state.currentSection)) state.currentSection = SECTIONS[0];
      for (const sec of SECTIONS) {
        const ss = state.sections[sec];
        for (const q of ss.questions) {
          if (!q || typeof q !== 'object') return null;
          if (typeof q.visited !== 'boolean') return null;
          q.marked = !!q.marked;
          if ('draft' in q === false) q.draft = q.saved;
          q.state = deriveState(q);
        }
        ss.locked = !!ss.locked;
        if (!Number.isFinite(ss.timeRemainingMs)) ss.timeRemainingMs = 0;
        if (ss.locked) ss.timeRemainingMs = 0;
        ss.currentIndex = Math.min(Math.max(0, ss.currentIndex | 0), Math.max(0, ss.count - 1));
      }
      return new ExamController(state, storage);
    } catch (e) {
      return null;
    }
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(detail) {
    for (const fn of this._listeners) {
      try { fn(detail, this.state); } catch (e) { console.error(e); }
    }
  }

  persist() {
    try { this.storage.setItem(ExamController.storageKey(this.state.year, this.state.slot), JSON.stringify(this.state)); }
    catch (e) { /* quota / private mode */ }
  }

  slotLabel() { return slotLabel(this.state.slot); }

  sectionState(sec = this.state.currentSection) { return this.state.sections[sec]; }

  currentIndex(sec = this.state.currentSection) { return this.state.sections[sec].currentIndex; }

  currentQuestion(sec = this.state.currentSection) {
    const ss = this.state.sections[sec];
    if (!ss || ss.count === 0) return null;
    return ss.questions[ss.currentIndex] || null;
  }

  questionAt(index, sec = this.state.currentSection) {
    const ss = this.state.sections[sec];
    if (!ss || index < 0 || index >= ss.count) return null;
    return ss.questions[index];
  }

  isSectionLocked(sec = this.state.currentSection) {
    return !!this.state.sections[sec].locked;
  }

  _editable() {
    if (!this.state.started || this.state.submitted) return false;
    return !this.state.sections[this.state.currentSection].locked;
  }

  counts(sec = this.state.currentSection) {
    const ss = this.state.sections[sec];
    const out = { answered: 0, notAnswered: 0, notVisited: 0, marked: 0, answeredMarked: 0, total: ss ? ss.count : 0 };
    if (!ss) return out;
    for (const q of ss.questions) {
      switch (q.state) {
        case QState.ANSWERED: out.answered++; break;
        case QState.ANSWERED_MARKED: out.answeredMarked++; break;
        case QState.MARKED: out.marked++; break;
        case QState.NOT_ANSWERED: out.notAnswered++; break;
        default: out.notVisited++;
      }
    }
    return out;
  }

  timeRemainingMs(sec = this.state.currentSection) {
    const ss = this.state.sections[sec];
    return ss ? ss.timeRemainingMs : 0;
  }

  timeString(sec = this.state.currentSection) {
    return formatTime(this.timeRemainingMs(sec));
  }

  openCurrent() {
    const ss = this.state.sections[this.state.currentSection];
    if (!ss || ss.count === 0) return;
    this._openIndex(ss, ss.currentIndex);
  }

  setDraft(value) {
    if (!this._editable()) return false;
    const q = this.currentQuestion();
    if (!q) return false;
    q.draft = value == null ? null : String(value);
    this.persist();
    return true;
  }

  _commit() {
    const q = this.currentQuestion();
    if (!q) return;
    const cleaned = q.draft == null ? null : (String(q.draft).trim() || null);
    q.saved = cleaned;
    q.draft = cleaned;
    q.state = deriveState(q);
  }

  _openIndex(ss, idx) {
    const q = ss.questions[idx];
    if (!q) return;
    q.visited = true;
    q.state = deriveState(q);
  }

  _advance(delta) {
    const ss = this.state.sections[this.state.currentSection];
    const target = ss.currentIndex + delta;
    if (target < 0 || target >= ss.count) return false;
    ss.currentIndex = target;
    this._openIndex(ss, target);
    return true;
  }

  saveAndNext() {
    if (!this._editable()) return false;
    this._commit();
    this._advance(1);
    this.persist();
    this.emit({ type: 'save' });
    return true;
  }

  markAndNext() {
    if (!this._editable()) return false;
    const q = this.currentQuestion();
    if (!q) return false;
    q.marked = true;
    this._commit();
    this._advance(1);
    this.persist();
    this.emit({ type: 'save' });
    return true;
  }

  clearResponse() {
    if (!this._editable()) return false;
    const q = this.currentQuestion();
    if (!q) return false;
    q.saved = null;
    q.draft = null;
    q.state = deriveState(q);
    this.persist();
    this.emit({ type: 'change' });
    return true;
  }

  goTo(index) {
    if (!this._editable()) return false;
    const ss = this.state.sections[this.state.currentSection];
    if (index < 0 || index >= ss.count || index === ss.currentIndex) return false;
    this._commit();
    ss.currentIndex = index;
    this._openIndex(ss, index);
    this.persist();
    this.emit({ type: 'navigate' });
    return true;
  }

  previous() {
    return this.goTo(this.state.sections[this.state.currentSection].currentIndex - 1);
  }

  switchSection(sec) {
    if (!SECTIONS.includes(sec) || sec === this.state.currentSection) return false;
    if (!this._editable()) return false;
    if (this.state.sections[sec].locked) return false;
    this._syncTick(Date.now());
    this._commit();
    this.state.currentSection = sec;
    const ss = this.state.sections[sec];
    this._openIndex(ss, ss.currentIndex);
    this._lastTickAt = Date.now();
    this.persist();
    this.emit({ type: 'section' });
    return true;
  }

  setCandidateName(name) {
    this.state.candidateName = String(name || '').trim().slice(0, 60) || 'Candidate';
    this.persist();
    this.emit({ type: 'meta' });
  }

  repairCounts(counts) {
    let changed = false;
    for (const sec of SECTIONS) {
      const want = Math.max(0, Math.floor(Number(counts && counts[sec]) || 0));
      const ss = this.state.sections[sec];
      if (want === ss.count) continue;
      changed = true;
      while (ss.questions.length < want) ss.questions.push(freshQuestion());
      if (ss.questions.length > want) ss.questions.length = want;
      ss.count = want;
      ss.currentIndex = Math.min(ss.currentIndex, Math.max(0, want - 1));
      if (want === 0) ss.currentIndex = 0;
    }
    if (changed) this.persist();
    return changed;
  }

  _syncTick(now) {
    const st = this.state;
    if (!st.started || st.submitted) { this._lastTickAt = now; return; }
    const sec = st.sections[st.currentSection];
    if (sec.locked) { this._lastTickAt = now; return; }
    const delta = Math.max(0, now - this._lastTickAt);
    this._lastTickAt = now;
    if (delta > 0 && sec.timeRemainingMs > 0) {
      sec.timeRemainingMs = Math.max(0, sec.timeRemainingMs - delta);
    }
  }

  tick(now = Date.now()) {
    if (!this.state.started || this.state.submitted) return { type: 'none' };
    this._syncTick(now);
    const ss = this.state.sections[this.state.currentSection];
    if (!ss.locked && ss.timeRemainingMs <= 0) {
      const detail = this._handleExpiry();
      this.persist();
      this.emit(detail);
      return detail;
    }
    this.persist();
    this.emit({ type: 'tick' });
    return { type: 'tick' };
  }

  _handleExpiry() {
    const st = this.state;
    const lockedSec = st.currentSection;
    const ss = st.sections[lockedSec];
    ss.locked = true;
    ss.timeRemainingMs = 0;
    const i = SECTIONS.indexOf(lockedSec);
    let next = null;
    for (let j = i + 1; j < SECTIONS.length; j++) {
      if (!st.sections[SECTIONS[j]].locked) { next = SECTIONS[j]; break; }
    }
    if (!next) {
      for (let j = 0; j < i; j++) {
        if (!st.sections[SECTIONS[j]].locked) { next = SECTIONS[j]; break; }
      }
    }
    if (next) {
      st.currentSection = next;
      const ns = st.sections[next];
      this._openIndex(ns, ns.currentIndex);
      this._lastTickAt = Date.now();
      return { type: 'lock', locked: lockedSec, advanced: next, autoSubmitted: false };
    }
    this._finalize(true);
    return { type: 'lock', locked: lockedSec, advanced: null, autoSubmitted: true };
  }

  confirmSubmit() {
    if (!this.state.started || this.state.submitted) return false;
    this._syncTick(Date.now());
    this._commit();
    this._finalize(false);
    return true;
  }

  _finalize(auto) {
    this.state.submitted = true;
    this.state.submittedAt = Date.now();
    this.state.submittedAuto = !!auto;
    this.persist();
    this.emit({ type: 'submit', auto: !!auto });
  }

  computeResults(papers) {
    return computeResults(this.state, papers);
  }
}

export const DEFAULT_MINUTES_PER_SECTION = DEFAULT_MINUTES;

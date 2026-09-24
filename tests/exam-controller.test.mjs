import assert from 'node:assert/strict';
import {
  ExamController, QState, SECTIONS, computeResults, evaluateQuestion,
  normalizeMCQAnswer, titaAnswersEqual, formatTime,
} from '../site/exam-mode/ExamController.js';

function memStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    _mem: mem,
  };
}

const COUNTS = { VARC: 24, DILR: 22, QA: 22 };

function newController(overrides = {}) {
  return ExamController.create({
    year: 2024,
    slot: 'slot-1',
    counts: COUNTS,
    candidateName: 'Test User',
    minutesPerSection: 40,
    storage: memStorage(),
    ...overrides,
  });
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('Phase 1 — ExamController state machine');

test('initial state: question 1 open (NOT_ANSWERED), rest NOT_VISITED, timers full', () => {
  const c = newController();
  assert.equal(c.state.currentSection, 'VARC');
  for (const sec of SECTIONS) {
    const ss = c.sectionState(sec);
    assert.equal(ss.count, COUNTS[sec]);
    assert.equal(ss.currentIndex, 0);
    assert.equal(ss.locked, false);
    assert.ok(sec !== 'VARC' || ss.timeRemainingMs === 40 * 60000);
  }
  assert.equal(c.currentQuestion().state, QState.NOT_ANSWERED);
  assert.equal(c.questionAt(1).state, QState.NOT_VISITED);
  const counts = c.counts('VARC');
  assert.deepEqual(counts, { answered: 0, notAnswered: 1, notVisited: 23, marked: 0, answeredMarked: 0, total: 24 });
});

test('opening a question for the first time: NOT_VISITED -> NOT_ANSWERED', () => {
  const c = newController();
  assert.equal(c.questionAt(1).state, QState.NOT_VISITED);
  c.goTo(1);
  assert.equal(c.currentQuestion().state, QState.NOT_ANSWERED);
  assert.equal(c.counts().answered, 0);
  assert.equal(c.counts().notAnswered, 2);
  assert.equal(c.counts().notVisited, 22);
  c.goTo(5);
  assert.equal(c.questionAt(1).state, QState.NOT_ANSWERED);
  c.goTo(1);
  assert.equal(c.currentQuestion().state, QState.NOT_ANSWERED);
});

test('selecting an option does NOT save (draft only, state unchanged)', () => {
  const c = newController();
  c.goTo(1);
  const q = c.currentQuestion();
  assert.equal(q.state, QState.NOT_ANSWERED);
  c.setDraft('B');
  assert.equal(q.draft, 'B');
  assert.equal(q.saved, null);
  assert.equal(q.state, QState.NOT_ANSWERED);
  assert.equal(c.counts().answered, 0);
});

test('Save & Next: draft -> saved (ANSWERED), advances', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('B');
  c.saveAndNext();
  const prev = c.questionAt(1);
  assert.equal(prev.saved, 'B');
  assert.equal(prev.state, QState.ANSWERED);
  assert.equal(c.sectionState().currentIndex, 2);
  assert.equal(c.currentQuestion().state, QState.NOT_ANSWERED);
  assert.equal(c.counts().answered, 1);
});

test('Save & Next with no draft keeps NOT_ANSWERED and advances', () => {
  const c = newController();
  c.goTo(1);
  c.saveAndNext();
  assert.equal(c.questionAt(1).state, QState.NOT_ANSWERED);
  assert.equal(c.sectionState().currentIndex, 2);
});

test('palette navigation (goTo) commits the draft — no shortcut skips saving', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('C');
  c.goTo(5);
  assert.equal(c.questionAt(1).saved, 'C');
  assert.equal(c.questionAt(1).state, QState.ANSWERED);
  assert.equal(c.sectionState().currentIndex, 5);
});

test('Previous commits the draft and goes back', () => {
  const c = newController();
  c.goTo(3);
  c.setDraft('A');
  c.previous();
  assert.equal(c.questionAt(3).saved, 'A');
  assert.equal(c.questionAt(3).state, QState.ANSWERED);
  assert.equal(c.sectionState().currentIndex, 2);
});

test('changing a saved answer re-commits on next navigation', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('A');
  c.saveAndNext();
  c.goTo(1);
  assert.equal(c.currentQuestion().draft, 'A');
  c.setDraft('D');
  c.saveAndNext();
  assert.equal(c.questionAt(1).saved, 'D');
  assert.equal(c.questionAt(1).state, QState.ANSWERED);
});

test('deselecting a saved MCQ then Save & Next reverts to NOT_ANSWERED', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('A');
  c.saveAndNext();
  c.goTo(1);
  c.setDraft(null);
  c.saveAndNext();
  const q = c.questionAt(1);
  assert.equal(q.saved, null);
  assert.equal(q.state, QState.NOT_ANSWERED);
});

test('Mark for Review & Next without draft -> MARKED', () => {
  const c = newController();
  c.goTo(1);
  c.markAndNext();
  assert.equal(c.questionAt(1).state, QState.MARKED);
  assert.equal(c.sectionState().currentIndex, 2);
  assert.equal(c.counts().marked, 1);
});

test('Mark for Review & Next with draft -> ANSWERED_MARKED', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('B');
  c.markAndNext();
  const q = c.questionAt(1);
  assert.equal(q.saved, 'B');
  assert.equal(q.state, QState.ANSWERED_MARKED);
  assert.equal(c.counts().answeredMarked, 1);
});

test('Save & Next on a MARKED question with draft -> ANSWERED_MARKED (mark kept)', () => {
  const c = newController();
  c.goTo(1);
  c.markAndNext();
  c.goTo(1);
  c.setDraft('C');
  c.saveAndNext();
  assert.equal(c.questionAt(1).state, QState.ANSWERED_MARKED);
});

test('Save & Next on a MARKED question without draft stays MARKED', () => {
  const c = newController();
  c.goTo(1);
  c.markAndNext();
  c.goTo(1);
  c.saveAndNext();
  assert.equal(c.questionAt(1).state, QState.MARKED);
});

test('Clear Response: ANSWERED -> NOT_ANSWERED, does not advance', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('A');
  c.saveAndNext();
  c.goTo(1);
  c.clearResponse();
  const q = c.currentQuestion();
  assert.equal(q.saved, null);
  assert.equal(q.draft, null);
  assert.equal(q.state, QState.NOT_ANSWERED);
  assert.equal(c.sectionState().currentIndex, 1);
});

test('Clear Response: ANSWERED_MARKED -> MARKED (mark preserved)', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('A');
  c.markAndNext();
  c.goTo(1);
  c.clearResponse();
  assert.equal(c.currentQuestion().state, QState.MARKED);
});

test('Clear Response on a fresh NOT_ANSWERED stays NOT_ANSWERED', () => {
  const c = newController();
  c.goTo(1);
  c.clearResponse();
  assert.equal(c.currentQuestion().state, QState.NOT_ANSWERED);
});

test('section switch preserves per-section progress, index, and timer independently', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('B');
  c.saveAndNext();
  c.goTo(4);
  const varcRemainingBefore = c.timeRemainingMs('VARC');
  c.sectionState('VARC').timeRemainingMs = 1234000;

  assert.equal(c.switchSection('DILR'), true);
  assert.equal(c.state.currentSection, 'DILR');
  assert.equal(c.currentIndex('DILR'), 0);
  assert.equal(c.counts('DILR').notVisited, 21); // DILR Q1 opens on switch (displayed)
  assert.equal(c.counts('DILR').notAnswered, 1);

  c.goTo(1);
  c.setDraft('X');
  c.saveAndNext();
  assert.equal(c.counts('DILR').answered, 1);

  // back to VARC: exactly where it was left off
  assert.equal(c.switchSection('VARC'), true);
  assert.equal(c.currentIndex('VARC'), 4);
  assert.equal(c.questionAt(1).saved, 'B');
  assert.equal(c.questionAt(1).state, QState.ANSWERED);
  assert.equal(c.counts('VARC').answered, 1);
  assert.ok(Math.abs(c.timeRemainingMs('VARC') - 1234000) < 100); // pending tick applied, then frozen
  assert.ok(Math.abs(c.timeRemainingMs('DILR') - 40 * 60000) < 100); // only active time counts
  assert.ok(varcRemainingBefore <= 40 * 60000);
});

test('switching sections commits any pending draft first', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('D');
  c.switchSection('QA');
  assert.equal(c.questionAt(1, 'VARC').saved, 'D');
  assert.equal(c.questionAt(1, 'VARC').state, QState.ANSWERED);
  assert.equal(c.state.currentSection, 'QA');
});

test('timer: tick decrements only the active section', () => {
  const c = newController();
  c._lastTickAt = Date.now() - 5000;
  c.tick();
  assert.ok(c.timeRemainingMs('VARC') <= 40 * 60000 - 5000 + 50);
  assert.equal(c.timeRemainingMs('DILR'), 40 * 60000);
  assert.equal(c.timeRemainingMs('QA'), 40 * 60000);
});

test('timer expiry: locks section, auto-advances to next unlocked section', () => {
  const c = newController();
  c.sectionState('VARC').timeRemainingMs = 1;
  c._lastTickAt = Date.now() - 100;
  const detail = c.tick();
  assert.equal(detail.type, 'lock');
  assert.equal(detail.locked, 'VARC');
  assert.equal(detail.advanced, 'DILR');
  assert.equal(c.sectionState('VARC').locked, true);
  assert.equal(c.timeRemainingMs('VARC'), 0);
  assert.equal(c.state.currentSection, 'DILR');
  assert.equal(c.switchSection('VARC'), false); // locked section cannot be re-entered
  assert.equal(c.state.currentSection, 'DILR');
});

test('last section expiry: auto-submits', () => {
  const c = newController();
  c.sectionState('VARC').locked = true;
  c.sectionState('DILR').locked = true;
  c.state.currentSection = 'QA';
  c.sectionState('QA').timeRemainingMs = 1;
  c._lastTickAt = Date.now() - 100;
  const detail = c.tick();
  assert.equal(detail.type, 'lock');
  assert.equal(detail.autoSubmitted, true);
  assert.equal(c.state.submitted, true);
});

test('expiry discards an unsaved draft (time is up, nothing new is saved)', () => {
  const c = newController();
  c.goTo(2);
  c.setDraft('B');
  c.sectionState('VARC').timeRemainingMs = 1;
  c._lastTickAt = Date.now() - 100;
  c.tick();
  const q = c.questionAt(2, 'VARC');
  assert.equal(q.saved, null);
  assert.equal(q.state, QState.NOT_ANSWERED);
});

test('after submit all editing is locked out', () => {
  const c = newController();
  c.goTo(1);
  c.setDraft('A');
  assert.equal(c.confirmSubmit(), true);
  assert.equal(c.state.submitted, true);
  assert.equal(c.questionAt(1).saved, 'A'); // confirmSubmit commits the current draft
  assert.equal(c.setDraft('B'), false);
  assert.equal(c.saveAndNext(), false);
  assert.equal(c.markAndNext(), false);
  assert.equal(c.clearResponse(), false);
  assert.equal(c.goTo(5), false);
  assert.equal(c.switchSection('QA'), false);
  assert.equal(c.confirmSubmit(), false);
});

test('persistence: state survives save/load round trip (refresh does not wipe progress)', () => {
  const storage = memStorage();
  const c = newController({ storage });
  c.goTo(1);
  c.setDraft('B');
  c.saveAndNext();
  c.goTo(3);
  c.setDraft('half typed');
  c.markAndNext();
  c.switchSection('DILR');
  c.goTo(2);
  c.sectionState('VARC').timeRemainingMs = 1111000;
  c.persist();

  const reloaded = ExamController.load({ year: 2024, slot: 'slot-1', storage });
  assert.ok(reloaded);
  assert.equal(reloaded.state.currentSection, 'DILR');
  assert.equal(reloaded.currentIndex('DILR'), 2);
  assert.equal(reloaded.questionAt(1, 'VARC').saved, 'B');
  assert.equal(reloaded.questionAt(1, 'VARC').state, QState.ANSWERED);
  assert.equal(reloaded.questionAt(3, 'VARC').state, QState.ANSWERED_MARKED);
  assert.equal(reloaded.timeRemainingMs('VARC'), 1111000);
  assert.equal(reloaded.currentQuestion().draft, reloaded.currentQuestion().saved);
});

test('persistence: uncommitted draft is restored on load', () => {
  const storage = memStorage();
  const c = newController({ storage });
  c.goTo(1);
  c.setDraft('D');
  const reloaded = ExamController.load({ year: 2024, slot: 'slot-1', storage });
  const q = reloaded.questionAt(1);
  assert.equal(q.draft, 'D');
  assert.equal(q.saved, null);
  assert.equal(q.state, QState.NOT_ANSWERED);
});

test('Start New Attempt: clear removes persisted state', () => {
  const storage = memStorage();
  newController({ storage });
  assert.equal(ExamController.hasAttempt({ year: 2024, slot: 'slot-1', storage }), true);
  ExamController.clear({ year: 2024, slot: 'slot-1', storage });
  assert.equal(ExamController.hasAttempt({ year: 2024, slot: 'slot-1', storage }), false);
  assert.equal(ExamController.load({ year: 2024, slot: 'slot-1', storage }), null);
});

test('repairCounts pads/trims a persisted attempt to match loaded paper', () => {
  const storage = memStorage();
  const c = newController({ storage });
  c.goTo(1);
  c.setDraft('A');
  c.saveAndNext();
  const reloaded = ExamController.load({ year: 2024, slot: 'slot-1', storage });
  reloaded.repairCounts({ VARC: 26, DILR: 22, QA: 20 });
  assert.equal(reloaded.sectionState('VARC').count, 26);
  assert.equal(reloaded.sectionState('VARC').questions[1].saved, 'A');
  assert.equal(reloaded.sectionState('VARC').questions[25].state, QState.NOT_VISITED);
  assert.equal(reloaded.sectionState('QA').count, 20);
});

test('scoring: +3 correct MCQ, -1 wrong MCQ, 0 unattempted', () => {
  const paper = {
    questions: [
      { question_number: '1', question_type: 'MCQ', correct_answer: '2' },
      { question_number: '2', question_type: 'MCQ', correct_answer: '1' },
      { question_number: '3', question_type: 'MCQ', correct_answer: '4' },
    ],
  };
  const state = {
    sections: {
      VARC: { count: 3, currentIndex: 0, timeRemainingMs: 0, locked: true, questions: [
        { visited: true, marked: false, saved: 'B', draft: 'B', state: QState.ANSWERED },
        { visited: true, marked: false, saved: 'C', draft: 'C', state: QState.ANSWERED },
        { visited: false, marked: false, saved: null, draft: null, state: QState.NOT_VISITED },
      ] },
      DILR: { count: 0, currentIndex: 0, timeRemainingMs: 0, locked: false, questions: [] },
      QA: { count: 0, currentIndex: 0, timeRemainingMs: 0, locked: false, questions: [] },
    },
  };
  const r = computeResults(state, { VARC: paper });
  assert.equal(r.sections.VARC.correct, 1);
  assert.equal(r.sections.VARC.incorrect, 1);
  assert.equal(r.sections.VARC.unattempted, 1);
  assert.equal(r.sections.VARC.score, 3 - 1 + 0);
  assert.equal(r.overall.score, 2);
  assert.equal(r.overall.maxScore, 9);
});

test('scoring: TITA +3 correct / 0 incorrect (no negative), numeric answer matching', () => {
  const paper = {
    questions: [
      { question_number: '1', question_type: 'TITA', correct_answer: '45' },
      { question_number: '2', question_type: 'TITA', correct_answer: '1200' },
    ],
  };
  assert.equal(evaluateQuestion(paper.questions[0], '45').marks, 3);
  assert.equal(evaluateQuestion(paper.questions[0], ' 45 ').correct, true);
  assert.equal(evaluateQuestion(paper.questions[0], '44').marks, 0);
  assert.equal(evaluateQuestion(paper.questions[1], '1,200').correct, true);
  assert.equal(evaluateQuestion(paper.questions[1], null).attempted, false);
});

test('scoring: ANSWERED_MARKED counts for evaluation; MARKED without answer scores 0', () => {
  const paper = {
    questions: [
      { question_number: '1', question_type: 'MCQ', correct_answer: '1' },
      { question_number: '2', question_type: 'MCQ', correct_answer: '1' },
    ],
  };
  assert.equal(evaluateQuestion(paper.questions[0], 'A').marks, 3);
  const state = {
    sections: {
      VARC: { count: 2, currentIndex: 0, timeRemainingMs: 0, locked: true, questions: [
        { visited: true, marked: true, saved: 'A', draft: 'A', state: QState.ANSWERED_MARKED },
        { visited: true, marked: true, saved: null, draft: null, state: QState.MARKED },
      ] },
      DILR: { count: 0, currentIndex: 0, timeRemainingMs: 0, locked: false, questions: [] },
      QA: { count: 0, currentIndex: 0, timeRemainingMs: 0, locked: false, questions: [] },
    },
  };
  const r = computeResults(state, { VARC: paper });
  assert.equal(r.sections.VARC.score, 3);
  assert.equal(r.sections.VARC.attempted, 1);
  assert.equal(r.sections.VARC.unattempted, 1);
});

test('MCQ answer normalization matches data format (1-4 and A-D)', () => {
  assert.equal(normalizeMCQAnswer('1'), 'a');
  assert.equal(normalizeMCQAnswer('4'), 'd');
  assert.equal(normalizeMCQAnswer('B'), 'b');
  assert.equal(normalizeMCQAnswer('Option 3 Correct Answer'), 'c');
  assert.equal(normalizeMCQAnswer('45'), 'd');
  assert.equal(titaAnswersEqual('2413', '2413'), true);
  assert.equal(titaAnswersEqual('2413', '2414'), false);
});

test('formatTime renders MM:SS', () => {
  assert.equal(formatTime(40 * 60000), '40:00');
  assert.equal(formatTime(65000), '01:05');
  assert.equal(formatTime(0), '00:00');
});

test('full journey: mixed states across all three sections, then submit + results', () => {
  const storage = memStorage();
  const c = newController({ storage });

  // VARC: answer some, mark some, leave some
  c.goTo(0); c.setDraft('A'); c.saveAndNext();     // Q1 ANSWERED (index already 0 at start)
  c.goTo(2); c.setDraft('B'); c.markAndNext();     // Q3 ANSWERED_MARKED (skips Q2)
  c.goTo(4); c.markAndNext();                      // Q5 MARKED
  c.saveAndNext();                                 // Q6 visited, NOT_ANSWERED, advances to Q7
  assert.deepEqual(c.counts('VARC'), {
    answered: 1, notAnswered: 4, notVisited: 17, marked: 1, answeredMarked: 1, total: 24,
  });

  // DILR: answer one
  c.switchSection('DILR');
  c.goTo(1); c.setDraft('C'); c.saveAndNext();
  assert.equal(c.counts('DILR').answered, 1);

  // QA: visit first, clear nothing
  c.switchSection('QA');
  c.goTo(0);
  assert.equal(c.counts('QA').notAnswered, 1);

  // back to VARC — exactly where we left it (index 6, after Q7 save-and-next)
  c.switchSection('VARC');
  assert.equal(c.currentIndex('VARC'), 6);

  const papers = {
    VARC: { questions: Array.from({ length: 24 }, (_, i) => ({ question_number: String(i + 1), question_type: 'MCQ', correct_answer: '1' })) },
    DILR: { questions: Array.from({ length: 22 }, (_, i) => ({ question_number: String(i + 1), question_type: 'MCQ', correct_answer: '3' })) },
    QA: { questions: Array.from({ length: 22 }, (_, i) => ({ question_number: String(i + 1), question_type: 'TITA', correct_answer: '7' })) },
  };

  c.confirmSubmit();
  assert.equal(c.state.submitted, true);
  const r = c.computeResults(papers);
  // VARC: Q1 'A' correct (+3), Q3 'B' incorrect MCQ (-1), Q5/Q6 unattempted
  assert.equal(r.sections.VARC.score, 2);
  assert.equal(r.sections.VARC.attempted, 2);
  // DILR: saved 'C' -> 'c', correct_answer '3' -> 'c' -> correct (+3)
  assert.equal(r.sections.DILR.score, 3);
  assert.equal(r.overall.score, 5);
  assert.equal(r.overall.total, 68);

  // refresh after submit -> still submitted
  const reloaded = ExamController.load({ year: 2024, slot: 'slot-1', storage });
  assert.equal(reloaded.state.submitted, true);
  const r2 = reloaded.computeResults(papers);
  assert.equal(r2.overall.score, 5);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);

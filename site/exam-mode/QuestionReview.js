import { SECTIONS, slotLabel, normalizeMCQAnswer } from './ExamController.js';
import { escapeHtml, renderContent, renderImages, getPassage, shouldSplit, enhance } from './Content.js';

function correctDisplay(pq) {
  if (!pq) return '—';
  if (pq.question_type === 'TITA') return escapeHtml(String(pq.correct_answer));
  return escapeHtml(normalizeMCQAnswer(pq.correct_answer).toUpperCase() || String(pq.correct_answer));
}

function savedDisplay(pq, saved) {
  if (saved == null || String(saved).trim() === '') return '—';
  if (pq && pq.question_type === 'TITA') return escapeHtml(String(saved));
  return escapeHtml(String(saved).toUpperCase());
}

export class QuestionReview {
  render(root, o) {
    const { controller, papers, results, section, index, onSelect, onBack, onHome } = o;
    const st = controller.state;
    const ss = controller.sectionState(section);
    const paper = papers[section];
    const idx = Math.min(Math.max(0, index), Math.max(0, ss.count - 1));
    const pq = paper && paper.questions ? paper.questions[idx] : null;
    const secResult = results.sections[section];
    const rq = secResult && secResult.questions[idx] ? secResult.questions[idx] : null;

    const split = pq ? shouldSplit(section, paper, pq) : false;
    const passage = split ? getPassage(paper, pq.passage_id) : null;

    let controlsHtml = '<div class="question-pane">Question data unavailable.</div>';
    let summaryHtml = '';
    let explanationHtml = '';

    if (pq && rq) {
      if (pq.question_type === 'MCQ' && pq.options && pq.options.length) {
        const correctNorm = normalizeMCQAnswer(pq.correct_answer);
        const savedNorm = rq.saved != null ? normalizeMCQAnswer(rq.saved) : '';
        controlsHtml = `
          <div class="options-list">
            ${pq.options.map((opt) => {
              const isCorrect = normalizeMCQAnswer(opt.label) === correctNorm;
              const isYours = !!savedNorm && normalizeMCQAnswer(opt.label) === savedNorm;
              const cls = isCorrect ? 'review-opt-correct' : (isYours ? 'review-opt-wrong' : '');
              let badge = '';
              if (isCorrect && isYours) badge = '<span class="opt-badge good">Correct — Your Answer ✓</span>';
              else if (isCorrect) badge = '<span class="opt-badge good">Correct Answer</span>';
              else if (isYours) badge = '<span class="opt-badge bad">Your Answer</span>';
              return `
                <label class="opt-row ${cls}">
                  <span class="opt-letter">${escapeHtml(opt.label)}.</span>
                  <span class="opt-text">${renderContent(opt.text)}</span>
                  ${badge}
                </label>`;
            }).join('')}
          </div>`;
      } else {
        controlsHtml = `
          <div class="tita-area">
            <div class="tita-label">Type-in (TITA) question — your typed response:</div>
            <div class="tita-input" style="display:inline-block;background:#f4f6f9;">${rq.saved != null && String(rq.saved).trim() !== '' ? escapeHtml(String(rq.saved)) : '<span style="color:#999;">(not answered)</span>'}</div>
          </div>`;
      }

      const savedCls = !rq.attempted ? 'neutral' : (rq.correct ? 'ok' : 'bad');
      const marks = rq.marks;
      const marksCls = marks > 0 ? 'ok' : (marks < 0 ? 'bad' : 'neutral');
      summaryHtml = `
        <div class="answer-summary">
          <div class="ans-chip ${savedCls}"><span class="k">Your answer:</span><span class="v">${savedDisplay(pq, rq.saved)}</span></div>
          <div class="ans-chip ok"><span class="k">Correct answer:</span><span class="v">${correctDisplay(pq)}</span></div>
          <div class="ans-chip ${marksCls}"><span class="k">Marks:</span><span class="v">${marks > 0 ? '+' : ''}${marks}</span></div>
          <div class="ans-chip neutral"><span class="k">Type:</span><span class="v">${escapeHtml(pq.question_type || '—')}</span></div>
        </div>`;

      explanationHtml = `
        <div class="review-explanation">
          <div class="re-head">Solution</div>
          <div class="re-body">${renderContent(pq.explanation_text)}${renderImages(pq.explanation_images)}</div>
        </div>`;
    }

    const stripButtons = ss.questions.map((q, i) => {
      const r = secResult && secResult.questions[i] ? secResult.questions[i] : null;
      let cls = 'unattempted';
      if (r && r.correct) cls = 'correct';
      else if (r && r.attempted) cls = 'incorrect';
      const pqI = paper && paper.questions ? paper.questions[i] : null;
      const num = pqI ? pqI.question_number : String(i + 1);
      const title = r && r.correct ? 'Correct' : (r && r.attempted ? 'Incorrect' : 'Not attempted');
      return `<button type="button" class="rev-btn ${cls}${i === idx ? ' current' : ''}" data-idx="${i}" title="${title}">${num}</button>`;
    }).join('');

    const sidebarHtml = `
      <div class="profile-block">
        <div class="avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="#7a8ba6"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(st.candidateName)}</div>
          <div class="profile-sub">CAT ${st.year} ${slotLabel(st.slot)}</div>
        </div>
      </div>
      <div class="sidebar-subheader">Your Score</div>
      <div style="padding:12px 15px;font-size:13.5px;line-height:2;">
        ${SECTIONS.map((sec) => {
          const r = results.sections[sec];
          return `<div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e5e5e5;"><span>${sec}</span><b>${r.score} / ${r.maxScore}</b></div>`;
        }).join('')}
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-weight:800;"><span>Overall</span><b>${results.overall.score} / ${results.overall.maxScore}</b></div>
      </div>
      <div class="sidebar-subheader">Colour key</div>
      <div style="padding:12px 15px;font-size:13px;line-height:2.1;">
        <span class="rev-btn correct" style="display:inline-block;width:26px;height:22px;vertical-align:middle;"></span> Correct<br>
        <span class="rev-btn incorrect" style="display:inline-block;width:26px;height:22px;vertical-align:middle;"></span> Incorrect<br>
        <span class="rev-btn unattempted" style="display:inline-block;width:26px;height:22px;vertical-align:middle;"></span> Not attempted
      </div>`;

    root.innerHTML = `
      <div class="review-page">
        <header class="exam-topbar">
          <div class="exam-title">Answer Review — CAT ${st.year} ${slotLabel(st.slot)}</div>
          <nav class="exam-links">
            <button type="button" data-act="results">Back to Results</button>
            <button type="button" data-act="home">Home</button>
          </nav>
        </header>
        <div class="review-section-tabs">
          ${SECTIONS.map((sec) => `<button type="button" class="section-tab ${sec === section ? 'active' : ''}" data-sec="${sec}">${sec}</button>`).join('')}
        </div>
        <div class="review-strip">
          <span class="review-strip-label">${section} questions:</span>
          ${stripButtons}
        </div>
        <div class="review-body">
          <div class="review-main">
            <div class="question-header">Question No. ${pq ? escapeHtml(String(pq.question_number)) : idx + 1}</div>
            <div class="question-panes${split ? '' : ' no-split'}" id="rev-panes">
              <div class="passage-pane">${passage ? renderContent(passage.text) + renderImages(passage.images) : ''}</div>
              <div class="question-pane">
                ${pq ? `<div class="question-text">${renderContent(pq.question_text)}${renderImages(pq.images)}</div>` : ''}
                ${controlsHtml}
                ${summaryHtml}
                ${explanationHtml}
              </div>
            </div>
          </div>
          <aside class="review-sidebar">${sidebarHtml}</aside>
        </div>
        <div class="review-foot">
          <button type="button" class="bar-btn" data-act="results-2">Back to Results</button>
          <div class="spacer"></div>
          <button type="button" class="bar-btn" data-act="prev" ${idx <= 0 ? 'disabled' : ''}>Previous</button>
          <button type="button" class="bar-btn" data-act="next" ${idx >= ss.count - 1 ? 'disabled' : ''}>Next</button>
        </div>
      </div>`;

    root.querySelectorAll('[data-act="results"], [data-act="results-2"]').forEach((b) => b.addEventListener('click', onBack));
    root.querySelector('[data-act="home"]').addEventListener('click', onHome);
    root.querySelectorAll('.review-section-tabs .section-tab').forEach((b) => {
      b.addEventListener('click', () => {
        const sec = b.getAttribute('data-sec');
        const target = controller.sectionState(sec);
        if (!target.count) { window.alert('No questions in this section.'); return; }
        onSelect(sec, Math.min(idx, target.count - 1));
      });
    });
    root.querySelectorAll('.rev-btn[data-idx]').forEach((b) => {
      b.addEventListener('click', () => onSelect(section, parseInt(b.getAttribute('data-idx'), 10)));
    });
    const prev = root.querySelector('[data-act="prev"]');
    const next = root.querySelector('[data-act="next"]');
    if (prev) prev.addEventListener('click', () => onSelect(section, idx - 1));
    if (next) next.addEventListener('click', () => onSelect(section, idx + 1));

    enhance(root.querySelector('#rev-panes'));
    const pane = root.querySelector('.question-pane');
    if (pane) pane.scrollTop = 0;
  }
}

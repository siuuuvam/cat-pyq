import { SECTIONS, slotLabel } from './ExamController.js';
import { escapeHtml } from './Content.js';

export function renderResults(root, { controller, results, onReview, onNewAttempt, onHome }) {
  const st = controller.state;
  const o = results.overall;
  const submittedDate = st.submittedAt ? new Date(st.submittedAt).toLocaleString() : '';
  const accuracy = o.attempted > 0 ? Math.round((o.correct / o.attempted) * 100) : 0;

  const rows = SECTIONS.map((sec) => {
    const r = results.sections[sec];
    if (!r.total) return '';
    return `
      <tr>
        <td>${sec}</td>
        <td>${r.total}</td>
        <td>${r.attempted}</td>
        <td>${r.correct}</td>
        <td>${r.incorrect}</td>
        <td>${r.unattempted}</td>
        <td class="score-cell">${r.score} / ${r.maxScore}</td>
      </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="results-page">
      <header class="exam-topbar">
        <div class="exam-title">CAT ${st.year} ${slotLabel(st.slot)}</div>
        <nav class="exam-links"><button type="button" data-act="home">Home</button></nav>
      </header>
      <div class="results-hero">
        <div class="rh-title">Mock Exam Results</div>
        <div class="rh-meta">${escapeHtml(st.candidateName)} · CAT ${st.year} ${slotLabel(st.slot)}${submittedDate ? ` · Submitted ${escapeHtml(submittedDate)}` : ''}${st.submittedAuto ? ' · Auto-submitted (time over)' : ''}</div>
      </div>
      <div class="results-body">
        <div class="score-card">
          <div class="score-big">
            <div class="num">${o.score}</div>
            <div class="max">/ ${o.maxScore}</div>
            <div class="lbl">Total Score</div>
          </div>
          <div class="stats-row">
            <div class="stat-tile blue"><div class="v">${o.attempted}</div><div class="k">Attempted (${accuracy}% accuracy)</div></div>
            <div class="stat-tile green"><div class="v">${o.correct}</div><div class="k">Correct</div></div>
            <div class="stat-tile red"><div class="v">${o.incorrect}</div><div class="k">Incorrect</div></div>
            <div class="stat-tile gray"><div class="v">${o.unattempted}</div><div class="k">Unattempted</div></div>
          </div>
        </div>
        <table class="results-section-table">
          <thead>
            <tr>
              <th>Section</th><th>Questions</th><th>Attempted</th><th>Correct</th>
              <th>Incorrect</th><th>Unattempted</th><th>Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td>Overall</td><td>${o.total}</td><td>${o.attempted}</td><td>${o.correct}</td>
              <td>${o.incorrect}</td><td>${o.unattempted}</td><td class="score-cell">${o.score} / ${o.maxScore}</td>
            </tr>
          </tfoot>
        </table>
        <div class="results-actions">
          <button type="button" class="btn btn-blue" data-act="review">Review Answers &amp; Explanations</button>
          <button type="button" class="btn btn-ghost" data-act="new">Start New Attempt</button>
          <button type="button" class="btn btn-ghost" data-act="home">Home</button>
        </div>
        <p class="results-note">Marking scheme: +3 correct MCQ · −1 incorrect MCQ · +3 correct TITA · 0 otherwise (no negative marking on TITA). Maximum possible score assumes every question answered correctly.</p>
      </div>
    </div>`;

  root.querySelector('[data-act="review"]').addEventListener('click', onReview);
  root.querySelector('[data-act="new"]').addEventListener('click', onNewAttempt);
  root.querySelectorAll('[data-act="home"]').forEach((b) => b.addEventListener('click', onHome));
}

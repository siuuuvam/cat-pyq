import { ExamController } from './ExamController.js';
import { instructionsHtml } from './InstructionsModal.js';
import { escapeHtml } from './Content.js';

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const SLOTS = ['slot-1', 'slot-2', 'slot-3'];

export class SetupScreen {
  render(root, ctx) {
    const pre = ctx.preselect || {};
    const year = YEARS.includes(pre.year) ? pre.year : 2024;
    const slot = SLOTS.includes(pre.slot) ? pre.slot : 'slot-1';
    const minutes = Number.isFinite(pre.minutes) && pre.minutes > 0 ? pre.minutes : 40;

    root.innerHTML = `
      <div class="setup-page">
        <header class="exam-topbar">
          <div class="exam-title">Mock Exam Mode</div>
          <nav class="exam-links">
            <button type="button" data-act="home">Back to Review Mode</button>
          </nav>
        </header>
        <div class="setup-main">
          <div class="setup-card">
            <h1>CAT Mock Exam</h1>
            <p class="sub">Full TCS iON-style test player — section timers, question palette and real marking. Correct answers stay hidden until you submit.</p>
            <div class="setup-fields">
              <div class="setup-field">
                <label for="s-year">Year</label>
                <select id="s-year">${YEARS.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
              </div>
              <div class="setup-field">
                <label for="s-slot">Slot</label>
                <select id="s-slot">${SLOTS.map((s) => `<option value="${s}" ${s === slot ? 'selected' : ''}>${s.replace('slot-', 'Slot ')}</option>`).join('')}</select>
              </div>
              <div class="setup-field full">
                <label for="s-name">Candidate name</label>
                <input id="s-name" type="text" maxlength="60" value="${escapeHtml(ctx.defaultName || 'Candidate')}" placeholder="Your name">
              </div>
              <div class="setup-field">
                <label for="s-min">Minutes per section</label>
                <input id="s-min" type="number" min="1" max="180" step="1" value="${minutes}">
              </div>
            </div>
            <div id="attempt-slot"></div>
            <div class="setup-actions" id="setup-actions"></div>
            ${ctx.error ? `<div class="setup-error">${escapeHtml(ctx.error)}</div>` : ''}
            <details class="setup-instructions">
              <summary>Exam instructions</summary>
              <div class="modal-body" id="setup-instructions-body">${instructionsHtml(minutes)}</div>
            </details>
            <p class="setup-note">Prefer instant answers and explanations? <a href="index.html">Open Review Mode</a>.</p>
          </div>
        </div>
      </div>`;

    const yearSel = root.querySelector('#s-year');
    const slotSel = root.querySelector('#s-slot');
    const nameInput = root.querySelector('#s-name');
    const minInput = root.querySelector('#s-min');
    const attemptSlot = root.querySelector('#attempt-slot');
    const actions = root.querySelector('#setup-actions');

    const getSelection = () => ({
      year: parseInt(yearSel.value, 10),
      slot: slotSel.value,
      name: (nameInput.value || '').trim().slice(0, 60) || 'Candidate',
      minutes: Math.min(180, Math.max(1, parseFloat(minInput.value) || 40)),
    });

    const updateAttempt = () => {
      const sel = getSelection();
      const has = ExamController.hasAttempt({ year: sel.year, slot: sel.slot });
      attemptSlot.innerHTML = has
        ? `<div class="attempt-banner"><span><b>Saved attempt</b> for CAT ${sel.year} ${sel.slot.replace('slot-', 'Slot ')} — resume it, or start fresh (progress will be deleted).</span></div>`
        : '';
      actions.innerHTML = has
        ? `<button type="button" class="btn btn-blue" data-act="resume">Resume Attempt</button>
           <button type="button" class="btn btn-ghost" data-act="new">Start New Attempt</button>`
        : `<button type="button" class="btn btn-blue" data-act="start">Start Mock Exam</button>`;

      const startFresh = () => {
        const sel2 = getSelection();
        if (has && !window.confirm('This will delete the saved attempt for this paper and start fresh. Continue?')) return;
        ctx.beginNew(sel2.year, sel2.slot, sel2.name, sel2.minutes);
      };

      const resumeBtn = actions.querySelector('[data-act="resume"]');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
          const sel2 = getSelection();
          ctx.resume(sel2.year, sel2.slot);
        });
      }
      const newBtn = actions.querySelector('[data-act="new"]');
      if (newBtn) newBtn.addEventListener('click', startFresh);
      const startBtn = actions.querySelector('[data-act="start"]');
      if (startBtn) startBtn.addEventListener('click', startFresh);
    };

    yearSel.addEventListener('change', updateAttempt);
    slotSel.addEventListener('change', updateAttempt);
    minInput.addEventListener('input', () => {
      const body = root.querySelector('#setup-instructions-body');
      if (body) body.innerHTML = instructionsHtml(parseFloat(minInput.value) || 40);
    });
    root.querySelector('[data-act="home"]').addEventListener('click', () => ctx.goHome());

    updateAttempt();
  }
}

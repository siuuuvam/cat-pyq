export function instructionsHtml(minutesPerSection) {
  const m = Number(minutesPerSection) || 40;
  const mLabel = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `
    <h3>1. General</h3>
    <ol>
      <li>This test has three sections: <b>VARC</b>, <b>DILR</b> and <b>QA</b>. You may move between sections and questions freely at any time.</li>
      <li>Each section has its own countdown of <b>${mLabel} minutes</b>. Only the timer of the section you are currently in runs.</li>
      <li>When a section's timer reaches zero the section locks automatically and the next available section opens. When every section is over, the test submits automatically.</li>
      <li>Your answers, marked questions and time left are saved in this browser — refreshing the page will not lose your progress.</li>
    </ol>
    <h3>2. Question types &amp; marking scheme</h3>
    <ul>
      <li><b>MCQ</b> (single correct): <b>+3</b> for the correct option, <b>−1</b> for an incorrect option, <b>0</b> if not attempted.</li>
      <li><b>TITA</b> (type-in answer): <b>+3</b> for the correct answer, <b>0</b> for an incorrect answer — no negative marking.</li>
      <li>Questions marked for review <i>with</i> a saved answer are considered for evaluation; marked questions without an answer score zero.</li>
    </ul>
    <h3>3. Answering a question</h3>
    <ol>
      <li>Selecting an option or typing an answer creates a <b>draft</b> — it is not saved until you use one of the buttons below.</li>
      <li><b>Save &amp; Next</b> — saves your response and opens the next question.</li>
      <li><b>Mark for Review &amp; Next</b> — saves your response (if any), marks the question for review, and opens the next question.</li>
      <li><b>Clear Response</b> — removes the saved response of the current question. It does not move to another question.</li>
      <li><b>Previous</b>, clicking a number in the question palette, or switching sections also saves the current draft response before moving — no response is lost by navigating.</li>
    </ol>
    <h3>4. Question palette (status of questions)</h3>
    <div class="ins-legend">
      <div class="ins-legend-item"><span class="ins-legend-swatch swatch-answered">&nbsp;</span> Answered — response saved</div>
      <div class="ins-legend-item"><span class="ins-legend-swatch swatch-not-answered">&nbsp;</span> Not Answered — visited, nothing saved</div>
      <div class="ins-legend-item"><span class="ins-legend-swatch swatch-not-visited">&nbsp;</span> Not Visited — never opened</div>
      <div class="ins-legend-item"><span class="ins-legend-swatch swatch-marked">&nbsp;</span> Marked For Review — no answer saved</div>
      <div class="ins-legend-item"><span class="ins-legend-swatch swatch-answered-marked">✓</span> Answered and Marked For Review (will be considered for evaluation)</div>
    </div>
    <h3>5. Submitting</h3>
    <ol>
      <li>Click <b>Submit</b> in the bottom bar to see a summary of your responses per section.</li>
      <li>You must confirm with <b>Yes, Submit</b> to finish the test.</li>
      <li>Correct answers, explanations and your score are revealed <b>only after</b> you submit.</li>
    </ol>`;
}

export class InstructionsModal {
  open(overlayRoot, minutesPerSection) {
    this.close();
    const backdrop = document.createElement('div');
    backdrop.className = 'overlay-backdrop';
    backdrop.innerHTML = `
      <div class="modal-card" role="dialog" aria-label="Exam instructions">
        <div class="modal-head">
          <span>Exam Instructions</span>
          <button type="button" class="modal-close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">${instructionsHtml(minutesPerSection)}</div>
        <div class="modal-foot">
          <button type="button" class="btn btn-blue" data-act="close">Close</button>
        </div>
      </div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', () => this.close());
    backdrop.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    overlayRoot.appendChild(backdrop);
    this.backdrop = backdrop;
    this._esc = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._esc);
  }

  close() {
    if (this._esc) document.removeEventListener('keydown', this._esc);
    if (this.backdrop) this.backdrop.remove();
    this.backdrop = null;
  }
}

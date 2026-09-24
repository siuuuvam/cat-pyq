import { SECTIONS, slotLabel } from './ExamController.js';
import { escapeHtml, renderContent, renderImages, getPassage, passageHasContent } from './Content.js';

export class PaperView {
  constructor() {
    this.overlay = null;
  }

  open(overlayRoot, { controller, papers }) {
    this.close();
    const st = controller.state;
    const overlay = document.createElement('div');
    overlay.className = 'paper-overlay';
    overlay.innerHTML = `
      <div class="paper-head">
        <h2>Question Paper — CAT ${st.year} ${slotLabel(st.slot)}</h2>
        <button type="button" class="btn btn-ghost" data-act="close">Close</button>
      </div>
      <div class="paper-body"><div class="paper-inner" id="paper-inner"></div></div>`;
    overlay.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    overlayRoot.appendChild(overlay);
    this.overlay = overlay;

    const inner = overlay.querySelector('#paper-inner');
    const seenPassages = new Set();
    const parts = [];
    for (const sec of SECTIONS) {
      const paper = papers[sec];
      parts.push(`<div class="paper-section-title">${sec}</div>`);
      if (!paper || !paper.questions || !paper.questions.length) {
        parts.push('<div class="paper-q">Section data not available.</div>');
        continue;
      }
      for (const q of paper.questions) {
        const passage = getPassage(paper, q.passage_id);
        if (passage && passageHasContent(passage) && !seenPassages.has(q.passage_id)) {
          seenPassages.add(q.passage_id);
          parts.push(`<div class="paper-passage">${renderContent(passage.text)}${renderImages(passage.images)}</div>`);
        }
        const typeLabel = q.question_type === 'TITA' ? 'TITA — type your own answer' : 'MCQ — single correct';
        const opts = q.question_type === 'MCQ' && q.options && q.options.length
          ? q.options.map((o) => `<div class="paper-opt"><b>${escapeHtml(o.label)}.</b>${renderContent(o.text)}</div>`).join('')
          : '<div class="paper-opt"><i>Numerical / type-in answer question.</i></div>';
        parts.push(`
          <div class="paper-q">
            <div class="paper-q-head">
              <span>Question No. ${escapeHtml(String(q.question_number))}</span>
              <span class="paper-q-type">${typeLabel}</span>
            </div>
            <div class="question-text">${renderContent(q.question_text)}${renderImages(q.images)}</div>
            ${opts}
          </div>`);
      }
    }
    inner.innerHTML = parts.join('');
    this._esc = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._esc);
  }

  close() {
    if (this._esc) document.removeEventListener('keydown', this._esc);
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }
}

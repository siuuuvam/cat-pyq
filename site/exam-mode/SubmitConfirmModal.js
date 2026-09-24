import { SECTIONS, slotLabel } from './ExamController.js';

export class SubmitConfirmModal {
  constructor() {
    this.backdrop = null;
  }

  open(overlayRoot, controller, { onConfirm, onClose }) {
    this.close();
    const st = controller.state;
    const rows = SECTIONS.map((sec) => {
      const c = controller.counts(sec);
      return `
        <tr>
          <td>${sec}</td>
          <td>${c.answered}</td>
          <td>${c.notAnswered}</td>
          <td>${c.marked}</td>
          <td>${c.answeredMarked}</td>
          <td>${c.notVisited}</td>
          <td>${c.total}</td>
        </tr>`;
    }).join('');
    const totals = SECTIONS.reduce((acc, sec) => {
      const c = controller.counts(sec);
      acc.answered += c.answered;
      acc.notAnswered += c.notAnswered;
      acc.marked += c.marked;
      acc.answeredMarked += c.answeredMarked;
      acc.notVisited += c.notVisited;
      acc.total += c.total;
      return acc;
    }, { answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0, total: 0 });

    const backdrop = document.createElement('div');
    backdrop.className = 'overlay-backdrop';
    backdrop.innerHTML = `
      <div class="modal-card" role="dialog" aria-label="Submit confirmation">
        <div class="modal-head">
          <span>Submit Test — CAT ${st.year} ${slotLabel(st.slot)}</span>
          <button type="button" class="modal-close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <p>You are about to submit your responses. Please review the summary below. Answers and solutions will be shown after submission.</p>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Answered</th>
                <th>Not Answered</th>
                <th>Marked for Review</th>
                <th>Answered &amp; Marked</th>
                <th>Not Visited</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td>All Sections</td>
                <td>${totals.answered}</td>
                <td>${totals.notAnswered}</td>
                <td>${totals.marked}</td>
                <td>${totals.answeredMarked}</td>
                <td>${totals.notVisited}</td>
                <td>${totals.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-act="cancel">No, Go Back</button>
          <button type="button" class="btn btn-blue" data-act="confirm">Yes, Submit</button>
        </div>
      </div>`;
    backdrop.querySelector('.modal-close').addEventListener('click', () => this.close(onClose));
    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => this.close(onClose));
    backdrop.querySelector('[data-act="confirm"]').addEventListener('click', () => {
      this.close();
      onConfirm();
    });
    overlayRoot.appendChild(backdrop);
    this.backdrop = backdrop;
    this._esc = (e) => { if (e.key === 'Escape') this.close(onClose); };
    document.addEventListener('keydown', this._esc);
  }

  close(onClose) {
    if (this._esc) document.removeEventListener('keydown', this._esc);
    if (this.backdrop) this.backdrop.remove();
    this.backdrop = null;
    if (onClose) onClose();
  }
}

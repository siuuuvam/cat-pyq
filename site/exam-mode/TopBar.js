import { escapeHtml } from './Content.js';
import { slotLabel } from './ExamController.js';

export class TopBar {
  constructor(ctx) {
    this.ctx = ctx;
  }

  render(el) {
    const { controller } = this.ctx;
    const st = controller.state;
    el.className = 'exam-topbar';
    el.innerHTML = `
      <div class="exam-title">CAT ${st.year} ${escapeHtml(slotLabel(st.slot))}</div>
      <nav class="exam-links" aria-label="Exam tools">
        <button type="button" data-act="instructions">View Instructions</button>
        <button type="button" data-act="paper">Question Paper</button>
        <button type="button" data-act="calc">Calculator</button>
      </nav>`;
    el.querySelector('[data-act="instructions"]').addEventListener('click', () => this.ctx.openInstructions());
    el.querySelector('[data-act="paper"]').addEventListener('click', () => this.ctx.openPaper());
    el.querySelector('[data-act="calc"]').addEventListener('click', () => this.ctx.openCalculator());
  }
}

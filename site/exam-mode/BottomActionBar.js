export class BottomActionBar {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = null;
  }

  render(el) {
    this.el = el;
    el.className = 'exam-bottombar';
    el.innerHTML = `
      <button type="button" class="bar-btn" data-act="mark">Mark for Review &amp; Next</button>
      <button type="button" class="bar-btn" data-act="clear">Clear Response</button>
      <div class="bottombar-spacer"></div>
      <button type="button" class="bar-btn" data-act="prev">Previous</button>
      <button type="button" class="bar-btn" data-act="save">Save &amp; Next</button>
      <button type="button" class="bar-btn bar-submit" data-act="submit">Submit</button>`;
    el.querySelector('[data-act="mark"]').addEventListener('click', () => this.ctx.markAndNext());
    el.querySelector('[data-act="clear"]').addEventListener('click', () => this.ctx.clearResponse());
    el.querySelector('[data-act="prev"]').addEventListener('click', () => this.ctx.previous());
    el.querySelector('[data-act="save"]').addEventListener('click', () => this.ctx.saveAndNext());
    el.querySelector('[data-act="submit"]').addEventListener('click', () => this.ctx.submit());
    this.refresh();
  }

  refresh() {
    if (!this.el) return;
    const { controller } = this.ctx;
    const st = controller.state;
    const editable = !st.submitted && !controller.isSectionLocked();
    const idx = controller.currentIndex();
    this.el.querySelector('[data-act="prev"]').disabled = !editable || idx <= 0;
    this.el.querySelector('[data-act="save"]').disabled = !editable;
    this.el.querySelector('[data-act="mark"]').disabled = !editable;
    this.el.querySelector('[data-act="clear"]').disabled = !editable;
    this.el.querySelector('[data-act="submit"]').disabled = st.submitted;
  }
}

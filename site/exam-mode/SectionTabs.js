import { SECTIONS } from './ExamController.js';

export class SectionTabs {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = null;
  }

  render(el) {
    this.el = el;
    el.className = 'exam-sectionbar';
    el.innerHTML = `
      <div class="exam-sections-wrap">
        <span class="exam-sections-label">Sections</span>
        <div class="section-tabs" role="tablist">
          ${SECTIONS.map((sec) => `<button type="button" class="section-tab" role="tab" data-sec="${sec}">${sec}</button>`).join('')}
        </div>
      </div>
      <div class="exam-timer" id="exam-time-left">Time Left: 40:00</div>`;
    el.querySelectorAll('.section-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.ctx.switchSection(btn.getAttribute('data-sec')));
    });
    this.refresh();
    this.updateTimer();
  }

  refresh() {
    if (!this.el) return;
    const { controller } = this.ctx;
    const cur = controller.state.currentSection;
    this.el.querySelectorAll('.section-tab').forEach((btn) => {
      const sec = btn.getAttribute('data-sec');
      const locked = controller.isSectionLocked(sec);
      btn.classList.toggle('active', sec === cur && !locked);
      btn.classList.toggle('locked', locked);
      btn.setAttribute('aria-selected', sec === cur ? 'true' : 'false');
      btn.title = locked ? 'Time is over for this section' : '';
    });
  }

  updateTimer() {
    if (!this.el) return;
    const { controller } = this.ctx;
    const el = this.el.querySelector('#exam-time-left');
    if (!el) return;
    el.textContent = `Time Left: ${controller.timeString()}`;
    el.classList.toggle('low', controller.timeRemainingMs() < 5 * 60 * 1000);
  }
}

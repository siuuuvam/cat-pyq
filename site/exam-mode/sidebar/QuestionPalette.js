import { QState } from '../ExamController.js';

const STATE_CLASS = {
  [QState.NOT_VISITED]: 'pal-not-visited',
  [QState.NOT_ANSWERED]: 'pal-not-answered',
  [QState.ANSWERED]: 'pal-answered',
  [QState.MARKED]: 'pal-marked',
  [QState.ANSWERED_MARKED]: 'pal-answered-marked',
};

const STATE_TITLE = {
  [QState.NOT_VISITED]: 'Not Visited',
  [QState.NOT_ANSWERED]: 'Not Answered',
  [QState.ANSWERED]: 'Answered',
  [QState.MARKED]: 'Marked For Review',
  [QState.ANSWERED_MARKED]: 'Answered and Marked For Review',
};

export function renderPalette(container, { controller, paper, goTo }) {
  const sec = controller.state.currentSection;
  const ss = controller.sectionState(sec);
  const cur = ss.currentIndex;
  const buttons = [];
  for (let i = 0; i < ss.count; i++) {
    const q = ss.questions[i];
    const pq = paper && paper.questions ? paper.questions[i] : null;
    const num = pq ? pq.question_number : String(i + 1);
    const cls = STATE_CLASS[q.state] || 'pal-not-visited';
    const title = STATE_TITLE[q.state] || '';
    buttons.push(
      `<button type="button" class="pal-btn ${cls}${i === cur ? ' current' : ''}" data-idx="${i}" title="${title}">${num}</button>`
    );
  }
  container.innerHTML = buttons.join('');
  container.querySelectorAll('.pal-btn').forEach((btn) => {
    btn.addEventListener('click', () => goTo(parseInt(btn.getAttribute('data-idx'), 10)));
  });
}

export class QuestionPalette {
  static render(container, ctx) {
    renderPalette(container, ctx);
  }
}

import { escapeHtml, renderContent, renderImages, getPassage, shouldSplit, enhance } from './Content.js';
import { normalizeMCQAnswer } from './ExamController.js';

function draftMatches(draft, label) {
  if (draft == null) return false;
  const d = String(draft);
  return d === label || normalizeMCQAnswer(d) === normalizeMCQAnswer(label);
}

export class QuestionPane {
  constructor(ctx) {
    this.ctx = ctx;
  }

  render(headerEl, panesEl) {
    const { controller, papers } = this.ctx;
    const sec = controller.state.currentSection;
    const idx = controller.currentIndex(sec);
    const paper = papers[sec];
    const q = paper && paper.questions ? paper.questions[idx] : null;
    const cq = controller.currentQuestion(sec);

    if (!q) {
      headerEl.textContent = 'Question';
      panesEl.className = 'question-panes no-split';
      panesEl.innerHTML = '<div class="question-pane pane-loading">No questions in this section.</div>';
      return;
    }

    headerEl.textContent = `Question No. ${q.question_number}`;

    const split = shouldSplit(sec, paper, q);
    const passage = split ? getPassage(paper, q.passage_id) : null;
    panesEl.className = 'question-panes' + (split ? '' : ' no-split');

    const passageHtml = `<div class="passage-pane">${passage ? renderContent(passage.text) + renderImages(passage.images) : ''}</div>`;

    let controlsHtml = '';
    if (q.question_type === 'MCQ' && q.options && q.options.length) {
      const draft = cq ? cq.draft : null;
      controlsHtml = `
        <div class="options-list" role="radiogroup" aria-label="Answer options">
          ${q.options.map((opt) => `
            <label class="opt-row">
              <input type="radio" name="exam-opt" value="${escapeHtml(opt.label)}" ${draftMatches(draft, opt.label) ? 'checked' : ''}>
              <span class="opt-letter">${escapeHtml(opt.label)}.</span>
              <span class="opt-text">${renderContent(opt.text)}</span>
            </label>`).join('')}
        </div>`;
    } else {
      const draft = cq && cq.draft != null ? String(cq.draft) : '';
      controlsHtml = `
        <div class="tita-area">
          <div class="tita-label">Type your answer (numerical / exact value):</div>
          <input type="text" class="tita-input" id="tita-answer" autocomplete="off" spellcheck="false"
            placeholder="Type your answer here..." value="${escapeHtml(draft)}">
        </div>`;
    }

    panesEl.innerHTML = `
      ${passageHtml}
      <div class="question-pane">
        <div class="question-text">${renderContent(q.question_text)}${renderImages(q.images)}</div>
        ${controlsHtml}
      </div>`;

    panesEl.querySelectorAll('input[name="exam-opt"]').forEach((input) => {
      input.addEventListener('click', () => {
        const cur = controller.currentQuestion(sec);
        if (cur && draftMatches(cur.draft, input.value)) {
          input.checked = false;
          controller.setDraft(null);
        } else {
          controller.setDraft(input.value);
        }
      });
    });

    const tita = panesEl.querySelector('#tita-answer');
    if (tita) {
      tita.addEventListener('input', () => controller.setDraft(tita.value));
    }

    const qp = panesEl.querySelector('.question-pane');
    const pp = panesEl.querySelector('.passage-pane');
    enhance(qp);
    enhance(pp);
  }
}

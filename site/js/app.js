let currentPaper = null;
let currentQuestionIndex = 0;
let allPapers = [];

async function init() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');
  const slot = params.get('slot');
  const section = params.get('section');
  const qNum = params.get('q');

  if (year && slot && section) {
    await loadPaperView(year, slot, section, qNum);
  } else if (year && slot && !section) {
    await loadSectionList(year, slot);
  } else if (year && !slot && !section) {
    await loadSlotList(year);
  } else {
    renderLanding();
  }
}

async function loadPaperView(year, slot, section, qNum) {
  try {
    currentPaper = await loadPaper(year, slot, section);
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="container"><p>Error loading paper: ${e.message}</p></div>`;
    return;
  }
  const questions = currentPaper.questions;
  currentQuestionIndex = qNum ? questions.findIndex(q => String(q.question_number) === String(qNum)) : 0;
  if (currentQuestionIndex < 0) currentQuestionIndex = 0;
  renderPaperView(year, slot, section);
}

async function loadSectionList(year, slot) {
  const sections = ['VARC', 'DILR', 'QA'];
  const sectionData = [];
  for (const section of sections) {
    try {
      const paper = await loadPaper(year, slot, section);
      sectionData.push({ section, paper });
    } catch (e) {
      sectionData.push({ section, paper: null, error: e.message });
    }
  }
  renderSectionList(year, slot, sectionData);
}

async function loadSlotList(year) {
  const slots = ['slot-1', 'slot-2', 'slot-3'];
  const slotData = [];
  for (const slot of slots) {
    const sections = [];
    for (const section of ['VARC', 'DILR', 'QA']) {
      try {
        const paper = await loadPaper(year, slot, section);
        sections.push({ section, paper });
      } catch (e) {
        sections.push({ section, paper: null });
      }
    }
    slotData.push({ slot, sections });
  }
  renderSlotList(year, slotData);
}

function renderSlotList(year, slotData) {
  document.getElementById('app').innerHTML = `
    <div class="container">
      <a href="index.html" class="back-link">← Back to years</a>
      <div class="page-title">CAT ${year}</div>
      <div class="page-subtitle">Select a slot to view sections</div>
      <div class="slot-grid">
        ${slotData.map(s => `
          <a class="slot-card" href="?year=${year}&slot=${s.slot}">
            <div class="slot-name">${s.slot.replace('slot-', 'Slot ')}</div>
            <div class="slot-meta">${s.sections.filter(x => x.paper).length} sections available</div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSectionList(year, slot, sectionData) {
  document.getElementById('app').innerHTML = `
    <div class="container">
      <a href="?year=${year}" class="back-link">← Back to ${year}</a>
      <div class="page-title">${year} ${slot.replace('slot-', 'Slot ')}</div>
      <div class="page-subtitle">Select a section</div>
      <div class="slot-grid">
        ${sectionData.map(s => `
          <a class="slot-card ${s.paper ? '' : 'hidden'}" href="?year=${year}&slot=${slot}&section=${s.section}">
            <div class="slot-name">${s.section}</div>
            <div class="slot-meta">${s.paper ? s.paper.questions.length + ' questions' : 'Not available'}</div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPaperView(year, slot, section) {
  const questions = currentPaper.questions;
  const q = questions[currentQuestionIndex];
  const passage = getPassage(currentPaper, q.passage_id);
  const isSplit = section === 'VARC' || section === 'DILR';

  const passageHtml = passage ? `
    <div class="passage-block">
      ${renderContent(passage.text)}
      ${passage.images && passage.images.length ? passage.images.map(img => `<img src="${fixImgPath(img)}" alt="">`).join('') : ''}
    </div>
  ` : '';

  const optionsHtml = q.question_type === 'MCQ' && q.options ? `
    <div class="options-list">
      ${q.options.map((opt, idx) => `
        <label class="option-item" data-index="${idx}">
          <input type="radio" name="q-option" value="${escapeHtml(opt.label)}" onchange="selectOption(this)">
          <span class="option-label">${escapeHtml(opt.label)}</span>
          <span class="option-text">${escapeHtml(opt.text)}</span>
        </label>
      `).join('')}
    </div>
  ` : '';

  const titaHtml = q.question_type === 'TITA' ? `
    <div class="tita-input-area">
      <input type="text" id="tita-answer" placeholder="Type your answer here..." autocomplete="off">
    </div>
  ` : '';

  const diffClass = q.difficulty === 'Hard' ? 'diff-hard' : q.difficulty === 'Medium' ? 'diff-medium' : 'diff-easy';

  const cats = [q.category_tag, q.sub_topic_tag].filter(Boolean);

  const navHtml = questions.map((qq, idx) => `
    <a class="q-nav-btn ${idx === currentQuestionIndex ? 'active' : ''}"
       href="?year=${year}&slot=${slot}&section=${section}&q=${qq.question_number}"
       title="Q${qq.question_number}">${qq.question_number}</a>
  `).join('');

  const questionContentHtml = `
    <div class="question-header">
      <span class="q-number">Q${q.question_number}:</span>
      ${cats.map((c, i) => `
        <span class="pill pill-blue">
          ${i > 0 ? '<span class="pill-sep">›</span>' : ''}
          ${escapeHtml(c)}
        </span>
      `).join('')}
      <span class="pill ${diffClass}">${q.difficulty || ''}</span>
    </div>

    <div class="question-text">
      ${renderContent(q.question_text)}
      ${q.images && q.images.length ? q.images.map(img => `<img src="${fixImgPath(img)}" alt="">`).join('') : ''}
    </div>

    ${optionsHtml}
    ${titaHtml}

    <button id="submit-btn" class="btn btn-primary" onclick="submitAnswer()">Submit</button>

    <div id="answer-area" class="hidden">
      <div class="answer-box">
        <span class="answer-label">Correct Answer:</span>
        <span class="answer-value">${escapeHtml(q.correct_answer)}</span>
      </div>
      <button class="btn btn-primary" onclick="toggleExplanation()">View Explanation</button>
    </div>

    <div id="explanation" class="explanation-section hidden">
      <div class="explanation-heading">✅ Solution</div>
      <div class="explanation-text">${renderContent(q.explanation_text)}
        ${q.explanation_images && q.explanation_images.length ? q.explanation_images.map(img => `<img src="${fixImgPath(img)}" alt="">`).join('') : ''}
      </div>
    </div>
  `;

  const layoutHtml = isSplit ? `
    <div class="split-layout">
      <div class="split-passage">
        ${passageHtml}
      </div>
      <div class="split-question">
        ${questionContentHtml}
      </div>
    </div>
  ` : `
    <div class="question-card">
      ${passageHtml}
      ${questionContentHtml}
    </div>
  `;

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="breadcrumb">
        <a href="index.html">Home</a>
        <span class="sep">›</span>
        <a href="?year=${year}">${year}</a>
        <span class="sep">›</span>
        <a href="?year=${year}&slot=${slot}">${slot.replace('slot-', 'Slot ')}</a>
        <span class="sep">›</span>
        <span>${section}</span>
      </div>

      <div class="tab-bar">
        <div class="tab-group">
          <span class="tab-group-label">Slot</span>
          ${['slot-1','slot-2','slot-3'].map(s => `
            <a class="tab ${s === slot ? 'active' : ''}" href="?year=${year}&slot=${s}&section=${section}">${s.replace('slot-', 'Slot ')}</a>
          `).join('')}
        </div>
        <div class="tab-group">
          <span class="tab-group-label">Section</span>
          ${['VARC','DILR','QA'].map(sec => `
            <a class="tab ${sec === section ? 'active' : ''}" href="?year=${year}&slot=${slot}&section=${sec}">${sec}</a>
          `).join('')}
        </div>
      </div>

      <div class="page-title">${year} ${slot.replace('slot-', 'Slot ')} ${section} PYQs</div>
      <div class="page-subtitle">${questions.length} questions</div>

      ${layoutHtml}

      <div class="q-nav">
        ${navHtml}
      </div>

      <script>
        renderMath(document.querySelector('.split-question, .question-card'));
      </script>
    </div>
  `;
}

function toggleExplanation() {
  const el = document.getElementById('explanation');
  if (el) el.classList.toggle('hidden');
}

function selectOption(radio) {
  const options = document.querySelectorAll('.option-item');
  options.forEach(opt => opt.classList.remove('selected'));
  if (radio.checked) {
    radio.closest('.option-item')?.classList.add('selected');
  }
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.classList.remove('hidden');
  }
}

function normalizeAnswer(ans) {
  if (!ans) return '';
  const s = String(ans).trim().toLowerCase();
  const map = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', 'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd' };
  const m = s.match(/(\d)/);
  if (m && map[m[1]]) return map[m[1]];
  if (map[s]) return map[s];
  return s.replace(/^option\s*/, '').trim();
}

function submitAnswer() {
  const q = currentPaper.questions[currentQuestionIndex];
  const answerArea = document.getElementById('answer-area');
  const submitBtn = document.getElementById('submit-btn');
  const options = document.querySelectorAll('.option-item');

  if (q.question_type === 'MCQ') {
    const selected = document.querySelector('input[name="q-option"]:checked');
    if (!selected) return;

    const correctNorm = normalizeAnswer(q.correct_answer);

    options.forEach(opt => {
      const input = opt.querySelector('input[type="radio"]');
      if (input) {
        input.disabled = true;
        const labelNorm = normalizeAnswer(input.value);
        if (labelNorm === correctNorm) {
          opt.classList.add('correct-option');
        } else if (input.checked) {
          opt.classList.add('wrong-option');
        }
      }
    });
  }

  if (q.question_type === 'TITA') {
    const titaInput = document.getElementById('tita-answer');
    if (titaInput) {
      titaInput.disabled = true;
      titaInput.style.opacity = '0.7';
    }
  }

  if (submitBtn) submitBtn.classList.add('hidden');
  if (answerArea) answerArea.classList.remove('hidden');
}

function renderLanding() {
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  document.getElementById('app').innerHTML = `
    <div class="landing-hero">
      <h1>CAT Past Year Questions</h1>
      <p>Offline clone of AfterGrad CAT PYQs — select a year to begin</p>
    </div>
    <div class="container">
      <div class="year-grid">
        ${years.map(y => `
          <a class="year-card" href="?year=${y}">
            <div class="year-num">${y}</div>
            <div class="year-meta">CAT ${y}</div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function looksLikeHtml(str) {
  if (!str) return false;
  return /<[a-zA-Z][^>]*>/.test(str);
}

function renderContent(str) {
  if (!str) return '';
  if (looksLikeHtml(str)) return str;
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function fixImgPath(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('./') || path.startsWith('/')) {
    return escapeHtml(path);
  }
  return '/' + escapeHtml(path);
}

function renderMath(container) {
  if (!container || typeof katex === 'undefined') return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(node => {
    let text = node.textValue;
    if (!text || !/[\\_^]/.test(text)) return;

    text = text
      .replace(/\u200B/g, '')
      .replace(/\u2060/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

    const lines = text.split('\n');
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { merged.push(''); continue; }
      const prev = merged.length > 0 ? merged[merged.length - 1] : '';
      const prevTrimmed = prev.trim();
      const isLatex = /^(\\[a-zA-Z]+|[\d.,+\-<>=\[\]\(\)]|x_\d|\ldots|\\max|\\min|\\frac|\\sqrt|\\left|\\right|\\sum|\\prod|\\int)/.test(line);
      const prevEndsLatex = /\\[a-zA-Z]+[^)]*$/.test(prevTrimmed) || /[_,^]\d+$/.test(prevTrimmed);
      if ((isLatex || prevEndsLatex) && prevTrimmed && !prevTrimmed.endsWith('.') && !prevTrimmed.endsWith('?') && !prevTrimmed.endsWith('!')) {
        merged[merged.length - 1] = prev + ' ' + line;
      } else {
        merged.push(line);
      }
    }

    const finalText = merged.join('\n');
    if (!/\\[a-zA-Z]+/.test(finalText) && !/x_\d/.test(finalText)) return;

    const segments = finalText.split(/(\\[a-zA-Z]+\s*(?:\{[^}]*\}|\[[^\]]*\])?)/g).filter(s => s.trim());
    const html = segments.map(seg => {
      if (/^\\[a-zA-Z]/.test(seg.trim())) {
        try {
          return katex.renderToString(seg.trim(), { throwOnError: false, displayMode: false });
        } catch (e) {
          return escapeHtml(seg);
        }
      }
      return escapeHtml(seg);
    }).join(' ');

    if (html !== escapeHtml(finalText)) {
      const span = document.createElement('span');
      span.innerHTML = html;
      node.parentNode.replaceChild(span, node);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

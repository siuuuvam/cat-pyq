(function () {
  'use strict';

  const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
  const SLOTS = ['slot-1', 'slot-2', 'slot-3'];
  const SECTIONS = ['VARC', 'DILR', 'QA'];

  const state = {
    currentYear: null,
    currentSlot: null,
    currentSection: null,
    currentQuestionIndex: 0,
    paper: null,
    darkMode: false,
    bookmarks: new Set(),
    progress: {},
    searchQuery: '',
    timerEnabled: false,
    timerSeconds: 0,
    timerInterval: null,
    quizMode: false,
    quizQuestions: [],
    quizIndex: 0,
    quizAnswers: [],
    quizStartTime: null,
  };

  function saveBookmarks() {
    try { localStorage.setItem('catpyq_bookmarks', JSON.stringify([...state.bookmarks])); } catch (e) {}
  }

  function loadBookmarks() {
    try {
      const data = JSON.parse(localStorage.getItem('catpyq_bookmarks') || '[]');
      state.bookmarks = new Set(data);
    } catch (e) { state.bookmarks = new Set(); }
  }

  function saveProgress() {
    try { localStorage.setItem('catpyq_progress', JSON.stringify(state.progress)); } catch (e) {}
  }

  function loadProgress() {
    try { state.progress = JSON.parse(localStorage.getItem('catpyq_progress') || '{}'); } catch (e) { state.progress = {}; }
  }

  function getProgressKey(year, slot, section, qNum) {
    return `${year}-${slot}-${section}-q${qNum}`;
  }

  function saveDarkMode() {
    try { localStorage.setItem('catpyq_dark', JSON.stringify(state.darkMode)); } catch (e) {}
  }

  function loadDarkMode() {
    try {
      const val = localStorage.getItem('catpyq_dark');
      if (val !== null) state.darkMode = JSON.parse(val);
      else state.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { state.darkMode = false; }
  }

  function applyDarkMode() {
    document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = state.darkMode ? sunIcon() : moonIcon();
  }

  function moonIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  function sunIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sanitizeHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, form, button, input, select, textarea').forEach(el => el.remove());
    doc.querySelectorAll('[onclick], [onerror], [onload], [onmouseover]').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  }

  function renderContent(str) {
    if (!str) return '';
    if (/<[a-zA-Z][^>]*>/.test(str)) return sanitizeHtml(str);
    return escapeHtml(str).replace(/\n/g, '<br>');
  }

  function fixImgPath(path) {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('./') || path.startsWith('/')) {
      return escapeHtml(path);
    }
    return '/' + escapeHtml(path);
  }

  function normalizeAnswer(ans) {
    if (!ans) return '';
    const s = String(ans).trim().toLowerCase();
    const map = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', 'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd' };
    const m = s.match(/(\d)/);
    if (m && map[m[1]]) return map[m[1]];
    if (map[s]) return map[s];
    return s.replace(/^option\s*/, '').trim().charAt(0) || '';
  }

  function renderMath(container) {
    if (!container || typeof katex === 'undefined') return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
      let text = node.textValue;
      if (!text || !/[\\_^]/.test(text)) return;
      text = text.replace(/\u200B/g, '').replace(/\u2060/g, '').replace(/\u00A0/g, ' ');
      if (!/\\[a-zA-Z]+/.test(text) && !/_[a-zA-Z0-9{]/.test(text) && !/\^[a-zA-Z0-9{]/.test(text)) return;

      const html = renderLatexText(text);
      if (html !== escapeHtml(text)) {
        const span = document.createElement('span');
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
      }
    });
  }

  function renderLatexText(text) {
    const result = [];
    let i = 0;
    const n = text.length;

    while (i < n) {
      if (text[i] === '\\') {
        const cmd = parseCommand(text, i);
        if (cmd) {
          try {
            result.push(katex.renderToString(cmd.tex, { throwOnError: false, displayMode: false }));
          } catch (e) {
            result.push(escapeHtml(cmd.tex));
          }
          i = cmd.end;
        } else {
          result.push(escapeHtml(text[i]));
          i++;
        }
      } else if (text[i] === '_' || text[i] === '^') {
        const sub = parseSubOrSup(text, i);
        if (sub) {
          try {
            result.push(katex.renderToString(sub.tex, { throwOnError: false, displayMode: false }));
          } catch (e) {
            result.push(escapeHtml(sub.tex));
          }
          i = sub.end;
        } else {
          result.push(escapeHtml(text[i]));
          i++;
        }
      } else {
        result.push(escapeHtml(text[i]));
        i++;
      }
    }
    return result.join('');
  }

  function parseCommand(text, start) {
    if (text[start] !== '\\' || start + 1 >= text.length) return null;
    let i = start + 1;
    let cmdName = '';

    if (text[i] === '{' || text[i] === '}') {
      return { tex: text.substring(start, i + 1), end: i + 1 };
    }

    if (text[i] === ',' || text[i] === ';' || text[i] === '!' || text[i] === ':' ||
        text[i] === '%' || text[i] === '#' || text[i] === '&' || text[i] === '_' ||
        text[i] === '$' || text[i] === '~' || text[i] === '^') {
      return { tex: text.substring(start, i + 1), end: i + 1 };
    }

    while (i < text.length && /[a-zA-Z]/.test(text[i])) {
      cmdName += text[i];
      i++;
    }

    if (!cmdName) return null;

    const twoArg = ['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'overset', 'underset'];
    const oneArg = ['sqrt', 'overline', 'underline', 'hat', 'bar', 'vec', 'dot',
                     'ddot', 'tilde', 'widehat', 'mathrm', 'mathbf', 'text',
                     'boldsymbol', 'color'];

    let tex = text.substring(start, i);

    if (twoArg.includes(cmdName)) {
      i = skipSpaces(text, i);
      if (i < text.length && text[i] === '{') {
        const a1 = readBraces(text, i);
        tex += text.substring(i, a1);
        i = a1;
        i = skipSpaces(text, i);
        if (i < text.length && text[i] === '{') {
          const a2 = readBraces(text, i);
          tex += text.substring(i, a2);
          i = a2;
        }
      }
    } else if (oneArg.includes(cmdName)) {
      i = skipSpaces(text, i);
      if (i < text.length && text[i] === '{') {
        const a1 = readBraces(text, i);
        tex += text.substring(i, a1);
        i = a1;
      }
    }

    while (i < text.length && text[i] in {'_': 1, '^': 1}) {
      const op = text[i];
      i++;
      i = skipSpaces(text, i);
      if (i < text.length && text[i] === '{') {
        const gr = readBraces(text, i);
        tex += op + text.substring(i, gr);
        i = gr;
      } else if (i < text.length) {
        tex += op + text[i];
        i++;
      }
    }

    return { tex, end: i };
  }

  function parseSubOrSup(text, start) {
    if ((text[start] !== '_' && text[start] !== '^') || start + 1 >= text.length) return null;
    const op = text[start];
    let i = start + 1;
    i = skipSpaces(text, i);
    let tex = op;

    if (i < text.length && text[i] === '{') {
      const gr = readBraces(text, i);
      tex += text.substring(i, gr);
      i = gr;
    } else if (i < text.length) {
      tex += text[i];
      i++;
    }

    while (i < text.length && text[i] in {'_': 1, '^': 1}) {
      const op2 = text[i];
      i++;
      i = skipSpaces(text, i);
      if (i < text.length && text[i] === '{') {
        const gr = readBraces(text, i);
        tex += op2 + text.substring(i, gr);
        i = gr;
      } else if (i < text.length) {
        tex += op2 + text[i];
        i++;
      }
    }

    return { tex, end: i };
  }

  function readBraces(text, start) {
    if (text[start] !== '{') return start + 1;
    let depth = 1;
    let i = start + 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    return i;
  }

  function skipSpaces(text, i) {
    while (i < text.length && text[i] === ' ') i++;
    return i;
  }

  function lazyLoadImages() {
    const imgs = document.querySelectorAll('img[data-src]');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.getAttribute('data-src');
            img.onload = () => img.classList.add('loaded');
            img.onerror = () => { img.classList.add('loaded'); img.alt = 'Image not available'; };
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '200px' });
      imgs.forEach(img => observer.observe(img));
    } else {
      imgs.forEach(img => {
        img.src = img.getAttribute('data-src');
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded');
      });
    }
  }

  function showLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.remove('hidden');
  }

  function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.add('hidden');
  }

  function renderSkeleton(type) {
    const app = document.getElementById('app');
    if (type === 'cards') {
      return `<div class="skeleton-grid">${Array(6).fill('').map(() =>
        `<div class="skeleton-card"><div class="skeleton-line skeleton-line-lg"></div><div class="skeleton-line skeleton-line-sm"></div></div>`
      ).join('')}</div>`;
    }
    if (type === 'question') {
      return `<div class="skeleton-question">
        <div class="skeleton-line skeleton-line-md"></div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-sm"></div>
        <div class="skeleton-option"></div><div class="skeleton-option"></div>
        <div class="skeleton-option"></div><div class="skeleton-option"></div>
      </div>`;
    }
    return `<div class="skeleton-grid">${Array(3).fill('').map(() =>
      `<div class="skeleton-card"><div class="skeleton-line skeleton-line-lg"></div><div class="skeleton-line skeleton-line-sm"></div></div>`
    ).join('')}</div>`;
  }

  function renderError(message, retryFn) {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="container"><div class="error-state">
      <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <h3>Something went wrong</h3>
      <p>${escapeHtml(message)}</p>
      ${retryFn ? '<button class="btn btn-primary" onclick="window.__retryFn()">Try Again</button>' : ''}
    </div></div>`;
    if (retryFn) window.__retryFn = retryFn;
  }

  function renderEmpty(message) {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="container"><div class="empty-state">
      <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
      <h3>${escapeHtml(message)}</h3>
      <a href="index.html" class="btn btn-primary">Go to Home</a>
    </div></div>`;
  }

  function updateNavActive() {
    document.querySelectorAll('.header-nav a[data-year]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-year') === String(state.currentYear));
    });
  }

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerSeconds = 0;
    state.timerInterval = setInterval(() => {
      state.timerSeconds++;
      const el = document.getElementById('timer-display');
      if (el) el.textContent = formatTime(state.timerSeconds);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── ROUTING ──
  function navigate(url) {
    history.pushState(null, '', url);
    handleRoute();
  }

  function handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const year = params.get('year');
    const slot = params.get('slot');
    const section = params.get('section');
    const qNum = params.get('q');
    const view = params.get('view');

    state.currentYear = year ? parseInt(year) : null;
    state.currentSlot = slot;
    state.currentSection = section;

    if (view === 'bookmarks') { renderBookmarks(); updateNavActive(); return; }
    if (view === 'random') { renderRandomSetup(); updateNavActive(); return; }
    if (view === 'progress') { renderProgressView(); updateNavActive(); return; }

    if (year && slot && section) loadPaperView(year, slot, section, qNum);
    else if (year && slot) loadSectionList(year, slot);
    else if (year) loadSlotList(year);
    else renderLanding();

    updateNavActive();
  }

  // ── LANDING ──
  function renderLanding() {
    hideLoading();
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="landing-hero">
        <h1>CAT Past Year Questions</h1>
        <p>Practice with real CAT papers from 2020–2025</p>
        <div class="landing-actions">
          <a href="?view=random" class="btn btn-primary" onclick="event.preventDefault(); window.__appNav('?view=random')">Quick Practice</a>
          <a href="?view=bookmarks" class="btn btn-outline" onclick="event.preventDefault(); window.__appNav('?view=bookmarks')">My Bookmarks</a>
          <a href="?view=progress" class="btn btn-outline" onclick="event.preventDefault(); window.__appNav('?view=progress')">Progress</a>
        </div>
      </div>
      <div class="container">
        <div class="year-grid">
          ${YEARS.map(y => `
            <a class="year-card" href="?year=${y}" onclick="event.preventDefault(); window.__appNav('?year=${y}')">
              <div class="year-num">${y}</div>
              <div class="year-meta">CAT ${y}</div>
            </a>
          `).join('')}
        </div>
      </div>`;
  }

  // ── SLOT LIST ──
  async function loadSlotList(year) {
    showLoading();
    const app = document.getElementById('app');
    app.innerHTML = renderSkeleton('cards');
    const slotData = [];
    for (const slot of SLOTS) {
      const sections = [];
      for (const section of SECTIONS) {
        try {
          const paper = await loadPaper(year, slot, section);
          sections.push({ section, paper });
        } catch (e) {
          sections.push({ section, paper: null });
        }
      }
      slotData.push({ slot, sections });
    }
    hideLoading();
    renderSlotList(year, slotData);
  }

  function renderSlotList(year, slotData) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <a class="back-link" href="?year=${year}" onclick="event.preventDefault(); window.__appNav('?year=${year}')">← Back to years</a>
        <div class="page-header">
          <h2 class="page-title">CAT ${year}</h2>
          <p class="page-subtitle">Select a slot to view sections</p>
        </div>
        <div class="slot-grid">
          ${slotData.map(s => {
            const count = s.sections.filter(x => x.paper).length;
            return `<a class="slot-card ${count === 0 ? 'empty' : ''}" href="?year=${year}&slot=${s.slot}" onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${s.slot}')">
              <div class="slot-name">${s.slot.replace('slot-', 'Slot ')}</div>
              <div class="slot-meta">${count > 0 ? count + ' sections available' : 'No data'}</div>
            </a>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── SECTION LIST ──
  async function loadSectionList(year, slot) {
    showLoading();
    const app = document.getElementById('app');
    app.innerHTML = renderSkeleton('cards');
    const sectionData = [];
    for (const section of SECTIONS) {
      try {
        const paper = await loadPaper(year, slot, section);
        sectionData.push({ section, paper });
      } catch (e) {
        sectionData.push({ section, paper: null, error: e.message });
      }
    }
    hideLoading();
    renderSectionList(year, slot, sectionData);
  }

  function renderSectionList(year, slot, sectionData) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <a class="back-link" href="?year=${year}" onclick="event.preventDefault(); window.__appNav('?year=${year}')">← Back to ${year}</a>
        <div class="page-header">
          <h2 class="page-title">${year} ${slot.replace('slot-', 'Slot ')}</h2>
          <p class="page-subtitle">Select a section</p>
        </div>
        <div class="slot-grid">
          ${sectionData.map(s => `
            <a class="slot-card ${s.paper ? '' : 'empty'}" href="?year=${year}&slot=${slot}&section=${s.section}" onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${slot}&section=${s.section}')">
              <div class="slot-name">${s.section}</div>
              <div class="slot-meta">${s.paper ? s.paper.questions.length + ' questions' : 'Not available'}</div>
            </a>
          `).join('')}
        </div>
      </div>`;
  }

  // ── PAPER VIEW ──
  async function loadPaperView(year, slot, section, qNum) {
    showLoading();
    const app = document.getElementById('app');
    app.innerHTML = renderSkeleton('question');
    try {
      state.paper = await loadPaper(year, slot, section);
    } catch (e) {
      hideLoading();
      renderError('Failed to load paper: ' + e.message, () => loadPaperView(year, slot, section, qNum));
      return;
    }
    if (!state.paper || !state.paper.questions || state.paper.questions.length === 0) {
      hideLoading();
      renderEmpty('No questions found for this selection.');
      return;
    }
    const questions = state.paper.questions;
    state.currentQuestionIndex = qNum ? questions.findIndex(q => String(q.question_number) === String(qNum)) : 0;
    if (state.currentQuestionIndex < 0) state.currentQuestionIndex = 0;
    hideLoading();
    renderPaperView(year, slot, section);
  }

  function renderPaperView(year, slot, section) {
    const app = document.getElementById('app');
    const questions = state.paper.questions;
    const q = questions[state.currentQuestionIndex];
    const passage = getPassage(state.paper, q.passage_id);
    const isSplit = section === 'VARC' || section === 'DILR';
    const pKey = getProgressKey(year, slot, section, q.question_number);
    const prog = state.progress[pKey] || {};
    const isBookmarked = state.bookmarks.has(pKey);

    const passageHtml = passage ? `
      <div class="passage-block">
        ${renderContent(passage.text)}
        ${passage.images && passage.images.length ? passage.images.map(img => `<img data-src="${fixImgPath(img)}" alt="Passage image" class="lazy-img">`).join('') : ''}
      </div>` : '';

    const optionsHtml = q.question_type === 'MCQ' && q.options ? `
      <div class="options-list" role="radiogroup" aria-label="Answer options">
        ${q.options.map((opt, idx) => `
          <label class="option-item ${prog.status === 'correct' && normalizeAnswer(opt.label) === normalizeAnswer(q.correct_answer) ? 'correct-option' : ''} ${prog.status === 'incorrect' && normalizeAnswer(opt.label) === prog.selectedAnswer ? 'wrong-option' : ''}" data-index="${idx}">
            <input type="radio" name="q-option" value="${escapeHtml(opt.label)}" onchange="window.__selectOption(this)" ${prog.status ? 'disabled' : ''} ${prog.selectedAnswer && normalizeAnswer(opt.label) === prog.selectedAnswer ? 'checked' : ''}>
            <span class="option-label">${escapeHtml(opt.label)}</span>
            <span class="option-text">${escapeHtml(opt.text)}</span>
          </label>
        `).join('')}
      </div>` : '';

    const titaHtml = q.question_type === 'TITA' ? `
      <div class="tita-input-area">
        <input type="text" id="tita-answer" placeholder="Type your answer here..." autocomplete="off" ${prog.status ? 'disabled' : ''} value="${prog.selectedAnswer ? escapeHtml(prog.selectedAnswer) : ''}">
      </div>` : '';

    const diffClass = q.difficulty === 'Hard' ? 'diff-hard' : q.difficulty === 'Medium' ? 'diff-medium' : 'diff-easy';
    const cats = [q.category_tag, q.sub_topic_tag].filter(Boolean);

    const navHtml = questions.map((qq, idx) => {
      const qp = state.progress[getProgressKey(year, slot, section, qq.question_number)] || {};
      let statusClass = '';
      if (qp.status === 'correct') statusClass = 'q-nav-correct';
      else if (qp.status === 'incorrect') statusClass = 'q-nav-incorrect';
      else if (qp.flagged) statusClass = 'q-nav-flagged';
      return `<a class="q-nav-btn ${idx === state.currentQuestionIndex ? 'active' : ''} ${statusClass}"
        href="?year=${year}&slot=${slot}&section=${section}&q=${qq.question_number}"
        onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${slot}&section=${section}&q=${qq.question_number}')"
        title="Q${qq.question_number}">${qq.question_number}</a>`;
    }).join('');

    const revealed = prog.status === 'correct' || prog.status === 'incorrect';
    const showExplanation = prog.showExplanation;

    const questionContentHtml = `
      <div class="question-header">
        <span class="q-number">Q${q.question_number}:</span>
        ${cats.map((c, i) => `<span class="pill pill-blue">${i > 0 ? '<span class="pill-sep">›</span>' : ''}${escapeHtml(c)}</span>`).join('')}
        <span class="pill ${diffClass}">${q.difficulty || ''}</span>
        <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="window.__toggleBookmark('${pKey}')" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}" aria-label="${isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      <div class="question-text">
        ${renderContent(q.question_text)}
        ${q.images && q.images.length ? q.images.map(img => `<img data-src="${fixImgPath(img)}" alt="Question image" class="lazy-img">`).join('') : ''}
      </div>

      ${optionsHtml}
      ${titaHtml}

      ${!revealed ? `<button id="submit-btn" class="btn btn-primary" onclick="window.__submitAnswer()">Submit Answer</button>` : ''}

      ${revealed ? `
        <div class="answer-reveal ${prog.status === 'correct' ? 'correct' : 'incorrect'}">
          <div class="answer-box">
            <span class="answer-label">Your answer:</span>
            <span class="answer-value">${prog.selectedAnswer ? escapeHtml(prog.selectedAnswer).toUpperCase() : '—'}</span>
            <span class="answer-badge ${prog.status}">${prog.status === 'correct' ? 'Correct' : 'Incorrect'}</span>
          </div>
          <div class="answer-box">
            <span class="answer-label">Correct answer:</span>
            <span class="answer-value">${escapeHtml(q.correct_answer)}</span>
          </div>
        </div>
        <div class="action-row">
          <button class="btn btn-outline btn-sm" onclick="window.__toggleExplanation()">${showExplanation ? 'Hide' : 'Show'} Explanation</button>
          <button class="btn btn-outline btn-sm" onclick="window.__toggleFlag('${pKey}')"> ${prog.flagged ? 'Unflag' : 'Flag for Review'}</button>
        </div>
      ` : ''}

      ${!revealed && q.question_type === 'TITA' ? `
        <div class="action-row" style="margin-top:12px">
          <button class="btn btn-outline btn-sm" onclick="window.__revealAnswer()">Reveal Answer Without Submitting</button>
        </div>
      ` : ''}

      <div id="explanation" class="explanation-section ${showExplanation ? '' : 'hidden'}">
        <div class="explanation-heading">Solution</div>
        <div class="explanation-text">${renderContent(q.explanation_text)}
          ${q.explanation_images && q.explanation_images.length ? q.explanation_images.map(img => `<img data-src="${fixImgPath(img)}" alt="Explanation image" class="lazy-img">`).join('') : ''}
        </div>
      </div>

      ${revealed ? `
        <div class="nav-row">
          ${state.currentQuestionIndex > 0 ? `<button class="btn btn-outline" onclick="window.__appNav('?year=${year}&slot=${slot}&section=${section}&q=${questions[state.currentQuestionIndex - 1].question_number}')">← Previous</button>` : '<span></span>'}
          <span class="q-progress-text">${state.currentQuestionIndex + 1} / ${questions.length}</span>
          ${state.currentQuestionIndex < questions.length - 1 ? `<button class="btn btn-primary" onclick="window.__appNav('?year=${year}&slot=${slot}&section=${section}&q=${questions[state.currentQuestionIndex + 1].question_number}')">Next →</button>` : '<span></span>'}
        </div>
      ` : ''}
    `;

    const layoutHtml = isSplit ? `
      <div class="split-layout">
        <div class="split-passage">${passageHtml}</div>
        <div class="split-question">${questionContentHtml}</div>
      </div>` : `
      <div class="question-card">${passageHtml}${questionContentHtml}</div>`;

    app.innerHTML = `
      <div class="container">
        <div class="breadcrumb">
          <a href="index.html" onclick="event.preventDefault(); window.__appNav('index.html')">Home</a>
          <span class="sep">›</span>
          <a href="?year=${year}" onclick="event.preventDefault(); window.__appNav('?year=${year}')">${year}</a>
          <span class="sep">›</span>
          <a href="?year=${year}&slot=${slot}" onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${slot}')">${slot.replace('slot-', 'Slot ')}</a>
          <span class="sep">›</span>
          <span>${section}</span>
        </div>

        <div class="tab-bar">
          <div class="tab-group">
            <span class="tab-group-label">Slot</span>
            ${SLOTS.map(s => `<a class="tab ${s === slot ? 'active' : ''}" href="?year=${year}&slot=${s}&section=${section}" onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${s}&section=${section}')">${s.replace('slot-', 'Slot ')}</a>`).join('')}
          </div>
          <div class="tab-group">
            <span class="tab-group-label">Section</span>
            ${SECTIONS.map(sec => `<a class="tab ${sec === section ? 'active' : ''}" href="?year=${year}&slot=${slot}&section=${sec}" onclick="event.preventDefault(); window.__appNav('?year=${year}&slot=${slot}&section=${sec}')">${sec}</a>`).join('')}
          </div>
          ${state.timerEnabled ? `<div class="timer-display" id="timer-display">${formatTime(state.timerSeconds)}</div>` : ''}
        </div>

        <div class="page-header">
          <h2 class="page-title">${year} ${slot.replace('slot-', 'Slot ')} ${section}</h2>
          <p class="page-subtitle">${questions.length} questions</p>
        </div>

        ${layoutHtml}

        <div class="q-nav">${navHtml}</div>
      </div>`;

    setTimeout(() => {
      const target = document.querySelector('.split-question, .question-card');
      if (target) {
        renderMath(target);
        lazyLoadImages();
      }
    }, 0);
  }

  // ── BOOKMARKS VIEW ──
  function renderBookmarks() {
    hideLoading();
    const app = document.getElementById('app');
    if (state.bookmarks.size === 0) {
      app.innerHTML = `<div class="container"><div class="empty-state">
        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
        <h3>No bookmarks yet</h3>
        <p>Star questions to save them here for quick access.</p>
        <a href="index.html" class="btn btn-primary" onclick="event.preventDefault(); window.__appNav('index.html')">Browse Questions</a>
      </div></div>`;
      return;
    }
    const items = [...state.bookmarks].map(key => {
      const parts = key.match(/^(\d+)-(slot-\d+)-([A-Z]+)-q(\d+)$/);
      if (!parts) return null;
      const [, yr, sl, sec, qn] = parts;
      return { year: yr, slot: sl, section: sec, qNum: qn, key };
    }).filter(Boolean);

    app.innerHTML = `
      <div class="container">
        <a class="back-link" href="index.html" onclick="event.preventDefault(); window.__appNav('index.html')">← Home</a>
        <div class="page-header">
          <h2 class="page-title">My Bookmarks</h2>
          <p class="page-subtitle">${items.length} bookmarked question${items.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="bookmark-list">
          ${items.map(item => `
            <a class="bookmark-item" href="?year=${item.year}&slot=${item.slot}&section=${item.section}&q=${item.qNum}" onclick="event.preventDefault(); window.__appNav('?year=${item.year}&slot=${item.slot}&section=${item.section}&q=${item.qNum}')">
              <span class="bookmark-item-info">
                <span class="bookmark-item-q">Q${item.qNum}</span>
                <span class="bookmark-item-meta">${item.year} ${item.slot.replace('slot-', 'Slot ')} ${item.section}</span>
              </span>
              <span class="bookmark-item-arrow">→</span>
            </a>
          `).join('')}
        </div>
      </div>`;
  }

  // ── PROGRESS VIEW ──
  function renderProgressView() {
    hideLoading();
    const app = document.getElementById('app');
    const allProgress = Object.entries(state.progress);
    if (allProgress.length === 0) {
      app.innerHTML = `<div class="container"><div class="empty-state">
        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
        <h3>No progress yet</h3>
        <p>Start answering questions to track your progress.</p>
        <a href="index.html" class="btn btn-primary" onclick="event.preventDefault(); window.__appNav('index.html')">Start Practicing</a>
      </div></div>`;
      return;
    }

    const bySet = {};
    allProgress.forEach(([key, prog]) => {
      const parts = key.match(/^(\d+)-(slot-\d+)-([A-Z]+)-q(\d+)$/);
      if (!parts) return;
      const [, yr, sl, sec] = parts;
      const setKey = `${yr}-${sl}-${sec}`;
      if (!bySet[setKey]) bySet[setKey] = { year: yr, slot: sl, section: sec, total: 0, correct: 0, incorrect: 0, flagged: 0 };
      bySet[setKey].total++;
      if (prog.status === 'correct') bySet[setKey].correct++;
      if (prog.status === 'incorrect') bySet[setKey].incorrect++;
      if (prog.flagged) bySet[setKey].flagged++;
    });

    const setEntries = Object.values(bySet).sort((a, b) => b.year - a.year || a.slot.localeCompare(b.slot) || a.section.localeCompare(b.section));

    app.innerHTML = `
      <div class="container">
        <a class="back-link" href="index.html" onclick="event.preventDefault(); window.__appNav('index.html')">← Home</a>
        <div class="page-header">
          <h2 class="page-title">My Progress</h2>
          <p class="page-subtitle">${allProgress.length} questions attempted across ${setEntries.length} sets</p>
        </div>
        <div class="progress-summary">
          <div class="progress-stat correct"><span class="stat-num">${allProgress.filter(([, p]) => p.status === 'correct').length}</span><span class="stat-label">Correct</span></div>
          <div class="progress-stat incorrect"><span class="stat-num">${allProgress.filter(([, p]) => p.status === 'incorrect').length}</span><span class="stat-label">Incorrect</span></div>
          <div class="progress-stat flagged"><span class="stat-num">${allProgress.filter(([, p]) => p.flagged).length}</span><span class="stat-label">Flagged</span></div>
        </div>
        <div class="progress-sets">
          ${setEntries.map(s => {
            const accuracy = s.correct + s.incorrect > 0 ? Math.round(s.correct / (s.correct + s.incorrect) * 100) : 0;
            return `<a class="progress-set-item" href="?year=${s.year}&slot=${s.slot}&section=${s.section}" onclick="event.preventDefault(); window.__appNav('?year=${s.year}&slot=${s.slot}&section=${s.section}')">
              <div class="progress-set-info">
                <span class="progress-set-name">${s.year} ${s.slot.replace('slot-', 'Slot ')} ${s.section}</span>
                <span class="progress-set-stats">${s.correct}/${s.correct + s.incorrect} correct (${accuracy}%)</span>
              </div>
              <div class="progress-bar"><div class="progress-bar-fill" style="width:${accuracy}%"></div></div>
            </a>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── RANDOM PRACTICE ──
  function renderRandomSetup() {
    hideLoading();
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <a class="back-link" href="index.html" onclick="event.preventDefault(); window.__appNav('index.html')">← Home</a>
        <div class="page-header">
          <h2 class="page-title">Quick Practice</h2>
          <p class="page-subtitle">Shuffle questions from any year/section</p>
        </div>
        <div class="random-setup">
          <div class="form-group">
            <label class="form-label">Year</label>
            <select id="random-year" class="form-select">
              <option value="all">All Years</option>
              ${YEARS.map(y => `<option value="${y}">${y}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Section</label>
            <select id="random-section" class="form-select">
              <option value="all">All Sections</option>
              ${SECTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Number of Questions</label>
            <select id="random-count" class="form-select">
              <option value="10">10</option>
              <option value="15" selected>15</option>
              <option value="20">20</option>
              <option value="30">30</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="window.__startRandom()">Start Practice</button>
        </div>
      </div>`;
  }

  async function startRandom() {
    const yearSelect = document.getElementById('random-year');
    const sectionSelect = document.getElementById('random-section');
    const countSelect = document.getElementById('random-count');
    const yearFilter = yearSelect.value;
    const sectionFilter = sectionSelect.value;
    const count = parseInt(countSelect.value);

    showLoading();
    const app = document.getElementById('app');
    app.innerHTML = renderSkeleton('question');

    let allQuestions = [];
    const yearsToFetch = yearFilter === 'all' ? YEARS : [parseInt(yearFilter)];
    const sectionsToFetch = sectionFilter === 'all' ? SECTIONS : [sectionFilter];

    for (const yr of yearsToFetch) {
      for (const sl of SLOTS) {
        for (const sec of sectionsToFetch) {
          try {
            const paper = await loadPaper(yr, sl, sec);
            paper.questions.forEach(q => {
              allQuestions.push({ ...q, year: yr, slot: sl, section: sec });
            });
          } catch (e) { /* skip missing papers */ }
        }
      }
    }

    if (allQuestions.length === 0) {
      hideLoading();
      renderEmpty('No questions found for the selected filters.');
      return;
    }

    // Fisher-Yates shuffle
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    state.quizMode = true;
    state.quizQuestions = allQuestions.slice(0, count);
    state.quizIndex = 0;
    state.quizAnswers = [];
    state.quizStartTime = Date.now();

    if (state.timerEnabled) startTimer();

    hideLoading();
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const app = document.getElementById('app');
    const q = state.quizQuestions[state.quizIndex];
    if (!q) { renderQuizSummary(); return; }

    const isMCQ = q.question_type === 'MCQ';
    const optionsHtml = isMCQ && q.options ? `
      <div class="options-list" role="radiogroup" aria-label="Answer options">
        ${q.options.map((opt, idx) => `
          <label class="option-item" data-index="${idx}">
            <input type="radio" name="q-option" value="${escapeHtml(opt.label)}" onchange="window.__selectOption(this)">
            <span class="option-label">${escapeHtml(opt.label)}</span>
            <span class="option-text">${escapeHtml(opt.text)}</span>
          </label>
        `).join('')}
      </div>` : '';

    const titaHtml = !isMCQ ? `
      <div class="tita-input-area">
        <input type="text" id="tita-answer" placeholder="Type your answer here..." autocomplete="off">
      </div>` : '';

    app.innerHTML = `
      <div class="container">
        <div class="quiz-header">
          <button class="btn btn-outline btn-sm" onclick="window.__exitQuiz()">Exit Quiz</button>
          <span class="quiz-progress">${state.quizIndex + 1} / ${state.quizQuestions.length}</span>
          ${state.timerEnabled ? `<span class="timer-display" id="timer-display">${formatTime(state.timerSeconds)}</span>` : ''}
        </div>
        <div class="question-card">
          <div class="question-header">
            <span class="q-number">Q${q.question_number}:</span>
            <span class="pill pill-blue">${escapeHtml(q.section)}</span>
            <span class="pill pill-blue">${escapeHtml(q.year)} ${escapeHtml(q.slot).replace('slot-', 'Slot ')}</span>
            ${q.difficulty ? `<span class="pill ${q.difficulty === 'Hard' ? 'diff-hard' : q.difficulty === 'Medium' ? 'diff-medium' : 'diff-easy'}">${q.difficulty}</span>` : ''}
          </div>
          <div class="question-text">
            ${renderContent(q.question_text)}
            ${q.images && q.images.length ? q.images.map(img => `<img data-src="${fixImgPath(img)}" alt="Question image" class="lazy-img">`).join('') : ''}
          </div>
          ${optionsHtml}
          ${titaHtml}
          <div class="nav-row">
            <span></span>
            <button class="btn btn-primary" onclick="window.__submitQuizAnswer()">Submit & Next →</button>
          </div>
        </div>
      </div>`;

    setTimeout(() => { renderMath(document.querySelector('.question-card')); lazyLoadImages(); }, 0);
  }

  function submitQuizAnswer() {
    const q = state.quizQuestions[state.quizIndex];
    let selected = null;
    if (q.question_type === 'MCQ') {
      const input = document.querySelector('input[name="q-option"]:checked');
      selected = input ? input.value : null;
    } else {
      const input = document.getElementById('tita-answer');
      selected = input ? input.value : null;
    }
    const isCorrect = selected && normalizeAnswer(selected) === normalizeAnswer(q.correct_answer);
    state.quizAnswers.push({ question: q, selected, isCorrect });

    state.quizIndex++;
    if (state.quizIndex >= state.quizQuestions.length) {
      renderQuizSummary();
    } else {
      renderQuizQuestion();
    }
  }

  function renderQuizSummary() {
    stopTimer();
    const elapsed = state.timerEnabled ? Math.floor((Date.now() - state.quizStartTime) / 1000) : 0;
    const total = state.quizAnswers.length;
    const correct = state.quizAnswers.filter(a => a.isCorrect).length;
    const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <div class="quiz-summary">
          <h2>Practice Complete!</h2>
          <div class="summary-stats">
            <div class="progress-stat correct"><span class="stat-num">${correct}</span><span class="stat-label">Correct</span></div>
            <div class="progress-stat incorrect"><span class="stat-num">${total - correct}</span><span class="stat-label">Incorrect</span></div>
            <div class="progress-stat"><span class="stat-num">${accuracy}%</span><span class="stat-label">Accuracy</span></div>
            ${state.timerEnabled ? `<div class="progress-stat"><span class="stat-num">${formatTime(elapsed)}</span><span class="stat-label">Time</span></div>` : ''}
          </div>
          <div class="quiz-review">
            ${state.quizAnswers.map((a, i) => `
              <div class="quiz-review-item ${a.isCorrect ? 'correct' : 'incorrect'}">
                <span class="review-num">Q${i + 1}</span>
                <span class="review-answer">${a.selected ? escapeHtml(a.selected) : '—'} → ${escapeHtml(a.question.correct_answer)}</span>
                <span class="review-badge">${a.isCorrect ? '✓' : '✗'}</span>
              </div>
            `).join('')}
          </div>
          <div class="action-row">
            <button class="btn btn-primary" onclick="window.__appNav('?view=random')">Try Again</button>
            <a class="btn btn-outline" href="index.html" onclick="event.preventDefault(); window.__appNav('index.html')">Back to Home</a>
          </div>
        </div>
      </div>`;
  }

  function exitQuiz() {
    state.quizMode = false;
    state.quizQuestions = [];
    stopTimer();
    handleRoute();
  }

  // ── ACTIONS ──
  function selectOption(radio) {
    document.querySelectorAll('.option-item').forEach(opt => opt.classList.remove('selected'));
    if (radio.checked) radio.closest('.option-item')?.classList.add('selected');
  }

  function submitAnswer() {
    const q = state.paper.questions[state.currentQuestionIndex];
    const year = state.currentYear;
    const slot = state.currentSlot;
    const section = state.currentSection;
    const pKey = getProgressKey(year, slot, section, q.question_number);

    let selected = null;
    if (q.question_type === 'MCQ') {
      const input = document.querySelector('input[name="q-option"]:checked');
      if (!input) return;
      selected = input.value;
    } else {
      const input = document.getElementById('tita-answer');
      selected = input ? input.value : '';
    }

    const correctNorm = normalizeAnswer(q.correct_answer);
    const selectedNorm = normalizeAnswer(selected);
    const isCorrect = selected && selectedNorm === correctNorm;

    if (!state.progress[pKey]) state.progress[pKey] = {};
    state.progress[pKey].status = isCorrect ? 'correct' : 'incorrect';
    state.progress[pKey].selectedAnswer = selected;
    state.progress[pKey].showExplanation = false;
    saveProgress();

    renderPaperView(year, slot, section);
  }

  function revealAnswer() {
    const q = state.paper.questions[state.currentQuestionIndex];
    const pKey = getProgressKey(state.currentYear, state.currentSlot, state.currentSection, q.question_number);
    if (!state.progress[pKey]) state.progress[pKey] = {};
    state.progress[pKey].status = 'incorrect';
    state.progress[pKey].selectedAnswer = 'Revealed';
    state.progress[pKey].showExplanation = true;
    saveProgress();
    renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
  }

  function toggleExplanation() {
    const q = state.paper.questions[state.currentQuestionIndex];
    const pKey = getProgressKey(state.currentYear, state.currentSlot, state.currentSection, q.question_number);
    if (state.progress[pKey]) {
      state.progress[pKey].showExplanation = !state.progress[pKey].showExplanation;
      saveProgress();
    }
    const el = document.getElementById('explanation');
    if (el) {
      el.classList.toggle('hidden');
      if (!el.classList.contains('hidden')) lazyLoadImages();
    }
  }

  function toggleBookmark(key) {
    if (state.bookmarks.has(key)) state.bookmarks.delete(key);
    else state.bookmarks.add(key);
    saveBookmarks();
    if (state.paper) renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
  }

  function toggleFlag(key) {
    if (!state.progress[key]) state.progress[key] = {};
    state.progress[key].flagged = !state.progress[key].flagged;
    saveProgress();
    renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
  }

  function toggleTimer() {
    state.timerEnabled = !state.timerEnabled;
    if (state.timerEnabled) { startTimer(); }
    else { stopTimer(); }
    const el = document.getElementById('timer-toggle');
    if (el) el.classList.toggle('active', state.timerEnabled);
    if (state.paper) renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
  }

  // ── KEYBOARD SHORTCUTS ──
  function handleKeyboard(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (state.quizMode) {
      if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); submitQuizAnswer(); }
      return;
    }

    if (!state.paper) return;
    const questions = state.paper.questions;
    if (e.key === 'ArrowLeft' || e.key === 'h') {
      e.preventDefault();
      if (state.currentQuestionIndex > 0) {
        const q = questions[state.currentQuestionIndex - 1];
        navigate(`?year=${state.currentYear}&slot=${state.currentSlot}&section=${state.currentSection}&q=${q.question_number}`);
      }
    }
    if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      if (state.currentQuestionIndex < questions.length - 1) {
        const q = questions[state.currentQuestionIndex + 1];
        navigate(`?year=${state.currentYear}&slot=${state.currentSlot}&section=${state.currentSection}&q=${q.question_number}`);
      }
    }
    if (e.key === ' ' || e.key === 'Enter') {
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn && !submitBtn.classList.contains('hidden')) {
        e.preventDefault();
        submitAnswer();
      }
    }
    if (e.key === 'e') {
      const q = state.paper.questions[state.currentQuestionIndex];
      const pKey = getProgressKey(state.currentYear, state.currentSlot, state.currentSection, q.question_number);
      const prog = state.progress[pKey];
      if (prog && (prog.status === 'correct' || prog.status === 'incorrect')) {
        toggleExplanation();
      }
    }
    if (e.key === 'b') {
      const q = state.paper.questions[state.currentQuestionIndex];
      const pKey = getProgressKey(state.currentYear, state.currentSlot, state.currentSection, q.question_number);
      toggleBookmark(pKey);
    }
    if (e.key === 'f') {
      const q = state.paper.questions[state.currentQuestionIndex];
      const pKey = getProgressKey(state.currentYear, state.currentSlot, state.currentSection, q.question_number);
      toggleFlag(pKey);
    }
  }

  // ── SEARCH ──
  function handleSearch(query) {
    state.searchQuery = query.toLowerCase().trim();
    if (!state.paper) return;
    if (!state.searchQuery) {
      state.currentQuestionIndex = 0;
      renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
      return;
    }
    const idx = state.paper.questions.findIndex(q => {
      const text = (q.question_text || '').toLowerCase();
      const cat = (q.category_tag || '').toLowerCase();
      const sub = (q.sub_topic_tag || '').toLowerCase();
      return text.includes(state.searchQuery) || cat.includes(state.searchQuery) || sub.includes(state.searchQuery);
    });
    if (idx >= 0) {
      state.currentQuestionIndex = idx;
      renderPaperView(state.currentYear, state.currentSlot, state.currentSection);
    }
  }

  // ── PRINT ──
  function printQuestions() {
    if (!state.paper) return;
    const questions = state.paper.questions;
    const printWindow = window.open('', '_blank');
    const showAnswers = confirm('Include answers and explanations?');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>CAT ${state.currentYear} ${state.currentSlot} ${state.currentSection}</title>
      <link rel="stylesheet" href="/lib/katex.min.css">
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#1f2937}
      .q{margin-bottom:24px;page-break-inside:avoid}.q-num{font-weight:700}.opt{margin:4px 0 4px 20px}
      .ans{background:#f0fdf4;border:1px solid #bbf7d0;padding:8px 12px;border-radius:6px;margin-top:8px}
      .exp{background:#fffbeb;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;margin-top:8px;font-size:14px}
      img{max-width:100%}h1{font-size:20px}h2{font-size:16px}</style></head><body>
      <h1>CAT ${state.currentYear} ${state.currentSlot.replace('slot-','Slot ')} ${state.currentSection} — ${questions.length} Questions</h1>`);
    questions.forEach(q => {
      const opts = q.options && q.options.length ? q.options.map(o => `<div class="opt">${escapeHtml(o.label)}. ${escapeHtml(o.text)}</div>`).join('') : '';
      const ansHtml = showAnswers ? `<div class="ans"><strong>Answer:</strong> ${escapeHtml(q.correct_answer)}</div>` : '';
      const expHtml = showAnswers && q.explanation_text ? `<div class="exp"><strong>Explanation:</strong> ${renderContent(q.explanation_text)}</div>` : '';
      printWindow.document.write(`<div class="q"><div class="q-num">Q${q.question_number}.</div><div>${renderContent(q.question_text)}</div>${opts}${ansHtml}${expHtml}</div>`);
    });
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }

  // ── INIT ──
  function init() {
    loadDarkMode();
    loadBookmarks();
    loadProgress();
    applyDarkMode();

    window.addEventListener('popstate', handleRoute);
    document.addEventListener('keydown', handleKeyboard);

    window.__appNav = function (url) { navigate(url); };
    window.__selectOption = selectOption;
    window.__submitAnswer = submitAnswer;
    window.__revealAnswer = revealAnswer;
    window.__toggleExplanation = toggleExplanation;
    window.__toggleBookmark = toggleBookmark;
    window.__toggleFlag = toggleFlag;
    window.__startRandom = startRandom;
    window.__submitQuizAnswer = submitQuizAnswer;
    window.__exitQuiz = exitQuiz;
    window.__toggleTimer = toggleTimer;
    window.__handleSearch = handleSearch;
    window.__printQuestions = printQuestions;
    window.__toggleDarkMode = function () {
      state.darkMode = !state.darkMode;
      saveDarkMode();
      applyDarkMode();
    };

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let debounce;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(() => handleSearch(this.value), 300);
      });
    }

    const timerBtn = document.getElementById('timer-toggle');
    if (timerBtn) {
      timerBtn.addEventListener('click', toggleTimer);
    }

    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', printQuestions);
    }

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
        mobileMenuBtn.classList.toggle('open');
      });
      mobileMenu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          mobileMenu.classList.remove('open');
          mobileMenuBtn.classList.remove('open');
        });
      });
    }

    handleRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

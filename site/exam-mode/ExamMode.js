import { ExamController, SECTIONS, DEFAULT_MINUTES_PER_SECTION, slotLabel } from './ExamController.js';
import { loadSlotPapers, countsFromPapers } from './Data.js';
import { escapeHtml } from './Content.js';
import { TopBar } from './TopBar.js';
import { SectionTabs } from './SectionTabs.js';
import { QuestionPane } from './QuestionPane.js';
import { BottomActionBar } from './BottomActionBar.js';
import { StatusLegend } from './sidebar/StatusLegend.js';
import { QuestionPalette } from './sidebar/QuestionPalette.js';
import { Calculator } from './Calculator.js';
import { InstructionsModal } from './InstructionsModal.js';
import { SubmitConfirmModal } from './SubmitConfirmModal.js';
import { PaperView } from './PaperView.js';
import { SetupScreen } from './SetupScreen.js';
import { renderResults } from './ResultsScreen.js';
import { QuestionReview } from './QuestionReview.js';

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const SLOTS = ['slot-1', 'slot-2', 'slot-3'];
const PROFILE_KEY = 'catpyq_mock_profile';

class ExamApp {
  constructor() {
    this.root = document.getElementById('exam-root');
    this.overlayRoot = document.getElementById('exam-overlay-root');
    this.controller = null;
    this.papers = null;
    this.screen = null;
    this.results = null;
    this.tickTimer = null;
    this.unsub = null;
    this.toastTimer = null;
    this.reviewState = { section: null, index: 0 };
    this.calculator = new Calculator();
    this.instructionsModal = new InstructionsModal();
    this.submitModal = new SubmitConfirmModal();
    this.paperView = new PaperView();
    this.params = this.readParams();
    this.ctx = this.buildCtx();
    window.addEventListener('pagehide', () => {
      if (this.controller) this.controller.persist();
    });
  }

  readParams() {
    const p = new URLSearchParams(window.location.search);
    const year = parseInt(p.get('year'), 10);
    const slot = p.get('slot');
    let minutes = parseFloat(p.get('min'));
    if (!Number.isFinite(minutes) || minutes <= 0) minutes = DEFAULT_MINUTES_PER_SECTION;
    else minutes = Math.min(180, Math.max(0.1, minutes));
    return {
      year: YEARS.includes(year) ? year : null,
      slot: SLOTS.includes(slot) ? slot : null,
      minutes,
      autostart: p.get('autostart') === '1',
      setup: p.get('setup') === '1',
      forceNew: p.get('new') === '1',
    };
  }

  buildCtx() {
    const app = this;
    return {
      get controller() { return app.controller; },
      get papers() { return app.papers; },
      toast: (msg) => app.toast(msg),
      openInstructions: () => app.instructionsModal.open(app.overlayRoot, app.controller.state.minutesPerSection),
      openPaper: () => app.paperView.open(app.overlayRoot, { controller: app.controller, papers: app.papers }),
      openCalculator: () => app.calculator.toggle(app.overlayRoot),
      switchSection: (sec) => app.trySwitchSection(sec),
      saveAndNext: () => app.controller.saveAndNext(),
      markAndNext: () => app.controller.markAndNext(),
      clearResponse: () => app.controller.clearResponse(),
      previous: () => app.controller.previous(),
      submit: () => app.openSubmitConfirm(),
      goTo: (i) => app.controller.goTo(i),
    };
  }

  getDefaultName() {
    try { return localStorage.getItem(PROFILE_KEY) || 'Candidate'; }
    catch (e) { return 'Candidate'; }
  }

  saveDefaultName(name) {
    try { localStorage.setItem(PROFILE_KEY, name); } catch (e) { /* ignore */ }
  }

  async boot() {
    const p = this.params;
    if (p.year && p.slot && !p.setup && !p.forceNew && ExamController.hasAttempt({ year: p.year, slot: p.slot })) {
      const c = ExamController.load({ year: p.year, slot: p.slot });
      if (c) {
        this.controller = c;
        this.renderLoading('Restoring your attempt…');
        try {
          this.papers = await loadSlotPapers(c.state.year, c.state.slot);
          c.repairCounts(countsFromPapers(this.papers));
          if (c.state.submitted) this.renderResultsScreen();
          else this.renderExam();
          return;
        } catch (e) {
          console.error(e);
          this.controller = null;
          this.renderSetup('Could not reload paper data. Is the local server running?');
          return;
        }
      }
    }
    if (p.year && p.slot && p.autostart) {
      await this.beginNew(p.year, p.slot, this.getDefaultName(), p.minutes);
      return;
    }
    this.renderSetup();
  }

  renderLoading(msg) {
    this.screen = 'loading';
    this.stopTick();
    this.root.innerHTML = `
      <div class="exam-loading">
        <div class="spinner"></div>
        <div>${escapeHtml(msg || 'Loading…')}</div>
      </div>`;
  }

  renderSetup(errorMsg) {
    this.stopTick();
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.screen = 'setup';
    this.results = null;
    const setup = new SetupScreen();
    setup.render(this.root, {
      preselect: {
        year: this.params.year || (this.controller ? this.controller.state.year : null),
        slot: this.params.slot || (this.controller ? this.controller.state.slot : null),
        minutes: this.params.minutes,
      },
      defaultName: this.getDefaultName(),
      error: errorMsg || null,
      beginNew: (y, s, name, mins) => this.beginNew(y, s, name, mins),
      resume: (y, s) => this.resumeAttempt(y, s),
      goHome: () => { window.location.href = 'index.html'; },
    });
  }

  async beginNew(year, slot, name, minutes) {
    this.renderLoading('Loading paper…');
    let papers = null;
    try {
      papers = await loadSlotPapers(year, slot);
    } catch (e) {
      console.error(e);
      this.renderSetup('Could not load the paper. Is the local server running (python serve.py)?');
      return;
    }
    if (!SECTIONS.some((s) => papers[s] && papers[s].questions && papers[s].questions.length)) {
      this.renderSetup('No question data found for this year / slot.');
      return;
    }
    ExamController.clear({ year, slot });
    this.papers = papers;
    this.controller = ExamController.create({
      year,
      slot,
      counts: countsFromPapers(papers),
      candidateName: name,
      minutesPerSection: minutes,
    });
    this.saveDefaultName(this.controller.state.candidateName);
    this.syncUrl(year, slot, minutes);
    this.results = null;
    this.renderExam();
  }

  async resumeAttempt(year, slot) {
    const c = ExamController.load({ year, slot });
    if (!c) {
      this.renderSetup('No saved attempt found for this selection.');
      return;
    }
    this.renderLoading('Restoring your attempt…');
    this.controller = c;
    try {
      this.papers = await loadSlotPapers(year, slot);
    } catch (e) {
      console.error(e);
      this.controller = null;
      this.renderSetup('Could not reload paper data. Is the local server running?');
      return;
    }
    c.repairCounts(countsFromPapers(this.papers));
    this.syncUrl(year, slot, c.state.minutesPerSection);
    if (c.state.submitted) this.renderResultsScreen();
    else this.renderExam();
  }

  syncUrl(year, slot, minutes) {
    const q = new URLSearchParams({ year: String(year), slot });
    if (minutes !== DEFAULT_MINUTES_PER_SECTION) q.set('min', String(minutes));
    try { history.replaceState(null, '', `exam.html?${q.toString()}`); } catch (e) { /* ignore */ }
    this.params.year = year;
    this.params.slot = slot;
    this.params.minutes = minutes;
  }

  renderExam() {
    this.stopTick();
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.screen = 'exam';
    this.root.innerHTML = `
      <div class="exam-app">
        <div id="topbar-host"></div>
        <div id="sectiontabs-host"></div>
        <div class="exam-banner">AfterGrad Mock</div>
        <div class="exam-body">
          <main class="exam-main">
            <div class="question-header" id="question-header"></div>
            <div class="question-panes" id="question-panes"></div>
          </main>
          <aside class="exam-sidebar" id="sidebar"></aside>
        </div>
        <div id="bottombar-host"></div>
      </div>`;

    this.topBar = new TopBar(this.ctx);
    this.topBar.render(document.getElementById('topbar-host'));
    this.sectionTabs = new SectionTabs(this.ctx);
    this.sectionTabs.render(document.getElementById('sectiontabs-host'));
    this.bottomBar = new BottomActionBar(this.ctx);
    this.bottomBar.render(document.getElementById('bottombar-host'));
    this.questionPane = new QuestionPane(this.ctx);
    this.renderQuestionPane();
    this.renderSidebar();
    this.unsub = this.controller.subscribe((e) => this.onControllerEvent(e));
    this.startTick();
  }

  renderQuestionPane() {
    const header = document.getElementById('question-header');
    const panes = document.getElementById('question-panes');
    if (!header || !panes || !this.questionPane) return;
    this.questionPane.render(header, panes);
    const qp = panes.querySelector('.question-pane');
    if (qp) qp.scrollTop = 0;
  }

  renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el || !this.controller) return;
    const c = this.controller;
    const paper = this.papers ? this.papers[c.state.currentSection] : null;
    el.innerHTML = `
      <div class="profile-block">
        <div class="avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="#7a8ba6"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(c.state.candidateName)}</div>
          <div class="profile-sub">CAT ${c.state.year} ${slotLabel(c.state.slot)}</div>
        </div>
        <button type="button" class="profile-edit" title="Edit candidate name">Edit</button>
      </div>
      <div id="legend-host"></div>
      <div class="sidebar-subheader">AfterGrad Mocks</div>
      <div class="palette-label">Choose a Question</div>
      <div class="question-palette" id="palette"></div>
      <div class="sidebar-footer">
        <button type="button" class="danger" data-act="new-attempt">Start New Attempt</button>
        <button type="button" data-act="home">Back to Home</button>
      </div>`;

    StatusLegend.render(el.querySelector('#legend-host'), c);
    QuestionPalette.render(el.querySelector('#palette'), {
      controller: c,
      paper,
      goTo: (i) => c.goTo(i),
    });
    el.querySelector('.profile-edit').addEventListener('click', () => this.editName());
    el.querySelector('[data-act="new-attempt"]').addEventListener('click', () => this.startNewAttempt());
    el.querySelector('[data-act="home"]').addEventListener('click', () => { window.location.href = 'index.html'; });
  }

  editName() {
    if (!this.controller) return;
    const name = window.prompt('Candidate name:', this.controller.state.candidateName);
    if (name == null) return;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return;
    this.saveDefaultName(trimmed);
    this.controller.setCandidateName(trimmed);
  }

  trySwitchSection(sec) {
    if (!this.controller) return;
    if (this.controller.isSectionLocked(sec)) {
      this.toast('Time is over for this section.');
      return;
    }
    this.controller.switchSection(sec);
  }

  onControllerEvent(e) {
    if (this.screen !== 'exam') return;
    switch (e.type) {
      case 'tick':
        this.sectionTabs.updateTimer();
        break;
      case 'save':
      case 'change':
      case 'navigate':
        this.renderQuestionPane();
        this.renderSidebar();
        this.bottomBar.refresh();
        break;
      case 'section':
        this.sectionTabs.refresh();
        this.sectionTabs.updateTimer();
        this.renderQuestionPane();
        this.renderSidebar();
        this.bottomBar.refresh();
        break;
      case 'lock':
        if (e.autoSubmitted) break;
        this.toast(`Time over for ${e.locked} — moved to ${e.advanced}.`);
        this.sectionTabs.refresh();
        this.sectionTabs.updateTimer();
        this.renderQuestionPane();
        this.renderSidebar();
        this.bottomBar.refresh();
        break;
      case 'submit':
        this.onSubmitted();
        break;
      case 'meta':
        this.renderSidebar();
        break;
      default:
        break;
    }
  }

  openSubmitConfirm() {
    if (!this.controller || this.controller.state.submitted) return;
    this.submitModal.open(this.overlayRoot, this.controller, {
      onConfirm: () => {
        if (this.controller) this.controller.confirmSubmit();
      },
    });
  }

  onSubmitted() {
    this.stopTick();
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.calculator.close();
    this.instructionsModal.close();
    this.paperView.close();
    this.submitModal.close();
    this.results = this.controller.computeResults(this.papers);
    this.renderResultsScreen();
  }

  renderResultsScreen() {
    if (!this.results) this.results = this.controller.computeResults(this.papers);
    this.screen = 'results';
    this.stopTick();
    renderResults(this.root, {
      controller: this.controller,
      results: this.results,
      onReview: () => this.openReview(),
      onNewAttempt: () => this.startNewAttempt(),
      onHome: () => { window.location.href = 'index.html'; },
    });
  }

  openReview() {
    const first = SECTIONS.find((s) => this.controller.sectionState(s).count > 0) || 'VARC';
    this.reviewState = { section: first, index: 0 };
    this.renderReview();
  }

  renderReview() {
    this.screen = 'review';
    const review = new QuestionReview();
    review.render(this.root, {
      controller: this.controller,
      papers: this.papers,
      results: this.results,
      section: this.reviewState.section,
      index: this.reviewState.index,
      onSelect: (sec, idx) => {
        this.reviewState = { section: sec, index: idx };
        this.renderReview();
      },
      onBack: () => this.renderResultsScreen(),
      onHome: () => { window.location.href = 'index.html'; },
    });
  }

  startNewAttempt() {
    if (!window.confirm('Start a new attempt? Your current progress for this paper will be deleted.')) return;
    const y = this.controller ? this.controller.state.year : this.params.year;
    const s = this.controller ? this.controller.state.slot : this.params.slot;
    if (y && s) ExamController.clear({ year: y, slot: s });
    this.stopTick();
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.controller = null;
    this.results = null;
    this.calculator.close();
    this.instructionsModal.close();
    this.paperView.close();
    this.submitModal.close();
    this.renderSetup();
  }

  startTick() {
    this.stopTick();
    this.tickTimer = setInterval(() => {
      if (this.controller && this.screen === 'exam') this.controller.tick();
    }, 500);
  }

  stopTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  toast(msg) {
    let el = document.getElementById('exam-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'exam-toast';
      el.className = 'exam-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
}

export function initExamApp() {
  const app = new ExamApp();
  window.__examApp = app;
  app.boot();
  return app;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExamApp);
  } else {
    initExamApp();
  }
}

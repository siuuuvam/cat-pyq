export class Calculator {
  constructor() {
    this.panel = null;
    this.display = '0';
    this.acc = null;
    this.op = null;
    this.waiting = false;
    this.drag = null;
  }

  toggle(overlayRoot) {
    if (this.panel) this.close();
    else this.open(overlayRoot);
  }

  open(overlayRoot) {
    if (this.panel) return;
    this.reset();
    const panel = document.createElement('div');
    panel.className = 'calc-panel';
    panel.style.left = `${Math.max(12, window.innerWidth - 260)}px`;
    panel.style.top = '86px';
    panel.innerHTML = `
      <div class="calc-head"><span>Calculator</span><button type="button" class="calc-close" aria-label="Close calculator">×</button></div>
      <div class="calc-display" id="calc-display">0</div>
      <div class="calc-grid">
        <button type="button" class="calc-btn clear" data-k="C">C</button>
        <button type="button" class="calc-btn op" data-k="back">⌫</button>
        <button type="button" class="calc-btn op" data-k="/">÷</button>
        <button type="button" class="calc-btn op" data-k="*">×</button>
        <button type="button" class="calc-btn" data-k="7">7</button>
        <button type="button" class="calc-btn" data-k="8">8</button>
        <button type="button" class="calc-btn" data-k="9">9</button>
        <button type="button" class="calc-btn op" data-k="-">−</button>
        <button type="button" class="calc-btn" data-k="4">4</button>
        <button type="button" class="calc-btn" data-k="5">5</button>
        <button type="button" class="calc-btn" data-k="6">6</button>
        <button type="button" class="calc-btn op" data-k="+">+</button>
        <button type="button" class="calc-btn" data-k="1">1</button>
        <button type="button" class="calc-btn" data-k="2">2</button>
        <button type="button" class="calc-btn" data-k="3">3</button>
        <button type="button" class="calc-btn" data-k="0">0</button>
        <button type="button" class="calc-btn" data-k=".">.</button>
        <button type="button" class="calc-btn eq" data-k="=">=</button>
      </div>`;
    overlayRoot.appendChild(panel);
    this.panel = panel;

    panel.querySelector('.calc-close').addEventListener('click', () => this.close());
    panel.querySelectorAll('.calc-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.press(btn.getAttribute('data-k')));
    });

    const head = panel.querySelector('.calc-head');
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('.calc-close')) return;
      const rect = panel.getBoundingClientRect();
      this.drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      e.preventDefault();
    });
    this._move = (e) => {
      if (!this.drag || !this.panel) return;
      const x = Math.min(Math.max(0, e.clientX - this.drag.dx), window.innerWidth - this.panel.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - this.drag.dy), window.innerHeight - this.panel.offsetHeight);
      this.panel.style.left = `${x}px`;
      this.panel.style.top = `${y}px`;
    };
    this._up = () => { this.drag = null; };
    document.addEventListener('mousemove', this._move);
    document.addEventListener('mouseup', this._up);
  }

  close() {
    if (!this.panel) return;
    document.removeEventListener('mousemove', this._move);
    document.removeEventListener('mouseup', this._up);
    this.panel.remove();
    this.panel = null;
    this.drag = null;
  }

  reset() {
    this.display = '0';
    this.acc = null;
    this.op = null;
    this.waiting = false;
  }

  showError() {
    this.display = 'Error';
    this.acc = null;
    this.op = null;
    this.waiting = true;
  }

  apply(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      default: return b;
    }
  }

  fmt(n) {
    if (n == null || !Number.isFinite(n)) return null;
    const r = Math.round(n * 1e10) / 1e10;
    return String(r);
  }

  press(key) {
    if (this.display === 'Error' && key !== 'C') {
      if (key >= '0' && key <= '9' || key === '.') this.reset();
      else return;
    }
    if (key >= '0' && key <= '9') {
      if (this.waiting) { this.display = key; this.waiting = false; }
      else if (this.display.length < 15) this.display = this.display === '0' ? key : this.display + key;
    } else if (key === '.') {
      if (this.waiting) { this.display = '0.'; this.waiting = false; }
      else if (!this.display.includes('.')) this.display += '.';
    } else if (key === 'C') {
      this.reset();
    } else if (key === 'back') {
      if (this.waiting) return;
      this.display = this.display.length > 1 ? this.display.slice(0, -1) : '0';
      if (this.display === '-') this.display = '0';
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
      const cur = parseFloat(this.display);
      if (this.acc != null && this.op && !this.waiting) {
        const r = this.apply(this.acc, cur, this.op);
        const f = this.fmt(r);
        if (f == null) { this.showError(); this.update(); return; }
        this.acc = r;
        this.display = f;
      } else {
        this.acc = cur;
      }
      this.op = key;
      this.waiting = true;
    } else if (key === '=') {
      if (this.acc != null && this.op && !this.waiting) {
        const r = this.apply(this.acc, parseFloat(this.display), this.op);
        const f = this.fmt(r);
        if (f == null) { this.showError(); this.update(); return; }
        this.display = f;
        this.acc = null;
        this.op = null;
        this.waiting = true;
      }
    }
    this.update();
  }

  update() {
    if (!this.panel) return;
    const el = this.panel.querySelector('#calc-display');
    if (el) el.textContent = this.display;
  }
}

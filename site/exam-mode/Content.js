export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, button, input, select, textarea').forEach((el) => el.remove());
  doc.querySelectorAll('[onclick], [onerror], [onload], [onmouseover]').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

export function renderContent(str) {
  if (!str) return '';
  if (/<[a-zA-Z][^>]*>/.test(str)) return sanitizeHtml(str);
  return escapeHtml(str).replace(/\n/g, '<br>');
}

export function fixImgPath(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('./') || path.startsWith('/')) return path;
  return '/' + path;
}

export function renderImages(images) {
  if (!images || !images.length) return '';
  return images.map((img) => `<img src="${escapeHtml(fixImgPath(img))}" alt="Question image" class="exam-img">`).join('');
}

function renderLatexText(text) {
  const result = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '\\') {
      const cmd = parseCommand(text, i);
      if (cmd) {
        try { result.push(katex.renderToString(cmd.tex, { throwOnError: false, displayMode: false })); }
        catch (e) { result.push(escapeHtml(cmd.tex)); }
        i = cmd.end;
      } else {
        result.push(escapeHtml(text[i]));
        i++;
      }
    } else if (text[i] === '_' || text[i] === '^') {
      const sub = parseSubOrSup(text, i);
      if (sub) {
        try { result.push(katex.renderToString(sub.tex, { throwOnError: false, displayMode: false })); }
        catch (e) { result.push(escapeHtml(sub.tex)); }
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
  if (text[i] === '{' || text[i] === '}') return { tex: text.substring(start, i + 1), end: i + 1 };
  if (',; !%#&_ $~^'.includes(text[i]) && text[i] !== ' ') return { tex: text.substring(start, i + 1), end: i + 1 };
  while (i < text.length && /[a-zA-Z]/.test(text[i])) { cmdName += text[i]; i++; }
  if (!cmdName) return null;
  const twoArg = ['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'overset', 'underset'];
  const oneArg = ['sqrt', 'overline', 'underline', 'hat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widehat', 'mathrm', 'mathbf', 'text', 'boldsymbol', 'color'];
  let tex = text.substring(start, i);
  if (twoArg.includes(cmdName)) {
    i = skipSpaces(text, i);
    if (i < text.length && text[i] === '{') {
      const a1 = readBraces(text, i);
      tex += text.substring(i, a1);
      i = skipSpaces(text, a1);
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
  while (i < text.length && (text[i] === '_' || text[i] === '^')) {
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
  let i = skipSpaces(text, start + 1);
  let tex = op;
  if (i < text.length && text[i] === '{') {
    const gr = readBraces(text, i);
    tex += text.substring(i, gr);
    i = gr;
  } else if (i < text.length) {
    tex += text[i];
    i++;
  }
  while (i < text.length && (text[i] === '_' || text[i] === '^')) {
    const op2 = text[i];
    i = skipSpaces(text, i + 1);
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

export function renderMath(container) {
  if (!container || typeof katex === 'undefined') return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    let text = node.nodeValue;
    if (!text || !/[\\_^]/.test(text)) return;
    text = text.replace(/​/g, '').replace(/⁠/g, '').replace(/ /g, ' ');
    if (!/\\[a-zA-Z]+/.test(text) && !/_[a-zA-Z0-9{]/.test(text) && !/\^[a-zA-Z0-9{]/.test(text)) return;
    if (/<span class="katex/.test(text)) return;
    const html = renderLatexText(text);
    if (html !== escapeHtml(text)) {
      const span = document.createElement('span');
      span.innerHTML = html;
      if (node.parentNode) node.parentNode.replaceChild(span, node);
    }
  });
}

export function enhance(container) {
  if (!container) return;
  renderMath(container);
}

export function getPassage(paper, passageId) {
  if (!passageId || !paper || !paper.passages) return null;
  return paper.passages[passageId] || null;
}

export function passageHasContent(passage) {
  if (!passage) return false;
  const text = (passage.text || '').replace(/<[^>]*>/g, '').trim();
  return !!(text || (passage.images && passage.images.length));
}

export function shouldSplit(section, paper, question) {
  if (section === 'QA') return false;
  const passage = getPassage(paper, question && question.passage_id);
  return passageHasContent(passage);
}

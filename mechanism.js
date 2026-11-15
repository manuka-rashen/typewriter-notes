'use strict';
(() => {
  const paper = document.getElementById('paper');
  const editor = document.getElementById('editor');
  const area = document.getElementById('writingArea');
  const head = document.getElementById('typeGuide');
  const hammer = head.querySelector('.head-hammer');
  const shell = head.querySelector('.head-shell');
  // The shaft remains anchored while the type slug reaches the actual letter.
  hammer.replaceChildren();
  const shaft = document.createElement('span'); shaft.className = 'hammer-shaft';
  const face = document.createElement('b'); face.className = 'hammer-face';
  const slug = document.createElement('em'); face.append(slug);
  hammer.append(shaft, face, document.createElement('i'));
  const viewport = document.createElement('div'); viewport.className = 'ink-viewport'; viewport.setAttribute('aria-hidden', 'true');
  const sheet = document.createElement('div'); sheet.className = 'ink-sheet'; viewport.append(sheet); area.prepend(viewport);
  const marker = document.createElement('span'); marker.className = 'ink-caret'; marker.textContent = '\u200b';
  document.body.classList.add('physical-typing');
  let position = 72, target = 72, frame = 0, lastTime = 0, dirty = true, initialized = false;
  let jobs = [], active = null, serial = 0, returning = false, queuedValue = '', lastFont = '';
  const pressed = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const emit = kind => document.dispatchEvent(new CustomEvent('typewriter:impact', { detail: { kind } }));

  function pressKey(key = '') {
    const normalized = key === ' ' ? 'Space' : key;
    const button = [...document.querySelectorAll('.key')].find(b => b.dataset.key?.toLowerCase() === normalized.toLowerCase());
    if (button) { clearTimeout(pressed.get(button)); button.classList.add('pressed'); pressed.set(button, setTimeout(() => { button.classList.remove('pressed'); pressed.delete(button); }, 105)); }
  }
  function resetHammer() {
    face.style.transform = 'translate3d(0,0,0)'; shaft.style.transform = 'scaleY(1)';
    slug.style.opacity = '0'; shell.style.transform = ''; paper.dataset.strikePhase = 'idle';
  }
  function clearJobs() { jobs = []; active = null; resetHammer(); dirty = true; }
  function ensureFrame() { if (!frame) frame = requestAnimationFrame(tick); }
  function sync() { dirty = true; ensureFrame(); }

  function render() {
    dirty = false;
    const style = getComputedStyle(editor), value = editor.value, caret = editor.selectionStart;
    const signature = `${style.font}|${style.letterSpacing}|${style.lineHeight}|${editor.clientWidth}`;
    if (signature !== lastFont) {
      Object.assign(sheet.style, { width: `${editor.clientWidth}px`, font: style.font, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, padding: style.padding, tabSize: style.tabSize });
      lastFont = signature;
    }
    jobs = jobs.filter(job => value.slice(job.start, job.end) === job.text);
    if (active && !jobs.includes(active)) { active = null; resetHammer(); }
    const fragment = document.createDocumentFragment(); let marked = false;
    function appendText(text, start, parent) {
      if (!marked && caret >= start && caret <= start + text.length) {
        const cut = caret - start; parent.append(document.createTextNode(text.slice(0, cut)), marker, document.createTextNode(text.slice(cut))); marked = true;
      } else parent.append(document.createTextNode(text));
    }
    let index = 0;
    for (const job of jobs) {
      appendText(value.slice(index, job.start), index, fragment);
      const glyph = document.createElement('span'); glyph.className = `ink-glyph${job.printed ? ' printed' : ''}`;
      glyph.dataset.stroke = String(job.id); appendText(job.text, job.start, glyph); fragment.append(glyph); job.element = glyph; index = job.end;
    }
    appendText(value.slice(index), index, fragment);
    if (!marked) fragment.append(marker);
    if (!value) { const placeholder = document.createElement('span'); placeholder.className = 'ink-placeholder'; placeholder.textContent = editor.placeholder; fragment.append(placeholder); }
    fragment.append(document.createTextNode('\u200b')); sheet.replaceChildren(fragment);
    const previousScroll = editor.scrollTop;
    const contentHeight = sheet.getBoundingClientRect().height;
    const height = Math.min(Math.max(35, paper.clientHeight - 155), Math.max(parseFloat(style.lineHeight) + 9, contentHeight));
    area.style.height = `${Math.ceil(height)}px`;
    editor.scrollTop = caret >= value.length ? editor.scrollHeight : previousScroll;
    sheet.style.transform = `translate3d(0,${-editor.scrollTop}px,0)`;
    const paperRect = paper.getBoundingClientRect(), cursorRect = marker.getBoundingClientRect();
    const next = clamp(cursorRect.left - paperRect.left, 12, paper.clientWidth - 12);
    if (next < target - 65) returning = true;
    target = next;
    if (!initialized) { position = target; initialized = true; }
    paper.dataset.caret = String(caret);
  }
  function moveHead(x) { position = x; paper.style.setProperty('--head-x', `${x.toFixed(3)}px`); }
  function begin(job, time) {
    job.begin = time; job.fromX = position;
    const rect = job.element?.getBoundingClientRect(), p = paper.getBoundingClientRect();
    if (!rect || !rect.height) return false;
    const distance = Math.abs((rect.left + rect.width / 2 - p.left) - position);
    const speed = jobs.length > 1 ? .78 : 1;
    job.travel = Math.max(8, Math.min(110, distance > 35 ? 20 + distance * .17 : 12)) * speed;
    job.up = 23 * speed; job.hold = 8 * speed; job.down = 29 * speed;
    if (jobs.length > 2) { job.travel = 0; job.up = 0; job.hold = 0; job.down = 10; }
    slug.textContent = job.text; return true;
  }
  function contact(job) {
    job.printed = true; job.element.classList.add('printed');
    // Store measured stamp-to-letter error for browser geometry checks.
    const glyph = job.element.getBoundingClientRect(), stamp = slug.getBoundingClientRect();
    paper.dataset.lastPrinted = job.text;
    paper.dataset.impactErrorX = (stamp.left + stamp.width / 2 - glyph.left - glyph.width / 2).toFixed(3);
    paper.dataset.impactErrorY = (stamp.top + stamp.height / 2 - glyph.top - glyph.height / 2).toFixed(3);
    paper.dataset.impactCount = String(Number(paper.dataset.impactCount || 0) + 1); emit('key');
  }
  function tick(time) {
    frame = 0;
    const dt = Math.min(48, time - (lastTime || time - 16)); lastTime = time;
    if (dirty) render();
    if (reduced.matches) { jobs.forEach(job => { if (!job.printed) emit('key'); }); clearJobs(); render(); moveHead(target); lastTime = 0; return; }
    if (!active && jobs.length) { active = jobs[0]; if (!begin(active, time)) { jobs.shift(); active = null; dirty = true; } }
    if (active) {
      const job = active, glyph = job.element.getBoundingClientRect(), p = paper.getBoundingClientRect();
      const x = glyph.left + glyph.width / 2 - p.left, y = glyph.top + glyph.height / 2;
      const rest = hammer.getBoundingClientRect(), reach = Math.max(0, rest.top - y);
      const elapsed = time - job.begin, liftStart = job.travel, contactTime = liftStart + job.up;
      const downStart = contactTime + job.hold, finish = downStart + job.down;
      if (elapsed < liftStart) {
        const fraction = clamp(elapsed / liftStart, 0, 1), eased = 1 - Math.pow(1 - fraction, 3);
        moveHead(job.fromX + (x - job.fromX) * eased); paper.dataset.strikePhase = 'aligning';
      } else {
        moveHead(x);
        let lift;
        if (elapsed < contactTime) { lift = Math.pow(clamp((elapsed - liftStart) / job.up, 0, 1), 2); paper.dataset.strikePhase = 'striking'; }
        else if (elapsed < downStart) { lift = 1; paper.dataset.strikePhase = 'contact'; }
        else { lift = Math.pow(1 - clamp((elapsed - downStart) / job.down, 0, 1), 2); paper.dataset.strikePhase = 'retracting'; }
        face.style.transform = `translate3d(0,${(-reach * lift).toFixed(3)}px,0)`;
        shaft.style.transform = `scaleY(${1 + reach * lift / Math.max(1, rest.height)})`;
        slug.style.width = `${Math.max(3, glyph.width)}px`; slug.style.height = `${glyph.height}px`;
        slug.style.opacity = String(lift > .45 ? Math.min(1, (lift - .45) * 2.5) : 0);
        shell.style.transform = elapsed >= contactTime && elapsed < downStart + 10 ? 'translateY(1px)' : '';
        if (elapsed >= contactTime && !job.printed) {
          // A late frame must still touch the exact glyph before withdrawing.
          face.style.transform = `translate3d(0,${(-reach).toFixed(3)}px,0)`;
          shaft.style.transform = `scaleY(${1 + reach / Math.max(1, rest.height)})`;
          if (elapsed >= downStart) job.begin = time - contactTime;
          contact(job);
        }
      }
      if (time - job.begin >= finish) { jobs.shift(); active = null; resetHammer(); dirty = true; }
      ensureFrame();
    } else {
      const easing = 1 - Math.exp(-dt / (returning ? 65 : 22)), next = position + (target - position) * easing;
      moveHead(Math.abs(target - next) < .08 ? target : next);
      if (position !== target || dirty || jobs.length) ensureFrame(); else { returning = false; lastTime = 0; }
    }
  }
  function strike(key = '') {
    pressKey(key);
    const value = key === 'Space' ? ' ' : key;
    if (key === 'Enter' || key === 'Backspace' || key === 'Tab' || !value.trim()) {
      if (key === 'Enter') returning = true;
      queuedValue = editor.value;
      emit(key === 'Enter' ? 'return' : key === 'Space' || value === ' ' ? 'space' : 'key'); sync(); return;
    }
    const end = editor.selectionStart, start = end - value.length;
    if (start < 0 || editor.value.slice(start, end) !== value) { sync(); return; }
    if ((jobs.length && !editor.value.startsWith(queuedValue)) || jobs.some(job => start < job.end)) clearJobs();
    jobs.push({ id: ++serial, start, end, text: value, printed: false }); queuedValue = editor.value; sync();
  }
  const resize = () => { lastFont = ''; sync(); };
  new ResizeObserver(resize).observe(paper);
  editor.addEventListener('scroll', () => { sheet.style.transform = `translate3d(0,${-editor.scrollTop}px,0)`; sync(); });
  editor.addEventListener('input', sync); editor.addEventListener('click', () => { clearJobs(); sync(); }); editor.addEventListener('select', sync);
  document.fonts?.ready.then(resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame); frame = 0; clearJobs(); render(); moveHead(target); lastTime = 0;
    } else sync();
  });
  window.visualViewport?.addEventListener('resize', () => { document.documentElement.style.setProperty('--visual-height', `${window.visualViewport.height}px`); resize(); });
  window.TypewriterMechanism = { sync, strike, resize, pressKey }; sync();
})();

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const editor = $('editor');
  const STORAGE = 'still-typewriter-v1';
  const defaults = { paper: 'warm', font: 'classic', fontSize: 17, sound: true, light: true, lightLevel: 80, native: false };
  const uid = () => globalThis.crypto?.randomUUID?.() || `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const welcome = 'There is a little magic\nin slowing down.\n\nA blank page.\nA little room to think.\nAnd somewhere to begin.';
  const makeNote = (text = '') => ({ id: uid(), text, created: Date.now(), updated: Date.now(), pinned: false, deleted: false });
  let state, storageAvailable = true;
  function validNote(n) { return n && typeof n.id === 'string' && typeof n.text === 'string' && Number.isFinite(n.created) && Number.isFinite(n.updated) && Math.abs(n.created) <= 8.64e15 && Math.abs(n.updated) <= 8.64e15; }
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE));
    if (stored && Array.isArray(stored.notes) && stored.notes.every(validNote)) {
      state = { notes: stored.notes, current: stored.current, settings: { ...defaults, ...stored.settings } };
    }
  } catch { /* A fresh session can still be used if the browser blocks storage. */ }
  if (!state) { const first = makeNote(welcome); state = { notes: [first], current: first.id, settings: { ...defaults } }; }
  if (!state.notes.some(n => n.id === state.current && !n.deleted)) state.current = state.notes.find(n => !n.deleted)?.id;
  if (!state.current) { const n = makeNote(); state.notes.push(n); state.current = n.id; }
  let settings = state.settings;
  let saveTimer, toastTimer, currentPopover = null, lastTrigger = null, trashView = false;
  let nativeFullscreen = false, nativeBeforeFullscreen = false;
  let shifted = false, caps = false, symbols = false, lastShift = 0, focused = false;
  let audioContext, noiseBuffer, lastSound = 0, composing = false, beforeEdit = null;
  const histories = new Map();
  const current = () => state.notes.find(n => n.id === state.current);
  const title = n => n.text.split('\n').find(s => s.trim())?.trim().slice(0, 65) || 'Untitled thought';
  const words = text => text.trim() ? text.trim().split(/\s+/u).length : 0;
  const snapshot = () => ({ text: editor.value, start: editor.selectionStart, end: editor.selectionEnd });
  function history() { if (!histories.has(state.current)) histories.set(state.current, { undo: [], redo: [] }); return histories.get(state.current); }
  function remember(value = snapshot()) {
    const h = history();
    if (h.undo.at(-1)?.text !== value.text) { h.undo.push(value); if (h.undo.length > 160) h.undo.shift(); }
    h.redo.length = 0;
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800); }
  function persist(showSaving = false) {
    clearTimeout(saveTimer);
    if (showSaving) {
      $('saveStatus').textContent = 'Saving…';
      saveTimer = setTimeout(() => persist(false), 180);
      return;
    }
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state)); storageAvailable = true;
      $('saveStatus').textContent = 'Saved on this device';
      $('footerStatus').textContent = 'All thoughts, safely kept.';
    } catch {
      clearTimeout(saveTimer);
      $('saveStatus').textContent = 'Not saved — download a backup';
      $('footerStatus').textContent = 'Storage unavailable. Please export your note.';
      if (storageAvailable) toast('Browser storage is full or unavailable. Download a backup to keep your notes.');
      storageAvailable = false;
    }
  }
  function updateCounts() {
    const count = words(editor.value), chars = Array.from(editor.value).length;
    $('wordCount').textContent = `${chars.toLocaleString()} ${chars === 1 ? 'character' : 'characters'}`;
    $('wordCount').title = `${count} ${count === 1 ? 'word' : 'words'}`;
    $('charCount').textContent = `${chars} ${chars === 1 ? 'CHARACTER' : 'CHARACTERS'}`;
    $('lineCount').textContent = `LINE ${String(editor.value.slice(0, editor.selectionStart).split('\n').length).padStart(2, '0')}`;
    $('noteName').textContent = title(current());
    $('undoButton').disabled = !history().undo.length;
    $('redoButton').disabled = !history().redo.length;
    window.TypewriterMechanism?.sync();
    document.title = `${title(current())} — Typewriter`;
  }
  function saveEdit() { current().text = editor.value; current().updated = Date.now(); persist(true); updateCounts(); }
  function loadNote(id, focus = true) {
    if (!state.notes.some(n => n.id === id && !n.deleted)) return;
    state.current = id; editor.value = current().text; persist(); updateCounts();
    editor.setSelectionRange(editor.value.length, editor.value.length); editor.scrollTop = editor.scrollHeight;
    updateCounts(); if (focus) editor.focus({ preventScroll: true });
  }
  function newNote() {
    const n = makeNote(); state.notes.unshift(n); closeLibrary(false); closePopovers(); loadNote(n.id);
    sound('return'); toast('A fresh page. Take your time.');
  }
  function strike(key) {
    window.TypewriterMechanism?.strike(key);
  }
  function sound(kind = 'key') {
    if (!settings.sound) return;
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        audioContext = new Audio();
        noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * .08, audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const t = audioContext.currentTime;
      const noise = audioContext.createBufferSource(); noise.buffer = noiseBuffer;
      const filter = audioContext.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = kind === 'space' ? 600 : 1600 + Math.random() * 800;
      const gain = audioContext.createGain(); gain.gain.setValueAtTime(kind === 'space' ? .09 : .13, t); gain.gain.exponentialRampToValueAtTime(.001, t + .045);
      noise.connect(filter); filter.connect(gain); gain.connect(audioContext.destination); noise.start(t); noise.stop(t + .065);
      const osc = audioContext.createOscillator(), tap = audioContext.createGain(); osc.type = 'triangle';
      osc.frequency.setValueAtTime(kind === 'space' ? 130 : 210 + Math.random() * 120, t); osc.frequency.exponentialRampToValueAtTime(55, t + .035);
      tap.gain.setValueAtTime(.065, t); tap.gain.exponentialRampToValueAtTime(.001, t + .045); osc.connect(tap); tap.connect(audioContext.destination); osc.start(t); osc.stop(t + .05);
      if (kind === 'return') {
        [1760, 3520].forEach((f, i) => {
          const bell = audioContext.createOscillator(), g = audioContext.createGain(); bell.type = 'sine'; bell.frequency.value = f;
          g.gain.setValueAtTime(i ? .018 : .04, t); g.gain.exponentialRampToValueAtTime(.0001, t + .7); bell.connect(g); g.connect(audioContext.destination); bell.start(t); bell.stop(t + .75);
        });
      }
      lastSound = performance.now();
    } catch { /* Sound is optional; writing must always work. */ }
  }
  function insert(key) {
    if (key === 'Shift') {
      const now = Date.now(); if (now - lastShift < 350) { caps = !caps; shifted = false; } else if (caps) { caps = false; shifted = false; } else shifted = !shifted;
      lastShift = now; renderKeyboard(); sound(); return;
    }
    if (key === 'Symbols') { symbols = !symbols; renderKeyboard(); sound(); return; }
    if (key === 'Hide') { setNative(true); return; }
    editor.focus({ preventScroll: true }); remember();
    let start = editor.selectionStart, end = editor.selectionEnd;
    if (key === 'Backspace') {
      if (start === end && start > 0) { const previous = Array.from(editor.value.slice(0, start)).at(-1); start -= previous.length; }
      editor.setRangeText('', start, end, 'end');
    } else {
      let text = key === 'Enter' ? '\n' : key === 'Space' ? ' ' : key === 'Tab' ? '    ' : key;
      if (shifted || caps) text = text.toUpperCase();
      editor.setRangeText(text, start, end, 'end');
    }
    strike(key); saveEdit();
    if (editor.selectionStart === editor.value.length) editor.scrollTop = editor.scrollHeight;
    if (shifted && key.length === 1) { shifted = false; renderKeyboard(); }
  }
  function undo(redo = false) {
    const h = history(), source = redo ? h.redo : h.undo, target = redo ? h.undo : h.redo;
    if (!source.length) return;
    target.push(snapshot()); const value = source.pop(); editor.value = value.text; editor.focus({ preventScroll: true }); editor.setSelectionRange(value.start, value.end); saveEdit();
  }
  function renderKeyboard() {
    const rows = symbols ? ['1234567890', '@#$%&*-+()', ['Shift', '.', ',', '?', '!', "'", '"', 'Backspace'], ['Symbols', 'Tab', 'Space', 'Enter']] : ['qwertyuiop', 'asdfghjkl', ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'], ['Symbols', 'Tab', 'Space', '.', ',', 'Enter']];
    $('keyboard').replaceChildren();
    $('keyboard').classList.toggle('caps', caps || shifted);
    const names = { Shift: caps ? 'Caps lock on' : 'Shift', Backspace: 'Backspace', Symbols: symbols ? 'Letter keyboard' : 'Number and symbol keyboard', Tab: 'Insert tab', Space: 'Space', Enter: 'Return' };
    const labels = { Shift: '<span>⇧</span>', Backspace: '<span>⌫</span>', Symbols: symbols ? 'ABC' : '123', Tab: '⇥', Space: 'space', Enter: 'return ↵' };
    rows.forEach((row, index) => {
      const el = document.createElement('div'); el.className = `key-row row-${index + 1}`;
      (typeof row === 'string' ? [...row] : row).forEach(key => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.key = key;
        button.className = `key ${names[key] ? `special ${key.toLowerCase()}` : 'letter'}${key === 'Shift' && (shifted || caps) ? ' enabled' : ''}`;
        if (names[key]) { button.innerHTML = labels[key]; button.setAttribute('aria-label', names[key]); }
        else { button.textContent = shifted || caps ? key.toUpperCase() : key; button.setAttribute('aria-label', key); }
        button.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') event.preventDefault(); });
        button.addEventListener('click', () => insert(key)); el.append(button);
      }); $('keyboard').append(el);
    });
  }
  function applySettings() {
    if (!['warm', 'cream', 'fog', 'night'].includes(settings.paper)) settings.paper = 'warm';
    if (!['classic', 'clean', 'book'].includes(settings.font)) settings.font = 'classic';
    settings.fontSize = Math.min(24, Math.max(14, Number(settings.fontSize) || 17));
    document.body.dataset.theme = settings.paper;
    const fonts = { classic: "'Special Elite','Courier New',monospace", clean: "'DM Mono','Courier New',monospace", book: "Georgia,'Times New Roman',serif" };
    document.documentElement.style.setProperty('--font', fonts[settings.font]);
    document.documentElement.style.setProperty('--type-size', `${settings.fontSize}px`);
    document.documentElement.style.setProperty('--lamp-opacity', settings.light ? '.8' : '0');
    settings.lightLevel = Math.max(20, Math.min(100, Number(settings.lightLevel) || 80));
    document.documentElement.style.setProperty('--lamp-strength', settings.light ? String(settings.lightLevel / 100) : '0');
    document.body.classList.toggle('light-off', !settings.light);
    $('lampTool').setAttribute('aria-pressed', String(settings.light));
    $('lampTool').setAttribute('aria-label', `Turn carriage light ${settings.light ? 'off' : 'on'}`);
    $('lampTool').classList.toggle('active', settings.light);
    $('lightLevel').value = settings.lightLevel; $('lightValue').value = `${settings.lightLevel}%`;
    document.querySelectorAll('[data-paper]').forEach(b => { b.classList.toggle('selected', b.dataset.paper === settings.paper); b.setAttribute('aria-pressed', String(b.dataset.paper === settings.paper)); });
    document.querySelectorAll('[data-font]').forEach(b => { b.classList.toggle('selected', b.dataset.font === settings.font); b.setAttribute('aria-pressed', String(b.dataset.font === settings.font)); });
    $('lightButton').setAttribute('aria-checked', String(settings.light));
    $('soundButton').setAttribute('aria-pressed', String(settings.sound)); $('soundButton').setAttribute('aria-label', `Turn typewriter sound ${settings.sound ? 'off' : 'on'}`);
    $('soundButton').innerHTML = icon(settings.sound ? 'sound' : 'muted'); $('soundButton').classList.toggle('active', settings.sound);
    $('soundState').innerHTML = `SOUND ${settings.sound ? 'ON <b>◖)))</b>' : 'OFF <b>◖×</b>'}`;
    $('fontSize').value = settings.fontSize; $('sizeValue').value = settings.fontSize;
    document.body.classList.toggle('native-input', settings.native); editor.setAttribute('inputmode', settings.native ? 'text' : 'none');
    $('keyboardButton').setAttribute('aria-pressed', String(settings.native)); $('keyboardButton').setAttribute('aria-label', settings.native ? 'Show typewriter keyboard' : 'Use device keyboard');
    window.TypewriterMechanism?.resize();
  }
  function setNative(on) { settings.native = on; applySettings(); persist(); editor.focus({ preventScroll: true }); toast(on ? 'Device keyboard enabled. Tap the keyboard icon to return.' : 'The typewriter keys are back.'); }
  function closePopovers(returnFocus = false) {
    if (currentPopover) $(currentPopover).hidden = true;
    document.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    currentPopover = null;
    if (returnFocus) lastTrigger?.focus();
  }
  function popover(id, trigger) {
    const wasOpen = currentPopover === id; closePopovers();
    if (!wasOpen) { currentPopover = id; lastTrigger = trigger; $(id).hidden = false; trigger.setAttribute('aria-expanded', 'true'); $(id).querySelector('button,input')?.focus(); }
  }
  function library(showTrash = false) {
    closePopovers(); trashView = showTrash; $('notesDrawer').hidden = false; $('drawerOverlay').hidden = false;
    document.body.style.overflow = 'hidden'; $('noteSearch').value = ''; renderNotes(); $('closeLibrary').focus();
  }
  function closeLibrary(returnFocus = true) { $('notesDrawer').hidden = true; $('drawerOverlay').hidden = true; document.body.style.overflow = ''; if (returnFocus) $('libraryButton').focus(); }
  function renderNotes() {
    const query = $('noteSearch').value.trim().toLowerCase();
    $('notesCount').textContent = state.notes.filter(n => !n.deleted).length; $('trashCount').textContent = state.notes.filter(n => n.deleted).length;
    $('activeTab').classList.toggle('selected', !trashView); $('trashTab').classList.toggle('selected', trashView);
    const notes = state.notes.filter(n => Boolean(n.deleted) === trashView && n.text.toLowerCase().includes(query)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
    const list = $('notesList'); list.replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('div'); empty.className = 'empty-notes';
      empty.innerHTML = `${icon(query ? 'search' : 'notes')}<h2>${query ? 'No thoughts found.' : trashView ? 'Nothing left behind.' : 'A little space for something.'}</h2><p>${query ? 'Try a different word or phrase.' : trashView ? 'Deleted notes will wait here until you restore them.' : 'Start with a fresh page.'}</p>`;
      list.append(empty); return;
    }
    notes.forEach(n => {
      const card = document.createElement('article'); card.className = `note-card${n.id === state.current && !trashView ? ' current' : ''}`;
      const heading = document.createElement('h2'); heading.textContent = title(n); card.append(heading);
      const description = document.createElement('p'); description.textContent = n.text.replace(/\n+/g, ' ').slice(0, 100) || 'An unwritten thought. The page is yours.'; card.append(description);
      const time = document.createElement('time'); time.dateTime = new Date(n.updated).toISOString(); time.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(n.updated)); card.append(time);
      if (trashView) {
        const restore = document.createElement('button'); restore.className = 'restore-note'; restore.textContent = 'Restore'; restore.setAttribute('aria-label', `Restore ${title(n)}`);
        restore.addEventListener('click', () => { n.deleted = false; n.updated = Date.now(); persist(); renderNotes(); toast('Thought restored.'); }); card.append(restore);
      } else {
        card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Open ${title(n)}`);
        const open = () => { closeLibrary(false); loadNote(n.id); };
        card.addEventListener('click', open); card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } });
        const wc = document.createElement('span'); wc.className = 'card-words'; wc.textContent = `${words(n.text)} words`; card.append(wc);
        const actions = document.createElement('div'); actions.className = 'card-actions';
        const pin = document.createElement('button'); pin.className = n.pinned ? 'pinned' : ''; pin.innerHTML = icon('pin'); pin.setAttribute('aria-label', `${n.pinned ? 'Unpin' : 'Pin'} ${title(n)}`);
        pin.addEventListener('click', e => { e.stopPropagation(); n.pinned = !n.pinned; persist(); renderNotes(); });
        const remove = document.createElement('button'); remove.innerHTML = icon('trash'); remove.setAttribute('aria-label', `Delete ${title(n)}`);
        remove.addEventListener('click', e => {
          e.stopPropagation(); n.deleted = true; n.updated = Date.now();
          if (n.id === state.current) {
            let next = state.notes.find(x => !x.deleted);
            if (!next) { next = makeNote(); state.notes.unshift(next); }
            loadNote(next.id, false);
          } else persist();
          renderNotes(); $('activeTab').focus(); toast('Moved to Recently deleted. You can restore it anytime.');
        }); actions.append(pin, remove); card.append(actions);
      }
      list.append(card);
    });
  }
  function download(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filename = () => (title(current()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 60).trim() || 'Untitled thought');
  function exportText() { download(`${filename()}.txt`, editor.value); closePopovers(); toast('Your words, ready to keep.'); }
  function backup() { download(`typewriter-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'typewriter-backup', version: 1, notes: state.notes, settings }, null, 2), 'application/json'); toast('Backup downloaded. Keep it somewhere safe.'); }
  function fullScreenUI(on) {
    if (on && !focused) { nativeBeforeFullscreen = settings.native; settings.native = false; }
    if (!on && focused) settings.native = nativeBeforeFullscreen;
    focused = on; closePopovers(); document.body.classList.toggle('fullscreen-mode', on);
    $('exitFocus').hidden = !on; $('focusButton').setAttribute('aria-pressed', String(on));
    $('focusButton').setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    applySettings(); editor.focus({ preventScroll: true });
  }
  function focusMode(on = !focused) {
    fullScreenUI(on);
    if (on && !document.fullscreenElement) {
      const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      request?.catch(() => { /* The full-screen workspace also works in browsers without the Fullscreen API. */ });
    } else if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) { nativeFullscreen = true; fullScreenUI(true); }
    else if (nativeFullscreen) { nativeFullscreen = false; fullScreenUI(false); }
  });

  editor.addEventListener('beforeinput', () => { beforeEdit = snapshot(); });
  editor.addEventListener('input', e => {
    if (beforeEdit) { remember(beforeEdit); beforeEdit = null; }
    saveEdit();
    if (!composing) {
      if (e.inputType === 'insertText' && e.data) strike(e.data);
      else if (e.inputType === 'insertLineBreak') strike('Enter');
      else if ((e.inputType || '').startsWith('delete')) strike('Backspace');
    }
  });
  editor.addEventListener('compositionstart', () => { composing = true; }); editor.addEventListener('compositionend', e => { composing = false; const letter = Array.from(e.data || '').at(-1); if (letter) strike(letter); });
  document.addEventListener('typewriter:impact', e => sound(e.detail.kind));
  editor.addEventListener('click', updateCounts); editor.addEventListener('keyup', updateCounts); editor.addEventListener('select', updateCounts);
  editor.addEventListener('keydown', e => {
    if (e.isComposing || composing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') { e.preventDefault(); insert('Tab'); return; }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
      window.TypewriterMechanism?.pressKey(e.key);
    }
  });
  document.addEventListener('keydown', e => {
    const targetIsEditor = e.target === editor;
    const textField = e.target instanceof HTMLInputElement || (e.target instanceof HTMLTextAreaElement && !targetIsEditor);
    const command = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (!$('notesDrawer').hidden) closeLibrary(); else if (currentPopover) closePopovers(true); else if (focused) focusMode(false);
      return;
    }
    if (command && e.key.toLowerCase() === 's') { e.preventDefault(); exportText(); return; }
    if (textField || $('helpDialog').open) return;
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newNote(); return; }
    if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); library(); return; }
    if (e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); focusMode(); return; }
    if (command && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') && $('notesDrawer').hidden && !currentPopover) {
      e.preventDefault(); undo(e.key.toLowerCase() === 'y' || e.shiftKey); return;
    }
    if (!targetIsEditor && !command && !e.altKey && $('notesDrawer').hidden && !currentPopover && e.target === document.body && e.key.length === 1) { e.preventDefault(); insert(e.key); }
    // Keep keyboard navigation inside the open note collection or popover.
    if (e.key === 'Tab') {
      const surface = !$('notesDrawer').hidden ? $('notesDrawer') : currentPopover ? $(currentPopover) : null;
      if (surface) {
        const controls = [...surface.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')].filter(el => !el.hidden);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && e.target === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && e.target === last) { e.preventDefault(); first?.focus(); }
      }
    }
  });
  document.addEventListener('pointerdown', e => { if (currentPopover && !$(currentPopover).contains(e.target) && !e.target.closest('[aria-expanded]')) closePopovers(); });
  $('libraryButton').onclick = () => library(); $('allNotesButton').onclick = () => library();
  $('closeLibrary').onclick = () => closeLibrary(); $('drawerOverlay').onclick = () => closeLibrary();
  $('newButton').onclick = newNote; $('drawerNew').onclick = newNote;
  $('activeTab').onclick = () => { trashView = false; renderNotes(); }; $('trashTab').onclick = () => { trashView = true; renderNotes(); };
  $('noteSearch').oninput = renderNotes;
  $('paperButton').onclick = () => popover('paperPopover', $('paperButton'));
  $('fontButton').onclick = () => popover('fontPopover', $('fontButton'));
  $('shareButton').onclick = () => popover('exportPopover', $('shareButton'));
  $('soundButton').onclick = () => { settings.sound = !settings.sound; applySettings(); persist(); if (settings.sound) sound(); toast(settings.sound ? 'A little click, a little clack. Sound on.' : 'Just you and your thoughts. Sound off.'); };
  $('lightButton').onclick = () => { settings.light = !settings.light; applySettings(); persist(); };
  $('lampTool').onclick = $('lightButton').onclick;
  $('lightLevel').oninput = () => { settings.lightLevel = Number($('lightLevel').value); applySettings(); persist(true); };
  document.querySelectorAll('[data-paper]').forEach(b => b.onclick = () => { settings.paper = b.dataset.paper; applySettings(); persist(); });
  document.querySelectorAll('[data-font]').forEach(b => b.onclick = () => { settings.font = b.dataset.font; applySettings(); persist(); });
  $('fontSize').oninput = () => { settings.fontSize = Number($('fontSize').value); applySettings(); persist(); updateCounts(); };
  $('undoButton').onclick = () => undo(); $('redoButton').onclick = () => undo(true);
  $('focusButton').onclick = () => focusMode(); $('exitFocus').onclick = () => focusMode(false);
  $('keyboardButton').onclick = () => setNative(!settings.native);
  $('downloadButton').onclick = exportText;
  $('copyButton').onclick = async () => {
    try { await navigator.clipboard.writeText(editor.value); closePopovers(); toast('Copied. Your words can go anywhere.'); }
    catch { closePopovers(); editor.focus(); editor.select(); toast('Select Copy from your device, or press Ctrl / ⌘ + C.'); }
  };
  $('printButton').onclick = () => { $('printPage').textContent = editor.value; closePopovers(); window.print(); };
  $('backupButton').onclick = backup; $('importButton').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('large');
      const incoming = JSON.parse(await file.text());
      if (incoming.format !== 'typewriter-backup' || !Array.isArray(incoming.notes) || !incoming.notes.every(validNote) || incoming.notes.length > 5000) throw new Error('format');
      let added = 0;
      incoming.notes.forEach(n => {
        const existing = state.notes.find(x => x.id === n.id);
        if (existing?.text === n.text) return;
        state.notes.push({ id: existing ? uid() : n.id, text: n.text, created: n.created, updated: n.updated, pinned: !!n.pinned, deleted: !!n.deleted }); added++;
      }); persist(); renderNotes(); toast(`${added} ${added === 1 ? 'thought' : 'thoughts'} brought back. Existing notes are kept.`);
    } catch { toast('Choose a Typewriter backup file under 10 MB.'); }
    e.target.value = '';
  };
  $('helpButton').onclick = () => { closePopovers(); $('helpDialog').showModal(); }; $('closeHelp').onclick = () => $('helpDialog').close();
  $('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('helpDialog').close(); } });
  window.addEventListener('resize', updateCounts);
  window.addEventListener('pagehide', () => persist());
  // Merge another tab's saved notes without overwriting an active edit.
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE || !e.newValue) return;
    try {
      const remote = JSON.parse(e.newValue); if (!Array.isArray(remote.notes) || !remote.notes.every(validNote)) return;
      let activeChanged = false;
      remote.notes.forEach(n => {
        const index = state.notes.findIndex(x => x.id === n.id);
        if (index < 0) state.notes.push(n);
        else if (n.updated > state.notes[index].updated) { state.notes[index] = n; if (n.id === state.current) activeChanged = true; }
      });
      if (activeChanged) {
        if (current().deleted) { const next = state.notes.find(n => !n.deleted); if (next) loadNote(next.id, false); else newNote(); }
        else { const start = editor.selectionStart; editor.value = current().text; editor.setSelectionRange(Math.min(start, editor.value.length), Math.min(start, editor.value.length)); histories.delete(state.current); updateCounts(); }
      }
      if (!$('notesDrawer').hidden) renderNotes();
    } catch { /* Ignore unrelated or incomplete saved data. */ }
  });
  applySettings(); renderKeyboard(); loadNote(state.current, false);
})();

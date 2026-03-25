/* ═══════════════════════════════════════════════════
   SIMPLNOTES — app.js
═══════════════════════════════════════════════════ */

/* ── DATA MODEL ───────────────────────────────────
   topics[]  { id, name }
   pages[]   { id, topicId, content, fcNodes[], fcEdges[] }
   spread    = index of left page in current view
             Can be >= pages.length (blank spread beyond)
─────────────────────────────────────────────────── */
let topics = [];
let pages  = [];
let nTid = 1, nPid = 1;
let spread = 0;
let sbOpen = true;

/* ── UTILS ────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const topicOf  = idx => topics.find(t => t.id === (pages[idx] || {}).topicId) || null;
const pagesFor = tid => pages.filter(p => p.topicId === tid);

function extractHeadings(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const out = [];
  d.querySelectorAll('h1,h2,h3').forEach(el => {
    const t = el.textContent.trim();
    if (t) out.push({ tag: el.tagName.toLowerCase(), text: t });
  });
  return out;
}

/* ── SIDEBAR ──────────────────────────────────────── */
function renderSidebar() {
  const list  = $('topic-list');
  const empty = $('sb-empty');
  list.innerHTML = '';
  if (!topics.length) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const activeTid = topicOf(spread)?.id;
  const lc = pages[spread]?.content || '';
  const rc = pages[spread + 1]?.content || '';

  topics.forEach(topic => {
    const g = document.createElement('div');
    g.className = 'topic-group';

    const row = document.createElement('div');
    row.className = 'topic-row' + (topic.id === activeTid ? ' active' : '');
    row.innerHTML = `<div class="topic-dot"></div>
      <span class="topic-name">${topic.name}</span>
      <span class="topic-pgcount">${pagesFor(topic.id).length}p</span>`;
    row.addEventListener('click', () => goToTopic(topic.id));
    g.appendChild(row);

    const allH = [];
    pagesFor(topic.id).forEach(pg => extractHeadings(pg.content).forEach(h => allH.push(h)));
    if (allH.length) {
      const hl = document.createElement('div');
      hl.className = 'heading-list';
      allH.forEach(h => {
        const e = document.createElement('div');
        const vis = topic.id === activeTid && (lc + rc).includes(h.text);
        e.className = 'h-entry' + (vis ? ' hl' : '');
        const b = h.tag === 'h1' ? '•' : h.tag === 'h2' ? '◦' : '▸';
        e.innerHTML = `<span class="h-bull">${b}</span><span class="h-text">${h.text}</span>`;
        e.addEventListener('click', () => goToHeading(topic.id, h.text));
        hl.appendChild(e);
      });
      g.appendChild(hl);
    }
    list.appendChild(g);
  });
}

/* ── NAVIGATION ──────────────────────────────────── */
function goToTopic(tid) {
  const fp = pages.find(p => p.topicId === tid);
  if (!fp) return;
  const i = pages.indexOf(fp);
  navigateTo(i % 2 === 0 ? i : i - 1, 'fwd');
}
function goToHeading(tid, text) {
  for (const pg of pagesFor(tid)) {
    if (extractHeadings(pg.content).some(h => h.text === text)) {
      const i = pages.indexOf(pg);
      navigateTo(i % 2 === 0 ? i : i - 1, 'fwd');
      return;
    }
  }
}

/* Navigate — spread can go beyond pages.length (blank area) */
function navigateTo(idx, dir) {
  if (idx < 0) idx = 0;
  saveContent();
  exitFcMode();
  spread = idx;
  renderSpread(dir);
}

/* ── RENDER SPREAD ───────────────────────────────── */
function renderSpread(dir) {
  ['L', 'R'].forEach((s, i) => {
    const pg  = pages[spread + i];
    const ed  = $('ed-' + s);
    const wr  = $('wrap-' + s);

    if (pg) {
      ed.innerHTML = pg.content || '';
      $('num-' + s).textContent = 'p.' + (spread + i + 1);
      const t = topicOf(spread + i);
      $('lbl-' + s).textContent   = t ? t.name : '';
      $('title-' + s).textContent = t ? t.name : '';
      wr.style.opacity = '1';
      renderFcOverlay(s, pg);
    } else {
      ed.innerHTML = '';
      $('num-' + s).textContent = $('lbl-' + s).textContent = $('title-' + s).textContent = '';
      wr.style.opacity = '0.26';
      clearFcOverlay(s);
    }
  });

  // Nav arrows — always enabled unless already at limit
  $('nav-prev').disabled = spread <= 0;
  // next is always enabled (lets you go to blank spread)
  $('nav-next').disabled = false;

  // Flip animation
  const aL = dir === 'fwd' ? 'anim-fwd'   : 'anim-bk';
  const aR = dir === 'fwd' ? 'anim-fwd-d' : 'anim-bk-d';
  ['wrap-L', 'wrap-R'].forEach((id, i) => {
    const el = $(id);
    el.classList.remove('anim-fwd','anim-fwd-d','anim-bk','anim-bk-d');
    void el.offsetWidth;
    el.classList.add(i === 0 ? aL : aR);
  });

  renderSidebar();
}

/* ── SAVE ─────────────────────────────────────────── */
function saveContent() {
  ['L', 'R'].forEach((s, i) => {
    const pg = pages[spread + i];
    if (pg) pg.content = $('ed-' + s).innerHTML;
  });
}

function liveInput(s) {
  const i = s === 'L' ? spread : spread + 1;
  if (pages[i]) {
    pages[i].content = $('ed-' + s).innerHTML;
    renderSidebar();
  }
}

$('ed-L').addEventListener('input', () => { liveInput('L'); scheduleOverflowCheck('L'); });
$('ed-R').addEventListener('input', () => { liveInput('R'); scheduleOverflowCheck('R'); });

/* ── EDITOR KEYBOARD HANDLING ─────────────────────── */
['ed-L', 'ed-R'].forEach(id => {
  $(id).addEventListener('keydown', e => edKeydown(e, id.slice(-1)));
});

function edKeydown(e, side) {
  const ed  = $('ed-' + side);
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const rng = sel.getRangeAt(0);

  // ── Tab / Shift+Tab ──
  const inList = closestList(rng.commonAncestorContainer);
  if (e.key === 'Tab') {
    e.preventDefault();
    if (inList) {
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    } else {
      e.shiftKey ? $('nav-prev').click() : $('nav-next').click();
    }
    return;
  }

  // ── Arrow cross-page ──
  if (side === 'L' && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
    if (atEnd(ed, rng) && pages[spread + 1]) {
      e.preventDefault(); focusStart($('ed-R')); return;
    }
  }
  if (side === 'R' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
    if (atStart(ed, rng) && pages[spread]) {
      e.preventDefault(); focusEnd($('ed-L')); return;
    }
  }
}

function closestList(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el) { if (['LI','UL','OL'].includes(el.tagName)) return el; el = el.parentElement; }
  return null;
}
function atEnd(ed, rng) {
  const tmp = rng.cloneRange(); tmp.selectNodeContents(ed); tmp.collapse(false);
  return rng.compareBoundaryPoints(Range.END_TO_END, tmp) >= 0;
}
function atStart(ed, rng) {
  const tmp = rng.cloneRange(); tmp.selectNodeContents(ed); tmp.collapse(true);
  return rng.compareBoundaryPoints(Range.START_TO_START, tmp) <= 0;
}

function focusStart(el) {
  el.focus();
  try {
    const r = document.createRange(), s = window.getSelection();
    r.setStart(el, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r);
  } catch(_){}
}
function focusEnd(el) {
  el.focus();
  try {
    const r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r);
  } catch(_){}
}

/* ── PAGE OVERFLOW ────────────────────────────────── */
let overflowTimer = null;
function scheduleOverflowCheck(side) {
  clearTimeout(overflowTimer);
  overflowTimer = setTimeout(() => checkOverflow(side), 10);
}

function checkOverflow(side) {
  const ed   = $('ed-' + side);
  const body = ed.parentElement;
  if (ed.scrollHeight <= body.offsetHeight + 2) return;  // +2 px tolerance

  // Detach the last block node
  let last = ed.lastElementChild || ed.lastChild;
  if (!last || (ed.childNodes.length === 1 && ed.textContent === '')) return;

  let carry = '';
  if (last.nodeType === Node.ELEMENT_NODE) { carry = last.outerHTML; last.remove(); }
  else { carry = last.textContent; last.remove(); }

  const idx = side === 'L' ? spread : spread + 1;
  if (pages[idx]) pages[idx].content = ed.innerHTML;

  if (side === 'L') {
    // Push carry to right page
    ensurePage(spread + 1, pages[spread]?.topicId);
    pages[spread + 1].content = carry + (pages[spread + 1].content || '');
    $('ed-R').innerHTML = pages[spread + 1].content;
    $('wrap-R').style.opacity = '1';
    updatePageHeader('R');
    focusStart($('ed-R'));
  } else {
    // Push carry to next spread's left page
    ensurePage(spread + 2, pages[spread + 1]?.topicId);
    pages[spread + 2].content = carry + (pages[spread + 2].content || '');
    saveContent();
    navigateTo(spread + 2, 'fwd');
    setTimeout(() => focusStart($('ed-L')), 60);
  }
}

function ensurePage(idx, topicId) {
  while (pages.length <= idx) {
    pages.push({ id: nPid++, topicId: topicId || null, content: '', fcNodes: [], fcEdges: [] });
  }
}

function updatePageHeader(side) {
  const i = side === 'L' ? spread : spread + 1;
  const pg = pages[i];
  if (!pg) return;
  $('num-' + side).textContent = 'p.' + (i + 1);
  const t = topicOf(i);
  $('lbl-' + side).textContent   = t ? t.name : '';
  $('title-' + side).textContent = t ? t.name : '';
}

/* ── TOPIC MODAL ─────────────────────────────────── */
function openModal() {
  $('m-topic-name').value = '';
  $('modal-wrap').classList.add('show');
  setTimeout(() => $('m-topic-name').focus(), 80);
}
function closeModal() { $('modal-wrap').classList.remove('show'); }

$('m-cancel').addEventListener('click', closeModal);
$('modal-wrap').addEventListener('click', e => { if (e.target === $('modal-wrap')) closeModal(); });
$('m-topic-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('m-confirm').click(); });
$('m-confirm').addEventListener('click', () => {
  const name = $('m-topic-name').value.trim();
  if (!name) { $('m-topic-name').focus(); return; }
  saveContent();
  createTopic(name);
  closeModal();
});

function createTopic(name) {
  const topic = { id: nTid++, name };
  topics.push(topic);
  // Align to even index
  if (pages.length % 2 !== 0) {
    const prev = pages[pages.length - 1];
    pages.push({ id: nPid++, topicId: prev?.topicId || null, content: '', fcNodes: [], fcEdges: [] });
  }
  const startIdx = pages.length;
  pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
  pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
  navigateTo(startIdx, 'fwd');
  setTimeout(() => $('ed-L').focus(), 120);
}

$('sb-add-btn').addEventListener('click', openModal);
$('new-topic-top').addEventListener('click', openModal);

/* ── PAGE NAVIGATION ─────────────────────────────── */
$('nav-prev').addEventListener('click', () => {
  if (spread > 0) { saveContent(); navigateTo(spread - 2, 'bk'); }
});
$('nav-next').addEventListener('click', () => {
  saveContent(); navigateTo(spread + 2, 'fwd');
});

/* Add blank page button (+ under right arrow) */
$('add-page-btn').addEventListener('click', () => {
  saveContent();
  // Insert two blank pages at current spread+2 position
  const tid = topicOf(spread + 1)?.id || topicOf(spread)?.id || null;
  const insertAt = spread + 2;
  pages.splice(insertAt, 0,
    { id: nPid++, topicId: tid, content: '', fcNodes: [], fcEdges: [] },
    { id: nPid++, topicId: tid, content: '', fcNodes: [], fcEdges: [] }
  );
  navigateTo(insertAt, 'fwd');
});

$('sb-toggle').addEventListener('click', () => {
  sbOpen = !sbOpen;
  $('sidebar').classList.toggle('closed', !sbOpen);
});

/* ═══════════════════════════════════════════════════
   UNIFIED TOOLBAR
═══════════════════════════════════════════════════ */

// The toolbar targets whichever editor was last focused
let activeEditor = $('ed-L');

['ed-L', 'ed-R'].forEach(id => {
  $(id).addEventListener('focus', () => { activeEditor = $(id); });
  // Update format-state buttons on every click inside editor
  $(id).addEventListener('mouseup', updateFmtState);
  $(id).addEventListener('keyup',   updateFmtState);
});

function updateFmtState() {
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const b = document.querySelector(`[data-cmd="${c}"]`);
    if (b) b.classList.toggle('on', document.queryCommandState(c));
  });
}
document.addEventListener('selectionchange', updateFmtState);

function ensureEditorFocused() {
  if (document.activeElement !== activeEditor &&
      !document.activeElement.closest('#unified-toolbar')) {
    activeEditor.focus();
  }
}

// Format buttons
document.querySelectorAll('[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    ensureEditorFocused();
    const c = btn.dataset.cmd;
    if (c === 'hiliteColor') {
      document.execCommand('hiliteColor', false, 'rgba(170,164,255,0.25)');
    } else {
      document.execCommand(c, false, null);
    }
    updateFmtState();
  });
});

// Font select
$('fnt-sel').addEventListener('change', function() {
  ensureEditorFocused(); document.execCommand('fontName', false, this.value);
});

// Size select
$('sz-sel').addEventListener('change', function() {
  ensureEditorFocused();
  document.execCommand('fontSize', false, 7);
  activeEditor.querySelectorAll('font[size="7"]').forEach(el => {
    el.removeAttribute('size'); el.style.fontSize = this.value;
  });
});

// Colour
$('col-btn').addEventListener('click', () => $('col-inp').click());
$('col-inp').addEventListener('input', function() {
  $('col-bar').style.background = this.value;
  ensureEditorFocused();
  document.execCommand('foreColor', false, this.value);
});

// Highlight
$('hl-btn').addEventListener('mousedown', e => {
  e.preventDefault(); ensureEditorFocused();
  document.execCommand('hiliteColor', false, 'rgba(170,164,255,0.25)');
});

// Image
$('img-btn').addEventListener('click', () => $('img-inp').click());
$('img-inp').addEventListener('change', function() {
  const f = this.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => { ensureEditorFocused(); document.execCommand('insertHTML', false, `<img src="${ev.target.result}" alt=""/>`); };
  r.readAsDataURL(f); this.value = '';
});

// Heading dropdown
const hdBtn  = $('hd-btn');
const hdDrop = $('hd-drop');
hdBtn.addEventListener('mousedown', e => { e.preventDefault(); hdDrop.classList.toggle('open'); });
hdDrop.querySelectorAll('.hd-opt').forEach(opt => {
  opt.addEventListener('mousedown', e => {
    e.preventDefault(); ensureEditorFocused();
    document.execCommand('formatBlock', false, opt.dataset.tag === 'p' ? 'P' : opt.dataset.tag.toUpperCase());
    hdDrop.classList.remove('open');
    setTimeout(() => {
      // Trigger sidebar heading update
      const s = activeEditor.id === 'ed-L' ? 'L' : 'R';
      liveInput(s);
    }, 30);
  });
});

// Link popover
let savedRange = null;
$('lnk-btn').addEventListener('mousedown', e => {
  e.preventDefault();
  ensureEditorFocused();
  const sel = window.getSelection();
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
  const r = $('lnk-btn').getBoundingClientRect();
  $('link-pop').style.left = r.left + 'px';
  $('link-pop').style.top  = (r.top - 120) + 'px';
  $('link-pop').classList.toggle('show');
  if ($('link-pop').classList.contains('show')) {
    $('lnk-url').value = '';
    setTimeout(() => $('lnk-url').focus(), 40);
  }
});
$('lnk-cancel').addEventListener('click', () => $('link-pop').classList.remove('show'));
$('lnk-apply').addEventListener('click', () => {
  const url = $('lnk-url').value;
  if (url && savedRange) {
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    document.execCommand('createLink', false, url);
    document.querySelectorAll('.page-ed a').forEach(a => a.target = '_blank');
  }
  $('link-pop').classList.remove('show');
});
document.addEventListener('click', e => {
  if (!$('link-pop').contains(e.target) && !e.target.closest('#lnk-btn'))
    $('link-pop').classList.remove('show');
  if (!hdDrop.contains(e.target) && e.target !== hdBtn)
    hdDrop.classList.remove('open');
});

/* ═══════════════════════════════════════════════════
   FLOWCHART ENGINE
   Nodes live on the .fc-overlay layer above the text.
   Each page stores fcNodes[] + fcEdges[] independently.
═══════════════════════════════════════════════════ */
let fcMode   = false;
let fcSide   = null;   // 'L' | 'R'

let fc = {
  selected:  null,
  connMode:  false,
  connSrc:   null,
  dragging:  null,  // { node, ox, oy, side }
  resizing:  null,  // { node, dir, ox, oy, w0, h0, x0, y0, side }
};

// ── Toolbar FC toggle button ──
$('fc-btn').addEventListener('click', () => {
  if (fcMode) exitFcMode();
  else {
    // Enter FC mode on the side whose editor is active
    const side = (activeEditor === $('ed-R')) ? 'R' : 'L';
    enterFcMode(side);
  }
});

function enterFcMode(side) {
  fcMode = true; fcSide = side;
  $('tb-text').classList.add('hide');
  $('tb-fc').classList.add('show');
  $('fc-btn').classList.add('on');
  $('fc-mode-badge').classList.add('show');
  $('fc-ov-' + side).classList.add('active');
}
function exitFcMode() {
  if (!fcMode) return;
  const s = fcSide;
  fcMode = false; fcSide = null;
  fc.connMode = false; fc.connSrc = null; fc.selected = null;
  $('tb-text').classList.remove('hide');
  $('tb-fc').classList.remove('show');
  $('fc-btn').classList.remove('on');
  $('fc-mode-badge').classList.remove('show');
  if (s) {
    $('fc-ov-' + s).classList.remove('active');
    $('fc-ov-' + s).style.cursor = '';
  }
}

// ── FC toolbar actions ──
$('fc-exit').addEventListener('click', exitFcMode);
$('fc-add-rect').addEventListener('click',   () => addNode('rect'));
$('fc-add-diam').addEventListener('click',   () => addNode('diamond'));
$('fc-add-oval').addEventListener('click',   () => addNode('oval'));
$('fc-add-para').addEventListener('click',   () => addNode('parallelogram'));
$('fc-connect').addEventListener('click',    toggleConnectMode);
$('fc-del').addEventListener('click',        deleteSelected);
$('fc-clear').addEventListener('click',      clearAll);

function getCurrentPg(side) {
  const idx = (side || fcSide) === 'L' ? spread : spread + 1;
  return pages[idx] || null;
}
function getOv(side) { return $('fc-ov-' + (side || fcSide)); }

function addNode(shape) {
  const side = fcSide;
  let pg = getCurrentPg(side);
  const ov = getOv(side);
  if (!pg || !ov) return;

  // Find lowest occupied Y on this page
  let maxY = 10;
  (pg.fcNodes || []).forEach(n => { if (n.y + n.h > maxY) maxY = n.y + n.h; });
  const ovH = ov.getBoundingClientRect().height;

  // If no room (within 60px of bottom), add to the other page or a new one
  if (maxY + 60 > ovH) {
    const altSide = side === 'L' ? 'R' : null;
    if (altSide) {
      const altPg = getCurrentPg(altSide);
      if (altPg) { addNodeToPg(altPg, shape, altSide); return; }
    }
    // Overflow to next spread — ensure pages exist and navigate
    ensurePage(spread + 2, pg.topicId);
    const nextSide = 'L';
    const nextPg   = pages[spread + 2];
    saveContent(); navigateTo(spread + 2, 'fwd');
    setTimeout(() => { enterFcMode(nextSide); addNodeToPg(nextPg, nextSide === 'L' ? pages[spread] : pages[spread+1], shape, nextSide); }, 120);
    return;
  }

  addNodeToPg(pg, shape, side);
}

function addNodeToPg(pg, shape, side) {
  if (!pg.fcNodes) pg.fcNodes = [];
  if (!pg.fcEdges) pg.fcEdges = [];
  const ov  = getOv(side);
  const ovR = ov.getBoundingClientRect();
  let maxY  = 10;
  pg.fcNodes.forEach(n => { if (n.y + n.h > maxY) maxY = n.y + n.h; });

  const w = shape === 'diamond' ? 110 : shape === 'oval' || shape === 'parallelogram' ? 130 : 120;
  const h = shape === 'diamond' ? 70  : 44;
  const node = {
    id: nPid++, shape,
    x: Math.max(10, (ovR.width - w) / 2 + (Math.random() - .5) * 40),
    y: maxY + 10, w, h,
    text: shape === 'diamond' ? 'Decision?' : shape === 'oval' ? 'Start/End' : 'Text'
  };
  pg.fcNodes.push(node);
  fc.selected = node.id;
  renderFcOverlay(side, pg);
}

function toggleConnectMode() {
  fc.connMode = !fc.connMode;
  fc.connSrc  = null;
  $('fc-connect').classList.toggle('on', fc.connMode);
  const ov = getOv();
  if (ov) ov.style.cursor = fc.connMode ? 'crosshair' : '';
}

function deleteSelected() {
  const pg = getCurrentPg();
  if (!pg || !fc.selected) return;
  pg.fcNodes = pg.fcNodes.filter(n => n.id !== fc.selected);
  pg.fcEdges = pg.fcEdges.filter(e => e.from !== fc.selected && e.to !== fc.selected);
  fc.selected = null;
  renderFcOverlay(fcSide, pg);
}

function clearAll() {
  const pg = getCurrentPg();
  if (!pg) return;
  pg.fcNodes = []; pg.fcEdges = []; fc.selected = null;
  renderFcOverlay(fcSide, pg);
}

/* ── RENDER FC OVERLAY ────────────────────────────── */
function renderFcOverlay(side, pg) {
  const ov = $('fc-ov-' + side);
  if (!ov || !pg) return;
  ov.querySelectorAll('.fc-node,.rh,.edge-label').forEach(e => e.remove());
  const svgEl = ov.querySelector('svg');
  svgEl.querySelectorAll('path,marker:not(#fc-arr)').forEach(e => e.remove());

  if (!pg.fcNodes?.length) return;

  // Draw edges
  (pg.fcEdges || []).forEach(edge => {
    drawEdge(svgEl, pg, edge);
  });

  // Draw nodes
  pg.fcNodes.forEach(node => {
    const el = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'fc-node-inner';
    inner.textContent = node.text;

    el.className = ['fc-node', node.shape,
      fc.selected === node.id ? 'sel'      : '',
      fc.connSrc  === node.id ? 'conn-src' : ''].filter(Boolean).join(' ');

    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px`;
    el.dataset.nid  = node.id;
    el.dataset.side = side;

    if (node.shape === 'parallelogram') {
      el.appendChild(inner);
    } else {
      el.textContent = node.text;
    }

    // ── Events ──
    el.addEventListener('mousedown', e => {
      if (e.target.contentEditable === 'true') return;
      e.stopPropagation();

      if (fc.connMode) {
        handleConnectClick(pg, side, node.id);
        return;
      }
      fc.selected = node.id;
      const ovR   = ov.getBoundingClientRect();
      fc.dragging = { node, side, ox: e.clientX - ovR.left - node.x, oy: e.clientY - ovR.top - node.y };
      renderFcOverlay(side, pg);
    });

    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      el.contentEditable = 'true'; el.focus();
      const rng = document.createRange();
      rng.selectNodeContents(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(rng);
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      node.text = el.textContent.trim() || 'Text';
    });

    ov.appendChild(el);

    // Resize handles only on selected node
    if (fc.selected === node.id) {
      ['nw','ne','sw','se'].forEach(dir => {
        const rh = document.createElement('div');
        rh.className = 'rh ' + dir;
        rh.style.cssText =
          `left:${dir.includes('w') ? node.x-5 : node.x+node.w-4}px;` +
          `top:${dir.includes('n') ? node.y-5 : node.y+node.h-4}px`;
        rh.addEventListener('mousedown', e => {
          e.stopPropagation();
          fc.resizing = { node, side, dir, ox:e.clientX, oy:e.clientY, w0:node.w, h0:node.h, x0:node.x, y0:node.y };
        });
        ov.appendChild(rh);
      });
    }
  });
}

function drawEdge(svgEl, pg, edge) {
  const a = pg.fcNodes.find(n => n.id === edge.from);
  const b = pg.fcNodes.find(n => n.id === edge.to);
  if (!a || !b) return;

  // Smart port selection: find the nearest boundary midpoints
  const ports = (n) => [
    { x: n.x + n.w/2, y: n.y           },   // top
    { x: n.x + n.w,   y: n.y + n.h/2   },   // right
    { x: n.x + n.w/2, y: n.y + n.h     },   // bottom
    { x: n.x,         y: n.y + n.h/2   },   // left
  ];
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  let best = { d: Infinity, p: null, q: null };
  ports(a).forEach(p => ports(b).forEach(q => {
    const d = dist(p, q); if (d < best.d) best = { d, p, q };
  }));

  const { p: p1, q: p2 } = best;
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // Orthogonal-style bezier
  path.setAttribute('d', `M${p1.x},${p1.y} C${p1.x},${my} ${p2.x},${my} ${p2.x},${p2.y}`);
  path.setAttribute('stroke', edge.style === 'dashed' ? 'rgba(0,210,255,0.55)' : 'rgba(170,164,255,0.6)');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('fill', 'none');
  if (edge.style === 'dashed') path.setAttribute('stroke-dasharray', '5 3');
  path.setAttribute('marker-end', 'url(#fc-arr)');
  svgEl.appendChild(path);

  // Edge label
  if (edge.label) {
    const lbl = document.createElement('div');
    lbl.className = 'edge-label';
    lbl.style.left = (mx - 20) + 'px';
    lbl.style.top  = (my - 9)  + 'px';
    lbl.textContent = edge.label;
    svgEl.parentElement.appendChild(lbl);
  }
}

function handleConnectClick(pg, side, nodeId) {
  if (!fc.connSrc) {
    fc.connSrc = nodeId;
    renderFcOverlay(side, pg);
  } else if (fc.connSrc !== nodeId) {
    pg.fcEdges.push({ from: fc.connSrc, to: nodeId, style: 'solid' });
    fc.connSrc = null; fc.connMode = false;
    $('fc-connect').classList.remove('on');
    getOv(side).style.cursor = '';
    renderFcOverlay(side, pg);
  }
}

function clearFcOverlay(side) {
  const ov = $('fc-ov-' + side);
  if (!ov) return;
  ov.querySelectorAll('.fc-node,.rh,.edge-label').forEach(e => e.remove());
  ov.querySelector('svg')?.querySelectorAll('path').forEach(e => e.remove());
}

/* ── DRAG + RESIZE (global) ──────────────────────── */
document.addEventListener('mousemove', e => {
  if (fc.dragging) {
    const { node, side, ox, oy } = fc.dragging;
    const ov  = $('fc-ov-' + side);
    const ovR = ov.getBoundingClientRect();
    const pg  = getCurrentPg(side);
    node.x = Math.max(0, Math.min(e.clientX - ovR.left - ox, ovR.width  - node.w));
    node.y = Math.max(0, Math.min(e.clientY - ovR.top  - oy, ovR.height - node.h));
    // Move element directly for smooth drag
    const el = ov.querySelector(`[data-nid="${node.id}"]`);
    if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
    // Move resize handles
    ov.querySelectorAll(`.rh[data-nid="${node.id}"]`).forEach(rh => {
      const d = rh.classList[1];
      rh.style.left = (d.includes('w') ? node.x-5 : node.x+node.w-4) + 'px';
      rh.style.top  = (d.includes('n') ? node.y-5 : node.y+node.h-4) + 'px';
    });
    // Redraw edges only
    if (pg) {
      const svgEl = ov.querySelector('svg');
      svgEl.querySelectorAll('path').forEach(p => p.remove());
      ov.querySelectorAll('.edge-label').forEach(p => p.remove());
      (pg.fcEdges || []).forEach(edge => drawEdge(svgEl, pg, edge));
    }
  }

  if (fc.resizing) {
    const { node, side, dir, ox, oy, w0, h0, x0, y0 } = fc.resizing;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    let nw = w0, nh = h0, nx = x0, ny = y0;
    if (dir.includes('e')) nw = Math.max(80, w0 + dx);
    if (dir.includes('s')) nh = Math.max(36, h0 + dy);
    if (dir.includes('w')) { nw = Math.max(80, w0 - dx); nx = x0 + (w0 - nw); }
    if (dir.includes('n')) { nh = Math.max(36, h0 - dy); ny = y0 + (h0 - nh); }
    node.w = nw; node.h = nh; node.x = nx; node.y = ny;
    const ov = $('fc-ov-' + side);
    const el = ov?.querySelector(`[data-nid="${node.id}"]`);
    if (el) { el.style.width=nw+'px'; el.style.height=nh+'px'; el.style.left=nx+'px'; el.style.top=ny+'px'; }
    ov?.querySelectorAll(`.rh`).forEach(rh => {
      const d = rh.classList[1];
      if (+rh.dataset.nid === node.id) {
        rh.style.left = (d.includes('w') ? nx-5 : nx+nw-4) + 'px';
        rh.style.top  = (d.includes('n') ? ny-5 : ny+nh-4) + 'px';
      }
    });
  }
});

document.addEventListener('mouseup', () => {
  if (fc.dragging) {
    const { side } = fc.dragging; fc.dragging = null;
    const pg = getCurrentPg(side); if (pg) renderFcOverlay(side, pg);
  }
  if (fc.resizing) {
    const { side } = fc.resizing; fc.resizing = null;
    const pg = getCurrentPg(side); if (pg) renderFcOverlay(side, pg);
  }
});

/* ── GLOBAL KEYBOARD ─────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
    if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
    if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
  }
  if (e.key === 'Escape') {
    closeModal(); exitFcMode();
    $('link-pop').classList.remove('show');
    hdDrop.classList.remove('open');
  }
  // Delete key removes selected FC node
  if ((e.key === 'Delete' || e.key === 'Backspace') && fcMode &&
       !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) &&
       !document.activeElement.isContentEditable) {
    deleteSelected();
  }
});

/* ── INIT ─────────────────────────────────────────── */
renderSidebar();
$('nav-prev').disabled = true;
$('wrap-L').style.opacity = '0.22';
$('wrap-R').style.opacity = '0.22';

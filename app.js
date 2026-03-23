/* ═══════════════════════════════════════════════════
   SIMPLNOTES — app.js
═══════════════════════════════════════════════════ */

/* ── DATA MODEL ───────────────────────────────────
  topics[]  { id, name }
  pages[]   { id, topicId, content, fcNodes[], fcEdges[] }
  spread    index of left page in current view
─────────────────────────────────────────────────── */
let topics = [];
let pages  = [];
let nTid = 1, nPid = 1;
let spread = 0;
let sbOpen = true;
let activeEditor = null;  // DOM element currently focused
let fcMode = false;       // whether flowchart mode is on
let fcSide = null;        // 'L' or 'R' — which page's fc overlay is active

/* ── UTILS ────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const topicOf  = idx => topics.find(t => t.id === (pages[idx] || {}).topicId) || null;
const pagesFor = tid => pages.filter(p => p.topicId === tid);
const pidx     = pid => pages.findIndex(p => p.id === pid);

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
    const pc = pagesFor(topic.id).length;
    row.innerHTML = `<div class="topic-dot"></div>
      <span class="topic-name">${topic.name}</span>
      <span class="topic-pgcount">${pc}p</span>`;
    row.addEventListener('click', () => goToTopic(topic.id));
    g.appendChild(row);

    // Headings
    const allH = [];
    pagesFor(topic.id).forEach(pg => extractHeadings(pg.content).forEach(h => allH.push(h)));
    if (allH.length) {
      const hl = document.createElement('div');
      hl.className = 'heading-list';
      allH.forEach(h => {
        const e = document.createElement('div');
        const visible = topic.id === activeTid && (lc + rc).includes(h.text);
        e.className = 'h-entry' + (visible ? ' hl' : '');
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
  const i = pidx(fp.id);
  navigateTo(i % 2 === 0 ? i : i - 1, 'fwd');
}
function goToHeading(tid, text) {
  for (const pg of pagesFor(tid)) {
    if (extractHeadings(pg.content).some(h => h.text === text)) {
      const i = pidx(pg.id);
      navigateTo(i % 2 === 0 ? i : i - 1, 'fwd');
      return;
    }
  }
}

function navigateTo(idx, dir) {
  if (idx < 0) idx = 0;
  if (idx >= pages.length) idx = Math.max(0, pages.length - 1);
  saveContent();
  exitFcMode();
  spread = idx;
  renderSpread(dir);
}

/* ── RENDER SPREAD ───────────────────────────────── */
function renderSpread(dir) {
  const sides = ['L', 'R'];
  sides.forEach((s, i) => {
    const pg  = pages[spread + i];
    const ed  = $(  'ed-' + s);
    const num = $( 'num-' + s);
    const lbl = $( 'lbl-' + s);
    const ttl = $('title-' + s);
    const wr  = $( 'wrap-' + s);

    if (pg) {
      ed.innerHTML = pg.content || '';
      num.textContent = 'p.' + (spread + i + 1);
      const t = topicOf(spread + i);
      lbl.textContent = t ? t.name : '';
      ttl.textContent = t ? t.name : '';
      wr.style.opacity = '1';
      renderFcOverlay(s, pg);
    } else {
      ed.innerHTML = '';
      num.textContent = lbl.textContent = ttl.textContent = '';
      wr.style.opacity = '0.28';
      clearFcOverlay(s);
    }
  });

  $('nav-prev').disabled = spread <= 0;
  $('nav-next').disabled = spread + 2 >= pages.length;

  // Flip animation
  const aL = dir === 'fwd' ? 'anim-fwd'   : 'anim-bk';
  const aR = dir === 'fwd' ? 'anim-fwd-d' : 'anim-bk-d';
  [['wrap-L', aL], ['wrap-R', aR]].forEach(([id, cls]) => {
    const el = $(id);
    el.classList.remove('anim-fwd','anim-fwd-d','anim-bk','anim-bk-d');
    void el.offsetWidth;
    el.classList.add(cls);
  });

  renderSidebar();
}

/* ── SAVE ─────────────────────────────────────────── */
function saveContent() {
  ['L','R'].forEach((s, i) => {
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

$('ed-L').addEventListener('input', () => { liveInput('L'); checkOverflow('L'); });
$('ed-R').addEventListener('input', () => { liveInput('R'); checkOverflow('R'); });

['ed-L','ed-R'].forEach(id => {
  $(id).addEventListener('focus', () => { activeEditor = $(id); });
  // Make keyboard navigation work naturally — browsers handle most of this
  // We only intercept Enter/Backspace at page boundaries
  $(id).addEventListener('keydown', e => editorKeydown(e, id.slice(-1)));
});

/* ── SMART EDITOR KEYDOWN ─────────────────────────── */
function editorKeydown(e, side) {
  const ed = $('ed-' + side);
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);

  // Tab / Shift+Tab → page flip (if not in a list item)
  const inList = range.commonAncestorContainer.nodeType !== Node.ELEMENT_NODE
    ? range.commonAncestorContainer.parentElement.closest('li,ul,ol')
    : range.commonAncestorContainer.closest('li,ul,ol');

  if (e.key === 'Tab' && !inList) {
    e.preventDefault();
    if (e.shiftKey) {
      $('nav-prev').click();
    } else {
      $('nav-next').click();
    }
    return;
  }

  // Indent with Tab inside lists
  if (e.key === 'Tab' && inList) {
    e.preventDefault();
    document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    return;
  }

  // ArrowRight / ArrowDown at end of page → jump to next page
  if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && side === 'L') {
    // Check if caret is at end of editor
    const tmp = range.cloneRange();
    tmp.selectNodeContents(ed);
    tmp.collapse(false);
    if (range.compareBoundaryPoints(Range.END_TO_END, tmp) >= 0) {
      e.preventDefault();
      const edR = $('ed-R');
      if (pages[spread + 1]) { focusStart(edR); }
      return;
    }
  }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && side === 'R') {
    const tmp = range.cloneRange();
    tmp.selectNodeContents(ed);
    tmp.collapse(true);
    if (range.compareBoundaryPoints(Range.START_TO_START, tmp) <= 0) {
      e.preventDefault();
      const edL = $('ed-L');
      if (pages[spread]) { focusEnd(edL); }
      return;
    }
  }

  // Backspace at start of right page → jump to end of left
  if (e.key === 'Backspace' && side === 'R') {
    const tmp = range.cloneRange();
    tmp.selectNodeContents(ed);
    tmp.collapse(true);
    if (range.compareBoundaryPoints(Range.START_TO_START, tmp) <= 0 && ed.textContent === '') {
      e.preventDefault();
      focusEnd($('ed-L'));
      return;
    }
  }
}

function focusStart(el) {
  el.focus();
  try {
    const r = document.createRange(), s = window.getSelection();
    r.setStart(el, 0); r.collapse(true);
    s.removeAllRanges(); s.addRange(r);
  } catch(_){}
}
function focusEnd(el) {
  el.focus();
  try {
    const r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(el); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  } catch(_){}
}

/* ── PAGE OVERFLOW DETECTION ─────────────────────── */
// Uses a hidden measurement div to detect overflow without scroll
function checkOverflow(side) {
  setTimeout(() => {
    const ed   = $('ed-' + side);
    const body = ed.parentElement;   // .pg-body
    // scrollHeight > offsetHeight means content overflows
    if (ed.scrollHeight <= body.offsetHeight) return;

    // Find and detach the last block-level node
    let last = ed.lastElementChild;
    if (!last) {
      // Only text nodes — take the last text node
      const nodes = Array.from(ed.childNodes);
      if (!nodes.length) return;
      last = nodes[nodes.length - 1];
    }
    // Capture carried content
    let carry = '';
    if (last.nodeType === Node.ELEMENT_NODE) {
      carry = last.outerHTML; last.remove();
    } else {
      carry = last.textContent; last.remove();
    }
    // Save trimmed page
    const idx = side === 'L' ? spread : spread + 1;
    if (pages[idx]) pages[idx].content = ed.innerHTML;

    if (side === 'L') {
      // Carry to right page
      const rIdx = spread + 1;
      if (rIdx < pages.length) {
        pages[rIdx].content = carry + (pages[rIdx].content || '');
        $('ed-R').innerHTML = pages[rIdx].content;
        focusStart($('ed-R'));
      } else {
        addPage(spread, topicOf(spread)?.id, carry);
        navigateTo(spread + 2, 'fwd');
        setTimeout(() => focusStart($('ed-L')), 80);
      }
    } else {
      // Carry to next spread's left page
      const nIdx = spread + 2;
      if (nIdx < pages.length) {
        pages[nIdx].content = carry + (pages[nIdx].content || '');
        navigateTo(spread + 2, 'fwd');
        setTimeout(() => focusStart($('ed-L')), 80);
      } else {
        addPage(spread + 1, topicOf(spread + 1)?.id, carry);
        navigateTo(spread + 2, 'fwd');
        setTimeout(() => focusStart($('ed-L')), 80);
      }
    }
  }, 0);
}

function addPage(afterIdx, topicId, initialContent) {
  pages.splice(afterIdx + 1, 0, {
    id: nPid++, topicId: topicId || null,
    content: initialContent || '',
    fcNodes: [], fcEdges: []
  });
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
    const prev = pages.length ? pages[pages.length - 1] : null;
    pages.push({ id: nPid++, topicId: prev?.topicId || null, content: '', fcNodes: [], fcEdges: [] });
  }
  const startIdx = pages.length;
  pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
  pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
  navigateTo(startIdx, 'fwd');
  setTimeout(() => { $('ed-L').focus(); }, 120);
}

$('sb-add-btn').addEventListener('click', openModal);
$('new-topic-top').addEventListener('click', openModal);

/* ── PAGE NAVIGATION ─────────────────────────────── */
function goFwd() {
  if (spread + 2 < pages.length) { saveContent(); navigateTo(spread + 2, 'fwd'); }
}
function goBk() {
  if (spread > 0) { saveContent(); navigateTo(spread - 2, 'bk'); }
}
$('nav-prev').addEventListener('click', goBk);
$('nav-next').addEventListener('click', goFwd);

/* ── SIDEBAR TOGGLE ──────────────────────────────── */
$('sb-toggle').addEventListener('click', () => {
  sbOpen = !sbOpen;
  $('sidebar').classList.toggle('closed', !sbOpen);
});

/* ══════════════════════════════════════════════════
   TOOLBAR (embedded in each page footer)
   Both pages share identical toolbar DOM — we clone
   behaviour using data attributes.
══════════════════════════════════════════════════ */

// Build toolbars dynamically after DOM ready
function buildToolbar(side) {
  const bar = $('pg-toolbar-' + side);
  // Text group buttons target the editor on the same side
  bar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      activateEditor(side);
      const c = btn.dataset.cmd;
      if (c === 'hiliteColor') {
        document.execCommand('hiliteColor', false, 'rgba(170,164,255,0.25)');
      } else {
        document.execCommand(c, false, null);
      }
      updateFormatState(side);
    });
  });

  // Font select
  const fnt = bar.querySelector('.fnt-sel');
  if (fnt) fnt.addEventListener('change', function() {
    activateEditor(side);
    document.execCommand('fontName', false, this.value);
  });

  // Size select
  const sz = bar.querySelector('.sz-sel');
  if (sz) sz.addEventListener('change', function() {
    activateEditor(side);
    document.execCommand('fontSize', false, 7);
    const ed = $('ed-' + side);
    ed.querySelectorAll('font[size="7"]').forEach(el => {
      el.removeAttribute('size');
      el.style.fontSize = this.value;
    });
  });

  // Colour
  const csw = bar.querySelector('.col-sw');
  const cinp = bar.querySelector('.col-inp');
  const cbar = bar.querySelector('.col-bar');
  if (csw && cinp) {
    csw.addEventListener('click', () => cinp.click());
    cinp.addEventListener('input', function() {
      cbar.style.background = this.value;
      activateEditor(side);
      document.execCommand('foreColor', false, this.value);
    });
  }

  // Heading dropdown
  const hdBtn  = bar.querySelector('.hd-btn');
  const hdDrop = bar.querySelector('.hd-drop');
  if (hdBtn && hdDrop) {
    hdBtn.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      hdDrop.classList.toggle('open');
    });
    hdDrop.querySelectorAll('.hd-opt').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        activateEditor(side);
        document.execCommand('formatBlock', false, opt.dataset.tag === 'p' ? 'P' : opt.dataset.tag.toUpperCase());
        hdDrop.classList.remove('open');
        setTimeout(() => liveInput(side), 30);
      });
    });
  }

  // Link
  const lnkBtn = bar.querySelector('.lnk-btn');
  if (lnkBtn) {
    lnkBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      activateEditor(side);
      const sel = window.getSelection();
      if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
      const r = lnkBtn.getBoundingClientRect();
      $('link-pop').style.left = r.left + 'px';
      $('link-pop').style.top  = (r.top - 116) + 'px';
      $('link-pop').classList.toggle('show');
      if ($('link-pop').classList.contains('show')) {
        $('lnk-url').value = '';
        setTimeout(() => $('lnk-url').focus(), 40);
      }
    });
  }

  // Image
  const imgBtn = bar.querySelector('.img-btn');
  const imgInp = bar.querySelector('.img-inp');
  if (imgBtn && imgInp) {
    imgBtn.addEventListener('click', () => imgInp.click());
    imgInp.addEventListener('change', function() {
      const f = this.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        activateEditor(side);
        document.execCommand('insertHTML', false, `<img src="${ev.target.result}" alt=""/>`);
      };
      reader.readAsDataURL(f); this.value = '';
    });
  }

  // FC toggle button
  const fcBtn = bar.querySelector('.fc-toggle-btn');
  if (fcBtn) {
    fcBtn.addEventListener('click', () => toggleFcMode(side));
  }

  // FC tool buttons
  bar.querySelectorAll('[data-fc]').forEach(btn => {
    btn.addEventListener('click', () => fcToolAction(btn.dataset.fc, side));
  });
}

function activateEditor(side) {
  const ed = $('ed-' + side);
  activeEditor = ed;
  if (document.activeElement !== ed) {
    ed.focus();
    if (savedRange) {
      try {
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(savedRange);
      } catch(_){}
    }
  }
}

function updateFormatState(side) {
  const bar = $('pg-toolbar-' + side);
  if (!bar) return;
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const b = bar.querySelector(`[data-cmd="${c}"]`);
    if (b) b.classList.toggle('on', document.queryCommandState(c));
  });
}

document.addEventListener('selectionchange', () => {
  ['L','R'].forEach(s => updateFormatState(s));
});

/* ── LINK POPOVER ─────────────────────────────────── */
let savedRange = null;
$('lnk-cancel').addEventListener('click', () => $('link-pop').classList.remove('show'));
$('lnk-apply').addEventListener('click', () => {
  const url = $('lnk-url').value;
  if (url && savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(savedRange);
    document.execCommand('createLink', false, url);
    document.querySelectorAll('.page-ed a').forEach(a => a.target = '_blank');
  }
  $('link-pop').classList.remove('show');
});
document.addEventListener('click', e => {
  const lp = $('link-pop');
  if (!lp.contains(e.target) && !e.target.closest('.lnk-btn')) lp.classList.remove('show');
  // Close heading dropdowns
  document.querySelectorAll('.hd-drop.open').forEach(d => {
    if (!d.contains(e.target) && !e.target.closest('.hd-btn')) d.classList.remove('open');
  });
});

/* ══════════════════════════════════════════════════
   FLOWCHART — embedded on page
══════════════════════════════════════════════════ */

// Each page object stores fcNodes[] and fcEdges[]
// We render them on the .fc-overlay layer above the text

let fcState = {
  side:        null,
  connecting:  false,
  connSrc:     null,
  selected:    null,
  dragging:    null,
  dragOX: 0, dragOY: 0,
  resizing:    null,
  resizeDir:   null,
  resizeOX: 0, resizeOY: 0,
  resizeW0: 0, resizeH0: 0,
};

function toggleFcMode(side) {
  if (fcMode && fcSide === side) {
    exitFcMode();
  } else {
    if (fcMode) exitFcMode();
    enterFcMode(side);
  }
}

function enterFcMode(side) {
  fcMode = true; fcSide = side;
  // Switch toolbar to FC mode for this side
  const bar = $('pg-toolbar-' + side);
  bar.querySelector('.tb-text-group').classList.add('hide');
  bar.querySelector('.tb-fc-group').classList.add('show');
  const fcBtn = bar.querySelector('.fc-toggle-btn');
  if (fcBtn) fcBtn.classList.add('on');
  // Enable pointer events on overlay
  const ov = $('fc-ov-' + side);
  ov.classList.add('active');
}

function exitFcMode() {
  if (!fcMode) return;
  const side = fcSide;
  fcMode = false; fcSide = null;
  fcState.connecting = false; fcState.connSrc = null; fcState.selected = null;
  if (!side) return;
  const bar = $('pg-toolbar-' + side);
  if (!bar) return;
  bar.querySelector('.tb-text-group').classList.remove('hide');
  bar.querySelector('.tb-fc-group').classList.remove('show');
  const fcBtn = bar.querySelector('.fc-toggle-btn');
  if (fcBtn) fcBtn.classList.remove('on');
  $('fc-ov-' + side).classList.remove('active');
}

function getCurrentPageForSide(side) {
  const idx = side === 'L' ? spread : spread + 1;
  return pages[idx] || null;
}

function fcToolAction(action, side) {
  const pg = getCurrentPageForSide(side);
  if (!pg) return;

  if (action === 'add-rect')    addFcNode(pg, side, 'rect');
  if (action === 'add-diamond') addFcNode(pg, side, 'diamond');
  if (action === 'add-cloud')   addFcNode(pg, side, 'cloud');
  if (action === 'connect')     startConnect(side);
  if (action === 'delete')      deleteFcSelected(pg, side);
  if (action === 'clear')       clearFc(pg, side);
}

function addFcNode(pg, side, shape) {
  // Check if page has room (very rough — place below existing nodes or in free area)
  const ov = $('fc-ov-' + side);
  const rect = ov.getBoundingClientRect();
  const existing = pg.fcNodes;

  // Find lowest node bottom
  let y = 10;
  existing.forEach(n => { const b = n.y + n.h; if (b > y) y = b; });
  // If no room at bottom of page, try next page
  if (y + 80 > rect.height) {
    // Add to next page
    const altSide = side === 'L' ? 'R' : null;
    if (altSide) {
      const altPg = getCurrentPageForSide(altSide);
      if (altPg) { addFcNode(altPg, altSide, shape); return; }
    }
    // else just stack anyway
    y = 10;
  }

  const node = {
    id: nPid++,
    x: 20 + Math.random() * 60,
    y: Math.max(10, y + 8),
    w: 120, h: 48,
    shape, text: 'Text'
  };
  pg.fcNodes.push(node);
  renderFcOverlay(side, pg);
  // Select new node
  fcState.selected = node.id;
  renderFcOverlay(side, pg);
}

function startConnect(side) {
  fcState.connecting = true; fcState.connSrc = null;
  // Visual feedback via cursor on overlay
  const ov = $('fc-ov-' + side);
  ov.style.cursor = 'crosshair';
}

function deleteFcSelected(pg, side) {
  if (!fcState.selected) return;
  pg.fcNodes = pg.fcNodes.filter(n => n.id !== fcState.selected);
  pg.fcEdges = pg.fcEdges.filter(e => e.from !== fcState.selected && e.to !== fcState.selected);
  fcState.selected = null;
  renderFcOverlay(side, pg);
}

function clearFc(pg, side) {
  pg.fcNodes = []; pg.fcEdges = [];
  fcState.selected = null;
  renderFcOverlay(side, pg);
}

/* ── FC OVERLAY RENDER ───────────────────────────── */
function renderFcOverlay(side, pg) {
  const ov = $('fc-ov-' + side);
  if (!ov || !pg) return;
  // Remove old nodes
  ov.querySelectorAll('.fc-node,.resize-handle').forEach(e => e.remove());
  const svgEl = ov.querySelector('svg');
  svgEl.querySelectorAll('path,line').forEach(e => e.remove());

  if (!pg.fcNodes || !pg.fcNodes.length) return;

  // Draw edges
  (pg.fcEdges || []).forEach(edge => {
    const a = pg.fcNodes.find(n => n.id === edge.from);
    const b = pg.fcNodes.find(n => n.id === edge.to);
    if (!a || !b) return;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2;
    const x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    path.setAttribute('stroke', 'rgba(170,164,255,0.6)');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', edge.style === 'dashed' ? '5 3' : 'none');
    path.setAttribute('marker-end', 'url(#fc-arr)');
    svgEl.appendChild(path);
  });

  // Draw nodes
  pg.fcNodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'fc-node' +
      (node.shape === 'cloud'   ? ' cloud'    : '') +
      (node.shape === 'diamond' ? ' diamond'  : '') +
      (fcState.selected === node.id ? ' sel' : '') +
      (fcState.connSrc  === node.id ? ' conn-src' : '');
    el.style.left   = node.x + 'px';
    el.style.top    = node.y + 'px';
    el.style.width  = node.w + 'px';
    el.style.height = node.h + 'px';
    el.textContent  = node.text;
    el.dataset.nid  = node.id;
    el.dataset.side = side;

    // Drag
    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('resize-handle')) return;
      if (e.target.contentEditable === 'true') return;
      if (fcState.connecting) {
        e.stopPropagation();
        handleConnectClick(pg, side, node.id);
        return;
      }
      e.stopPropagation();
      fcState.selected = node.id;
      fcState.dragging = node;
      const ovr = $('fc-ov-' + side).getBoundingClientRect();
      fcState.dragOX = e.clientX - ovr.left - node.x;
      fcState.dragOY = e.clientY - ovr.top  - node.y;
      renderFcOverlay(side, pg);
    });

    // Double-click to edit
    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      el.contentEditable = 'true'; el.focus();
      const rng = document.createRange();
      rng.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(rng);
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      node.text = el.textContent.trim() || 'Text';
    });

    ov.appendChild(el);

    // Resize handles (only when selected)
    if (fcState.selected === node.id) {
      ['nw','ne','sw','se'].forEach(dir => {
        const rh = document.createElement('div');
        rh.className = `resize-handle rh-${dir}`;
        rh.dataset.dir  = dir;
        rh.dataset.nid  = node.id;
        rh.dataset.side = side;
        rh.style.left = (dir.includes('w') ? node.x - 4 : node.x + node.w - 4) + 'px';
        rh.style.top  = (dir.includes('n') ? node.y - 4 : node.y + node.h - 4) + 'px';
        rh.addEventListener('mousedown', e => {
          e.stopPropagation();
          fcState.resizing   = node;
          fcState.resizeDir  = dir;
          fcState.resizeOX   = e.clientX;
          fcState.resizeOY   = e.clientY;
          fcState.resizeW0   = node.w;
          fcState.resizeH0   = node.h;
          fcState.resizeX0   = node.x;
          fcState.resizeY0   = node.y;
        });
        ov.appendChild(rh);
      });
    }
  });
}

function handleConnectClick(pg, side, nodeId) {
  if (!fcState.connSrc) {
    fcState.connSrc = nodeId;
    renderFcOverlay(side, pg);
  } else if (fcState.connSrc !== nodeId) {
    pg.fcEdges.push({ from: fcState.connSrc, to: nodeId, style: 'solid' });
    fcState.connSrc = null; fcState.connecting = false;
    const ov = $('fc-ov-' + side);
    ov.style.cursor = '';
    renderFcOverlay(side, pg);
  }
}

function clearFcOverlay(side) {
  const ov = $('fc-ov-' + side);
  if (!ov) return;
  ov.querySelectorAll('.fc-node,.resize-handle').forEach(e => e.remove());
  const svgEl = ov.querySelector('svg');
  if (svgEl) svgEl.querySelectorAll('path,line').forEach(e => e.remove());
}

// Global mouse move / up for drag + resize
document.addEventListener('mousemove', e => {
  if (fcState.dragging) {
    const side = fcState.dragging._side || fcSide;
    const ov   = $('fc-ov-' + side);
    if (!ov) return;
    const ovr  = ov.getBoundingClientRect();
    const node = fcState.dragging;
    node._side = side;
    node.x = Math.max(0, e.clientX - ovr.left - fcState.dragOX);
    node.y = Math.max(0, e.clientY - ovr.top  - fcState.dragOY);
    // Update position directly without full re-render for smooth drag
    const el = ov.querySelector(`[data-nid="${node.id}"]`);
    if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
    // Redraw edges
    const pg = getCurrentPageForSide(side);
    if (pg) {
      const svgEl = ov.querySelector('svg');
      svgEl.querySelectorAll('path').forEach(e => e.remove());
      // Quick edge redraw
      (pg.fcEdges || []).forEach(edge => {
        const a = pg.fcNodes.find(n => n.id === edge.from);
        const b = pg.fcNodes.find(n => n.id === edge.to);
        if (!a || !b) return;
        const x1=a.x+a.w/2,y1=a.y+a.h/2,x2=b.x+b.w/2,y2=b.y+b.h/2,mx=(x1+x2)/2;
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        path.setAttribute('stroke','rgba(170,164,255,0.6)');
        path.setAttribute('stroke-width','1.6');
        path.setAttribute('fill','none');
        path.setAttribute('marker-end','url(#fc-arr)');
        svgEl.appendChild(path);
      });
      // Update resize handle positions
      ov.querySelectorAll('.resize-handle').forEach(rh => {
        const dir = rh.dataset.dir;
        if (rh.dataset.nid == node.id) {
          rh.style.left = (dir.includes('w') ? node.x-4 : node.x+node.w-4) + 'px';
          rh.style.top  = (dir.includes('n') ? node.y-4 : node.y+node.h-4) + 'px';
        }
      });
    }
  }

  if (fcState.resizing) {
    const node = fcState.resizing;
    const side = node._side || fcSide;
    const dx = e.clientX - fcState.resizeOX;
    const dy = e.clientY - fcState.resizeOY;
    const dir = fcState.resizeDir;
    let nw = fcState.resizeW0, nh = fcState.resizeH0, nx = fcState.resizeX0, ny = fcState.resizeY0;
    if (dir.includes('e')) nw = Math.max(80, fcState.resizeW0 + dx);
    if (dir.includes('s')) nh = Math.max(36, fcState.resizeH0 + dy);
    if (dir.includes('w')) { nw = Math.max(80, fcState.resizeW0 - dx); nx = fcState.resizeX0 + (fcState.resizeW0 - nw); }
    if (dir.includes('n')) { nh = Math.max(36, fcState.resizeH0 - dy); ny = fcState.resizeY0 + (fcState.resizeH0 - nh); }
    node.w = nw; node.h = nh; node.x = nx; node.y = ny;
    const ov = $('fc-ov-' + side);
    const el = ov?.querySelector(`[data-nid="${node.id}"]`);
    if (el) { el.style.width=nw+'px'; el.style.height=nh+'px'; el.style.left=nx+'px'; el.style.top=ny+'px'; }
    // Update handles
    ov?.querySelectorAll('.resize-handle').forEach(rh => {
      if (rh.dataset.nid == node.id) {
        const d = rh.dataset.dir;
        rh.style.left = (d.includes('w') ? nx-4 : nx+nw-4) + 'px';
        rh.style.top  = (d.includes('n') ? ny-4 : ny+nh-4) + 'px';
      }
    });
  }
});

document.addEventListener('mouseup', () => {
  if (fcState.dragging) {
    const side = fcState.dragging._side || fcSide;
    const pg = getCurrentPageForSide(side);
    if (pg) renderFcOverlay(side, pg);
    fcState.dragging = null;
  }
  if (fcState.resizing) {
    const side = fcState.resizing._side || fcSide;
    const pg = getCurrentPageForSide(side);
    if (pg) renderFcOverlay(side, pg);
    fcState.resizing = null;
  }
});

/* ── GLOBAL KEYBOARD ─────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
    if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
    if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
    if (e.key === 'z') { /* browser handles undo */ }
    if (e.key === 'y') { /* browser handles redo */ }
  }
  if (e.key === 'Escape') {
    closeModal();
    exitFcMode();
    $('link-pop').classList.remove('show');
    document.querySelectorAll('.hd-drop.open').forEach(d => d.classList.remove('open'));
  }
});

/* ── INIT ─────────────────────────────────────────── */
// Build toolbar behaviours
buildToolbar('L');
buildToolbar('R');

// Empty initial state
renderSidebar();
$('nav-prev').disabled = true;
$('nav-next').disabled = true;

// Set initial opacity of blank pages
$('wrap-L').style.opacity = '0.22';
$('wrap-R').style.opacity = '0.22';

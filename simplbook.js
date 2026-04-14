/* SimplBook — app logic
   1. State & base UI
   2. Overflow engine
   3. Index & navigation
   4. Cursor movement
   5. Text formatting
   6. Persistence (localStorage)
   7. Flowchart (stub)
*/

/* ── 1. STATE & BASE UI ─────────────────────────────────────────────────────────────────────── */

/* Data model:
     topics[]         { id, name }
     pages[]          { id, topicId, content, fcNodes[], fcEdges[] }
     collapsedTopics  Set of topic ids whose heading list is collapsed
     spread           index of left page in current view (always even)
*/
let topics = [];
let pages  = [];
let nTid   = 1, nPid = 1;
let spread = 0;
let sbOpen = true;
const collapsedTopics = new Set();

/* Flowchart state — declared here so renderSpread/exitFcMode can reference them
   before section 7 runs. let/const are NOT hoisted like function declarations. */
let fcMode = false;
let fcSide = null;
const fc   = { selected: null, connMode: false, connSrc: null, dragging: null, resizing: null };

const $        = id  => document.getElementById(id);
const topicOf  = idx => topics.find(t => t.id === (pages[idx] || {}).topicId) || null;
const pagesFor = tid => pages.filter(p => p.topicId === tid);

/* ── Sidebar ──
   Reads headings from pages[].content directly, so it works on fresh load
   and after typing without needing the DOM to be populated first. */
function renderSidebar() {
  const list  = $('topic-list');
  const empty = $('sb-empty');
  if (!list) return;
  list.innerHTML = '';
  if (!topics.length) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const activeTid = topicOf(spread)?.id;
  /* For highlighting headings visible on the current spread, read from pages[] model
     (not the DOM) so this works both on fresh load and after typing. */
  const lc = pages[spread]?.content     || '';
  const rc = pages[spread + 1]?.content || '';

  topics.forEach(topic => {
    const g = document.createElement('div');
    g.className = 'topic-group';

    /* Topic row */
    const row = document.createElement('div');
    row.className = 'topic-row' + (topic.id === activeTid ? ' active' : '');

    /* Collapse toggle button */
    const allH = [];
    pagesFor(topic.id).forEach(pg => extractHeadings(pg.content).forEach(h => allH.push(h)));
    const hasHeadings  = allH.length > 0;
    const isCollapsed  = collapsedTopics.has(topic.id);

    const toggle = document.createElement('button');
    toggle.className = 'topic-toggle' + (isCollapsed ? ' collapsed' : '');
    toggle.title     = hasHeadings ? (isCollapsed ? 'Expand' : 'Collapse') : '';
    toggle.innerHTML = `<span class="toggle-arrow">${hasHeadings ? '▾' : '•'}</span>`;
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      if (!hasHeadings) return;
      if (collapsedTopics.has(topic.id)) collapsedTopics.delete(topic.id);
      else collapsedTopics.add(topic.id);
      renderSidebar();
    });

    const name = document.createElement('span');
    name.className   = 'topic-name';
    name.textContent = topic.name;

    const cnt = document.createElement('span');
    cnt.className   = 'topic-pgcount';
    cnt.textContent = pagesFor(topic.id).length + 'p';

    /* Delete-topic button — fades in on row hover via CSS */
    const delBtn = document.createElement('button');
    delBtn.className = 'topic-del-btn';
    delBtn.title     = 'Delete topic';
    delBtn.innerHTML = '<span class="mi" style="font-size:13px;pointer-events:none">delete</span>';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDelete(
        `Delete topic "${topic.name}" and all its pages? This cannot be undone.`,
        () => deleteTopic(topic.id)
      );
    });

    row.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(cnt);
    row.appendChild(delBtn);
    row.addEventListener('click', () => goToTopic(topic.id));
    g.appendChild(row);

    /* Heading list */
    if (hasHeadings && !isCollapsed) {
      const hl = document.createElement('div');
      hl.className = 'heading-list';
      allH.forEach(h => {
        const e   = document.createElement('div');
        const vis = topic.id === activeTid && (lc + rc).includes(h.text);
        const lvl = h.tag === 'h1' ? 'h-level-1' : h.tag === 'h2' ? 'h-level-2' : 'h-level-3';
        e.className = `h-entry ${lvl}` + (vis ? ' hl' : '');
        const b = '›';
        e.innerHTML = `<span class="h-bull">${b}</span><span class="h-text">${h.text}</span>`;
        e.addEventListener('click', () => goToHeading(topic.id, h.text));
        hl.appendChild(e);
      });
      g.appendChild(hl);
    }
    list.appendChild(g);
  });
}

/* ── Page spread ── */
function renderSpread(dir) {
  ['L', 'R'].forEach((s, i) => {
    const pg = pages[spread + i];
    const ed = $('ed-' + s);
    const wr = $('wrap-' + s);

    if (pg) {
      ed.innerHTML = pg.content || '';
      /* Re-attach link target after innerHTML restore */
      ed.querySelectorAll('a[href]').forEach(a => {
        a.target = '_blank'; a.rel = 'noopener noreferrer';
      });
      $('num-' + s).textContent   = 'p.' + (spread + i + 1);
      $('title-' + s).textContent = topicOf(spread + i)?.name || '';
      wr.style.opacity = '1';
      /* Non-critical rendering — wrapped so errors can't block renderSidebar */
      try { renderFcOverlay(s, pg); }         catch(e) { console.warn('renderFcOverlay:', e); }
      try { renderPageDeleteBtn(s, spread + i); } catch(e) { console.warn('renderPageDeleteBtn:', e); }
    } else {
      ed.innerHTML = '';
      $('num-' + s).textContent = $('lbl-' + s).textContent = $('title-' + s).textContent = '';
      try { clearFcOverlay(s); }      catch(e) {}
      try { removePageDeleteBtn(s); } catch(e) {}
    }
  });

  $('nav-prev').disabled = spread <= 0;
  $('nav-next').disabled = false;
  
  renderSidebar();

  const aL = dir === 'fwd' ? 'anim-fwd'   : dir === 'bk' ? 'anim-bk'   : 'null';
  const aR = dir === 'fwd' ? 'anim-fwd-d' : dir === 'bk' ? 'anim-bk-d' : 'null';
  ['wrap-L', 'wrap-R'].forEach((id, i) => {
    const el = $(id);
    el.classList.remove('anim-fwd', 'anim-fwd-d', 'anim-bk', 'anim-bk-d');
    void el.offsetWidth;
    el.classList.add(i === 0 ? aL : aR);
  });
}

/* ── Per-page delete button (injected into .pg-head) ── */
function renderPageDeleteBtn(side, pgIdx) {
  const pg   = $('pg-' + side);
  if (!pg) return;
  const head = pg.querySelector('.pg-head');
  if (!head) return;
  removePageDeleteBtn(side);
  if (!pages[pgIdx]) return;
  const btn = document.createElement('button');
  btn.className = 'pg-del-btn';
  btn.id        = 'pg-del-' + side;
  btn.title     = 'Delete this page';
  btn.innerHTML = '<span class="mi" style="font-size:13px;pointer-events:none">delete</span>';
  btn.addEventListener('click', () => {
    confirmDelete(`Delete page ${pgIdx + 1}? This cannot be undone.`, () => deletePage(pgIdx));
  });
  head.appendChild(btn);
}
function removePageDeleteBtn(side) { $('pg-del-' + side)?.remove(); }

/* Enable / disable all interactive UI */
function enableUI() {
  $('ed-L').contentEditable = 'true';
  $('ed-R').contentEditable = 'true';
  $('nav-prev').disabled    = spread <= 0;
  $('nav-next').disabled    = false;
  $('wrap-L').style.opacity = '1';
  $('wrap-R').style.opacity = '1';
}
function disableUI() {
  $('ed-L').contentEditable = 'false';
  $('ed-R').contentEditable = 'false';
  $('nav-prev').disabled    = true;
  $('nav-next').disabled    = true;
  $('wrap-L').style.opacity = '0.22';
  $('wrap-R').style.opacity = '0.22';
}

/* ── Confirmation dialog ── */
function confirmDelete(message, onConfirm) {
  let overlay = $('del-confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'del-confirm-overlay';
    overlay.innerHTML = `
      <div id="del-confirm-box">
        <p id="del-confirm-msg"></p>
        <div class="del-confirm-row">
          <button id="del-confirm-cancel" class="m-cancel">Cancel</button>
          <button id="del-confirm-ok">Delete</button>
        </div>
      </div>`;
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '600',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    });
    document.body.appendChild(overlay);
    const box = $('del-confirm-box');
    Object.assign(box.style, {
      background: 'rgba(255,255,255,0.11)', backdropFilter: 'blur(28px)',
      borderRadius: '16px', padding: '28px 28px 22px', maxWidth: '340px', width: '90%',
      border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    });
    Object.assign($('del-confirm-msg').style, {
      color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: '1.6', marginBottom: '22px',
    });
    const row = overlay.querySelector('.del-confirm-row');
    Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });
    const okBtn = $('del-confirm-ok');
    Object.assign(okBtn.style, {
      height: '34px', padding: '0 18px', borderRadius: '999px', border: 'none', cursor: 'pointer',
      background: 'rgba(220,60,60,0.8)', color: '#fff', fontWeight: '600', fontSize: '13px',
    });
    $('del-confirm-cancel').addEventListener('click', closeConfirm);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeConfirm(); });
    document.body.appendChild(overlay);
  }
  $('del-confirm-msg').textContent = message;
  overlay.style.display = 'flex';
  const ok = $('del-confirm-ok');
  const fresh = ok.cloneNode(true);
  Object.assign(fresh.style, ok.style.cssText ? { cssText: ok.style.cssText } : {
    height:'34px', padding:'0 18px', borderRadius:'999px', border:'none', cursor:'pointer',
    background:'rgba(220,60,60,0.8)', color:'#fff', fontWeight:'600', fontSize:'13px',
  });
  ok.replaceWith(fresh);
  fresh.addEventListener('click', () => { closeConfirm(); onConfirm(); });
}
function closeConfirm() {
  const o = $('del-confirm-overlay'); if (o) o.style.display = 'none';
}

/* ── Delete a page ── */
function deletePage(pgIdx) {
  saveContent();
  pages.splice(pgIdx, 1);
  if (spread >= pages.length) {
    spread = Math.max(0, pages.length - 2);
    if (spread % 2 !== 0) spread--;
    if (spread < 0) spread = 0;
  }
  topics = topics.filter(t => pages.some(p => p.topicId === t.id));
  if (!pages.length) { disableUI(); renderSidebar(); renderSpread(); }
  else renderSpread();
  schedulePersist();
}

/* ── Delete an entire topic ── */
function deleteTopic(tid) {
  saveContent();
  const indices = pages.reduce((acc, p, i) => { if (p.topicId === tid) acc.push(i); return acc; }, []);
  indices.reverse().forEach(i => pages.splice(i, 1));
  topics = topics.filter(t => t.id !== tid);
  collapsedTopics.delete(tid);
  if (spread >= pages.length) {
    spread = Math.max(0, pages.length - 2);
    if (spread % 2 !== 0) spread--;
    if (spread < 0) spread = 0;
  }
  if (!pages.length) { disableUI(); renderSidebar(); renderSpread(); }
  else renderSpread();
  schedulePersist();
}

/* ── Topic modal ── */
function openModal() {
  $('m-topic-name').value = '';
  $('modal-wrap').classList.add('show');
  setTimeout(() => $('m-topic-name').focus(), 80);
}
function closeModal() {
  $('modal-wrap').classList.remove('show');
  renderSpread();
}

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
  if (pages.length % 2 !== 0) {
    pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
  } else {
    const startIdx = pages.length;
    pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
    pages.push({ id: nPid++, topicId: topic.id, content: '', fcNodes: [], fcEdges: [] });
    spread = startIdx;
  }
  enableUI();
  renderSpread('fwd');
  schedulePersist();
  setTimeout(() => $('ed-L').focus(), 120);
}

function saveContent() {
  ['L', 'R'].forEach((s, i) => {
    const pg = pages[spread + i];
    if (pg) pg.content = $('ed-' + s).innerHTML;
  });
}

/* ── Initial locked state ── */
$('nav-prev').disabled    = true;
$('nav-next').disabled    = true;
$('wrap-L').style.opacity = '0.22';
$('wrap-R').style.opacity = '0.22';
$('ed-L').contentEditable = 'false';
$('ed-R').contentEditable = 'false';
renderSidebar();

/* ── Button wiring ── */
$('sb-add-btn').addEventListener('click', openModal);
$('new-topic-top').addEventListener('click', openModal);
$('sb-toggle').addEventListener('click', () => {
  sbOpen = !sbOpen;
  $('sidebar').classList.toggle('closed', !sbOpen);
});
$('add-page-btn').addEventListener('click', () => {
  if (!topics.length) { openModal(); return; }
  saveContent();
  const tid      = topicOf(spread + 1)?.id || topicOf(spread)?.id || topics[topics.length - 1]?.id || null;
  const insertAt = topicOf(spread + 1) === null ? spread + 1 : spread + 2;
  pages.splice(insertAt, 0, { id: nPid++, topicId: tid, content: '', fcNodes: [], fcEdges: [] });
  const targetSpread = insertAt % 2 === 0 ? insertAt : insertAt - 1;
  if (insertAt % 2 === 0) navigateTo(targetSpread, 'fwd');
  else renderSpread();
  schedulePersist();
  setTimeout(() => { $(insertAt === spread ? 'ed-L' : 'ed-R').focus(); }, 80);
});


/* ── 2. OVERFLOW ENGINE ─────────────────────────────────────────────────────────────────────── */

const OF_DELAY = 50;
const ofTimer  = { L: null, R: null };

function scheduleOverflow(side) {
  clearTimeout(ofTimer[side]);
  ofTimer[side] = setTimeout(() => runOverflow(side), OF_DELAY);
}

$('ed-L').addEventListener('input', () => { liveInput('L'); scheduleOverflow('L'); guardFontSize('L'); });
$('ed-R').addEventListener('input', () => { liveInput('R'); scheduleOverflow('R'); guardFontSize('R'); });

function isOverflowing(ed) { return ed.scrollHeight > ed.clientHeight + 2; }
function hasPullRoom(ed)   { return ed.scrollHeight <= ed.clientHeight - 30; }

function ensurePage(idx, topicId) {
  while (pages.length <= idx)
    pages.push({ id: nPid++, topicId, content: '', fcNodes: [], fcEdges: [] });
}
function prependHtml(pgIdx, html) {
  pages[pgIdx].content = html + (pages[pgIdx].content || '');
}
function prependBlock(pgIdx, tagName, text) {
  const tag  = (tagName || 'p').toLowerCase();
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  pages[pgIdx].content = `<${tag}>${safe}</${tag}>` + (pages[pgIdx].content || '');
}

function trySplitLastWord(ed, lastBlock) {
  if ([...lastBlock.childNodes].some(n => n.nodeType === Node.ELEMENT_NODE)) return null;
  const origText = lastBlock.textContent;
  const words    = origText.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;
  lastBlock.textContent = words[0];
  if (isOverflowing(ed)) { lastBlock.textContent = origText; return null; }
  let lo = 1, hi = words.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    lastBlock.textContent = words.slice(0, mid).join(' ');
    if (!isOverflowing(ed)) lo = mid; else hi = mid - 1;
  }
  lastBlock.textContent = words.slice(0, lo).join(' ');
  return { tagName: lastBlock.tagName, text: words.slice(lo).join(' ') };
}

function pushLoop(side, pgIdx) {
  const ed = $('ed-' + side);
  let safety = 0;
  while (isOverflowing(ed) && ++safety < 300) {
    const nextIdx   = pgIdx + 1;
    ensurePage(nextIdx, pages[pgIdx].topicId);
    const children  = [...ed.children];
    if (!children.length) break;
    const lastBlock = children[children.length - 1];
    const split     = trySplitLastWord(ed, lastBlock);
    if (split) { prependBlock(nextIdx, split.tagName, split.text); }
    else        { prependHtml(nextIdx, lastBlock.outerHTML); lastBlock.remove(); }
  }
}

function pullLoop(side, pgIdx) {
  const ed      = $('ed-' + side);
  const nextIdx = pgIdx + 1;
  if (!pages[nextIdx]?.content?.trim() || !hasPullRoom(ed)) return;
  let safety = 0;
  while (hasPullRoom(ed) && ++safety < 300) {
    if (!pages[nextIdx]?.content?.trim()) break;
    const tmp = document.createElement('div');
    tmp.innerHTML = pages[nextIdx].content;
    const first = tmp.firstElementChild;
    if (!first) break;
    ed.appendChild(first.cloneNode(true));
    if (isOverflowing(ed)) { ed.removeChild(ed.lastElementChild); break; }
    tmp.removeChild(first);
    pages[nextIdx].content = tmp.innerHTML;
  }
}

function runOverflow(side) {
  const ed    = $('ed-' + side);
  const pgIdx = spread + (side === 'L' ? 0 : 1);
  const pg    = pages[pgIdx];
  if (!pg) return;

  const hadMarker = insertCursorMarker(ed);
  pushLoop(side, pgIdx);
  pullLoop(side, pgIdx);
  pg.content = ed.innerHTML;

  const nextEd = (side === 'L' && pages[spread + 1]) ? $('ed-R') : null;
  if (nextEd) nextEd.innerHTML = pages[spread + 1].content;

  if (hadMarker) {
    restoreCursorFromMarker(ed, nextEd);
    pg.content = ed.innerHTML;
    if (nextEd && pages[spread + 1]) pages[spread + 1].content = nextEd.innerHTML;
  }

  cleanMarkerFromPages();
  if (side === 'L' && nextEd && isOverflowing(nextEd)) scheduleOverflow('R');
  renderSidebar();
  schedulePersist();
}


/* ── 3. INDEX & NAVIGATION ──────────────────────────────────────────────────────────────────── */

function extractHeadings(html) {
  if (!html) return [];
  const d = document.createElement('div');
  d.innerHTML = html;
  const out = [];
  d.querySelectorAll('h1,h2,h3').forEach(el => {
    const t = el.textContent.trim();
    if (t) out.push({ tag: el.tagName.toLowerCase(), text: t });
  });
  return out;
}

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

function navigateTo(idx, dir) {
  if (idx < 0) idx = 0;
  saveContent();
  exitFcMode();
  spread = idx;
  renderSpread(dir);
  schedulePersist();
}

$('nav-prev').addEventListener('click', () => { if (spread > 0) navigateTo(spread - 2, 'bk'); });
$('nav-next').addEventListener('click', () => { navigateTo(spread + 2, 'fwd'); });


/* ── 4. CURSOR MOVEMENT ─────────────────────────────────────────────────────────────────────── */

['ed-L', 'ed-R'].forEach(id => { $(id).addEventListener('keydown', e => edKeydown(e, id.slice(-1))); });

function edKeydown(e, side) {
  const ed  = $('ed-' + side);
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const rng = sel.getRangeAt(0);

  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    return;
  }

  /* Backspace / Delete: remove one level of indentation if cursor is at the
     boundary of a <blockquote> (what execCommand('indent') creates on plain text). */
  if ((e.key === 'Backspace' || e.key === 'Delete') && rng.collapsed) {
    let node = rng.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    let bq = null;
    for (let tmp = node; tmp && tmp !== ed; tmp = tmp.parentElement) {
      if (tmp.tagName === 'BLOCKQUOTE') { bq = tmp; break; }
    }
    if (bq) {
      /* Check the cursor is at the very start (Backspace) or end (Delete) of the blockquote's text */
      const boundary = document.createRange();
      boundary.selectNodeContents(bq);
      if (e.key === 'Backspace') boundary.setEnd(rng.startContainer, rng.startOffset);
      else                       boundary.setStart(rng.endContainer, rng.endOffset);
      if (boundary.toString().replace(/\u200B/g, '').trim().length === 0) {
        e.preventDefault();
        document.execCommand('outdent');
        return;
      }
    }
  }

  if (e.key === 'ArrowLeft'  && side === 'R' && isAtStart(ed)) { if (pages[spread])     { e.preventDefault(); focusEnd($('ed-L'));   } return; }
  if (e.key === 'ArrowRight' && side === 'L' && isAtEnd(ed))   { if (pages[spread + 1]) { e.preventDefault(); focusStart($('ed-R')); } return; }
  if (e.key === 'ArrowDown'  && side === 'L' && isAtEnd(ed))   { if (pages[spread + 1]) { e.preventDefault(); focusStart($('ed-R')); } return; }
  if (e.key === 'ArrowUp'    && side === 'R' && isAtStart(ed)) { if (pages[spread])     { e.preventDefault(); focusEnd($('ed-L'));   } return; }
  if (e.key === 'Backspace'  && side === 'R' && isAtStart(ed)) { if (pages[spread])     focusEnd($('ed-L'));   return; }
  if (e.key === 'Delete'     && side === 'L' && isAtEnd(ed))   { if (pages[spread + 1]) focusStart($('ed-R')); return; }
}

function isAtStart(ed) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(ed); pre.setEnd(rng.startContainer, rng.startOffset);
  if (pre.toString().replace(/\u200B/g, '').trim().length > 0) return false;
  let curNode = rng.startContainer;
  while (curNode && curNode.parentNode !== ed) curNode = curNode.parentNode;
  if (curNode && curNode !== ed) {
    let prev = curNode.previousSibling;
    while (prev) {
      if (prev.textContent?.replace(/\u200B/g, '').trim().length > 0) return false;
      if (prev.querySelector?.('img, canvas, svg')) return false;
      prev = prev.previousSibling;
    }
  }
  return true;
}

function isAtEnd(ed) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0);
  const post = document.createRange();
  post.selectNodeContents(ed); post.setStart(rng.endContainer, rng.endOffset);
  if (post.toString().replace(/\u200B/g, '').trim().length > 0) return false;
  let curNode = rng.endContainer;
  while (curNode && curNode.parentNode !== ed) curNode = curNode.parentNode;
  if (curNode && curNode !== ed) {
    let next = curNode.nextSibling;
    while (next) {
      if (next.textContent?.replace(/\u200B/g, '').trim().length > 0) return false;
      if (next.querySelector?.('img, canvas, svg')) return false;
      next = next.nextSibling;
    }
  }
  return true;
}

function focusStart(ed) {
  ed.focus();
  const rng = document.createRange();
  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  if (first) { rng.setStart(first, 0); rng.collapse(true); }
  else        { rng.selectNodeContents(ed); rng.collapse(true); }
  window.getSelection().removeAllRanges(); window.getSelection().addRange(rng);
}

function focusEnd(ed) {
  ed.focus();
  const rng = document.createRange();
  rng.selectNodeContents(ed); rng.collapse(false);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(rng);
}

const MARKER_ID = '__cur__';

function insertCursorMarker(ed) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const rng = sel.getRangeAt(0);
  if (!ed.contains(rng.startContainer)) return false;
  const spot = rng.cloneRange(); spot.collapse(true);
  const mark = document.createElement('span'); mark.id = MARKER_ID;
  spot.insertNode(mark); return true;
}

function restoreCursorFromMarker(ed, nextEd) {
  let mark = ed.querySelector('#' + MARKER_ID), target = ed;
  if (!mark && nextEd) { mark = nextEd.querySelector('#' + MARKER_ID); target = nextEd; }
  if (!mark) return false;
  const rng = document.createRange(); rng.setStartAfter(mark); rng.collapse(true); mark.remove();
  target.focus(); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
  return true;
}

function cleanMarkerFromPages() {
  pages.forEach(p => {
    if (p.content?.includes(MARKER_ID)) {
      const tmp = document.createElement('div');
      tmp.innerHTML = p.content; tmp.querySelector('#' + MARKER_ID)?.remove(); p.content = tmp.innerHTML;
    }
  });
}


/* ── 5. TEXT FORMATTING ─────────────────────────────────────────────────────────────────────── */

function liveInput(s) {
  const i = s === 'L' ? spread : spread + 1;
  if (pages[i]) { pages[i].content = $('ed-' + s).innerHTML; renderSidebar(); }
}

let activeEditor = $('ed-L');

['ed-L', 'ed-R'].forEach(id => {
  $(id).addEventListener('focus',   () => { activeEditor = $(id); });
  $(id).addEventListener('mouseup', updateFmtState);
  $(id).addEventListener('keyup',   updateFmtState);
});

function updateFmtState() {
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const b = document.querySelector(`[data-cmd="${c}"]`);
    if (b) b.classList.toggle('on', document.queryCommandState(c));
  });
  const sel = window.getSelection();
  let inSup = false, inSub = false;
  if (sel?.rangeCount) {
    let el = sel.getRangeAt(0).commonAncestorContainer;
    if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    while (el && el !== document.body) {
      if (el.tagName === 'SUP') { inSup = true; break; }
      if (el.tagName === 'SUB') { inSub = true; break; }
      el = el.parentElement;
    }
  }
  $('sup-btn')?.classList.toggle('on', inSup);
  $('sub-btn')?.classList.toggle('on', inSub);
}

document.addEventListener('selectionchange', updateFmtState);

function ensureEditorFocused() {
  if (document.activeElement !== activeEditor &&
      !document.activeElement.closest('#unified-toolbar')) activeEditor.focus();
}

document.querySelectorAll('[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault(); ensureEditorFocused();
    const c = btn.dataset.cmd;
    document.execCommand(c === 'hiliteColor' ? 'hiliteColor' : c, false,
                         c === 'hiliteColor' ? 'rgba(170,164,255,0.25)' : null);
    updateFmtState();
  });
});

$('fnt-sel').addEventListener('change', function() {
  ensureEditorFocused(); document.execCommand('fontName', false, this.value);
});

let intendedFontSize = '14px';

$('sz-sel').addEventListener('change', function () {
  intendedFontSize = this.value; const size = this.value;
  ensureEditorFocused();
  const sel = window.getSelection(); if (!sel?.rangeCount) return;
  const rng = sel.getRangeAt(0);
  if (!rng.collapsed) {
    const span = document.createElement('span'); span.style.fontSize = size;
    try { rng.surroundContents(span); }
    catch { const frag = rng.extractContents(); span.appendChild(frag); rng.insertNode(span); }
    rng.setStartAfter(span); rng.collapse(true); sel.removeAllRanges(); sel.addRange(rng);
  } else {
    const span = document.createElement('span'); span.style.fontSize = size; span.textContent = '\u200B';
    rng.insertNode(span);
    const cur = document.createRange(); cur.setStart(span.firstChild, 1); cur.collapse(true);
    sel.removeAllRanges(); sel.addRange(cur);
  }
  liveInput(document.activeElement === $('ed-L') ? 'L' : 'R');
});

function guardFontSize(side) {
  const ed = $('ed-' + side), sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return;
  let el = sel.getRangeAt(0).startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  while (el && el !== ed) { if (el.style?.fontSize) return; el = el.parentElement; }
  if (intendedFontSize === '14px') return;
  const span = document.createElement('span'); span.style.fontSize = intendedFontSize; span.textContent = '\u200B';
  const rng = sel.getRangeAt(0).cloneRange(); rng.insertNode(span);
  const cur = document.createRange(); cur.setStart(span.firstChild, 1); cur.collapse(true);
  sel.removeAllRanges(); sel.addRange(cur);
}

function syncSizePicker(side) {
  const ed = $('ed-' + side), sel = window.getSelection();
  if (!sel?.rangeCount) return;
  let el = sel.getRangeAt(0).startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  while (el && el !== ed) { if (el.style?.fontSize) { $('sz-sel').value = el.style.fontSize; return; } el = el.parentElement; }
  $('sz-sel').value = '14px'; intendedFontSize = '14px';
}

document.addEventListener('selectionchange', () => {
  const a = document.activeElement;
  if      (a === $('ed-L')) syncSizePicker('L');
  else if (a === $('ed-R')) syncSizePicker('R');
});

$('col-btn').addEventListener('click', () => $('col-inp').click());
$('col-inp').addEventListener('input', function() {
  $('col-bar').style.background = this.value;
  ensureEditorFocused(); document.execCommand('foreColor', false, this.value);
});

$('hl-btn').addEventListener('mousedown', e => {
  e.preventDefault(); ensureEditorFocused();
  document.execCommand('hiliteColor', false, 'rgba(170,164,255,0.25)');
});

/* Superscript / Subscript — true toggle:
   A: collapsed inside tag → insert ZWS after tag and move cursor out.
   B: selection inside tag → unwrap (replace tag with its children).
   C: no wrapping tag → execCommand wraps normally. */
function applySuperSub(cmd) {
  ensureEditorFocused();
  const sel     = window.getSelection(); if (!sel?.rangeCount) return;
  const tagName = cmd === 'superscript' ? 'SUP' : 'SUB';

  let el = sel.getRangeAt(0).commonAncestorContainer;
  if (el?.nodeType === Node.TEXT_NODE) el = el.parentElement;
  let tagEl = null;
  for (let tmp = el; tmp && tmp !== activeEditor; tmp = tmp.parentElement) {
    if (tmp.tagName === tagName) { tagEl = tmp; break; }
  }

  if (sel.isCollapsed && tagEl) {
    const zws = document.createTextNode('\u200B');
    tagEl.after(zws);
    const rng = document.createRange(); rng.setStart(zws, 1); rng.collapse(true);
    sel.removeAllRanges(); sel.addRange(rng);
  } else if (!sel.isCollapsed && tagEl) {
    const rng = sel.getRangeAt(0);
    if (tagEl.contains(rng.startContainer) && tagEl.contains(rng.endContainer)) {
      const frag = document.createDocumentFragment();
      while (tagEl.firstChild) frag.appendChild(tagEl.firstChild);
      tagEl.replaceWith(frag);
    } else {
      document.execCommand(cmd, false, null);
    }
  } else {
    document.execCommand(cmd, false, null);
  }

  activeEditor.querySelectorAll('sup, sub').forEach(e => { e.style.fontSize = ''; });
  activeEditor.querySelectorAll('sup font[size], sub font[size]').forEach(e => {
    e.removeAttribute('size'); e.style.fontSize = '';
  });
  updateFmtState();
}

$('sup-btn').addEventListener('mousedown', e => { e.preventDefault(); applySuperSub('superscript'); });
$('sub-btn').addEventListener('mousedown', e => { e.preventDefault(); applySuperSub('subscript'); });

/* Image — stored as base64 data URL; rejected if too tall to fit on one page */
function compressImage(img, maxWidth = 800, quality = 0.7) {
  const canvas = document.createElement('canvas');
  const scale  = Math.min(1, maxWidth / img.naturalWidth);
  canvas.width  = Math.floor(img.naturalWidth  * scale);
  canvas.height = Math.floor(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
$('img-btn').addEventListener('click', () => $('img-inp').click());
$('img-inp').addEventListener('change', function() {
  const f = this.files[0]; if (!f) return;
  this.value = '';
  const r = new FileReader();
  r.onload = ev => {
  const img = new Image();
  img.onload = () => {
    const dataUrl = compressImage(img, 900, 0.7);
    const ed       = activeEditor;
    const edW      = ed.clientWidth  || 400;
    const edH      = ed.clientHeight || 600;

    const scale    = Math.min(1, edW / img.naturalWidth);
    const rendered = Math.ceil(img.naturalHeight * scale);
    if (rendered > edH * 0.85) {
      showSaveToast('⚠ Image too tall to fit — resize it before inserting.');
      return;
    }
    ensureEditorFocused();
    document.execCommand('insertHTML', false,
      `<img src="${dataUrl}" style="max-width:100%" alt=""/>`
    );
    liveInput(activeEditor.id === 'ed-L' ? 'L' : 'R');
    schedulePersist();
  };
  img.src = ev.target.result;
};
  r.readAsDataURL(f);
});

/* Link */
let savedRange = null;
$('lnk-btn').addEventListener('mousedown', e => {
  e.preventDefault(); ensureEditorFocused();
  const sel = window.getSelection();
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
  const r = $('lnk-btn').getBoundingClientRect();
  $('link-pop').style.left = r.left + 'px'; $('link-pop').style.top = (r.top - 120) + 'px';
  $('link-pop').classList.toggle('show');
  if ($('link-pop').classList.contains('show')) { $('lnk-url').value = ''; setTimeout(() => $('lnk-url').focus(), 40); }
});
$('lnk-cancel').addEventListener('click', () => $('link-pop').classList.remove('show'));
$('lnk-apply').addEventListener('click', () => {
  let url = $('lnk-url').value.trim();
  if (!url) { $('link-pop').classList.remove('show'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (savedRange) {
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    document.execCommand('createLink', false, url);
    document.querySelectorAll('.page-ed a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    liveInput(activeEditor.id === 'ed-L' ? 'L' : 'R'); schedulePersist();
  }
  $('link-pop').classList.remove('show');
});

['ed-L', 'ed-R'].forEach(id => {
  $(id).addEventListener('click', e => {
    const a = e.target.closest('a[href]'); if (!a) return;
    if (window.getSelection()?.toString().length > 0) return;
    e.preventDefault(); window.open(a.href, '_blank', 'noopener,noreferrer');
  });
});

const hdBtn = $('hd-btn'), hdDrop = $('hd-drop');
hdBtn.addEventListener('mousedown', e => { e.preventDefault(); hdDrop.classList.toggle('open'); });
hdDrop.querySelectorAll('.hd-opt').forEach(opt => {
  opt.addEventListener('mousedown', e => {
    e.preventDefault();
    ensureEditorFocused();
    document.execCommand('formatBlock', false, opt.dataset.tag === 'p' ? 'P' : opt.dataset.tag.toUpperCase());
    hdDrop.classList.remove('open');
    setTimeout(() => liveInput(activeEditor.id === 'ed-L' ? 'L' : 'R'), 30);
  });
});

document.addEventListener('click', e => {
  if (!$('link-pop').contains(e.target) && !e.target.closest('#lnk-btn')) $('link-pop').classList.remove('show');
  if (!hdDrop.contains(e.target) && !e.target.closest('#hd-btn')) hdDrop.classList.remove('open');
});


/* ── 6. PERSISTENCE ─────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'simplbook-v1';
let persistTimer  = null;

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 1500);
}

function persistNow() {
  try {
    saveContent();
    let cTopics = Array.from(collapsedTopics);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, pages, nTid, nPid, spread, cTopics }));
    showSaveToast();
  } catch (e) {
    console.warn('SimplBook: save failed:', e.message);
    showSaveToast('⚠ Save failed — storage full?');
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false;
    const s = JSON.parse(raw);
    topics = s.topics || []; pages = s.pages || [];
    let cTopics = s.cTopics || new Set();
    for(let i = 0; i < cTopics.length; i++) {
      collapsedTopics.add(cTopics[i]);
    }
    nTid = s.nTid || topics.length + 1; nPid = s.nPid || pages.length + 1; spread = s.spread || 0;
    pages.forEach(p => { p.fcNodes = p.fcNodes || []; p.fcEdges = p.fcEdges || []; });
    return topics.length > 0;
  } catch (e) { console.warn('SimplBook: load failed:', e); return false; }
}

let toastTimer = null;
function showSaveToast(msg = '✓  Saved') {
  let toast = $('save-toast');
  if (!toast) {
    toast = document.createElement('div'); toast.id = 'save-toast';
    Object.assign(toast.style, {
      position:'fixed', bottom:'24px', right:'24px', zIndex:'9999',
      background:'rgba(255,255,255,0.11)', border:'1px solid rgba(255,255,255,0.22)',
      backdropFilter:'blur(16px)', color:'rgba(255,255,255,0.9)', padding:'7px 18px',
      borderRadius:'999px', fontSize:'12px', fontWeight:'600', letterSpacing:'.04em',
      opacity:'0', transition:'opacity .25s', pointerEvents:'none',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg; toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
}

/* Manual save button */
(function injectSaveButton() {
  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.id = 'save-btn'; btn.title = 'Save (Ctrl+S)';
  btn.innerHTML = '<span class="mi">save</span>';
  btn.addEventListener('click', persistNow);
  const right = document.querySelector('.topbar-right');
  if (right) right.prepend(btn);
})();

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key.toLowerCase() === 's') { e.preventDefault(); persistNow(); }
});

['ed-L', 'ed-R'].forEach(id => $(id).addEventListener('input', schedulePersist));

/* ── Restore on page load ── */
(function initFromStorage() {
  const hadData = loadFromStorage();
  if (hadData) {
    enableUI();
    renderSpread();
    renderSidebar();
    requestAnimationFrame(renderSidebar);
  }
})();

/* Inject component CSS */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Topic collapse toggle */
    .topic-toggle {
      width: 18px; height: 18px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer; padding: 0;
      color: rgba(255,255,255,0.35); border-radius: 4px;
    }
    .topic-toggle:hover { color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.07); }
    .toggle-arrow { display: inline-block; transition: transform .2s; font-size: 12px; line-height: 1; }
    .topic-toggle.collapsed .toggle-arrow { transform: rotate(-90deg); }

    /* Topic delete button — fades in on row hover */
    .topic-del-btn {
      margin-left: auto; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      padding: 2px 3px; border-radius: 5px; line-height: 1;
      display: flex; align-items: center;
      opacity: 0; transition: opacity .18s;
      color: rgba(255,100,100,0.9);
    }
    .topic-del-btn .mi { color: rgba(255,100,100,0.9) !important; }
    .topic-row:hover .topic-del-btn { opacity: 1; }
    .topic-del-btn:hover { background: rgba(220,60,60,0.15); }

    /* Page delete button — fades in on page-head hover */
    .pg-del-btn {
      margin-left: auto; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      padding: 3px 4px; border-radius: 5px; line-height: 1;
      display: flex; align-items: center;
      opacity: 0; transition: opacity .18s;
      color: rgba(255,100,100,0.9);
    }
    .pg-del-btn .mi { color: rgba(255,100,100,0.9) !important; }
    .pg-head:hover .pg-del-btn { opacity: 1; }
    .pg-del-btn:hover { background: rgba(220,60,60,0.15); }

    /* Heading indentation by level */
    .h-entry.h-level-1 { padding-left: 6px; }
    .h-entry.h-level-2 { padding-left: 18px; }
    .h-entry.h-level-3 { padding-left: 30px; }
  `;
  document.head.appendChild(style);
})();


/* ── 7. FLOWCHART (stub — to be implemented) ────────────────────────────────────────────────── */

function drawEdge()           {}
function handleConnectClick() {}

function exitFcMode() {
  if (!fcMode) return;
  const s = fcSide; fcMode = false; fcSide = null;
  fc.connMode = false; fc.connSrc = null; fc.selected = null;
  $('tb-text').classList.remove('hide'); $('tb-fc').classList.remove('show');
  $('fc-btn').classList.remove('on'); $('fc-mode-badge').classList.remove('show');
  if (s) { $('fc-ov-' + s).classList.remove('active'); $('fc-ov-' + s).style.cursor = ''; }
}

function renderFcOverlay(side, pg) {
  const ov = $('fc-ov-' + side);
  if (!ov || !pg) return;
  ov.querySelectorAll('.fc-node,.rh,.edge-label').forEach(e => e.remove());
  const svgEl = ov.querySelector('svg');
  if (!svgEl) return;
  svgEl.querySelectorAll('path,marker:not(#fc-arr)').forEach(e => e.remove());
  if (!pg.fcNodes?.length) return;
  (pg.fcEdges || []).forEach(edge => drawEdge(svgEl, pg, edge));
  pg.fcNodes.forEach(node => {
    const el = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'fc-node-inner'; inner.textContent = node.text;
    el.className = ['fc-node', node.shape, fc.selected === node.id ? 'sel' : '', fc.connSrc === node.id ? 'conn-src' : ''].filter(Boolean).join(' ');
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px`;
    el.dataset.nid = node.id; el.dataset.side = side;
    if (node.shape === 'parallelogram') el.appendChild(inner); else el.textContent = node.text;
    el.addEventListener('mousedown', e => {
      if (e.target.contentEditable === 'true') return; e.stopPropagation();
      if (fc.connMode) { handleConnectClick(pg, side, node.id); return; }
      fc.selected = node.id;
      const ovR = ov.getBoundingClientRect();
      fc.dragging = { node, side, ox: e.clientX - ovR.left - node.x, oy: e.clientY - ovR.top - node.y };
      renderFcOverlay(side, pg);
    });
    el.addEventListener('dblclick', e => {
      e.stopPropagation(); el.contentEditable = 'true'; el.focus();
      const rng = document.createRange(); rng.selectNodeContents(el);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(rng);
    });
    el.addEventListener('blur', () => { el.contentEditable = 'false'; node.text = el.textContent.trim() || 'Text'; });
    ov.appendChild(el);
    if (fc.selected === node.id) {
      ['nw','ne','sw','se'].forEach(dir => {
        const rh = document.createElement('div');
        rh.className = 'rh ' + dir;
        rh.style.cssText = `left:${dir.includes('w') ? node.x-5 : node.x+node.w-4}px;top:${dir.includes('n') ? node.y-5 : node.y+node.h-4}px`;
        rh.addEventListener('mousedown', e => {
          e.stopPropagation();
          fc.resizing = { node, side, dir, ox: e.clientX, oy: e.clientY, w0: node.w, h0: node.h, x0: node.x, y0: node.y };
        });
        ov.appendChild(rh);
      });
    }
  });
}

function clearFcOverlay(side) {
  const ov = $('fc-ov-' + side); if (!ov) return;
  ov.querySelectorAll('.fc-node,.rh,.edge-label').forEach(e => e.remove());
  ov.querySelector('svg')?.querySelectorAll('path').forEach(e => e.remove());
}
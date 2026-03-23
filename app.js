/* ═══════════════════════════════════════════════════════
   SIMPLNOTES — app.js
═══════════════════════════════════════════════════════ */

/* ─── DATA MODEL ─────────────────────────────────────────────
  topics: [{ id, name, startPage }]
  pages:  [{ id, topicId, content }]
  currentSpread: index of the LEFT page currently shown
  Each "spread" shows pages[currentSpread] on left, pages[currentSpread+1] on right.
──────────────────────────────────────────────────────────── */
let topics = [];        // array of topic objects
let pages  = [];        // flat array of page objects
let nextTopicId = 1;
let nextPageId  = 1;
let currentSpread = 0;  // left-page index
let sbOpen  = true;
let ftbOn   = true;
let activeEditorId = null;  // 'ed-L' or 'ed-R'

// ─── HELPERS ──────────────────────────────────────────────────

function getTopicForPage(pageIdx) {
  if (pageIdx < 0 || pageIdx >= pages.length) return null;
  const pid = pages[pageIdx].topicId;
  return topics.find(t => t.id === pid) || null;
}

function getPageIndex(pageId) {
  return pages.findIndex(p => p.id === pageId);
}

function pageCountForTopic(topicId) {
  return pages.filter(p => p.topicId === topicId).length;
}

// Collect headings from a page's HTML content
function extractHeadings(content) {
  const div = document.createElement('div');
  div.innerHTML = content;
  const headings = [];
  div.querySelectorAll('h1, h2, h3').forEach(el => {
    const text = el.textContent.trim();
    if (text) headings.push({ tag: el.tagName.toLowerCase(), text });
  });
  return headings;
}

// ─── SIDEBAR RENDER ───────────────────────────────────────────

function renderSidebar() {
  const list = document.getElementById('topic-list');
  const empty = document.getElementById('sb-empty');
  list.innerHTML = '';

  if (topics.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  const activeTopic = getTopicForPage(currentSpread);
  const activeTopicId = activeTopic ? activeTopic.id : null;

  // Collect all headings for the active page pair to know which to highlight
  const leftContent  = pages[currentSpread]     ? pages[currentSpread].content     : '';
  const rightContent = pages[currentSpread + 1] ? pages[currentSpread + 1].content : '';

  topics.forEach(topic => {
    const group = document.createElement('div');
    group.className = 'topic-group';

    // Topic row
    const row = document.createElement('div');
    row.className = 'topic-row' + (topic.id === activeTopicId ? ' active' : '');
    const pgCount = pageCountForTopic(topic.id);
    row.innerHTML = `
      <div class="topic-bullet"></div>
      <span class="topic-name">${topic.name}</span>
      <span class="topic-pages">${pgCount}p</span>
    `;
    row.addEventListener('click', () => goToTopic(topic.id));
    group.appendChild(row);

    // Collect all headings across all pages of this topic
    const topicPages = pages.filter(p => p.topicId === topic.id);
    const allHeadings = [];
    topicPages.forEach(pg => {
      extractHeadings(pg.content).forEach(h => allHeadings.push(h));
    });

    if (allHeadings.length > 0) {
      const hl = document.createElement('div');
      hl.className = 'heading-list';

      allHeadings.forEach(h => {
        const he = document.createElement('div');
        // Highlight if this heading text appears in current visible pages
        const isVisible = (leftContent + rightContent).includes(h.text);
        he.className = 'heading-entry' + (isVisible && topic.id === activeTopicId ? ' active-heading' : '');
        const indent = h.tag === 'h1' ? '' : h.tag === 'h2' ? '  ' : '    ';
        const bullet = h.tag === 'h1' ? '•' : h.tag === 'h2' ? '◦' : '▸';
        he.innerHTML = `<span class="h-bullet">${bullet}</span><span class="h-text">${indent}${h.text}</span>`;
        he.addEventListener('click', () => goToTopicHeading(topic.id, h.text));
        hl.appendChild(he);
      });
      group.appendChild(hl);
    }

    list.appendChild(group);
  });
}

// ─── NAVIGATION ───────────────────────────────────────────────

function goToTopic(topicId) {
  const firstPage = pages.find(p => p.topicId === topicId);
  if (!firstPage) return;
  const idx = getPageIndex(firstPage.id);
  navigateTo(idx % 2 === 0 ? idx : idx - 1, 'left');
}

function goToTopicHeading(topicId, headingText) {
  // Find the page containing that heading
  const topicPages = pages.filter(p => p.topicId === topicId);
  for (const pg of topicPages) {
    const headings = extractHeadings(pg.content);
    if (headings.some(h => h.text === headingText)) {
      const idx = getPageIndex(pg.id);
      navigateTo(idx % 2 === 0 ? idx : idx - 1, 'left');
      return;
    }
  }
}

// direction: 'left' (going back) or 'right' (going forward)
function navigateTo(spreadIdx, direction) {
  if (spreadIdx < 0) spreadIdx = 0;
  if (spreadIdx >= pages.length) spreadIdx = Math.max(0, pages.length - (pages.length % 2 === 0 ? 2 : 1));
  saveCurrentContent();
  const prev = currentSpread;
  currentSpread = spreadIdx;
  renderSpread(direction || (spreadIdx >= prev ? 'right' : 'left'));
}

// ─── SPREAD RENDER ────────────────────────────────────────────

function renderSpread(direction) {
  const lp = pages[currentSpread];
  const rp = pages[currentSpread + 1];

  // Left page
  const edL    = document.getElementById('ed-L');
  const numL   = document.getElementById('num-L');
  const lblL   = document.getElementById('lbl-L');
  const titleL = document.getElementById('title-L');
  const wrapL  = document.getElementById('wrap-L');

  if (lp) {
    edL.innerHTML = lp.content || '';
    numL.textContent = 'p.' + (currentSpread + 1);
    const t = getTopicForPage(currentSpread);
    lblL.textContent   = t ? t.name : '';
    titleL.textContent = t ? t.name : '';
    wrapL.style.opacity = '1';
  } else {
    edL.innerHTML = '';
    numL.textContent = '';
    lblL.textContent = '';
    titleL.textContent = '';
    wrapL.style.opacity = '0.3';
  }

  // Right page
  const edR    = document.getElementById('ed-R');
  const numR   = document.getElementById('num-R');
  const lblR   = document.getElementById('lbl-R');
  const titleR = document.getElementById('title-R');
  const wrapR  = document.getElementById('wrap-R');

  if (rp) {
    edR.innerHTML = rp.content || '';
    numR.textContent = 'p.' + (currentSpread + 2);
    const t = getTopicForPage(currentSpread + 1);
    lblR.textContent   = t ? t.name : '';
    titleR.textContent = t ? t.name : '';
    wrapR.style.opacity = '1';
  } else {
    edR.innerHTML = '';
    numR.textContent = '';
    lblR.textContent = '';
    titleR.textContent = '';
    wrapR.style.opacity = '0.3';
  }

  // Nav
  document.getElementById('nav-lbl').textContent =
    `Pages ${currentSpread + 1}–${Math.min(currentSpread + 2, pages.length)}`;
  document.getElementById('nav-prev').disabled = currentSpread <= 0;
  document.getElementById('nav-next').disabled = currentSpread + 2 >= pages.length;

  // Flip animation
  const animL = direction === 'right' ? 'flip-in-right'       : 'flip-in-left';
  const animR = direction === 'right' ? 'flip-in-right-delay'  : 'flip-in-left-delay';

  [['wrap-L', animL], ['wrap-R', animR]].forEach(([id, cls]) => {
    const el = document.getElementById(id);
    el.classList.remove('flip-in-right','flip-in-left','flip-in-right-delay','flip-in-left-delay');
    void el.offsetWidth;
    el.classList.add(cls);
  });

  renderSidebar();
}

// ─── SAVE CONTENT ─────────────────────────────────────────────

function saveCurrentContent() {
  if (pages[currentSpread])     pages[currentSpread].content     = document.getElementById('ed-L').innerHTML;
  if (pages[currentSpread + 1]) pages[currentSpread + 1].content = document.getElementById('ed-R').innerHTML;
}

// ─── LIVE SAVE & HEADING DETECTION ────────────────────────────

function onEditorInput(side) {
  const idx = side === 'L' ? currentSpread : currentSpread + 1;
  if (pages[idx]) {
    pages[idx].content = document.getElementById('ed-' + side).innerHTML;
    renderSidebar();
  }
}

document.getElementById('ed-L').addEventListener('input', () => onEditorInput('L'));
document.getElementById('ed-R').addEventListener('input', () => onEditorInput('R'));

// Track which editor is active for toolbar commands
['ed-L', 'ed-R'].forEach(id => {
  document.getElementById(id).addEventListener('focus', () => { activeEditorId = id; });
});

// ─── PAGE OVERFLOW → AUTO-FLIP ────────────────────────────────
// When typing overflows a page's fixed height, move to the next page.

function checkOverflow(editorId) {
  const ed = document.getElementById(editorId);
  const body = ed.parentElement; // .pg-body

  if (ed.scrollHeight > body.clientHeight) {
    // We've overflowed. Determine which side we're on.
    const isLeft = editorId === 'ed-L';

    // Save overflow content: split at the overflow point
    // Strategy: remove last block element from current page, carry it to next
    const lastChild = ed.lastElementChild || ed.lastChild;
    if (!lastChild) return;

    // Capture the overflow node's outer content
    let carryHTML = '';
    if (lastChild.nodeType === Node.ELEMENT_NODE) {
      carryHTML = lastChild.outerHTML;
      lastChild.remove();
    } else {
      // text node
      carryHTML = lastChild.textContent;
      lastChild.remove();
    }

    // Save the trimmed content
    const idx = isLeft ? currentSpread : currentSpread + 1;
    if (pages[idx]) pages[idx].content = ed.innerHTML;

    if (isLeft) {
      // Move focus to right page
      const edR = document.getElementById('ed-R');
      const rightIdx = currentSpread + 1;
      if (pages[rightIdx]) {
        // Prepend carried content
        pages[rightIdx].content = carryHTML + (pages[rightIdx].content || '');
        edR.innerHTML = pages[rightIdx].content;
      } else {
        // Need to add a new page to the right
        addPageAfter(currentSpread, carryHTML);
      }
      // Move cursor to start of right editor
      focusAtStart(edR);
    } else {
      // Right page overflows → flip to next spread
      const rightIdx = currentSpread + 1;
      if (pages[rightIdx]) pages[rightIdx].content = ed.innerHTML;

      // Check if there's a next page pair
      if (currentSpread + 2 < pages.length) {
        // There are more pages: advance spread, carry content to next-left
        const nextLeftIdx = currentSpread + 2;
        pages[nextLeftIdx].content = carryHTML + (pages[nextLeftIdx].content || '');
        navigateTo(currentSpread + 2, 'right');
        setTimeout(() => {
          const edL = document.getElementById('ed-L');
          edL.innerHTML = pages[currentSpread].content || '';
          focusAtStart(edL);
        }, 50);
      } else {
        // Need to add a new page
        const topicId = pages[rightIdx] ? pages[rightIdx].topicId : (topics[topics.length - 1] || { id: null }).id;
        addPageAfterIdx(currentSpread + 1, topicId, carryHTML);
        navigateTo(currentSpread + 2, 'right');
        setTimeout(() => {
          const edL = document.getElementById('ed-L');
          edL.innerHTML = pages[currentSpread] ? pages[currentSpread].content : '';
          focusAtStart(edL);
        }, 50);
      }
    }
  }
}

function focusAtStart(el) {
  el.focus();
  try {
    const range = document.createRange();
    const sel   = window.getSelection();
    range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch(e) {}
}

function focusAtEnd(el) {
  el.focus();
  try {
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch(e) {}
}

['ed-L', 'ed-R'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    // Short debounce to let DOM settle
    setTimeout(() => checkOverflow(id), 0);
  });
});

// ─── ADD PAGE HELPERS ─────────────────────────────────────────

function addPageAfter(spreadLeftIdx, initialContent) {
  // Insert a new page right after the right-page of current spread
  const insertAfter = spreadLeftIdx + 1;
  const topicId = pages[spreadLeftIdx] ? pages[spreadLeftIdx].topicId : null;
  addPageAfterIdx(insertAfter, topicId, initialContent);
}

function addPageAfterIdx(afterIdx, topicId, initialContent) {
  const newPage = {
    id: nextPageId++,
    topicId: topicId,
    content: initialContent || ''
  };
  pages.splice(afterIdx + 1, 0, newPage);
}

// ─── NEW TOPIC MODAL ──────────────────────────────────────────

function openTopicModal() {
  document.getElementById('m-topic-name').value = '';
  document.getElementById('modal-wrap').classList.add('show');
  setTimeout(() => document.getElementById('m-topic-name').focus(), 80);
}

function closeModal() {
  document.getElementById('modal-wrap').classList.remove('show');
}

document.getElementById('m-cancel').addEventListener('click', closeModal);
document.getElementById('modal-wrap').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-wrap')) closeModal();
});

document.getElementById('m-confirm').addEventListener('click', () => {
  const name = document.getElementById('m-topic-name').value.trim();
  if (!name) {
    document.getElementById('m-topic-name').focus();
    return;
  }
  saveCurrentContent();
  createTopic(name);
  closeModal();
});

document.getElementById('m-topic-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('m-confirm').click();
});

function createTopic(name) {
  const topic = { id: nextTopicId++, name, startPage: pages.length };
  topics.push(topic);

  // New topics always start on a left page (even index).
  // If current pages count is odd, add a blank filler page first.
  if (pages.length % 2 !== 0) {
    // Current last page is on a left slot — add a blank right page
    const prevTopicId = pages.length > 0 ? pages[pages.length - 1].topicId : null;
    pages.push({ id: nextPageId++, topicId: prevTopicId, content: '' });
  }

  // Add two pages for the new topic (left + right)
  pages.push({ id: nextPageId++, topicId: topic.id, content: '' });
  pages.push({ id: nextPageId++, topicId: topic.id, content: '' });

  // Navigate to the new topic's first spread
  const newSpread = pages.length - 2; // index of the first new page
  navigateTo(newSpread, 'right');
  setTimeout(() => {
    document.getElementById('ed-L').focus();
  }, 100);
}

// Sidebar add-topic button
document.getElementById('sb-add-topic').addEventListener('click', openTopicModal);
document.getElementById('new-topic-top').addEventListener('click', openTopicModal);

// ─── PAGE NAVIGATION BUTTONS ──────────────────────────────────

document.getElementById('nav-prev').addEventListener('click', () => {
  if (currentSpread > 0) {
    saveCurrentContent();
    navigateTo(currentSpread - 2, 'left');
  }
});
document.getElementById('nav-next').addEventListener('click', () => {
  if (currentSpread + 2 < pages.length) {
    saveCurrentContent();
    navigateTo(currentSpread + 2, 'right');
  }
});

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────

document.getElementById('sb-toggle').addEventListener('click', () => {
  sbOpen = !sbOpen;
  document.getElementById('sidebar').classList.toggle('closed', !sbOpen);
});

// ─── TOOLBAR DRAG ─────────────────────────────────────────────

const ftb = document.getElementById('ftb');
const fh  = document.getElementById('ftb-h');
let drg = false, dox = 0, doy = 0;

fh.addEventListener('mousedown', e => {
  drg = true;
  const r = ftb.getBoundingClientRect();
  ftb.style.left = r.left + 'px'; ftb.style.top = r.top + 'px'; ftb.style.transform = 'none';
  dox = e.clientX - r.left; doy = e.clientY - r.top;
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!drg) return;
  ftb.style.left = (e.clientX - dox) + 'px';
  ftb.style.top  = (e.clientY - doy) + 'px';
});
document.addEventListener('mouseup', () => { drg = false; });

document.getElementById('ftb-toggle').addEventListener('click', function () {
  ftbOn = !ftbOn;
  ftb.classList.toggle('hidden', !ftbOn);
  this.classList.toggle('act', ftbOn);
});

// ─── TEXT FORMATTING ──────────────────────────────────────────

const cmd = (c, v) => document.execCommand(c, false, v || null);

document.querySelectorAll('.ftb-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    cmd(btn.dataset.cmd);
    if (['bold','italic','underline','strikeThrough'].includes(btn.dataset.cmd))
      btn.classList.toggle('on', document.queryCommandState(btn.dataset.cmd));
  });
});

document.addEventListener('selectionchange', () => {
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const b = document.querySelector(`.ftb-btn[data-cmd="${c}"]`);
    if (b) b.classList.toggle('on', document.queryCommandState(c));
  });
});

document.getElementById('fnt-sel').addEventListener('change', function () { cmd('fontName', this.value); });
document.getElementById('sz-sel').addEventListener('change', function () {
  cmd('fontSize', 7);
  document.querySelectorAll('.page-ed font[size="7"]').forEach(el => {
    el.removeAttribute('size'); el.style.fontSize = this.value;
  });
});

// Text colour
document.getElementById('col-btn').addEventListener('click', () => document.getElementById('col-inp').click());
document.getElementById('col-inp').addEventListener('input', function () {
  document.getElementById('col-bar').style.background = this.value;
  cmd('foreColor', this.value);
});

// Highlight
document.getElementById('hl-btn').addEventListener('mousedown', e => {
  e.preventDefault(); cmd('hiliteColor', 'rgba(170,164,255,0.22)');
});

// Image
document.getElementById('img-btn').addEventListener('click', () => document.getElementById('img-inp').click());
document.getElementById('img-inp').addEventListener('change', function () {
  const f = this.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => cmd('insertHTML', `<img src="${e.target.result}" alt=""/>`);
  r.readAsDataURL(f); this.value = '';
});

// ─── HEADING DROPDOWN ─────────────────────────────────────────

const hdBtn  = document.getElementById('heading-btn');
const hdDrop = document.getElementById('heading-drop');

hdBtn.addEventListener('mousedown', e => {
  e.preventDefault();
  e.stopPropagation();
  hdDrop.classList.toggle('open');
});

document.addEventListener('click', e => {
  if (!hdBtn.contains(e.target) && !hdDrop.contains(e.target)) {
    hdDrop.classList.remove('open');
  }
});

document.querySelectorAll('.hd-opt').forEach(opt => {
  opt.addEventListener('mousedown', e => {
    e.preventDefault();
    const tag = opt.dataset.tag;
    if (tag === 'p') {
      cmd('formatBlock', 'p');
    } else {
      cmd('formatBlock', tag);
    }
    hdDrop.classList.remove('open');
    // Update sidebar after inserting heading
    setTimeout(() => {
      onEditorInput(activeEditorId === 'ed-R' ? 'R' : 'L');
    }, 50);
  });
});

// ─── LINK POPOVER ─────────────────────────────────────────────

let sRange = null;
const lp   = document.getElementById('link-pop');

document.getElementById('lnk-btn').addEventListener('mousedown', e => {
  e.preventDefault();
  const sel = window.getSelection();
  if (sel.rangeCount) sRange = sel.getRangeAt(0).cloneRange();
  const r = document.getElementById('lnk-btn').getBoundingClientRect();
  lp.style.left = r.left + 'px'; lp.style.top = (r.bottom + 6) + 'px';
  lp.classList.toggle('show');
  if (lp.classList.contains('show')) { document.getElementById('lnk-url').value = ''; setTimeout(() => document.getElementById('lnk-url').focus(), 40); }
});
document.getElementById('lnk-cancel').addEventListener('click', () => lp.classList.remove('show'));
document.getElementById('lnk-apply').addEventListener('click', () => {
  const url = document.getElementById('lnk-url').value;
  if (url && sRange) {
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(sRange);
    cmd('createLink', url);
    document.querySelectorAll('.page-ed a').forEach(a => a.target = '_blank');
  }
  lp.classList.remove('show');
});
document.addEventListener('click', e => {
  if (!lp.contains(e.target) && e.target.id !== 'lnk-btn') lp.classList.remove('show');
});

// ─── FLOWCHART ────────────────────────────────────────────────

const fcc = document.getElementById('fc-canvas');
const svg = document.getElementById('fc-svg');
let fnodes=[], fconns=[], fid=0, fconn=false, fconnFrom=null, fsel=null, fdrag=null, fdx=0, fdy=0;

const fcEnter = () => { fcc.classList.add('show'); document.getElementById('fc-toggle').classList.add('act'); };
const fcExit  = () => {
  fcc.classList.remove('show'); document.getElementById('fc-toggle').classList.remove('act');
  fconn = false; fconnFrom = null; document.getElementById('fc-conn').classList.remove('on');
};
document.getElementById('fc-toggle').addEventListener('click', () => fcc.classList.contains('show') ? fcExit() : fcEnter());
document.getElementById('fc-done').addEventListener('click', fcExit);

function drawConns() {
  svg.querySelectorAll('path').forEach(e => e.remove());
  fconns.forEach(c => {
    const a = fnodes.find(n => n.id === c.from), b = fnodes.find(n => n.id === c.to);
    if (!a || !b) return;
    const x1=a.x+a.w/2, y1=a.y+a.h/2, x2=b.x+b.w/2, y2=b.y+b.h/2, mx=(x1+x2)/2;
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.setAttribute('stroke','url(#cg)'); p.setAttribute('stroke-width','1.8');
    p.setAttribute('fill','none'); p.setAttribute('stroke-dasharray','6 3');
    p.setAttribute('marker-end','url(#arr)'); svg.appendChild(p);
  });
}
function drawNodes() {
  fcc.querySelectorAll('.fc-node').forEach(e => e.remove());
  fnodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'fc-node' + (node.shape==='cloud'?' cloud':'') + (fsel===node.id?' sel':'') + (fconnFrom===node.id?' conn-from':'');
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${node.w}px;`;
    el.textContent = node.text; el.dataset.id = node.id;
    el.addEventListener('mousedown', e => {
      if (e.target.contentEditable==='true') return;
      if (fconn) {
        if (!fconnFrom) { fconnFrom = node.id; drawNodes(); }
        else if (fconnFrom !== node.id) { fconns.push({from:fconnFrom,to:node.id}); fconnFrom=null; fconn=false; document.getElementById('fc-conn').classList.remove('on'); fcRedraw(); }
        return;
      }
      fsel = node.id;
      const cr=fcc.getBoundingClientRect(), r=el.getBoundingClientRect();
      fdx=e.clientX-r.left; fdy=e.clientY-r.top; fdrag=node; drawNodes(); e.preventDefault();
    });
    el.addEventListener('dblclick', () => {
      el.contentEditable='true'; el.focus();
      const rng=document.createRange(); rng.selectNodeContents(el);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(rng);
    });
    el.addEventListener('blur', () => { el.contentEditable='false'; node.text=el.textContent; });
    fcc.insertBefore(el, document.getElementById('fc-status'));
  });
}
function fcRedraw() { drawConns(); drawNodes(); }
function fcAdd(shape) { fnodes.push({id:++fid,x:80+Math.random()*280,y:80+Math.random()*220,w:140,h:54,shape,text:shape==='cloud'?'Idea':'Node'}); fcRedraw(); }
document.getElementById('fc-rect').addEventListener('click', () => fcAdd('rect'));
document.getElementById('fc-cloud').addEventListener('click', () => fcAdd('cloud'));
document.getElementById('fc-conn').addEventListener('click', function() { fconn=!fconn; fconnFrom=null; this.classList.toggle('on',fconn); });
document.getElementById('fc-del').addEventListener('click', () => { if(!fsel)return; fnodes=fnodes.filter(n=>n.id!==fsel); fconns=fconns.filter(c=>c.from!==fsel&&c.to!==fsel); fsel=null; fcRedraw(); });
document.getElementById('fc-clr').addEventListener('click', () => { fnodes=[]; fconns=[]; fsel=null; fcRedraw(); });
document.addEventListener('mousemove', e => {
  if (!fdrag) return;
  const cr=fcc.getBoundingClientRect(); fdrag.x=e.clientX-cr.left-fdx; fdrag.y=e.clientY-cr.top-fdy;
  const el=fcc.querySelector(`[data-id="${fdrag.id}"]`);
  if (el) { el.style.left=fdrag.x+'px'; el.style.top=fdrag.y+'px'; } drawConns();
});
document.addEventListener('mouseup', () => { fdrag=null; });

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key==='b') { e.preventDefault(); cmd('bold'); }
    if (e.key==='i') { e.preventDefault(); cmd('italic'); }
    if (e.key==='u') { e.preventDefault(); cmd('underline'); }
  }
  if (e.key==='Escape') { closeModal(); fcExit(); lp.classList.remove('show'); hdDrop.classList.remove('open'); }

  const editable = document.activeElement.isContentEditable ||
    ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
  if (!editable) {
    if (e.key==='ArrowRight') document.getElementById('nav-next').click();
    if (e.key==='ArrowLeft')  document.getElementById('nav-prev').click();
  }
});

// ─── INIT ─────────────────────────────────────────────────────
// Start with a completely blank book — no topics, no pages.
// Sidebar shows the empty state with "Start new topic" prompt.
renderSidebar();
// Disable nav buttons since there are no pages
document.getElementById('nav-prev').disabled = true;
document.getElementById('nav-next').disabled = true;
document.getElementById('nav-lbl').textContent = '—';
// Show empty page state
document.getElementById('ed-L').innerHTML = '';
document.getElementById('ed-R').innerHTML = '';
document.getElementById('num-L').textContent = '';
document.getElementById('num-R').textContent = '';
document.getElementById('lbl-L').textContent = '';
document.getElementById('lbl-R').textContent = '';
document.getElementById('title-L').textContent = '';
document.getElementById('title-R').textContent = '';
document.getElementById('wrap-L').style.opacity = '0.25';
document.getElementById('wrap-R').style.opacity = '0.25';

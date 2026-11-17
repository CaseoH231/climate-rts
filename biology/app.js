import { STARTER } from './data.js';
import { PRESETS } from './presets.js';
import { DIAGRAMS, DIAGRAM_WORDS, CELLS, diagramSVG, cellSVG } from './diagrams.js';

// ---------- saving ----------
const KEY = 'bio-study-notes-v1';
const PALETTE = ['#16a34a', '#2563eb', '#db2777', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];
const clone = (o) => JSON.parse(JSON.stringify(o));

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.topics)) return d;
  } catch { /* first visit or storage blocked */ }
  return clone(STARTER);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch {
    toast('Could not save – your device storage is full. Try a smaller picture, or download a backup.');
    return false;
  }
}

let db = load();
const HOME = '__home';
let current = HOME;
let query = '';
let cellKind = 'animal';
let shownIds = []; // order of cards on screen, for next / previous

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const topicOf = (id) => db.topics.find((t) => t.id === id);
const all = () => db.topics.flatMap((t) => t.entries.map((e) => ({ e, t })));
const find = (id) => all().find((x) => x.e.id === id);
const colorOf = (e, t) => e.color || DIAGRAMS[e.diagram]?.color || t.color;
const chips = (found) => (found || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => `<span class="chip">${esc(s)}</span>`).join('');
const dlg = $('#dlg');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}
function openDialog(html, cls = '') {
  dlg.className = cls; dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });

// ---------- main screen ----------
function render() {
  if (current !== HOME && !topicOf(current)) current = HOME;
  const notes = all();
  $('#sub').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'} · ${db.topics.length} topic${db.topics.length === 1 ? '' : 's'}`;
  $('#topics').innerHTML = `<button class="topic home ${current === HOME && !query ? 'on' : ''}" data-topic="${HOME}"><span class="ico">⌂</span><span class="nm">Dashboard</span></button>
    <div class="nav-label">Topics</div>` + db.topics.map((t) =>
    `<button class="topic ${t.id === current && !query ? 'on' : ''}" data-topic="${t.id}" style="--c:${t.color}">
      <span class="dot"></span><span class="nm">${esc(t.name)}</span><span class="n">${t.entries.length}</span></button>`).join('') +
    '<button class="topic add" id="add-topic">+ New topic</button>';

  const main = $('#main');
  if (query) {
    const q = query.toLowerCase();
    const hits = all().filter(({ e }) => [e.title, e.definition, e.found, ...(e.notes || [])].join(' ').toLowerCase().includes(q));
    shownIds = hits.map((h) => h.e.id);
    main.innerHTML = `<div class="bar"><h2>Search</h2></div><p class="lead">${hits.length} note${hits.length === 1 ? '' : 's'} matching “${esc(query)}”</p>` +
      (hits.length ? `<div class="grid">${hits.map(({ e, t }) => card(e, t, true)).join('')}</div>` : '<p class="empty">Nothing found.</p>');
    return;
  }
  if (current === HOME) { main.innerHTML = dashboard(); shownIds = []; return; }
  const t = topicOf(current);
  shownIds = t.entries.map((e) => e.id);
  const hasCells = t.entries.some((e) => ['nucleus', 'membrane', 'chloroplast', 'mitochondria', 'plasmid', 'wall'].includes(e.diagram));
  main.innerHTML = `
    <div class="bar" style="--c:${t.color}"><h2><span class="tdot"></span>${esc(t.name)}</h2><div class="tools">
      <button data-act="rename-topic">Rename</button><button data-act="colour-topic">Colour</button><button class="danger" data-act="delete-topic">Delete</button>
      <button class="primary" data-act="add">+ Add note</button></div></div>
    <p class="lead">${t.entries.length} note${t.entries.length === 1 ? '' : 's'} · click a card to open it</p>
    ${hasCells ? explorer() : ''}
    ${t.entries.length ? `<div class="grid">${t.entries.map((e) => card(e, t)).join('')}</div>`
      : `<div class="empty"><p>No notes in this topic yet.</p><button class="primary" data-act="add">+ Add a note</button><button data-act="paste">Paste notes</button></div>`}`;
}

const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;

function dashboard() {
  const notes = all();
  const hr = new Date().getHours();
  const figs = notes.filter(({ e }) => DIAGRAMS[e.diagram] || e.image).length;
  const points = notes.reduce((n, { e }) => n + (e.notes?.length || 0), 0);
  const recent = [...notes].reverse().slice(0, 6);
  return `<div class="bar"><h2>Dashboard</h2><div class="tools"><button data-act="new-topic">+ New topic</button><button class="primary" data-act="add">+ Add note</button></div></div>
    <section class="hero"><div class="hello"><h2>${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}</h2>
      <p>${notes.length ? `You have ${notes.length} notes across ${db.topics.length} topic${db.topics.length === 1 ? '' : 's'}. Ready for a quick quiz?` : 'Add your first notes, or pick a ready-made topic.'}</p>
      <div class="row">${notes.length ? '<button class="primary" data-act="cards">Start flashcards</button>' : ''}<button data-act="paste">Paste my notes</button></div></div>
      <div class="hero-art">${cellSVG('plant')}<small>Click a part of the cell</small></div></section>
    <div class="stats">${stat(notes.length, 'notes')}${stat(db.topics.length, 'topics')}${stat(figs, 'with a diagram')}${stat(points, 'key points')}${stat(db.rounds || 0, 'flashcard rounds done')}</div>
    <h3 class="sect-h">Topics</h3>
    ${db.topics.length ? `<div class="tgrid">${db.topics.map((t) => `<button class="tcard" data-topic="${t.id}" style="--c:${t.color}">
      <h3>${esc(t.name)}</h3><span class="tn">${t.entries.length} note${t.entries.length === 1 ? '' : 's'}</span>
      <div class="chips">${t.entries.slice(0, 5).map((e) => `<span class="chip">${esc(e.title)}</span>`).join('')}${t.entries.length > 5 ? `<span class="chip">+${t.entries.length - 5} more</span>` : ''}</div></button>`).join('')}
      <button class="tcard add" data-act="new-topic"><h3>+ New topic</h3><span class="tn">Ready-made or blank</span></button></div>`
    : '<div class="empty"><p>You have no topics yet.</p><button class="primary" data-act="new-topic">+ New topic</button></div>'}
    ${recent.length ? `<h3 class="sect-h">Latest notes</h3><div class="card-list"><ul class="list">${recent.map(({ e, t }) =>
      `<li><button class="lrow" data-entry="${e.id}"><b style="color:${colorOf(e, t)}">${esc(e.title)}</b><span>${esc(e.definition)}</span><small>${esc(t.name)}</small></button></li>`).join('')}</ul></div>` : ''}`;
}

function card(e, t, showTopic = false) {
  const thumb = e.diagram && DIAGRAMS[e.diagram] ? diagramSVG(e.diagram, { labels: false })
    : e.image ? `<img src="${e.image}" alt="">` : `<span class="initial">${esc(e.title[0] || '?')}</span>`;
  return `<button class="card" data-entry="${e.id}" style="--c:${colorOf(e, t)}">
    <div class="thumb">${thumb}</div>
    <div class="body"><h3>${esc(e.title)}</h3><p>${esc(e.definition)}</p>
    ${showTopic ? `<div class="where">${esc(t.name)}</div>` : ''}<div class="chips">${chips(e.found)}</div></div></button>`;
}

function explorer() {
  return `<section class="explorer"><div class="ex-head"><h3>Cell explorer</h3><p>Click any part of the cell to open its notes.</p>
    <div class="tabs">${Object.entries(CELLS).map(([k, c]) => `<button data-cell="${k}" class="${k === cellKind ? 'on' : ''}">${c.name}</button>`).join('')}</div></div>
    <div class="ex-svg">${cellSVG(cellKind)}</div><p class="ex-tip" id="ex-tip">&nbsp;</p></section>`;
}

function openPart(key, name) {
  const inTopic = topicOf(current)?.entries.find((e) => e.diagram === key);
  const hit = inTopic || all().find((x) => x.e.diagram === key)?.e;
  if (hit) return openDetail(hit.id);
  toast(`No notes for “${name}” yet – add some!`);
  openEdit(null, { title: name, diagram: DIAGRAMS[key] ? key : '' });
}

$('#topics').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.id === 'add-topic') return openTopicPicker();
  current = b.dataset.topic; query = ''; $('#search').value = '';
  render(); window.scrollTo({ top: 0 });
});

$('#main').addEventListener('click', (ev) => {
  const c = ev.target.closest('[data-entry]');
  if (c) { if (current === HOME && !query) shownIds = [...all()].reverse().slice(0, 6).map((x) => x.e.id); return openDetail(c.dataset.entry); }
  const tp = ev.target.closest('[data-topic]');
  if (tp) { current = tp.dataset.topic; render(); return window.scrollTo({ top: 0 }); }
  const tab = ev.target.closest('[data-cell]');
  if (tab) { cellKind = tab.dataset.cell; return render(); }
  const p = ev.target.closest('.part');
  if (p) return openPart(p.dataset.k, $('title', p).textContent);
  const act = ev.target.closest('[data-act]')?.dataset.act;
  const t = topicOf(current);
  if (act === 'add') openEdit(null, { topic: current === HOME ? db.topics[0]?.id : current });
  if (act === 'paste') openPaste();
  if (act === 'cards') openCards();
  if (act === 'new-topic') openTopicPicker();
  if (act === 'rename-topic') {
    const n = prompt('New name for this topic:', t.name);
    if (n && n.trim()) { t.name = n.trim(); save(); render(); }
  }
  if (act === 'colour-topic') {
    t.color = PALETTE[(PALETTE.indexOf(t.color) + 1) % PALETTE.length]; save(); render();
  }
  if (act === 'delete-topic' && confirm(`Delete the topic “${t.name}” and all ${t.entries.length} notes in it?`)) {
    db.topics = db.topics.filter((x) => x !== t); save(); render();
  }
});
$('#main').addEventListener('keydown', (ev) => {
  const p = ev.target.closest('.part');
  if (p && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openPart(p.dataset.k, $('title', p).textContent); }
});
$('#main').addEventListener('mouseover', (ev) => {
  const tip = $('#ex-tip') || $('.hero-art small');
  if (!tip) return;
  const p = ev.target.closest('.part');
  tip.textContent = p ? `${$('title', p).textContent} – click to open` : tip.closest('.hero-art') ? 'Click a part of the cell' : ' ';
});

function newTopic(name) {
  const n = name;
  if (!n || !n.trim()) return null;
  const t = { id: uid(), name: n.trim(), color: PALETTE[db.topics.length % PALETTE.length], entries: [] };
  db.topics.push(t); save();
  return t;
}

// Pick a ready-made topic (with starter notes) or make a blank one.
function openTopicPicker() {
  const has = (name) => db.topics.find((t) => t.name.toLowerCase() === name.toLowerCase());
  openDialog(`
    <div class="dlg-head"><h2 class="grow">Add a topic</h2><button data-close aria-label="Close">✕</button></div>
    <div class="dlg-body">
      <h4 class="sect">Ready-made topics <small>– each comes with starter definitions you can edit</small></h4>
      <div class="presets">${PRESETS.map((p, i) => `<button class="preset" data-p="${i}" style="--c:${p.color}">
        <b>${esc(p.name)}</b><span>${esc(p.blurb)}</span>
        <small>${has(p.name) ? '✓ Added – click to fill in any missing notes' : `${p.entries.length} notes`}</small></button>`).join('')}</div>
      <h4 class="sect">Or start a blank topic</h4>
      <form id="blank-topic" class="blank-row"><input type="text" name="name" required placeholder="e.g. Ecology"><button class="primary">Create</button></form>
    </div>`, 'small');
  $$('.preset', dlg).forEach((b) => { b.onclick = () => addPreset(PRESETS[b.dataset.p]); });
  $('#blank-topic').onsubmit = (ev) => {
    ev.preventDefault();
    const t = newTopic(ev.target.name.value);
    if (!t) return;
    current = t.id; query = ''; $('#search').value = ''; dlg.close(); render();
  };
}

function addPreset(p) {
  let t = db.topics.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
  if (!t) { t = { id: uid(), name: p.name, color: p.color, entries: [] }; db.topics.push(t); }
  let added = 0;
  for (const e of p.entries) {
    if (t.entries.some((x) => x.title.toLowerCase() === e.title.toLowerCase())) continue;
    t.entries.push({ id: uid(), ...e, notes: [...e.notes], diagram: '', image: '' });
    added++;
  }
  save(); current = t.id; query = ''; $('#search').value = ''; dlg.close(); render();
  toast(added ? `${p.name}: added ${added} note${added === 1 ? '' : 's'}` : `${p.name} already has all its notes`);
}

// ---------- one note, opened up ----------
function openDetail(id) {
  const hit = find(id);
  if (!hit) return;
  const { e, t } = hit;
  const d = DIAGRAMS[e.diagram];
  const i = shownIds.indexOf(id);
  const prev = i > 0 ? find(shownIds[i - 1]) : null;
  const next = i >= 0 && i < shownIds.length - 1 ? find(shownIds[i + 1]) : null;
  const hasFig = d || e.image;
  openDialog(`
    <div class="detail" style="--c:${colorOf(e, t)}">
      <div class="dlg-head"><div class="grow"><h2>${esc(e.title)}</h2><div class="chips">${chips(e.found)}<span class="chip">${esc(t.name)}</span></div></div>
        <button data-act="edit">Edit</button><button data-close aria-label="Close">✕</button></div>
      <div class="dlg-body d-body ${hasFig ? '' : 'textonly'}">
        <div class="d-text">
          <p class="def">${esc(e.definition) || '<i>No definition yet – press Edit to add one.</i>'}</p>
          ${e.notes?.length ? `<h4>Key points</h4><ul>${e.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          ${d ? `<h4>Labels</h4><ol class="legend">${d.labels.map((l, j) => `<li data-i="${j}" style="--lc:${l[1]}"><b>${l[0]}</b> <span>– ${l[6]}</span></li>`).join('')}</ol>` : ''}
        </div>
        ${hasFig ? `<div class="d-fig">
          ${d ? `<div class="fig">${diagramSVG(e.diagram)}</div>
            <label class="quiz-toggle"><input type="checkbox" id="hide-labels"> Hide the labels to test yourself (click a label in the list to reveal it)</label>` : ''}
          ${e.image ? `<figure class="myimg"><img src="${e.image}" alt="My diagram of ${esc(e.title)}"><figcaption>My own diagram</figcaption></figure>` : ''}
        </div>` : ''}
      </div>
      <div class="dlg-foot">
        <button data-go="${prev?.e.id || ''}" ${prev ? '' : 'disabled'}>← ${prev ? esc(prev.e.title) : 'Previous'}</button>
        <span class="grow">${i >= 0 ? `${i + 1} of ${shownIds.length}` : ''}</span>
        <button data-go="${next?.e.id || ''}" ${next ? '' : 'disabled'}>${next ? esc(next.e.title) : 'Next'} →</button>
      </div>
    </div>`, 'detail-dlg');

  const svg = $('svg.dg', dlg);
  const hl = (j) => {
    if (!svg) return;
    svg.classList.toggle('hl', j != null);
    $$('.lb', svg).forEach((g) => g.classList.toggle('on', g.dataset.i === String(j)));
    $$('.legend li', dlg).forEach((li) => li.classList.toggle('hover', li.dataset.i === String(j)));
  };
  $$('.legend li', dlg).forEach((li) => {
    li.addEventListener('mouseenter', () => hl(li.dataset.i));
    li.addEventListener('mouseleave', () => hl(null));
    li.addEventListener('click', () => {
      li.classList.toggle('show');
      $(`.lb[data-i="${li.dataset.i}"]`, svg)?.classList.toggle('show', li.classList.contains('show'));
    });
  });
  svg && $$('.lb', svg).forEach((g) => {
    g.addEventListener('mouseenter', () => hl(g.dataset.i));
    g.addEventListener('mouseleave', () => hl(null));
  });
  $('#hide-labels', dlg)?.addEventListener('change', (ev) => {
    $('.detail', dlg).classList.toggle('quiz', ev.target.checked);
    $$('.show', dlg).forEach((x) => x.classList.remove('show'));
  });
  $('[data-act=edit]', dlg).onclick = () => openEdit(e.id);
  $$('[data-go]', dlg).forEach((b) => { b.onclick = () => b.dataset.go && openDetail(b.dataset.go); });
}

document.addEventListener('keydown', (ev) => {
  if (!dlg.open || !dlg.classList.contains('detail-dlg') || ev.target.matches('input, textarea')) return;
  if (ev.key === 'ArrowLeft') $$('[data-go]', dlg)[0]?.click();
  if (ev.key === 'ArrowRight') $$('[data-go]', dlg)[1]?.click();
});

// ---------- add / edit a note ----------
function topicOptions(selected) {
  return db.topics.map((t) => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('') +
    '<option value="__new">+ New topic…</option>';
}

function openEdit(id, preset = {}) {
  const hit = id ? find(id) : null;
  const e = hit ? hit.e : { title: '', definition: '', notes: [], found: '', diagram: '', image: '', ...preset };
  let image = e.image || '';
  const topicId = hit ? hit.t.id : preset.topic || current;
  openDialog(`
    <div class="dlg-head"><h2 class="grow">${hit ? 'Edit note' : 'Add a note'}</h2><button data-close aria-label="Close">✕</button></div>
    <form class="dlg-body form" id="edit-form">
      <div class="row2">
        <label>Name <input type="text" name="title" required value="${esc(e.title)}" placeholder="e.g. Mitochondria"></label>
        <label>Topic <select name="topic">${topicOptions(topicId)}</select></label>
      </div>
      <label>Definition <textarea name="definition" rows="3" placeholder="What it is / what it does">${esc(e.definition)}</textarea></label>
      <label>Key points <small>one per line</small><textarea name="notes" rows="4" placeholder="Has a double membrane&#10;Found in muscle cells">${esc((e.notes || []).join('\n'))}</textarea></label>
      <label>Found in <small>separate with commas</small><input type="text" name="found" value="${esc(e.found)}" placeholder="Animal, Plant"></label>
      <div class="row2">
        <label>Labelled diagram <select name="diagram"><option value="">None</option>
          ${Object.entries(DIAGRAMS).map(([k, d]) => `<option value="${k}" ${k === e.diagram ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        <label>Card colour <small>leave as is to use the diagram's colour</small>
          <input type="color" name="color" value="${e.color || DIAGRAMS[e.diagram]?.color || topicOf(topicId)?.color || '#16a34a'}"></label>
      </div>
      <div class="preview" id="dg-preview">${e.diagram ? diagramSVG(e.diagram) : ''}</div>
      <label>Your own picture <small>e.g. a photo of a diagram you drew</small>
        <div class="imgrow"><input type="file" accept="image/*" id="img-in"><span id="img-show">${image ? `<img src="${image}" alt="">` : ''}</span>
        <button type="button" class="link danger" id="img-rm" ${image ? '' : 'hidden'}>Remove picture</button></div></label>
    </form>
    <div class="dlg-foot">
      ${hit ? '<button class="danger" id="del">Delete note</button>' : ''}<span class="grow"></span>
      <button data-close>Cancel</button><button class="primary" id="save" form="edit-form">Save</button>
    </div>`, 'small');

  const f = $('#edit-form');
  const startColor = f.color.value;
  let colorTouched = !!e.color;
  f.color.addEventListener('input', () => { colorTouched = true; });
  f.diagram.addEventListener('change', () => {
    $('#dg-preview').innerHTML = f.diagram.value ? diagramSVG(f.diagram.value) : '';
    if (!colorTouched && DIAGRAMS[f.diagram.value]) f.color.value = DIAGRAMS[f.diagram.value].color;
  });
  f.title.addEventListener('change', () => {
    if (f.diagram.value) return;
    const m = DIAGRAM_WORDS.find(([re]) => re.test(f.title.value));
    if (m) { f.diagram.value = m[1]; f.diagram.dispatchEvent(new Event('change')); }
  });
  $('#img-in').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try { image = await shrinkImage(file); } catch { return toast('Sorry, that picture could not be opened.'); }
    $('#img-show').innerHTML = `<img src="${image}" alt="">`; $('#img-rm').hidden = false;
  });
  $('#img-rm').onclick = () => { image = ''; $('#img-show').innerHTML = ''; $('#img-rm').hidden = true; $('#img-in').value = ''; };
  if (hit) $('#del').onclick = () => {
    if (!confirm(`Delete “${e.title}”?`)) return;
    hit.t.entries = hit.t.entries.filter((x) => x !== e); save(); dlg.close(); render();
  };
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = f.topic.value === '__new' ? newTopic(prompt('Name of the new topic:') ?? '') : topicOf(f.topic.value);
    if (!t) return toast('Pick a topic for this note.');
    const data = {
      title: f.title.value.trim(), definition: f.definition.value.trim(), found: f.found.value.trim(),
      notes: f.notes.value.split('\n').map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean),
      diagram: f.diagram.value, image,
      color: colorTouched && f.color.value !== startColor || e.color ? f.color.value : '',
    };
    let entry = e;
    if (hit) {
      Object.assign(e, data);
      if (hit.t !== t) { hit.t.entries = hit.t.entries.filter((x) => x !== e); t.entries.push(e); }
    } else {
      entry = { id: uid(), ...data };
      t.entries.push(entry);
    }
    if (!save()) return;
    current = t.id; query = ''; $('#search').value = '';
    render(); openDetail(entry.id);
    toast('Saved');
  });
  setTimeout(() => (hit ? null : f.title.focus()), 50);
}

// Make pictures small enough to keep in the browser's storage.
function shrinkImage(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- paste a page of notes ----------
// Understands lines like "Nucleus: controls the cell" or "Nucleus - controls the cell",
// a name on its own line with the definition underneath, and bullet points ("- ...") as key points.
export function parseNotes(text) {
  const out = [];
  let cur = null, gap = true;
  const bullet = /^([-•*–]|\d+[.)])\s+/;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { gap = true; continue; }
    const isBullet = bullet.test(line);
    const m = !isBullet && line.match(/^([^:=]{1,50}?)\s*(?:[:=]|\s[-–—]\s)\s*(.+)$/);
    if (m) { cur = { title: m[1].trim(), definition: m[2].trim(), notes: [] }; out.push(cur); }
    else if (isBullet && cur) cur.notes.push(line.replace(bullet, ''));
    else if (gap || !cur) { cur = { title: line.replace(/[:\-–]\s*$/, '').replace(bullet, '').trim(), definition: '', notes: [] }; out.push(cur); }
    else if (!cur.definition) cur.definition = line;
    else cur.definition += ' ' + line;
    gap = false;
  }
  return out.filter((n) => n.title);
}

function openPaste() {
  openDialog(`
    <div class="dlg-head"><h2 class="grow">Paste your notes</h2><button data-close aria-label="Close">✕</button></div>
    <div class="dlg-body form">
      <p class="hint">Type or paste what you wrote down. Put each thing on its own line, like this:
        <code>Nucleus: contains DNA that controls the cell
- surrounded by a nuclear envelope
Ribosomes - where proteins are made</code>
        Lines starting with “-” become key points. If a name matches an organelle, its diagram is added for you.</p>
      <label>Add to topic <select id="paste-topic">${topicOptions(current)}</select></label>
      <label>Your notes <textarea id="paste-text" rows="10" placeholder="Mitochondria: where aerobic respiration happens"></textarea></label>
      <p id="paste-count" class="where">&nbsp;</p>
    </div>
    <div class="dlg-foot"><span class="grow"></span><button data-close>Cancel</button><button class="primary" id="paste-go">Add notes</button></div>`, 'small');
  const ta = $('#paste-text');
  ta.addEventListener('input', () => {
    const n = parseNotes(ta.value);
    $('#paste-count').textContent = n.length ? `Found ${n.length} note${n.length === 1 ? '' : 's'}: ${n.map((x) => x.title).join(', ')}` : ' ';
  });
  $('#paste-go').onclick = () => {
    const notes = parseNotes(ta.value);
    if (!notes.length) return toast('Nothing to add yet – type some notes first.');
    const sel = $('#paste-topic').value;
    const t = sel === '__new' ? newTopic(prompt('Name of the new topic:') ?? '') : topicOf(sel);
    if (!t) return;
    let added = 0, updated = 0;
    for (const n of notes) {
      const old = t.entries.find((x) => x.title.toLowerCase() === n.title.toLowerCase());
      if (old) {
        if (n.definition) old.definition = n.definition;
        old.notes = [...(old.notes || []), ...n.notes.filter((s) => !(old.notes || []).includes(s))];
        updated++;
      } else {
        const m = DIAGRAM_WORDS.find(([re]) => re.test(n.title));
        t.entries.push({ id: uid(), ...n, found: '', diagram: m ? m[1] : '', image: '' });
        added++;
      }
    }
    save(); current = t.id; query = ''; $('#search').value = ''; dlg.close(); render();
    toast(`Added ${added} note${added === 1 ? '' : 's'}${updated ? `, updated ${updated}` : ''}`);
  };
  ta.focus();
}

// ---------- flashcards ----------
function openCards() {
  const withDef = all().filter(({ e }) => e.definition);
  if (!withDef.length) return toast('Add some notes with definitions first.');
  openDialog(`
    <div class="dlg-head"><h2 class="grow">Flashcards</h2><button data-close aria-label="Close">✕</button></div>
    <div class="dlg-body form">
      <label>Topic <select id="fc-topic"><option value="">All topics</option>${db.topics.map((t) => `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label>Mode <select id="fc-mode">
        <option value="def">Read the definition → name it</option>
        <option value="name">Read the name → say the definition</option>
        <option value="diagram">See the diagram → name it</option></select></label>
    </div>
    <div class="dlg-foot"><span class="grow"></span><button class="primary" id="fc-start">Start</button></div>`, 'small');
  $('#fc-start').onclick = () => {
    const tid = $('#fc-topic').value, mode = $('#fc-mode').value;
    let deck = all().filter(({ e, t }) => (!tid || t.id === tid) && (mode === 'diagram' ? DIAGRAMS[e.diagram] || e.image : e.definition));
    if (!deck.length) return toast(mode === 'diagram' ? 'No notes with diagrams in that topic.' : 'No notes with definitions in that topic.');
    deck = deck.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    runCards(deck, mode);
  };
}

function runCards(deck, mode) {
  const total = deck.length;
  let right = 0;
  const queue = [...deck];
  const show = (revealed) => {
    if (!queue.length) {
      db.rounds = (db.rounds || 0) + 1; save();
      openDialog(`<div class="dlg-head"><h2 class="grow">All done!</h2><button data-close aria-label="Close">✕</button></div>
        <div class="dlg-body" style="text-align:center"><p class="score">${right} / ${total}</p><p>You got ${right} right first go out of ${total} cards.</p></div>
        <div class="dlg-foot"><span class="grow"></span><button id="fc-again" class="primary">Go again</button></div>`, 'small');
      $('#fc-again').onclick = openCards;
      return;
    }
    const { e, t } = queue[0];
    const fig = DIAGRAMS[e.diagram] ? `<div class="fig">${diagramSVG(e.diagram, { labels: false })}</div>` : e.image ? `<figure class="myimg"><img src="${e.image}" alt=""></figure>` : '';
    const q = mode === 'def' ? esc(e.definition) : mode === 'name' ? `<b>${esc(e.title)}</b>` : `<p>Which organelle is this?</p>${fig}`;
    const a = mode === 'name' ? esc(e.definition) : esc(e.title);
    openDialog(`
      <div class="dlg-head"><h2 class="grow">Flashcards</h2><span class="where">${queue.length} left</span><button data-close aria-label="Close">✕</button></div>
      <div class="dlg-body"><div class="fc-bar"><div style="width:${((total - queue.length) / total) * 100}%"></div></div>
        <div class="fc" style="--c:${colorOf(e, t)}"><div><div class="q">${q}</div>${revealed ? `<div class="a">${a}</div>` : ''}</div></div></div>
      <div class="dlg-foot"><span class="grow"></span>
        ${revealed ? '<button id="fc-no">✗ Not yet</button><button class="primary" id="fc-yes">✓ Got it</button>' : '<button class="primary" id="fc-show">Show answer</button>'}</div>`, 'small');
    if (!revealed) return ($('#fc-show').onclick = () => show(true));
    $('#fc-yes').onclick = () => { if (!queue[0].missed) right++; queue.shift(); show(false); };
    $('#fc-no').onclick = () => { const c = queue.shift(); c.missed = true; queue.push(c); show(false); };
  };
  deck.forEach((c) => delete c.missed);
  show(false);
}

// ---------- header buttons ----------
$('#btn-paste').onclick = openPaste;
$('#btn-cards').onclick = openCards;
$('#search').addEventListener('input', (ev) => { query = ev.target.value.trim(); render(); });
$('#btn-export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `bio-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  $('.more').open = false;
};
$('#btn-import').onclick = () => $('#file-import').click();
$('#file-import').onchange = async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.topics)) throw new Error('bad');
    if (!confirm('Replace all your current notes with this backup?')) return;
    db = d; save(); current = HOME; render(); toast('Backup loaded');
  } catch { toast('That file is not a Bio Study Notes backup.'); }
  $('.more').open = false;
};
$('#btn-reset').onclick = () => {
  if (!confirm('Throw away all your notes and go back to the starter organelle notes?')) return;
  db = clone(STARTER); save(); current = HOME; render(); $('.more').open = false;
};
document.addEventListener('click', (ev) => { const m = $('.more'); if (m.open && !m.contains(ev.target)) m.open = false; });

// ---------- install as an app ----------
let installEvent = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvent = ev; $('#btn-install').hidden = false; });
$('#btn-install').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt(); await installEvent.userChoice;
  installEvent = null; $('#btn-install').hidden = true;
};
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

render();

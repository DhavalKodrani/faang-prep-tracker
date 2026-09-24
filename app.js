// FAANG Prep Tracker — static page; progress.json in the GitHub repo is the database.
(() => {
  'use strict';

  const LS = { cfg: 'fpt.cfg', data: 'fpt.progress', dirty: 'fpt.dirty', tab: 'fpt.tab' };
  const DATA_FILE = 'progress.json';
  const $ = (s, el = document) => el.querySelector(s);

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ---------- config ----------
  function detectRepo() {
    const host = location.hostname;
    if (host.endsWith('.github.io')) {
      const owner = host.replace('.github.io', '');
      const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
      return { owner, repo };
    }
    return {};
  }
  let cfg = Object.assign({ owner: '', repo: '', branch: 'main', token: '' }, detectRepo(), store.get(LS.cfg, {}));
  const hasRepo = () => cfg.owner && cfg.repo;

  // ---------- state ----------
  let plan = null;
  let sessions = [];            // [{n, date: 'YYYY-MM-DD', ...planDay}]
  let progress = store.get(LS.data, null) || emptyProgress();
  let dirty = store.get(LS.dirty, false);
  let remoteSha = null;
  let pushTimer = null;
  let pushing = false;
  let lastChange = 'Update progress';
  let tab = store.get(LS.tab, null);
  const openDays = new Set();

  function emptyProgress() { return { version: 1, days: {}, lastUpdated: null }; }
  const dayState = (n) => progress.days[n] || { tasks: [], confidence: null, notes: '', completedAt: null, updatedAt: null };

  // ---------- dates ----------
  const pad = (x) => String(x).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => keyOf(new Date());
  const fmt = (k, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parseKey(k).toLocaleDateString(undefined, opts);

  function buildSessions() {
    const skip = new Set(plan.skipDates || []);
    const d = parseKey(plan.startDate);
    sessions = plan.days.map((day, i) => {
      while (d.getDay() === 0 || d.getDay() === 6 || skip.has(keyOf(d))) d.setDate(d.getDate() + 1);
      const s = Object.assign({ n: i + 1, date: keyOf(d) }, day);
      d.setDate(d.getDate() + 1);
      return s;
    });
  }

  const doneCount = (s) => dayState(s.n).tasks.filter(Boolean).length;
  const isDone = (s) => doneCount(s) >= s.tasks.length;
  const level = (s) => {
    const f = doneCount(s) / s.tasks.length;
    return f === 0 ? 0 : f < 0.34 ? 1 : f < 0.67 ? 2 : f < 1 ? 3 : 4;
  };

  // ---------- rendering ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderStats() {
    const t = todayKey();
    const done = sessions.filter(isDone).length;
    const totalTasks = sessions.reduce((a, s) => a + s.tasks.length, 0);
    const doneTasks = sessions.reduce((a, s) => a + doneCount(s), 0);
    let streak = 0;
    for (const s of sessions.filter((s) => s.date <= t).reverse()) {
      if (isDone(s)) streak++;
      else if (s.date === t) continue; // today's session isn't over yet
      else break;
    }
    const confs = sessions.map((s) => dayState(s.n).confidence).filter((c) => c != null);
    const avg = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(1) : '–';
    const behind = sessions.filter((s) => s.date < t && !isDone(s)).length;
    $('#stats').innerHTML = `
      <div class="stat"><b>${done}/${sessions.length}</b><span>sessions done</span><div class="bar"><div style="width:${(done / sessions.length) * 100}%"></div></div></div>
      <div class="stat"><b>${Math.round((doneTasks / totalTasks) * 100)}%</b><span>tasks ticked</span></div>
      <div class="stat"><b>${streak}🔥</b><span>session streak</span></div>
      <div class="stat"><b>${behind ? behind : avg}</b><span>${behind ? 'sessions behind' : 'avg confidence'}</span></div>`;
  }

  function renderHeat() {
    const t = todayKey();
    const byDate = new Map(sessions.map((s) => [s.date, s]));
    const first = parseKey(sessions[0].date);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
    const last = parseKey(sessions[sessions.length - 1].date);
    let html = '<span class="mon"></span>' + ['Mon', '', 'Wed', '', 'Fri'].map((d) => `<span class="dow">${d}</span>`).join('');
    let lastMonth = -1;
    for (const wk = new Date(first); wk <= last; wk.setDate(wk.getDate() + 7)) {
      const fri = new Date(wk); fri.setDate(fri.getDate() + 4);   // label a week by its Friday's month
      const m = fri.getMonth();
      html += `<span class="mon">${m !== lastMonth ? fri.toLocaleDateString(undefined, { month: 'short' }) : ''}</span>`;
      lastMonth = m;
      for (let i = 0; i < 5; i++) {
        const d = new Date(wk); d.setDate(d.getDate() + i);
        const k = keyOf(d);
        const s = byDate.get(k);
        if (!s) { html += `<span class="cell none" title="${fmt(k)} · no session"></span>`; continue; }
        html += `<button class="cell l${level(s)}${k === t ? ' is-today' : ''}" data-jump="${s.n}" title="${esc(`${fmt(k)} · Day ${s.n}: ${s.title} (${doneCount(s)}/${s.tasks.length})`)}" aria-label="${esc(`Day ${s.n}, ${fmt(k)}, ${doneCount(s)} of ${s.tasks.length} tasks`)}"></button>`;
      }
    }
    $('#heat').innerHTML = html;
  }

  function dayBody(s) {
    const st = dayState(s.n);
    const tasks = s.tasks.map((task, i) => `
      <label class="task${st.tasks[i] ? ' checked' : ''}">
        <input type="checkbox" data-day="${s.n}" data-task="${i}"${st.tasks[i] ? ' checked' : ''}>
        <span>${esc(task)}</span>
      </label>`).join('');
    const links = s.links && s.links.length
      ? `<div class="links">${s.links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</div>` : '';
    const conf = Array.from({ length: 10 }, (_, i) => i + 1)
      .map((v) => `<button type="button" data-conf="${s.n}" data-v="${v}" aria-pressed="${st.confidence === v}">${v}</button>`).join('');
    return `${tasks}${links}
      <div class="meta">
        <div><label>Confidence (1–10)</label><div class="conf">${conf}</div></div>
        <div><label>Notes / what I learned</label><textarea data-notes="${s.n}" placeholder="3 takeaways, where I got stuck…">${esc(st.notes || '')}</textarea></div>
      </div>
      ${st.completedAt ? `<div class="stamp">✓ Completed ${new Date(st.completedAt).toLocaleString()}</div>` : ''}`;
  }

  function renderToday() {
    const t = todayKey();
    let s = sessions.find((x) => x.date === t);
    let kicker = `Today · ${fmt(t, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    if (!s) {
      s = sessions.find((x) => x.date > t && !isDone(x));
      if (!s) { $('#todayCard').innerHTML = sessions.every(isDone) ? '<div class="card"><div class="kicker">All done</div><h2>Program complete — go apply! 🚀</h2></div>' : ''; return; }
      kicker = t < plan.startDate ? `Starts ${fmt(s.date, { weekday: 'long', month: 'long', day: 'numeric' })}` : `Rest day · next up ${fmt(s.date)}`;
    }
    const phase = plan.phases.find((p) => p.id === s.phase);
    $('#todayCard').innerHTML = `<div class="card">
      <div class="kicker">${esc(kicker)}</div>
      <h2>Day ${s.n}: ${esc(s.title)}</h2>
      <p class="muted">${esc(phase ? phase.name : '')} · ${doneCount(s)}/${s.tasks.length} tasks</p>
      ${dayBody(s)}</div>`;
  }

  function renderTabs() {
    const opts = [{ id: 'all', name: 'All' }].concat(plan.phases);
    $('#tabs').innerHTML = opts.map((p) => `<button class="tab" role="tab" data-tab="${p.id}" aria-selected="${p.id === tab}">${esc(p.name)}</button>`).join('');
  }

  function renderList() {
    const t = todayKey();
    const rows = sessions.filter((s) => tab === 'all' || s.phase === tab);
    $('#list').innerHTML = rows.map((s) => {
      const done = isDone(s);
      const badge = s.date === t ? '<span class="badge">Today</span>' : (s.date < t && !done ? '<span class="badge late">Overdue</span>' : '');
      return `<details class="day${done ? ' done' : ''}" data-n="${s.n}"${openDays.has(s.n) ? ' open' : ''}>
        <summary>
          <span class="num">Day ${s.n}</span>
          <span class="date">${fmt(s.date)}</span>
          <span class="name">${esc(s.title)}</span>
          ${badge}
          <span class="count">${done ? '✓ ' : ''}${doneCount(s)}/${s.tasks.length}</span>
        </summary>
        <div class="day-body">${dayBody(s)}</div>
      </details>`;
    }).join('');
  }

  function renderAll() {
    renderStats(); renderHeat(); renderToday(); renderTabs(); renderList();
    $('#lastUpdated').textContent = progress.lastUpdated ? `Last update ${new Date(progress.lastUpdated).toLocaleString()}` : '';
  }

  function setSync(text, cls = '', title = '') {
    const el = $('#sync');
    el.textContent = text; el.className = `pill ${cls}`; el.title = title || text;
  }

  // ---------- mutations ----------
  function touch(n, mutate, msg) {
    const st = Object.assign({}, dayState(n));
    st.tasks = st.tasks.slice();
    mutate(st);
    const s = sessions[n - 1];
    const complete = st.tasks.filter(Boolean).length >= s.tasks.length;
    st.completedAt = complete ? (st.completedAt || new Date().toISOString()) : null;
    st.updatedAt = new Date().toISOString();
    progress.days[n] = st;
    progress.lastUpdated = st.updatedAt;
    lastChange = msg;
    dirty = true;
    store.set(LS.data, progress);
    store.set(LS.dirty, true);
    schedulePush();
  }

  // ---------- GitHub sync ----------
  const api = (path) => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`;
  const headers = () => Object.assign({ Accept: 'application/vnd.github+json' }, cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {});

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  async function readRemote() {
    if (hasRepo()) {
      const r = await fetch(api(`/contents/${DATA_FILE}?ref=${encodeURIComponent(cfg.branch)}`), { headers: headers(), cache: 'no-store' });
      if (r.status === 404) return { data: emptyProgress(), sha: null };
      if (r.status === 401) throw Object.assign(new Error('Token rejected'), { auth: true });
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      const j = await r.json();
      return { data: JSON.parse(b64decode(j.content)), sha: j.sha };
    }
    const r = await fetch(`${DATA_FILE}?t=${Date.now()}`, { cache: 'no-store' });
    return { data: r.ok ? await r.json() : emptyProgress(), sha: null };
  }

  // Per-day last-writer-wins, so edits made on two devices don't clobber each other.
  function merge(a, b) {
    const out = emptyProgress();
    const keys = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
    for (const k of keys) {
      const x = (a.days || {})[k], y = (b.days || {})[k];
      out.days[k] = !x ? y : !y ? x : ((x.updatedAt || '') >= (y.updatedAt || '') ? x : y);
    }
    out.lastUpdated = [a.lastUpdated, b.lastUpdated].filter(Boolean).sort().pop() || null;
    return out;
  }

  async function pull() {
    if (pushing) return;
    setSync('Syncing…');
    try {
      const { data, sha } = await readRemote();
      remoteSha = sha;
      progress = dirty ? merge(progress, data) : merge(data, progress);
      store.set(LS.data, progress);
      renderAll();
      if (dirty) await push();
      else setSync(cfg.token ? 'Synced ✓' : 'View only', cfg.token ? 'ok' : 'warn', cfg.token ? 'Up to date with GitHub' : 'Add a token in Sync settings to save from this device');
    } catch (e) {
      setSync(e.auth ? 'Token rejected' : 'Offline', 'err', e.message);
      renderAll();
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1200);
  }

  async function push(keepalive = false) {
    clearTimeout(pushTimer);
    if (!dirty) return;
    if (!hasRepo() || !cfg.token) { setSync('Saved on this device', 'warn', 'Add a token in Sync settings to save to GitHub'); return; }
    if (pushing) { schedulePush(); return; }
    pushing = true;
    setSync('Saving…');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const body = { message: lastChange, content: b64encode(JSON.stringify(progress, null, 2) + '\n'), branch: cfg.branch };
        if (remoteSha) body.sha = remoteSha;
        const r = await fetch(api(`/contents/${DATA_FILE}`), { method: 'PUT', headers: headers(), body: JSON.stringify(body), keepalive });
        if (r.ok) {
          remoteSha = (await r.json()).content.sha;
          dirty = false; store.set(LS.dirty, false);
          setSync('Synced ✓', 'ok', `Saved to ${cfg.owner}/${cfg.repo}`);
          return;
        }
        if (r.status === 409 || r.status === 422) {   // someone else wrote first: merge and retry
          const remote = await readRemote();
          remoteSha = remote.sha;
          progress = merge(progress, remote.data);
          store.set(LS.data, progress);
          continue;
        }
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Token cannot write to this repo'), { auth: true });
        throw new Error(`GitHub ${r.status}`);
      }
      throw new Error('Too many conflicts');
    } catch (e) {
      setSync(e.auth ? 'Token rejected' : 'Not synced', 'err', `${e.message} — your changes are kept on this device and will sync later`);
    } finally {
      pushing = false;
      renderAll();
    }
  }

  // ---------- events ----------
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('input[data-task]')) {
      const n = +el.dataset.day, i = +el.dataset.task;
      const s = sessions[n - 1];
      touch(n, (st) => { st.tasks[i] = el.checked; }, `Day ${n} (${s.date}): ${el.checked ? '✓' : '✗'} ${s.tasks[i]}`);
      renderAll();
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('textarea[data-notes]')) {
      const n = +el.dataset.notes;
      touch(n, (st) => { st.notes = el.value; }, `Day ${n}: notes`);
      document.querySelectorAll(`textarea[data-notes="${n}"]`).forEach((t) => { if (t !== el) t.value = el.value; });
    }
  });

  document.addEventListener('click', (e) => {
    const conf = e.target.closest('[data-conf]');
    if (conf) {
      const n = +conf.dataset.conf, v = +conf.dataset.v;
      touch(n, (st) => { st.confidence = st.confidence === v ? null : v; }, `Day ${n}: confidence ${v}/10`);
      renderAll();
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; store.set(LS.tab, tab); renderTabs(); renderList(); return; }
    const j = e.target.closest('[data-jump]');
    if (j) {
      const n = +j.dataset.jump;
      if (tab !== 'all' && sessions[n - 1].phase !== tab) { tab = 'all'; store.set(LS.tab, tab); renderTabs(); }
      openDays.add(n); renderList();
      const el = $(`details[data-n="${n}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details.day')) (d.open ? openDays.add(+d.dataset.n) : openDays.delete(+d.dataset.n));
  }, true);

  // Flush when leaving the page; refresh when coming back (another device may have written).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (dirty) push(true); }
    else pull();
  });
  window.addEventListener('online', () => pull());

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `faang-progress-${todayKey()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // settings dialog
  const dlg = $('#settings');
  $('#settingsBtn').addEventListener('click', () => {
    $('#sOwner').value = cfg.owner; $('#sRepo').value = cfg.repo; $('#sBranch').value = cfg.branch || 'main';
    $('#sToken').value = ''; $('#sToken').placeholder = cfg.token ? '•••••••• (saved — leave blank to keep)' : 'github_pat_…';
    $('#sMsg').textContent = '';
    dlg.showModal();
  });
  $('#sForget').addEventListener('click', () => {
    cfg.token = ''; store.set(LS.cfg, cfg);
    $('#sToken').placeholder = 'github_pat_…';
    $('#sMsg').textContent = 'Token removed from this device.';
    pull();
  });
  $('#settingsForm').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const next = {
      owner: $('#sOwner').value.trim(), repo: $('#sRepo').value.trim(), branch: $('#sBranch').value.trim() || 'main',
      token: $('#sToken').value.trim() || cfg.token,
    };
    $('#sMsg').textContent = 'Checking…';
    try {
      const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(next.owner)}/${encodeURIComponent(next.repo)}`,
        { headers: Object.assign({ Accept: 'application/vnd.github+json' }, next.token ? { Authorization: `Bearer ${next.token}` } : {}), cache: 'no-store' });
      if (r.status === 401) throw new Error('GitHub rejected this token.');
      if (r.status === 404) throw new Error('Repo not found (or the token has no access to it).');
      if (!r.ok) throw new Error(`GitHub error ${r.status}.`);
    } catch (err) { $('#sMsg').textContent = err.message; return; }
    cfg = next; store.set(LS.cfg, cfg);
    remoteSha = null;
    dlg.close();
    pull();
  });

  // ---------- boot ----------
  fetch('plan.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((p) => {
      plan = p;
      document.title = `${plan.title} Tracker`;
      $('#title').textContent = plan.title;
      buildSessions();
      if (!tab) { const t = todayKey(); tab = (sessions.find((s) => s.date >= t) || sessions[0]).phase; }
      const cur = sessions.find((s) => s.date === todayKey());
      if (cur) openDays.add(cur.n);
      renderAll();
      pull();
    })
    .catch((e) => { setSync('Failed to load plan', 'err', e.message); });
})();

// Marketing review queue (owner only). All text is inserted with textContent / value, never as HTML.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };
  const when = (s) => new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Beirut', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' Beirut';
  let editing = null, last = '';
  const STATE = { starting: 'starting', processing: 'processing', publishing: 'publishing', published: 'published', failed: 'failed', dry_run: 'dry run, not posted' };
  async function send(payload, answered) {
    $('msg').textContent = ''; $('msg').className = '';
    const r = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    answered?.();
    if (r.status === 401) return signedOut();
    if (!r.ok) { $('msg').textContent = (await r.json().catch(() => ({}))).error || 'Something went wrong.'; $('msg').scrollIntoView({ block: 'nearest' }); return false; }
    const d = await r.json().catch(() => ({}));
    editing = null; last = ''; await load(); if (d.notice) { $('msg').textContent = d.notice; $('msg').className = 'ok'; $('msg').scrollIntoView({ block: 'nearest' }); } return true;
  }
  const btn = (text, fn, cls = '') => el('button', { type: 'button', textContent: text, className: cls, onclick: fn });

  function editor(p) {
    const rows = p.post.scenes.map((s, i) => {
      const say = el('textarea', { dir: 'auto', value: s.say, rows: 2 }), title = el('input', { dir: 'auto', value: s.title }), chat = s.chat && el('input', { dir: 'auto', value: s.chat[1] });
      const items = s.items && el('textarea', { dir: 'auto', value: s.items.join('\n'), rows: s.items.length });
      return { get: () => ({ ...s, say: say.value, title: title.value, ...(chat ? { chat: [s.chat[0], chat.value] } : {}), ...(items ? { items: items.value.split('\n').map((x) => x.trim()).filter(Boolean) } : {}) }),
        node: el('fieldset', {}, el('legend', { textContent: 'Scene ' + (i + 1) }), el('label', {}, 'Spoken', say), el('label', {}, 'Title', title), chat && el('label', {}, 'Demo message', chat), items && el('label', {}, 'On-screen lines (one per line)', items)) };
    });
    const cap = el('textarea', { dir: 'auto', value: p.post.caption, rows: 4 }), tags = el('input', { dir: 'auto', value: p.post.hashtags.join(' ') });
    return el('div', {}, el('label', {}, 'Caption', cap), el('label', {}, 'Hashtags', tags), ...rows.map((r) => r.node),
      btn('Save', () => send({ action: 'edit', id: p.id, version: p.version, post: { scenes: rows.map((r) => r.get()), caption: cap.value, hashtags: tags.value.split(/\s+/).filter(Boolean) } }), 'primary'),
      btn('Cancel', () => { editing = null; last = ''; load(); }));
  }
  function chip(s) {
    return s ? el('div', {}, el('span', { className: 'chip ' + s.state, textContent: `Instagram: ${STATE[s.state] || s.state}${s.error ? ' · ' + s.error : ''}` })) : '';
  }
  // datetime-local value in Beirut time
  const local = (s) => new Date(s).toLocaleString('sv-SE', { timeZone: 'Asia/Beirut' }).slice(0, 16).replace(' ', 'T');
  // the first four tabs are always shown, the others only while they hold posts
  const TABS = { review: 'Waiting for approval', scheduled: 'Approved', publishing: 'Publishing now', published: 'Published', failed: 'Failed', rendering: 'Rendering', declined: 'Declined' };
  const ALWAYS = ['review', 'scheduled', 'publishing', 'published'];
  let data = null, tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'review';
  function renderList() {
    const count = (k) => data.posts.filter((p) => p.status === k).length;
    const shown = Object.keys(TABS).filter((k) => ALWAYS.includes(k) || count(k));
    if (!shown.includes(tab)) tab = 'review';
    const open = (k, focus) => { tab = k; editing = null; history.replaceState(null, '', '#' + k); renderList(); if (focus) $('tab-' + k).focus(); };
    $('tabs').replaceChildren(...shown.map((k, i) => {
      const b = el('button', { type: 'button', id: 'tab-' + k, role: 'tab', tabIndex: k === tab ? 0 : -1, onclick: () => open(k),
        onkeydown: (e) => { const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (step) open(shown[(i + step + shown.length) % shown.length], true); } }, TABS[k], el('span', { className: 'count', textContent: count(k) }));
      b.setAttribute('aria-selected', String(k === tab)); b.setAttribute('aria-controls', 'list');
      return b;
    }));
    const posts = data.posts.filter((p) => p.status === tab);
    if (tab === 'published') posts.reverse(); // newest slot first
    $('list').setAttribute('aria-labelledby', 'tab-' + tab);
    $('list').replaceChildren(...(posts.length ? posts.map((p) => card({ ...p, live: data.instagram.live })) : [el('p', { className: 'meta', textContent: `Nothing in "${TABS[tab]}".` })]));
  }
  // ── progress bar: posts being published now, plus results from the last 2 minutes ──
  const STAGES = {
    sending: [10, 'Sending the request'],
    starting: [30, 'Creating the Reel container'],
    processing: [60, 'Waiting for Instagram to report FINISHED (checked about every 5 minutes)'],
    publishing: [85, 'Publishing the Reel'],
    published: [100, 'Published'], failed: [100, 'Failed'], dry_run: [100, 'Dry run: simulated, nothing posted'], simulating: [50, 'Simulating (Dry Run): nothing is posted'],
  };
  const pending = new Map(); // "Publish now" requests still waiting for the server
  const recent = (s) => s && Date.now() - Date.parse(s.at) < 12e4;
  function progress() {
    const rows = [];
    for (const p of data?.posts || []) {
      if (pending.has(p.id)) continue;
      const s = p.pub?.instagram;
      const show = p.status === 'publishing' || (['published', 'failed'].includes(p.status) && recent(s)) || (p.status === 'scheduled' && s?.state === 'dry_run' && recent(s));
      if (show) rows.push({ p, state: s?.state || 'starting', error: s?.error });
    }
    for (const x of pending.values()) rows.push(x);
    const box = $('progress'); box.hidden = !rows.length;
    // rows are reused so the bar moves from its old width to the new one
    const old = new Map([...box.children].map((n) => [n.dataset.key, n]));
    box.replaceChildren(...rows.map(({ p, state, error }) => {
      const key = p.id, [pct, text] = STAGES[state] || STAGES.starting;
      const n = old.get(key) || el('div', {}, el('strong'), el('div', { className: 'meta' }), el('div', { className: 'bar', role: 'progressbar' }, el('span')));
      n.dataset.key = key; n.className = 'run ' + state;
      const [title, line, bar] = n.children;
      title.textContent = `${p.post.scenes[0].say} (${p.id})`;
      line.textContent = `Instagram: ${text}${error ? ' · ' + error : ''}`;
      bar.setAttribute('aria-valuenow', pct); bar.setAttribute('aria-label', `${p.id} ${line.textContent}`);
      requestAnimationFrame(() => { bar.firstChild.style.transform = `scaleX(${pct / 100})`; });
      return n;
    }));
  }
  // would this post really be sent now (false = Publish now only simulates)
  const reach = (p) => p.live && p.pub?.instagram?.state !== 'published';
  function publishNow(p) {
    const real = reach(p);
    return btn(real ? 'Publish now' : 'Publish now (dry run)', async (e) => {
      if (real && !confirm('Publish this post NOW, for real, on Instagram? This cannot be undone.')) return;
      const b = e.currentTarget; b.disabled = true; b.textContent = real ? 'Publishing…' : 'Simulating…';
      pending.set(p.id, { p, state: real ? 'sending' : 'simulating' }); progress();
      const watch = setInterval(async () => { // show the server's own stage while the request runs
        const r = await fetch('/api/marketing').catch(() => null); if (!r?.ok) return;
        const now = (await r.json()).posts.find((x) => x.id === p.id);
        if (pending.has(p.id) && now?.status === 'publishing') pending.set(p.id, { ...pending.get(p.id), state: now.pub?.instagram?.state || 'starting' });
        progress();
      }, 2000);
      let ok;
      try { ok = await send({ action: 'publish_now', id: p.id, version: p.version, confirm: real ? 'PUBLISH' : '' }, () => { clearInterval(watch); pending.delete(p.id); }); }
      finally { clearInterval(watch); pending.delete(p.id); progress(); }
      if (!ok) { last = ''; load(); }
    }, 'primary');
  }
  function schedule(p) {
    const real = reach(p), at = el('input', { type: 'datetime-local', value: local(p.slot) });
    return el('div', { className: 'schedule' }, el('div', { className: 'meta', textContent: real ? 'At this time it is really published on Instagram.' : 'At this time it is only simulated: nothing is posted.' }),
      el('label', {}, 'Publish time (Beirut)', at), btn('Save time', () => send({ action: 'reschedule', id: p.id, version: p.version, at: at.value })));
  }
  // Manual TikTok cross-posting: save the video and copy the caption. Nothing is sent to TikTok.
  const kits = new Map(); // kept across redraws, so a running download keeps its button and message
  function tiktokKit(p) {
    const key = JSON.stringify([p.id, p.version, p.has_video, p.caption]);
    if (kits.has(key)) return kits.get(key);
    const note = el('div', { className: 'meta' }); note.setAttribute('role', 'status');
    const say = (text, cls = 'meta') => { note.className = cls; note.textContent = text; };
    const download = p.has_video && btn('Download', async () => {
      download.disabled = true; download.textContent = 'Downloading…'; say('');
      try {
        const r = await fetch(`/api/marketing?video=${encodeURIComponent(p.id)}&v=${p.version}`);
        if (r.status === 401) return signedOut();
        if (r.status === 404) { say('This video is no longer available: it was cleaned up or is being rendered again.', 'warn'); return; }
        if (!r.ok || r.headers.get('Content-Type') !== 'video/mp4') throw new Error();
        const url = URL.createObjectURL(await r.blob()), name = `${String(p.id).replace(/[^\w-]+/g, '-')}.mp4`;
        el('a', { href: url, download: name }).click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        say(`Saved ${name} to your downloads.`);
      } catch { say('Download failed. Check your connection and try again.', 'warn'); }
      finally { download.disabled = false; download.textContent = 'Download'; }
    });
    const copy = btn('Copy caption', async () => {
      try { await navigator.clipboard.writeText(p.caption); say('Caption and hashtags copied.'); }
      catch { say('Could not copy. Select the caption text and copy it by hand.', 'warn'); }
    });
    const gone = !p.has_video && { published: 'publishing', declined: 'declining' }[p.status];
    const node = el('div', { className: 'kit' }, gone && el('div', { className: 'meta', textContent: `Video cleaned up after ${gone}, so it can no longer be downloaded.` }), download, copy, note);
    kits.set(key, node); return node;
  }
  function card(p) {
    const open = ['rendering', 'review', 'scheduled', 'failed'].includes(p.status);
    const state = p.status === 'scheduled' ? `Approved · ${when(p.slot)}${p.dry_run_at ? ' · dry run done, nothing posted' : ''}` : p.status === 'review' ? 'Waiting for your approval' : p.status === 'rendering' ? (p.error ? `Last render failed (try ${p.attempts} of 3). Trying once more automatically; the same error again stops it` : 'Rendering (usually within 15 to 30 minutes)') : p.status === 'failed' ? 'Failed' : TABS[p.status] || p.status;
    const stuck = p.status === 'failed' && !p.has_video;
    const side = el('div', {}, el('h2', { textContent: p.post.scenes[0].say, dir: 'auto' }), el('div', { className: 'meta', textContent: `${p.post.lang === 'ar-LB' ? 'Lebanese Arabic' : 'English'} · ${state} · version ${p.version}` }), p.error && el('div', { style: 'color:var(--bad)', textContent: `Error: ${p.error}` }));
    if (editing === p.id) side.append(editor(p));
    else side.append(el('p', { className: 'cap', textContent: p.caption, dir: 'auto' }),
      p.post.keyword ? el('div', { className: 'meta', textContent: `Comment keyword: ${p.post.keyword} · ${p.post.info?.title || ''}`, dir: 'auto' }) : '', chip(p.pub?.instagram), tiktokKit(p), p.status === 'scheduled' ? schedule(p) : '', el('div', {},
      p.status === 'review' && btn('Approve', () => send({ action: 'approve', id: p.id, version: p.version }), 'primary'),
      p.status === 'scheduled' && publishNow(p),
      p.status === 'failed' && p.has_video && btn('Try publishing again', () => send({ action: 'republish', id: p.id, version: p.version }), 'primary'),
      stuck && btn('Render again', () => send({ action: 'retry', id: p.id, version: p.version }), 'primary'),
      open && btn(p.status === 'failed' ? 'Edit and retry' : 'Edit', () => { editing = p.id; last = ''; load(); }),
      open && btn('Decline', () => confirm('Decline this post and delete its video?') && send({ action: 'decline', id: p.id }))));
    return el('article', { className: 'card post' }, p.has_video ? el('video', { src: `/api/marketing?video=${p.id}&v=${p.version}`, controls: true, playsInline: true, preload: 'metadata' }) : el('div', { className: 'meta', textContent: p.status === 'rendering' ? (p.error ? 'No video yet: waiting for the next try' : 'The video is being made') : stuck ? 'Render failed: no video' : 'No video stored' }), side);
  }
  const day = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  async function testLink() {
    const post = (action) => fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    $('msg').className = ''; $('msg').textContent = 'Testing the video link…';
    try {
      const d = await (await post('video_link')).json(); if (!d.url) throw new Error(d.error || 'No link');
      const r = await fetch(d.url, { credentials: 'omit', headers: { Range: 'bytes=0-1023' } }), type = r.headers.get('Content-Type');
      if (r.status !== 206 || type !== 'video/mp4') throw new Error(`The link answered ${r.status} ${type}`);
      $('msg').className = 'ok'; $('msg').textContent = 'The public video link works over HTTPS without signing in.';
    } catch (e) { $('msg').textContent = 'Video link problem: ' + e.message; }
  }
  function instagram(p) {
    const box = el('section', { className: 'card' }, el('h2', { textContent: 'Instagram' }),
      el('div', { className: 'status ' + (p.connected ? 'on' : 'off'), textContent: p.connected ? `Connected: @${p.name}` : 'Not connected' }),
      el('div', { className: 'meta', textContent: p.live ? 'Live: approved posts are published here.' : 'Nothing is sent to Instagram now.' }));
    if (p.connected) {
      const at = Date.parse(p.expires), left = Math.floor((at - Date.now()) / 864e5), fb = p.type === 'PROFESSIONAL'; // Facebook (EAA) tokens are not renewed
      const life = at ? `Token valid until ${day(p.expires)} (${left} days)${fb ? ', not renewed automatically' : ', renewed automatically'}` : p.expires === 'never' ? 'Token does not expire' : 'Token expiry unknown: use Check connection';
      box.append(el('div', { className: 'meta', textContent: [p.type && `Account: ${p.type.replace('MEDIA_', '').toLowerCase()}`, life, p.refreshed && `last saved ${day(p.refreshed)}`].filter(Boolean).join(' · ') }));
      if (at && left < 10) box.append(el('div', { className: 'alert', textContent: at < Date.now() ? 'The token has expired: connect again.' : fb ? 'The token expires soon: paste a new one (add the app secret for a 60-day token).' : 'The token expires soon and has not renewed. Check the connection.' }));
    }
    if (p.error) box.append(el('div', { className: 'alert', textContent: `${p.error.message} (${when(p.error.at)})` }));
    const token = el('input', { type: 'password', placeholder: 'Instagram access token', autocomplete: 'off' }), secret = el('input', { type: 'password', placeholder: 'App secret (only for a short-lived token)', autocomplete: 'off' });
    box.append(el('div', {}, p.connected && btn('Check connection', () => send({ action: 'check' })), btn('Test video link', testLink)),
      el('details', {}, el('summary', { textContent: p.connected ? 'Replace token' : 'Connect Instagram' }),
        el('p', { className: 'meta', textContent: 'Needs a Business or Creator account. Paste an EAA… token (Meta Unified Login: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement) or an IG… token (Instagram Login: instagram_business_basic, instagram_business_content_publish). Connecting turns Dry Run on.' }),
        token, secret, btn('Connect', () => send({ action: 'connect', token: token.value, secret: secret.value }), 'primary')));
    return box;
  }
  function dryRun(d) {
    const on = d.dryRun, box = $('mode'); box.className = 'card ' + (on ? 'dry' : 'live');
    const stale = !d.lastTick || Date.now() - Date.parse(d.lastTick) > 36e5;
    const toggle = el('button', { type: 'button', className: 'switch', role: 'switch', onclick: () => (on ? askLive(d) : send({ action: 'dry_run', on: true })) }, el('span', {}));
    toggle.setAttribute('aria-checked', String(on)); toggle.setAttribute('aria-label', 'Dry Run');
    box.replaceChildren(el('div', {}, el('h2', { textContent: on ? 'Dry Run is ON' : 'Dry Run is OFF: LIVE' }),
      el('div', { textContent: on ? 'Safe mode: approved posts are only simulated. Nothing is published.' : d.instagram.live ? 'Approved posts are really published to Instagram.' : 'Instagram is not connected: nothing can be published.' }),
      el('div', { className: 'meta', textContent: d.lastTick ? `Publisher last checked ${when(d.lastTick)}${stale ? ' (over an hour ago: check the n8n publisher)' : ''}` : 'The publisher has not checked in yet.' })),
      el('label', { className: 'toggle' }, toggle, el('strong', { textContent: on ? 'ON' : 'OFF' })));
  }
  function askLive(d) {
    const approved = d.posts.filter((p) => p.status === 'scheduled'), recent = approved.filter((p) => Date.parse(p.slot) <= Date.now() && Date.parse(p.slot) > Date.now() - 6 * 36e5).length;
    const lines = [d.instagram.connected ? `Instagram: WILL publish as @${d.instagram.name}` : 'Instagram: not connected, stays simulated'];
    lines.push(`${approved.length} approved post(s) waiting for their time.`);
    if (recent) lines.push(`${recent} of them are due now and publish within minutes.`);
    $('golive-list').replaceChildren(...lines.map((textContent) => el('li', { textContent })));
    $('golive-ok').checked = false; $('golive-yes').disabled = true; $('golive').showModal();
  }
  $('golive-ok').addEventListener('change', (e) => { $('golive-yes').disabled = !e.target.checked; });
  $('golive-cancel').addEventListener('click', () => $('golive').close());
  $('golive-yes').addEventListener('click', () => { $('golive').close(); send({ action: 'dry_run', on: false, confirm: 'PUBLISH' }); });
  function signedOut() {
    $('app').hidden = true; $('login').hidden = false; data = null; progress(); $('tabs').replaceChildren(); $('list').replaceChildren(); $('platforms').replaceChildren(); $('mode').replaceChildren(); $('golive').close(); last = ''; editing = null;
  }
  $('signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, button = f.querySelector('button'); button.disabled = true; $('login-msg').textContent = '';
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.email.value, password: f.password.value, remember: f.remember.checked }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { f.reset(); $('login').hidden = true; await load(); } else $('login-msg').textContent = d.error || 'Sign-in failed.';
    } catch { $('login-msg').textContent = 'No connection. Try again.'; }
    button.disabled = false;
  });
  // someone is typing, watching a video or in a settings panel: do not redraw under them
  const busy = () => editing || document.activeElement?.matches('input, select, textarea') || [...document.querySelectorAll('video')].some((v) => !v.paused) || $('platforms').querySelector('details[open]');
  let loaded = 0;
  async function load(quiet) { // quiet = background check: the progress bar always updates, the rest only when not busy
    if (!$('login').hidden) return;
    loaded = Date.now();
    const r = await fetch('/api/marketing');
    if (r.status === 401) return signedOut();
    $('app').hidden = false;
    if (!r.ok) { $('msg').textContent = 'Could not load the queue.'; return; }
    const d = await r.json(), sig = JSON.stringify(d) + editing;
    data = d; progress();
    if (sig === last || (last && (quiet ? busy() : editing && last))) return; // do not restart videos that are playing
    last = sig; dryRun(d); $('platforms').replaceChildren(instagram(d.instagram));
    document.querySelectorAll('.owner').forEach((a) => { a.style.visibility = d.role === 'owner' ? '' : 'hidden'; });
    renderList();
  }
  load();
  // every 20 s, or every 5 s while something is being published
  setInterval(() => { if (!document.hidden && Date.now() - loaded > (data?.posts.some((p) => p.status === 'publishing') ? 4000 : 19000)) load(true); }, 5000);
})();

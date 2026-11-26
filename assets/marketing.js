// Marketing review queue (owner only). All text is inserted with textContent / value, never as HTML.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };
  const when = (s) => new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Beirut', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' Beirut';
  let editing = null, last = '';
  const NAMES = { instagram: 'Instagram', tiktok: 'TikTok' };
  const STATE = { starting: 'starting', processing: 'processing', publishing: 'publishing', published: 'published', failed: 'failed', dry_run: 'dry run, not posted' };
  const check = (label, checked, onchange, disabled) => el('label', { className: 'check' }, el('input', { type: 'checkbox', checked, disabled: !!disabled, onchange }), label);
  async function send(payload) {
    $('msg').textContent = ''; $('msg').className = '';
    const r = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.status === 401) return signedOut();
    if (!r.ok) { $('msg').textContent = (await r.json().catch(() => ({}))).error || 'Something went wrong.'; $('msg').scrollIntoView({ block: 'nearest' }); return false; }
    const d = await r.json().catch(() => ({}));
    editing = null; last = ''; await load(); if (d.notice) { $('msg').textContent = d.notice; $('msg').className = 'ok'; } return true;
  }
  const btn = (text, fn, cls = '') => el('button', { type: 'button', textContent: text, className: cls, onclick: fn });

  function editor(p) {
    const rows = p.post.scenes.map((s, i) => {
      const say = el('textarea', { value: s.say, rows: 2 }), title = el('input', { value: s.title }), chat = s.chat && el('input', { value: s.chat[1] });
      const items = s.items && el('textarea', { value: s.items.join('\n'), rows: s.items.length });
      return { get: () => ({ ...s, say: say.value, title: title.value, ...(chat ? { chat: [s.chat[0], chat.value] } : {}), ...(items ? { items: items.value.split('\n').map((x) => x.trim()).filter(Boolean) } : {}) }),
        node: el('fieldset', {}, el('legend', { textContent: 'Scene ' + (i + 1) }), el('label', {}, 'Spoken', say), el('label', {}, 'Title', title), chat && el('label', {}, 'Demo message', chat), items && el('label', {}, 'On-screen lines (one per line)', items)) };
    });
    const cap = el('textarea', { value: p.post.caption, rows: 4 }), tags = el('input', { value: p.post.hashtags.join(' ') });
    return el('div', {}, el('label', {}, 'Caption', cap), el('label', {}, 'Hashtags', tags), ...rows.map((r) => r.node),
      btn('Save', () => send({ action: 'edit', id: p.id, version: p.version, post: { scenes: rows.map((r) => r.get()), caption: cap.value, hashtags: tags.value.split(/\s+/).filter(Boolean) } }), 'primary'),
      btn('Cancel', () => { editing = null; last = ''; load(); }));
  }
  function targets(p) {
    const editable = ['rendering', 'review', 'scheduled'].includes(p.status);
    const box = el('div', { className: 'targets' }, el('span', { className: 'meta', textContent: 'Publish to' }));
    for (const n of Object.keys(NAMES)) {
      const s = p.pub?.[n];
      box.append(check(NAMES[n], p.effective.includes(n), (e) => {
        const next = Object.keys(NAMES).filter((x) => (x === n ? e.target.checked : p.effective.includes(x)));
        if (p.status === 'scheduled' && !confirm('Changing platforms clears the approval. Continue?')) { e.target.checked = !e.target.checked; return; }
        send({ action: 'targets', id: p.id, version: p.version, targets: next }).then((ok) => { if (!ok) { last = ''; load(); } });
      }, !editable));
      if (s) box.append(el('span', { className: 'chip ' + s.state, textContent: `${NAMES[n]}: ${STATE[s.state] || s.state}${s.error ? ' · ' + s.error : ''}` }));
    }
    return box;
  }
  // datetime-local value in Beirut time
  const local = (s) => new Date(s).toLocaleString('sv-SE', { timeZone: 'Asia/Beirut' }).slice(0, 16).replace(' ', 'T');
  const GROUPS = { review: 'Waiting for your approval', failed: 'Failed', publishing: 'Publishing now', scheduled: 'Approved, waiting for their time', rendering: 'Rendering', published: 'Published', declined: 'Declined' };
  function schedule(p) {
    const real = p.effective.filter((n) => p.live[n] && p.pub?.[n]?.state !== 'published').map((n) => NAMES[n]);
    const at = el('input', { type: 'datetime-local', value: local(p.slot) });
    const now = () => {
      if (real.length && !confirm(`Publish this post NOW, for real, on ${real.join(' and ')}? This cannot be undone.`)) return;
      send({ action: 'publish_now', id: p.id, version: p.version, confirm: real.length ? 'PUBLISH' : '' }).then((ok) => { if (!ok) { last = ''; load(); } });
    };
    return el('div', { className: 'schedule' }, el('div', { className: 'meta', textContent: real.length ? `At this time it is really published on ${real.join(' and ')}.` : 'At this time it is only simulated: nothing is posted.' }),
      el('label', {}, 'Publish time (Beirut)', at), btn('Save time', () => send({ action: 'reschedule', id: p.id, version: p.version, at: at.value })),
      btn(real.length ? 'Publish now' : 'Publish now (dry run)', now, 'primary'));
  }
  function card(p) {
    const open = ['rendering', 'review', 'scheduled', 'failed'].includes(p.status);
    const state = p.status === 'scheduled' ? `Approved · ${when(p.slot)}${p.dry_run_at ? ' · dry run done, nothing posted' : ''}` : p.status === 'review' ? 'Waiting for your approval' : p.status === 'rendering' ? (p.error ? `Last render failed (try ${p.attempts} of 3). Trying again automatically` : 'Rendering (usually within 15 to 30 minutes)') : p.status === 'failed' ? 'Failed' : p.status;
    const stuck = p.status === 'failed' && !p.has_video;
    const side = el('div', {}, el('h2', { textContent: p.post.scenes[0].say }), el('div', { className: 'meta', textContent: `${state} · version ${p.version}` }), p.error && el('div', { style: 'color:var(--bad)', textContent: `Error: ${p.error}` }));
    if (editing === p.id) side.append(editor(p));
    else side.append(el('p', { className: 'cap', textContent: p.captions.instagram }),
      p.captions.tiktok === p.captions.instagram ? '' : el('details', {}, el('summary', { textContent: 'TikTok caption' }), el('p', { className: 'cap', textContent: p.captions.tiktok })),
      p.post.keyword ? el('div', { className: 'meta', textContent: `Comment keyword: ${p.post.keyword} · ${p.post.info?.title || ''}` }) : '', targets(p), p.status === 'scheduled' ? schedule(p) : '', el('div', {},
      p.status === 'review' && btn('Approve', () => send({ action: 'approve', id: p.id, version: p.version }), 'primary'),
      p.status === 'failed' && p.has_video && btn('Try publishing again', () => send({ action: 'republish', id: p.id, version: p.version }), 'primary'),
      stuck && btn('Render again', () => send({ action: 'retry', id: p.id, version: p.version }), 'primary'),
      open && btn(p.status === 'failed' ? 'Edit and retry' : 'Edit', () => { editing = p.id; last = ''; load(); }),
      open && btn('Decline', () => confirm('Decline this post and delete its video?') && send({ action: 'decline', id: p.id }))));
    return el('article', { className: 'card post' }, p.has_video ? el('video', { src: `/api/marketing?video=${p.id}&v=${p.version}`, controls: true, playsInline: true, preload: 'metadata' }) : el('div', { className: 'meta', textContent: p.status === 'rendering' ? (p.error ? 'No video yet: waiting for the next try' : 'The video is being made') : stuck ? 'Render failed: no video' : 'No video stored' }), side);
  }
  function status(name, p, live) {
    const box = el('section', { className: 'card' }, el('h2', { textContent: NAMES[name] }),
      el('div', { className: 'status ' + (p.connected ? 'on' : 'off'), textContent: p.connected ? `Connected: @${p.name}` : 'Not connected' }),
      el('div', { className: 'meta', textContent: live ? 'Live: approved posts are published here.' : `Nothing is sent to ${NAMES[name]} now.` }));
    return box;
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
    const box = status('instagram', p, p.live);
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
      el('div', { textContent: on ? 'Safe mode: approved posts are only simulated. Nothing is published.' : `Approved posts are really published to: ${Object.keys(NAMES).filter((n) => d.platforms[n].live).map((n) => NAMES[n]).join(' and ') || 'no platform is ready'}.` }),
      el('div', { className: 'meta', textContent: d.lastTick ? `Publisher last checked ${when(d.lastTick)}${stale ? ' (over an hour ago: check the n8n publisher)' : ''}` : 'The publisher has not checked in yet.' })),
      el('label', { className: 'toggle' }, toggle, el('strong', { textContent: on ? 'ON' : 'OFF' })));
  }
  function askLive(d) {
    const approved = d.posts.filter((p) => p.status === 'scheduled'), recent = approved.filter((p) => Date.parse(p.slot) <= Date.now() && Date.parse(p.slot) > Date.now() - 6 * 36e5).length;
    const ready = { instagram: d.platforms.instagram.connected, tiktok: d.platforms.tiktok.connected && !!d.platforms.tiktok.options.privacy };
    const lines = Object.keys(NAMES).map((n) => (ready[n] ? `${NAMES[n]}: WILL publish as @${d.platforms[n].name}` : `${NAMES[n]}: not ready, stays simulated`));
    lines.push(`${approved.length} approved post(s) waiting for their time.`);
    if (recent) lines.push(`${recent} of them are due now and publish within minutes.`);
    $('golive-list').replaceChildren(...lines.map((textContent) => el('li', { textContent })));
    $('golive-ok').checked = false; $('golive-yes').disabled = true; $('golive').showModal();
  }
  $('golive-ok').addEventListener('change', (e) => { $('golive-yes').disabled = !e.target.checked; });
  $('golive-cancel').addEventListener('click', () => $('golive').close());
  $('golive-yes').addEventListener('click', () => { $('golive').close(); send({ action: 'dry_run', on: false, confirm: 'PUBLISH' }); });
  function tiktok(p) {
    const box = status('tiktok', p, p.live), o = p.options;
    if (p.connected && !o.privacy) box.append(el('div', { className: 'alert', textContent: 'Choose a privacy level below. Until then TikTok is only simulated.' }));
    const key = el('input', { placeholder: 'Client key', autocomplete: 'off' }), secret = el('input', { type: 'password', placeholder: 'Client secret', autocomplete: 'off' });
    const file = el('input', { placeholder: 'File name, e.g. tiktokAbc123.txt' }), line = el('input', { placeholder: 'tiktok-developers-site-verification=…' });
    const privacy = el('select', {}, el('option', { value: '', textContent: p.privacyChoices.length ? 'Choose who can see posts' : 'Connect first to load choices' }), ...p.privacyChoices.map((v) => el('option', { value: v, textContent: v.replaceAll('_', ' ').toLowerCase() })));
    privacy.value = o.privacy;
    const source = el('select', {}, el('option', { value: 'url', textContent: 'TikTok pulls the video from vagent.online (needs domain verification)' }), el('option', { value: 'file', textContent: 'Upload the file directly' }));
    source.value = o.source;
    const flags = { comment: check('Allow comments', o.comment), duet: check('Allow duet', o.duet), stitch: check('Allow stitch', o.stitch) };
    const on = (k) => flags[k].querySelector('input').checked;
    box.append(el('details', {}, el('summary', { textContent: p.connected ? 'Settings' : 'Connect TikTok' }),
      el('p', { className: 'meta', textContent: `1. In developers.tiktok.com add Login Kit and Content Posting API (Direct Post), scopes user.info.basic and video.publish, redirect URI ${p.redirect}. Until TikTok audits the app, posts can only be private.` }),
      key, secret, btn(p.app ? 'Replace app keys' : 'Save app keys', () => send({ action: 'tiktok_app', key: key.value, secret: secret.value })),
      el('p', { className: 'meta', textContent: '2. Log in with the TikTok account.' }),
      p.app && el('a', { href: '/api/marketing?tiktok=authorize', className: 'button', textContent: p.connected ? 'Log in again' : 'Log in with TikTok' }),
      el('p', { className: 'meta', textContent: '3. Posting settings' }), privacy, source, ...Object.values(flags),
      btn('Save settings', () => send({ action: 'tiktok_options', options: { privacy: privacy.value, source: source.value, comment: on('comment'), duet: on('duet'), stitch: on('stitch') } })),
      p.connected && btn('Reload account info', () => send({ action: 'tiktok_creator' })),
      el('p', { className: 'meta', textContent: `4. Domain verification: add the URL prefix https://vagent.online/hook/ in TikTok and paste its signature file here.${p.verify ? ' Served now: /hook/' + p.verify : ''}` }),
      file, line, btn('Save verification file', () => send({ action: 'tiktok_verify', file: file.value, content: line.value }))));
    return box;
  }
  function signedOut() {
    $('app').hidden = true; $('login').hidden = false; $('list').replaceChildren(); $('platforms').replaceChildren(); $('mode').replaceChildren(); $('golive').close(); last = ''; editing = null;
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
  async function load() {
    if ((editing && last) || !$('login').hidden) return;
    const r = await fetch('/api/marketing');
    if (r.status === 401) return signedOut();
    $('app').hidden = false;
    if (!r.ok) { $('msg').textContent = 'Could not load the queue.'; return; }
    const d = await r.json(), sig = JSON.stringify(d) + editing;
    if (sig === last) return; // do not restart videos that are playing
    last = sig; dryRun(d); $('platforms').replaceChildren(instagram(d.platforms.instagram), tiktok(d.platforms.tiktok));
    document.querySelectorAll('.owner').forEach((a) => { a.style.visibility = d.role === 'owner' ? '' : 'hidden'; });
    const live = Object.fromEntries(Object.keys(NAMES).map((n) => [n, d.platforms[n].live]));
    $('list').replaceChildren(...(d.posts.length ? d.posts.flatMap((p, i) => [p.status !== d.posts[i - 1]?.status && el('h2', { textContent: `${GROUPS[p.status] || p.status} (${d.posts.filter((x) => x.status === p.status).length})` }), card({ ...p, live })].filter(Boolean)) : [el('p', { textContent: 'No posts yet.' })]));
  }
  const back = new URLSearchParams(location.search).get('tiktok');
  if (back) { $('msg').textContent = back === 'connected' ? 'TikTok connected. It stays in dry run until you switch it live.' : 'TikTok: ' + back; history.replaceState(null, '', location.pathname); }
  load(); setInterval(() => { if (!document.hidden && !document.activeElement?.matches('input, select, textarea') && ![...document.querySelectorAll('video')].some((v) => !v.paused) && !$('platforms').querySelector('details[open]')) load(); }, 20000);
})();

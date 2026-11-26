// Marketing review queue (owner only). All text is inserted with textContent / value, never as HTML.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };
  const when = (s) => new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Beirut', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' Beirut';
  let editing = null, last = '';
  async function send(payload) {
    $('msg').textContent = '';
    const r = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { $('msg').textContent = (await r.json().catch(() => ({}))).error || 'Something went wrong.'; $('msg').scrollIntoView({ block: 'nearest' }); return false; }
    editing = null; last = ''; await load(); return true;
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
  function card(p) {
    const open = ['rendering', 'review', 'scheduled', 'failed'].includes(p.status);
    const state = p.status === 'scheduled' ? `Approved · ${when(p.slot)}${p.dry_run_at ? ' · dry run done, nothing posted' : ''}` : p.status === 'review' ? 'Waiting for your approval' : p.status === 'rendering' ? 'Rendering (usually within 15 to 30 minutes)' : p.status;
    const side = el('div', {}, el('h2', { textContent: p.post.scenes[0].say }), el('div', { className: 'meta', textContent: `${state} · version ${p.version}` }), p.error && el('div', { style: 'color:var(--bad)', textContent: p.error }));
    if (editing === p.id) side.append(editor(p));
    else side.append(el('p', { className: 'cap', textContent: p.post.caption + '\n\n' + p.post.hashtags.join(' ') }), el('div', {},
      p.status === 'review' && btn('Approve', () => send({ action: 'approve', id: p.id, version: p.version }), 'primary'),
      open && btn(p.status === 'failed' ? 'Edit and retry' : 'Edit', () => { editing = p.id; last = ''; load(); }),
      open && btn('Decline', () => confirm('Decline this post and delete its video?') && send({ action: 'decline', id: p.id }))));
    return el('article', { className: 'card post' }, p.has_video ? el('video', { src: `/api/marketing?video=${p.id}&v=${p.version}`, controls: true, playsInline: true, preload: 'metadata' }) : el('div', { className: 'meta', textContent: 'No video stored' }), side);
  }
  function instagram(d) {
    const box = $('ig'); box.replaceChildren(el('h2', { textContent: 'Instagram' }), el('div', { textContent: d.live ? `LIVE: approved posts are published to @${d.instagram}.` : 'Dry run: nothing is sent to Instagram.' }));
    if (d.live) box.append(btn('Switch to dry run', () => send({ action: 'live', on: false })));
    else if (d.instagram) box.append(btn(`Go live as @${d.instagram}`, () => confirm('Approved posts will really be published. Continue?') && send({ action: 'live', on: true }), 'primary'));
    const token = el('input', { type: 'password', placeholder: 'Instagram long-lived access token', autocomplete: 'off' });
    box.append(el('details', {}, el('summary', { textContent: d.instagram ? `Connected: @${d.instagram} (replace token)` : 'Connect Instagram' }), token, btn('Connect', () => send({ action: 'connect', token: token.value }))));
  }
  async function load() {
    if (editing && last) return;
    const r = await fetch('/api/marketing');
    if (r.status === 401) return location.assign('/');
    if (!r.ok) { $('msg').textContent = 'Could not load the queue.'; return; }
    const d = await r.json(), sig = JSON.stringify(d) + editing;
    if (sig === last) return; // do not restart videos that are playing
    last = sig; instagram(d);
    $('list').replaceChildren(...(d.posts.length ? d.posts.map(card) : [el('p', { textContent: 'No posts yet.' })]));
  }
  load(); setInterval(() => { if (!document.hidden && !document.querySelector('video:not([src=""])')?.matches(':hover') && ![...document.querySelectorAll('video')].some((v) => !v.paused) && !$('ig').querySelector('details[open]')) load(); }, 20000);
})();

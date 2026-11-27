// VSniperResearch — the four action buttons in the Sniper Client hunt chat. Talks only to /api/sniper/research. Drafts only: nothing is sent.
window.VSniperResearch = (() => {
  const STORE = 'vagent-sniper-research-v1';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = (u) => /^https?:\/\//i.test(u || '');
  const link = (u, label) => (safe(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u)}</a>` : esc(label || ''));
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  let S = { mode: '', form: {}, batch: null, audit: null, draft: null, proposal: null, ...load() };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} };
  let el = null, api = null, toast = () => {}, busy = '', error = '', job = 0;

  const MODES = [['find', '🎯 Find & Score Leads'], ['audit', '🔍 Deep Audit Company'], ['proposal', '📄 Generate Proposal'], ['draft', '✉️ Draft Outreach']];
  const v = (k, d = '') => esc(S.form[k] ?? d);
  const input = (k, label, ph, d = '') => `<label class="vr-f"><span>${label}</span><input class="input" data-k="${k}" value="${v(k, d)}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  const select = (k, label, opts) => `<label class="vr-f"><span>${label}</span><select class="input" data-k="${k}">${opts.map(([o, t]) => `<option value="${esc(o)}" ${S.form[k] === o ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const btn = (act, label, primary, extra = '') => `<button class="btn${primary ? ' primary' : ''}" type="button" data-vr="${act}" ${extra} ${busy ? 'disabled' : ''}>${label}</button>`;
  const copy = (key, label = 'Copy') => `<button class="btn vr-sm" type="button" data-vr="copy" data-key="${key}">${label}</button>`;

  // what proposal and outreach can be built from: the last audit and every scored lead
  const targets = () => [
    ...(S.audit ? [{ id: 'audit', name: S.audit.name, findings: S.audit.findings }] : []),
    ...(S.batch?.rows || []).map((l, i) => ({ id: 'lead' + i, name: l.name, findings: l.gaps || [] })).filter((t) => t.findings.length),
  ];
  const target = () => targets().find((t) => t.id === S.form.target) || targets()[0];
  const targetSelect = () => { const t = targets(); return t.length ? select('target', 'Company', t.map((x) => [x.id, x.name + (x.id === 'audit' ? ' (last audit)' : '')])) : '<p class="empty">Run Find &amp; Score Leads or Deep Audit first. Findings with evidence come from there.</p>'; };

  const tier = (l) => `<span class="vr-score ${esc(l.tier)}">${l.score}<small>${esc(l.tier)}</small></span>`;
  const parts = (p) => `Fit ${p.fit}/20 · Active ${p.active}/15 · Gap ${p.gap}/35 · Contact ${p.contact}/15 · Why now ${p.signal}/15`;
  const finding = (f) => `<li><b>${esc(f.text)}</b><span>Likely effect: ${esc(f.effect)}</span>${f.quotes ? f.quotes.filter(Boolean).map((q) => `<q>${esc(q)}</q>`).join('') : ''}<small>${link(f.url, 'Evidence ↗')} · checked ${esc(f.date)}</small></li>`;

  function findView() {
    const b = S.batch;
    return `<div class="vr-card">${input('query', 'Niche and city', 'dental clinics in Beirut')}
      ${select('n', 'How many leads', [['15', '15'], ['10', '10'], ['5', '5'], ['20', '20']])}
      <div class="vr-row">${btn('discover', 'Search Google Maps and score (1 SerpApi search)', true)}</div>
      <details data-k-open="list" ${S.form.list ? 'open' : ''}><summary>Or score my own list (free)</summary><label class="vr-f"><span>One website or Instagram link per line</span><textarea class="input" data-k="list" rows="4" placeholder="example-clinic.com&#10;instagram.com/another.clinic">${v('list')}</textarea></label>${btn('list', 'Score my list (free)')}</details></div>`
      + (!b ? '' : `<div class="vr-sum"><b>${esc(b.query || 'My list')}</b><span>${b.rows.length}${b.total > b.rows.length ? ' of ' + b.total : ''} scored · ${b.credits} SerpApi search used · ${esc(b.date)}</span></div>
      ${b.rows.length ? `<div class="vr-row">${btn('csv', '⬇ Download CSV', true)}${btn('top', '✉️ Draft openers for top 5')}</div>` : ''}
      ${b.rows.map((l, i) => `<article class="vr-lead"><header>${tier(l)}<div><b>${esc(l.name)}</b><small>${esc(l.websiteStatus)} · confidence ${esc(l.confidence)}${l.rating ? ` · ${l.rating}★ (${l.reviews})` : ''}</small></div></header>
        <p>${esc(l.topGap)}</p><details><summary>Score, contact and evidence</summary><p>${parts(l.parts)}</p><p>${[l.phone, l.email, l.address].filter(Boolean).map(esc).join(' · ') || 'No contact verified.'}</p>
        <ul class="vr-findings">${l.gaps.map(finding).join('') || '<li>No gap proven.</li>'}</ul><p>${l.evidence.map((u, k) => link(u, 'Source ' + (k + 1) + ' ↗')).join(' · ')}</p></details>
        ${l.opener ? `<pre class="vr-text">${esc((l.opener.subject ? 'Subject: ' + l.opener.subject + '\n\n' : '') + l.opener.opener)}</pre><div class="vr-row">${copy('opener:' + i, 'Copy opener')}<small>Draft, not sent</small></div>` : ''}
        <div class="vr-row">${l.gaps.length ? btn('opener', l.opener ? 'Redraft opener' : 'Draft opener', false, `data-i="${i}"`) : ''}${l.website || l.name ? btn('deep', 'Deep audit', false, `data-i="${i}"`) : ''}</div></article>`).join('') || (busy ? '' : '<p class="empty">No leads found.</p>')}`);
  }

  function auditView() {
    const a = S.audit;
    return `<div class="vr-card">${input('company', 'Company name or website', 'company.com, @handle or the business name')}${input('area', 'City (for Google Maps)', 'Beirut')}
      <div class="vr-row">${btn('audit', 'Audit website (free)', true)}${btn('auditPaid', 'Audit + reviews + competitors (up to 3 SerpApi searches)')}</div></div>`
      + (!a ? '' : `<article class="vr-lead"><header>${tier(a)}<div><b>${esc(a.name)}</b><small>${a.website ? link(a.website) : 'No website checked'}${a.listing?.rating ? ` · ${a.listing.rating}★ (${a.listing.reviews})` : ''} · ${a.credits} SerpApi searches used</small></div></header><p>${parts(a.parts)}</p>
      <p>${[a.contact.phone, a.contact.email].filter(Boolean).map(esc).join(' · ')} ${a.contact.whatsapp ? link(a.contact.whatsapp, 'WhatsApp ↗') : ''} ${(a.contact.socials || []).map((u) => link(u, 'Social ↗')).join(' ')} ${a.listing ? link(a.listing.url, 'Maps listing ↗') : ''}</p></article>
      <p class="label">Top findings (${a.findings.length})</p><ul class="vr-findings">${a.findings.map(finding).join('') || '<li>No problem could be proven with evidence.</li>'}</ul>
      ${a.checks ? `<details><summary>Website, mobile, booking and SEO checks</summary><dl class="vr-dl">${Object.entries(a.checks).map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl><ul class="vr-findings">${a.otherFindings.map(finding).join('')}</ul></details>` : ''}
      ${a.competitors.length ? `<details open><summary>Local competitors (observed)</summary>${a.competitors.map((c) => `<p><b>${esc(c.name)}</b> ${c.rating ? `${c.rating}★ (${c.reviews})` : ''}<br><small>${c.website ? link(c.website, 'Website ↗') : 'No website listed'} · booking: ${yn(c.booking)} · tap-to-call/WhatsApp: ${yn(c.contact)} · mobile setting: ${yn(c.mobile)} ${link(c.url, '· Maps ↗')}</small></p>`).join('')}</details>` : ''}
      <details><summary>Not verified</summary><ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>
      <div class="vr-row">${a.findings.length ? btn('goDraft', '✉️ Draft Outreach', true) + btn('goProposal', '📄 Generate Proposal') : ''}${copy('report', 'Copy report')}</div>`);
  }
  const yn = (x) => (x == null ? 'unverified' : x ? 'yes' : 'no');

  function draftView() {
    const d = S.draft;
    return `<div class="vr-card">${targetSelect()}${select('channel', 'Channel', [['email', 'Cold email'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram DM']])}${select('language', 'Language', [['English', 'English'], ['Arabic', 'Arabic'], ['French', 'French']])}
      <div class="vr-row">${target() ? btn('draft', 'Write opener + 2 follow-ups', true) : ''}</div></div>`
      + (!d ? '' : `<p class="label">Draft, not sent · ${esc(d.name)}</p>${d.note ? `<p class="help">${esc(d.note)}</p>` : ''}
      ${[['subject', 'Subject'], ['opener', 'Opener'], ['followup1', 'Follow-up 1'], ['followup2', 'Follow-up 2']].filter(([k]) => d[k]).map(([k, t]) => `<div class="vr-lead"><div class="vr-row"><b>${t}</b>${copy('draft:' + k)}</div><pre class="vr-text">${esc(d[k])}</pre></div>`).join('')}
      <p class="help">Check the evidence before sending: ${d.evidence.map((u, i) => link(u, 'Source ' + (i + 1) + ' ↗')).join(' · ')}</p><div class="vr-row">${copy('draft:all', 'Copy all')}</div>`);
  }

  function proposalView() {
    const p = S.proposal;
    return `<div class="vr-card">${targetSelect()}${select('service', 'Service', [['', 'Best match for the findings'], ['web', 'Web development'], ['uiux', 'UI/UX design'], ['automation', 'AI automation']])}
      <div class="vr-two">${input('price', 'Total price (your number)', 'leave empty for [PRICE]')}${select('currency', 'Currency', [['USD', 'USD'], ['EUR', 'EUR'], ['LBP', 'LBP']])}</div>${input('timeline', 'Timeline', 'for example: 3 weeks')}
      <div class="vr-row">${target() ? btn('proposal', 'Generate proposal (free)', true) : ''}</div></div>`
      + (!p ? '' : `<p class="label">Draft, not sent</p>${p.missing.length ? `<p class="help vr-warn">Fill before sending: ${p.missing.map(esc).join(', ')}</p>` : ''}
      <label class="vr-f"><span>Proposal (you can edit it)</span><textarea class="input vr-doc" data-vr-doc rows="18">${esc(p.text)}</textarea></label>
      <div class="vr-row">${copy('proposal')}${btn('word', '⬇ Word', true)}${btn('md', '⬇ Text')}${btn('print', 'Print / PDF')}</div>`);
  }

  function paint() {
    if (!el?.isConnected) return;
    const view = { find: findView, audit: auditView, draft: draftView, proposal: proposalView }[S.mode];
    el.innerHTML = `<div class="vr-actions" role="group" aria-label="Research actions">${MODES.map(([m, t]) => `<button type="button" class="pick" data-vr="mode" data-mode="${m}" aria-pressed="${S.mode === m}">${t}</button>`).join('')}</div>
      ${view ? `<div class="vr-panel"><div class="vr-row vr-top"><small>Research only. Nothing is ever sent.</small><button type="button" class="btn vr-sm" data-vr="mode" data-mode="">Close</button></div>
      <div class="vr-status" aria-live="polite">${busy ? `<p class="vr-busy"><span>${esc(busy)}</span><button type="button" class="btn vr-sm" data-vr="stop">Stop</button></p>` : ''}${error ? `<p class="vr-err">${esc(error)}</p>` : ''}</div>${view()}</div>` : ''}`;
  }
  const call = (b) => api('sniper/research', { body: b });
  const progress = (t) => { busy = t; paint(); };
  async function task(label, fn) {
    if (busy) return; const me = ++job; error = ''; progress(label);
    try { await fn(() => me === job); } catch (e) { if (me === job) error = e.message; }
    if (me === job) { busy = ''; save(); paint(); }
  }

  // free website checks, three at a time
  async function scoreAll(leads, query, live) {
    let next = 0, done = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (next < leads.length && live()) {
        const lead = leads[next++];
        let row; try { row = (await call({ action: 'score', lead, query })).lead; } catch (e) { error = 'Some sites could not be checked: ' + e.message; }
        if (!live()) return;
        if (row) { S.batch.rows.push(row); S.batch.rows.sort((a, b) => b.score - a.score); save(); }
        progress(`Checking websites ${++done}/${leads.length}…`);
      }
    }));
  }
  const newBatch = (query, total, credits) => { S.batch = { query, total, credits, date: new Date().toISOString().slice(0, 10), rows: [] }; S.form.target = ''; };

  const draftFor = async (t, channel, language) => ({ ...(await call({ action: 'outreach', name: t.name, channel, language, findings: t.findings })).draft, name: t.name });
  const channelOf = (l) => (l.email ? 'email' : l.websiteStatus === 'Social only' ? 'instagram' : 'whatsapp');

  // CSV: quoted, and cells that a spreadsheet would run as a formula get a leading '
  const cell = (x) => { let t = String(x ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  function csv() {
    const head = 'score,tier,business,category,area,website_status,website_url,social_urls,phone,email,top_gap,evidence_urls,why_prospect,confidence,verified_date,notes,opener_draft';
    const rows = S.batch.rows.map((l) => [l.score, l.tier, l.name, l.type, l.address, l.websiteStatus, l.website, (l.socials || []).join(' '), l.phone, l.email, l.topGap, l.evidence.join(' '), l.gaps[0] ? l.gaps[0].effect + ' (inference)' : '', l.confidence, l.checked, parts(l.parts), l.opener?.opener || ''].map(cell).join(','));
    return '﻿' + [head, ...rows].join('\r\n');
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const slug = (t) => String(t || 'leads').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'leads';
  function docHtml(md) {
    const out = []; let list = false, table = false;
    for (const line of md.split('\n')) {
      const li = line.startsWith('- '), tr = line.startsWith('|');
      if (list && !li && !line.startsWith('  ')) { out.push('</ul>'); list = false; }
      if (table && !tr) { out.push('</table>'); table = false; }
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${esc(line.slice(2))}</li>`); }
      else if (tr) { if (/^\|\s*-/.test(line)) continue; if (!table) { out.push('<table border="1" cellpadding="6" style="border-collapse:collapse">'); table = true; } out.push('<tr>' + line.split('|').slice(1, -1).map((c) => `<td>${esc(c.trim())}</td>`).join('') + '</tr>'); }
      else if (line.startsWith('# ')) out.push(`<h1>${esc(line.slice(2))}</h1>`);
      else if (line.startsWith('## ')) out.push(`<h2>${esc(line.slice(3))}</h2>`);
      else if (line.trim()) out.push(`<p>${esc(line.trim())}</p>`);
    }
    if (list) out.push('</ul>'); if (table) out.push('</table>');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(S.proposal.filename)}</title><style>body{font-family:Inter,Arial,sans-serif;color:#141413;max-width:700px;margin:32px auto;padding:0 20px;line-height:1.5}h1,h2{font-family:Newsreader,Georgia,serif;font-weight:500}h2{color:#B5532F;font-size:18px}p,li{overflow-wrap:anywhere}</style></head><body><img src="${location.origin}/assets/brand/lockup.svg" alt="VAgent" width="140">${out.join('')}</body></html>`;
  }
  const report = (a) => [`${a.name} (${a.date}) score ${a.score}/100 ${a.tier}`, a.website, ...a.findings.map((f, i) => `${i + 1}. ${f.text} Likely effect: ${f.effect}\n   Evidence: ${f.url}`), 'Not verified: ' + a.notes.join(' ')].filter(Boolean).join('\n');
  function textFor(key) {
    const [k, x] = key.split(':'), d = S.draft;
    if (k === 'opener') { const o = S.batch.rows[x].opener; return (o.subject ? 'Subject: ' + o.subject + '\n\n' : '') + o.opener; }
    if (k === 'draft') return x === 'all' ? [d.subject && 'Subject: ' + d.subject, d.opener, '--- Follow-up 1 ---\n' + d.followup1, '--- Follow-up 2 ---\n' + d.followup2].filter(Boolean).join('\n\n') : d[x];
    return k === 'proposal' ? S.proposal.text : report(S.audit);
  }

  const ACT = {
    mode: (b) => { S.mode = S.mode === b.dataset.mode ? '' : b.dataset.mode; error = ''; save(); paint(); },
    stop: () => { job++; busy = ''; save(); paint(); },
    discover: () => task('Searching Google Maps…', async (live) => {
      const query = (S.form.query || '').trim(); if (query.length < 3) throw new Error('Type a niche and a city first.');
      const r = await call({ action: 'discover', query, n: S.form.n || 15, paid: true }); if (!live()) return;
      newBatch(query, r.leads.length, r.credits); progress(`Checking websites 0/${r.leads.length}…`); await scoreAll(r.leads, query, live);
    }),
    list: () => task('Checking websites…', async (live) => {
      const lines = [...new Set((S.form.list || '').split(/[\n,]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
      if (!lines.length) throw new Error('Paste at least one website or Instagram link.');
      const query = (S.form.query || '').trim(); newBatch(query, lines.length, 0); await scoreAll(lines.map((website) => ({ website, source: 'list' })), query, live);
    }),
    csv: () => download(`sniper-${slug(S.batch.query)}-${S.batch.date}.csv`, csv(), 'text/csv;charset=utf-8'),
    opener: (b) => task('Writing the opener…', async () => { const l = S.batch.rows[b.dataset.i]; l.opener = await draftFor({ name: l.name, findings: l.gaps }, channelOf(l)); }),
    top: () => task('Writing openers…', async (live) => {
      const top = S.batch.rows.filter((l) => l.gaps.length).slice(0, 5);
      for (let i = 0; i < top.length && live(); i++) { progress(`Writing opener ${i + 1}/${top.length}…`); top[i].opener = await draftFor({ name: top[i].name, findings: top[i].gaps }, channelOf(top[i])); save(); }
    }),
    deep: (b) => { const l = S.batch.rows[b.dataset.i]; S.form.company = l.website || l.name; S.form.area = (S.batch.query.match(/\s(?:in|near)\s+(.+)$/i) || [])[1] || S.form.area || ''; S.mode = 'audit'; error = ''; save(); paint(); el.scrollIntoView({ block: 'start' }); },
    audit: () => runAudit(false), auditPaid: () => runAudit(true),
    goDraft: () => { S.form.target = 'audit'; S.mode = 'draft'; save(); paint(); },
    goProposal: () => { S.form.target = 'audit'; S.mode = 'proposal'; save(); paint(); },
    draft: () => task('Writing drafts… up to a minute', async () => { S.draft = await draftFor(target(), S.form.channel || 'email', S.form.language || 'English'); }),
    proposal: () => task('Building the proposal…', async () => {
      const t = target(), service = S.form.service || t.findings.find((f) => f.service)?.service || 'web';
      S.proposal = (await call({ action: 'proposal', name: t.name, service, findings: t.findings, price: S.form.price, currency: S.form.currency || 'USD', timeline: S.form.timeline })).proposal;
    }),
    word: () => download(S.proposal.filename + '.doc', '﻿' + docHtml(S.proposal.text), 'application/msword'),
    md: () => download(S.proposal.filename + '.md', S.proposal.text, 'text/markdown;charset=utf-8'),
    print: () => { const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print, or use the Word download.'); w.document.write(docHtml(S.proposal.text)); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); },
    copy: async (b) => { try { await navigator.clipboard.writeText(textFor(b.dataset.key)); toast('Copied. Nothing was sent.'); } catch { toast('Could not copy. Select the text and copy it.'); } },
  };
  function runAudit(paid) {
    task(paid ? 'Auditing website, reviews and competitors… up to a minute or two' : 'Auditing the website…', async (live) => {
      const company = (S.form.company || '').trim(); if (company.length < 2) throw new Error('Enter a company name or website first.');
      const r = await call({ action: 'audit', input: company, area: S.form.area || '', paid }); if (!live()) return;
      S.audit = r.audit; S.form.target = 'audit'; S.draft = null; S.proposal = null;
    });
  }

  function mount(node, o) {
    el = node; api = o.api; toast = o.toast || toast;
    el.onclick = (e) => { const b = e.target.closest('[data-vr]'); if (!b) return; e.preventDefault(); e.stopPropagation(); ACT[b.dataset.vr]?.(b); };
    el.oninput = el.onchange = (e) => {
      if (e.target.dataset.k) { S.form[e.target.dataset.k] = e.target.value; save(); }
      if ('vrDoc' in e.target.dataset) { S.proposal.text = e.target.value; S.proposal.missing = [...new Set(e.target.value.match(/\[[A-Z][A-Za-z ]+\]/g) || [])]; save(); }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input[data-k]')) { e.preventDefault(); if (S.mode === 'audit') runAudit(false); } }; // Enter never spends credit
    paint();
  }
  return { mount };
})();

// Pure logic for the Netlify pool card (tested by scripts/netlify-test.mjs).
const STALE = 25 * 60000; // the status workflow runs every 10 minutes
const LIMIT = /HTTP 402|(usage|credits?|bandwidth|build.?minutes?|plan|account|team|deploy|site|project)s?[ _-]*(limit|quota)|(limit|quota)[ _-]*(reached|exceeded)|exceeded.{0,40}(limit|quota|usage|credit|bandwidth)|out of credits|insufficient credits/i;
const kindOf = (text) => (LIMIT.test(text) ? 'limit' : /HTTP 40[13]|credential/i.test(text) ? 'auth' : /HTTP 429/.test(text) ? 'rate' : 'other');

// "... Problems: main upload: HTTP 402 ...; b2 find: HTTP 401 ..." (written by the pool) -> one entry per account
export function problems(text, at, labels) {
  const out = [], found = String(text || '').split(/Problems: | Error: /).slice(1).join('; ');
  for (const part of found.split(/;\s*|\s\[/)) {
    const m = part.match(/^(.+?) (verify|find|create|upload|build|status|poll): (.+?)\]?$/);
    if (m && labels.includes(m[1])) out.push({ label: m[1], at, step: m[2], reason: m[3].replace(/\. Error:.*$/, '').slice(0, 220), kind: kindOf(m[3]) });
  }
  return out;
}

export function view(snapshot, sites, log, now = Date.now()) {
  const list = snapshot.accounts || [], labels = list.map((a) => a.label);
  const errors = [...(sites || []).flatMap((r) => problems(r.detail, r.updatedAt || r.createdAt, labels)),
    ...(log || []).filter((r) => r.step === 'Netlify').flatMap((r) => problems(r.message, r.createdAt, labels))].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const accounts = list.map((a, i) => {
    const own = (sites || []).filter((r) => r.account === a.label);
    // newest successful deploy through the pool: from the owner table, or a log line naming the account without an error
    const ok = [...own.filter((r) => r.status === 'ready').map((r) => r.updatedAt || r.createdAt),
      ...(log || []).filter((r) => r.step === 'Netlify' && String(r.message).startsWith('Netlify account: ' + a.label) && !/ Error: /.test(r.message)).map((r) => r.createdAt)]
      .sort((x, y) => Date.parse(y) - Date.parse(x))[0] || null;
    // an error counts until a later successful deploy on that account, or until the next usage period starts
    const since = Math.max(Date.parse(a.periodStart) || now - 30 * 864e5, Date.parse(ok) || 0);
    const open = errors.filter((e) => e.label === a.label && Date.parse(e.at) > since);
    const last = errors.find((e) => e.label === a.label) || null;
    // Netlify's "used" field stays 0 even after production deploys, so only a number above 0 is shown as real usage
    const used = a.creditsUsed > 0 ? a.creditsUsed : null;
    const flagged = a.ok && (a.usagesExceeded?.length ? 'Netlify reports exceeded: ' + a.usagesExceeded.join(', ')
      : a.sitesExceeded ? 'Netlify reports ' + a.sitesExceeded + ' site(s) over usage'
      : a.daysUntilDisabled != null ? 'Netlify will disable this team in ' + a.daysUntilDisabled + ' day(s)'
      : a.state && a.state !== 'active' ? 'Account state: ' + a.state
      : used != null && a.creditsIncluded && used >= a.creditsIncluded ? 'All plan credits are used' : '');
    const limit = open.find((e) => e.kind === 'limit'), auth = open.find((e) => e.kind === 'auth');
    let status = 'available', reason = 'No limit flag from Netlify and no open limit error from deploys.';
    if (flagged) { status = 'limit'; reason = flagged; }
    else if (limit) { status = 'limit'; reason = 'A deploy was refused: ' + limit.reason; }
    else if (a.code === 401 || a.code === 403 || (!a.ok && auth)) { status = 'token'; reason = 'Netlify refused this account\'s token.'; }
    else if (a.code === 402) { status = 'limit'; reason = a.error; }
    else if (!a.ok) { status = 'unknown'; reason = a.error || 'Could not check this account.'; }
    else if (auth) { status = 'token'; reason = 'A deploy was refused: ' + auth.reason; }
    return { order: i + 1, label: a.label, status, reason, plan: a.plan || '', creditsIncluded: a.creditsIncluded ?? null, creditsUsed: used,
      periodEnd: a.periodEnd || null, sites: a.sites ?? null, published: a.published ?? null, buildMinutes: a.buildMinutes ?? null, bandwidthBytes: a.bandwidthBytes ?? null,
      poolSites: sites ? own.length : null, lastDeploy: ok, lastError: last && { at: last.at, step: last.step, reason: last.reason, open: open.includes(last) } };
  });
  return { checkedAt: snapshot.checkedAt, stale: !(now - Date.parse(snapshot.checkedAt) < STALE), sitesKnown: !!sites, logKnown: !!log, accounts };
}

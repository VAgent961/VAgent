import { readSession, json, sql } from './_lib.js';

// ONE Pages project serves every experience; the Host header decides which one (Cloudflare custom domains all point at this project):
//   city.vagent.online / *.pages.dev     -> the company HQ (sign-in page, /office, /marketing, /api/* with the owner session)
//   vagent.online / www                   -> a blank white page (the new company site comes later) + the few addresses that must keep working
//   adminvoice.vagent.online              -> the Client Admin Portal (admin-voice.html at /, /api/client/* with the client session)
//   voice.vagent.online/<slug>            -> the public Voice AI call page of business <slug> (no DNS change needed per client)
//   <sub>.vagent.online (e.g. voice1.)    -> the public call page of the client whose client_accounts.custom_subdomain = that host, served at /
// Non-HQ hosts have an allow-list: nothing of the HQ (office, owner APIs) is reachable there.
const BASE = 'vagent.online', ADMIN_HOST = 'adminvoice.vagent.online', VOICE_HOST = 'voice.vagent.online', APP_HOST = 'city.vagent.online';
const RESERVED = new Set(['city', 'www', 'adminvoice', 'voice', 'api', 'admin', 'mail', 'app', 'hq', 'office', 'call', 'login', 'static', 'assets', 'ftp', 'n8n', 'hassan', 'boudy', 'fayez']);
const isStatic = (p) => p.startsWith('/assets/') || /^\/(favicon\.ico|favicon-32x32\.png|apple-touch-icon\.png|icon-192\.png|icon-512\.png)$/.test(p);
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const isDev = (h) => h === 'localhost' || h === '127.0.0.1';

// Serve a static page under another URL (clean-URL paths: /call -> call.html).
async function page(env, request, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, request.url).toString(), { headers: request.headers }));
  const h = new Headers(r.headers); h.set('Cache-Control', 'no-store');
  return new Response(r.body, { status: r.status, headers: h });
}

export async function onRequest(context) {
  const { request, env } = context, url = new URL(request.url), host = url.hostname.toLowerCase(), path = url.pathname;
  if (host === BASE || host === 'www.' + BASE) return landingHost(context, url, path);
  if (host === APP_HOST) return mainSite(context, host, path);
  if (host === ADMIN_HOST) return adminHost(context, path);
  if (host === VOICE_HOST) return voiceHost(context, path);
  const sub = host.endsWith('.' + BASE) ? host.slice(0, -(BASE.length + 1)) : '';
  if (sub && !sub.includes('.') && !RESERVED.has(sub)) return clientHost(context, host, path);
  return mainSite(context, host, path);
}

// The main domain: blank until the new company site is built. Kept: n8n/render hooks and public call-page embeds (they cannot
// rely on a redirect: POSTs, and the iframe microphone permission), plus a redirect for old /office and /marketing bookmarks.
const BLANK = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>VAgent</title><link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg"><style>html,body{margin:0;background:#fff}</style></head><body></body></html>';
function landingHost({ next }, url, path) {
  if (path === '/' || path === '/index.html') return new Response(BLANK, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (/^\/(office|marketing)(\.html|\/.*)?$/.test(path)) return Response.redirect('https://' + APP_HOST + path + url.search, 302);
  if (path.startsWith('/hook/') || path.startsWith('/api/public-') || path === '/call' || path === '/call.html' || isStatic(path)) return next();
  return notFound();
}
function adminHost({ env, request, next }, path) {
  if (path === '/' || path === '/admin-voice' || path === '/admin-voice.html') return page(env, request, '/admin-voice');
  if (path.startsWith('/api/client/') || isStatic(path)) return next();   // client routes do their own session + Origin checks
  return notFound();
}
function voiceHost({ env, request, next }, path) {
  if (path === '/') return Response.redirect('https://' + BASE + '/', 302);
  if (/^\/[a-z0-9-]{1,40}\/?$/i.test(path)) return page(env, request, '/call');   // call.html reads the slug from the path
  if (path.startsWith('/api/public-') || isStatic(path)) return next();
  return notFound();
}
async function clientHost({ env, request, next }, host, path) {
  if (path.startsWith('/api/public-') || isStatic(path)) return next();
  if (path !== '/') return notFound();
  try { if (!(await sql(env, 'SELECT 1 FROM client_accounts WHERE custom_subdomain = $1', [host])).length) return notFound(); } catch { return notFound(); }
  return page(env, request, '/call');   // call.html finds its business with /api/public-business?host=<this host>
}

// The owner sign-in, served in place (no redirect), so /office keeps its address and opens right after login.
async function signIn(env, request, marketing) {
  const r = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString()));
  const html = await r.text(), h = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  return new Response(marketing ? html.replace('<body>', '<body data-marketing>') : html, { status: r.status, headers: h });
}

// The company HQ: guards /office and /api/* (sets data.owner); signed-in owners skip the sign-in page.
async function mainSite({ request, env, next, data }, host, path) {
  if (path.startsWith('/api/client/')) return isDev(host) ? next() : notFound();   // the client portal API exists only on adminvoice.vagent.online
  const isOffice = path === '/office' || path.startsWith('/office/') || path === '/office.html';
  const isMarketing = path === '/marketing' || path === '/marketing.html'; // open page: it shows its own sign-in screen, its data needs a session
  const isLogin = path === '/' || path === '/index.html';
  // /api/public-* are open on purpose (the public call page); each one has its own Origin check + rate limit.
  const isApi = path.startsWith('/api/') && path !== '/api/login' && path !== '/api/logout' && !path.startsWith('/api/public-');
  if (!isOffice && !isLogin && !isApi && !isMarketing) return next();
  let session = await readSession(env, request);
  if (session?.s === 'mk' && session.e !== env.MARKETING_EMAIL?.toLowerCase()) session = null; // account removed or changed
  if (session?.s === 'mk') { // marketing only: no office, no other API. /office and / show the owner sign-in.
    if (isOffice) return signIn(env, request, true);
    if (isApi && path !== '/api/marketing') return json({ error: 'Not allowed.' }, 403);
    data.owner = session.e; data.role = 'marketing'; data.access_depts = [];
  }
  if (isApi && !session) return json({ error: 'Please sign in again.' }, 401);
  if (isOffice && !session) return signIn(env, request, false);
  if (isLogin && session && session.s !== 'mk') return Response.redirect(new URL('/office', request.url).toString(), 302);
  if (session && session.s !== 'mk') {
    data.owner = session.e;
    try {
      const rows = await sql(env, 'SELECT role, access_depts FROM vagent_owners WHERE email = $1', [session.e]);
      data.role = rows[0]?.role || 'owner';
      const txt = rows[0]?.access_depts || '';
      data.access_depts = txt ? txt.split(',').map(Number).filter(Boolean) : [];
    } catch { data.role = 'owner'; data.access_depts = []; }
  }
  if (isLogin && session?.s === 'mk') return signIn(env, request, true);
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

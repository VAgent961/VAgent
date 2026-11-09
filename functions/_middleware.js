import { readSession, json } from './_lib.js';

// Guards the site: /office and /api/* need an owner session; signed-in owners skip the sign-in page.
export async function onRequest({ request, env, next, data }) {
  const path = new URL(request.url).pathname;
  const isOffice = path === '/office' || path.startsWith('/office/') || path === '/office.html';
  const isLogin = path === '/' || path === '/index.html';
  const isApi = path.startsWith('/api/') && path !== '/api/login' && path !== '/api/logout';
  if (!isOffice && !isLogin && !isApi) return next();
  const session = await readSession(env, request);
  if (isApi && !session) return json({ error: 'Please sign in again.' }, 401);
  if (isOffice && !session) return Response.redirect(new URL('/', request.url).toString(), 302);
  if (isLogin && session) return Response.redirect(new URL('/office', request.url).toString(), 302);
  if (session) data.owner = session.e;
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

import { readSession } from './_lib.js';

// Guards the site: /office needs a valid owner session; signed-in owners skip the sign-in page.
export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  const isOffice = path === '/office' || path.startsWith('/office/') || path === '/office.html';
  const isLogin = path === '/' || path === '/index.html';
  if (!isOffice && !isLogin) return next();
  const session = await readSession(env, request);
  if (isOffice && !session) return Response.redirect(new URL('/', request.url).toString(), 302);
  if (isLogin && session) return Response.redirect(new URL('/office', request.url).toString(), 302);
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

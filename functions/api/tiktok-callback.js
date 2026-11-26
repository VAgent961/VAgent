import { finishConnect } from '../_tiktok.js';

// TikTok Login Kit redirects here (signed-in users only; the middleware checks the session cookie).
export async function onRequestGet({ request, env, data }) {
  const q = new URL(request.url).searchParams;
  let result = 'connected';
  try {
    if (data.role !== 'owner' && data.role !== 'marketing') throw new Error('Not allowed');
    if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
    await finishConnect(env, q.get('code') || '', q.get('state') || '', String(data.owner));
  } catch (e) { result = e.message.slice(0, 160); }
  return Response.redirect(new URL('/marketing?tiktok=' + encodeURIComponent(result), request.url).toString(), 302);
}

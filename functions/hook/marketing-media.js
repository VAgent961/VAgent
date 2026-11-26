import { video, mediaSig } from '../_marketing.js';

// Short-lived signed video link, used only by Instagram while publishing.
export async function onRequest({ request, env }) {
  const q = new URL(request.url).searchParams, id = q.get('id') || '', exp = Number(q.get('exp'));
  if (!(exp > Date.now() / 1000) || q.get('sig') !== await mediaSig(env, id, exp)) return new Response('Not found', { status: 404 });
  return video(env, request, id);
}

import { json, bad, body } from '../_lib.js';
import * as mk from '../_marketing.js';
import { tick } from '../_publish.js';

// POST /hook/marketing
//  - n8n publisher: header X-VAgent-Secret, {action:"tick"}
//  - render job (GitHub Actions OIDC token): ?action=chunk (raw bytes) or {action: seed|queue|complete|fail}
// GET: {posts: [{id, status}]} and nothing else.
export async function onRequestGet({ env }) {
  await mk.schema(env);
  return json({ posts: await mk.states(env) });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const secret = request.headers.get('X-VAgent-Secret') || '';
  if (env.WEBHOOK_SECRET && secret === env.WEBHOOK_SECRET) {
    const b = await body(request);
    if (b.action !== 'tick') return bad('Unknown action');
    await mk.schema(env); return json(await tick(env));
  }
  if (!(await mk.isRenderer(request))) return bad('Not allowed', 401);
  await mk.schema(env);
  const q = url.searchParams;
  if (q.get('action') === 'chunk') {
    const err = await mk.putChunk(env, q.get('id'), Number(q.get('version')), Number(q.get('n')), new Uint8Array(await request.arrayBuffer()));
    return err ? bad(err, 409) : json({ ok: true });
  }
  const b = await body(request);
  if (b.action === 'seed') { const posts = Array.isArray(b.posts) ? b.posts.slice(0, 1000) : []; await mk.seed(env, posts); await mk.relook(env, b.look, posts); return json({ ok: true, sync: 2 }); }
  if (b.action === 'queue') return json({ posts: await mk.queue(env), chunk: mk.CHUNK });
  if (b.action === 'complete') { const err = await mk.complete(env, b.id, b.version, String(b.sha), b.size); return err ? bad(err, 409) : json({ ok: true }); }
  if (b.action === 'fail') { await mk.renderFailed(env, b.id, b.version, b.why); return json({ ok: true }); }
  return bad('Unknown action');
}

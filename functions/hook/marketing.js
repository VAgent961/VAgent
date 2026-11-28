import { json, bad, body } from '../_lib.js';
import * as mk from '../_marketing.js';
import { tick } from '../_publish.js';
import { generate, history, sameTopic } from '../_autopilot.js';

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
    if (!['tick', 'generate', 'check'].includes(b.action)) return bad('Unknown action');
    await mk.schema(env);
    if (b.action === 'tick') return json(await tick(env));
    try {
      // manual: one new idea in today's language into the render queue (never approves or publishes)
      if (b.action === 'generate') { const r = await generate(env, new Date(), null, undefined, b.pageOptional === true); return r.post ? json({ id: r.post.id, title: r.post.info.title, first: r.post.scenes[0].say, keyword: r.post.keyword }) : bad(r.skipped, 409); }
      // is this draft new? checked against the whole queue and the Instagram page
      const err = mk.lint(b.post); if (err) return bad(err);
      const used = await history(env);
      return json({ duplicate: mk.repeats(b.post, used) || await sameTopic(env, b.post, used) });
    } catch (e) { return bad(e.message, 502); }
  }
  if (!(await mk.isRenderer(request))) return bad('Not allowed', 401);
  await mk.schema(env);
  const q = url.searchParams;
  if (q.get('action') === 'chunk') {
    const err = await mk.putChunk(env, q.get('id'), Number(q.get('version')), Number(q.get('n')), new Uint8Array(await request.arrayBuffer()));
    return err ? bad(err, 409) : json({ ok: true });
  }
  const b = await body(request);
  if (b.action === 'seed') { const posts = Array.isArray(b.posts) ? b.posts.slice(0, 1000) : [];
    await mk.seed(env, posts); await mk.relook(env, b.look, posts); return json({ ok: true, sync: 2 }); }
  if (b.action === 'queue') return json({ posts: await mk.queue(env), chunk: mk.CHUNK });
  if (b.action === 'complete') { const err = await mk.complete(env, b.id, b.version, String(b.sha), b.size); return err ? bad(err, 409) : json({ ok: true }); }
  if (b.action === 'fail') { await mk.renderFailed(env, b.id, b.version, b.why); return json({ ok: true }); }
  return bad('Unknown action');
}

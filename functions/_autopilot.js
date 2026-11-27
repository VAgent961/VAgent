// Autopilot (Instagram only). Tue/Thu/Sat Beirut: from 06:00 write one fresh reel so it waits for approval by 08:00.
// A declined (or failed-to-render) one is replaced 2 hours later, until a post holds today's slot or it is 19:00.
// Other days: nothing. It only queues a draft for rendering; approving and publishing stay with the owner and _publish.js.
import { sql } from './_lib.js';
import { think, parseJSON } from './_brain.js';
import { lint, log, repeats, setting, SHOTS } from './_marketing.js';
import * as ig from './_instagram.js';

export const DAYS = ['Tue', 'Thu', 'Sat'];
export const PREP = '06:00', CUTOFF = '19:00', PACE = 2 * 36e5; // 06:00 leaves two hours for a slow render queue
export function clock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Beirut', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, active: DAYS.includes(p.weekday) };
}
// state: {approved, pending, closed: time of today's latest decline or failed render}
export function decide(c, state, now = new Date()) {
  if (!c.active) return 'idle';
  if (c.time >= CUTOFF) return 'cutoff';
  if (c.time < PREP) return 'early';
  if (state.approved) return 'approved';
  if (state.pending) return 'pending';
  if (state.closed && now - new Date(state.closed) < PACE) return 'pacing';
  return 'generate';
}

const today = async (env, date) => (await sql(env, `SELECT
  EXISTS (SELECT 1 FROM marketing_posts WHERE (slot AT TIME ZONE 'Asia/Beirut')::date = $1::date AND (status IN ('scheduled', 'publishing', 'published') OR (status = 'failed' AND video_sha IS NOT NULL))) AS approved,
  EXISTS (SELECT 1 FROM marketing_posts WHERE auto_day = $1::date AND status IN ('rendering', 'review')) AS pending,
  (SELECT max(updated_at) FROM marketing_posts WHERE (updated_at AT TIME ZONE 'Asia/Beirut')::date = $1::date AND (status = 'declined' OR (auto_day = $1::date AND status = 'failed' AND video_sha IS NULL))) AS closed`, [date]))[0] || {};

export const HOOK_TITLE = 18; // longer wraps to 3 lines and fails the render's 84 px headline check
// Error text, or '' when the idea is well formed and passes the text duplicate check.
export function judge(p, used) {
  const err = lint(p); if (err) return err;
  const n = p.scenes.map((x) => x.say).join(' ').split(/\s+/).length;
  if (p.scenes.length < 6 || p.scenes.length > 8) return 'Use 6 to 8 scenes';
  if (n < 65 || n > 90) return `The spoken script is ${n} words; it must be 65 to 90`;
  if (p.scenes[0].say.split(/\s+/).length > 12) return 'The first spoken line must be 12 words or fewer';
  if (p.scenes[0].title.length > HOOK_TITLE) return `The first scene's title is too long for large type: at most 3 short words, ${HOOK_TITLE} characters`;
  if (p.scenes.some((x) => ['flow', 'list', 'browser', 'alert'].includes(x.shot) && !x.items?.length)) return 'Every flow, list, browser and alert scene needs items, or its card is empty';
  if (String(p.caption).length < 120) return 'The caption is too thin: write 2 to 4 sentences before the comment request';
  if (p.scenes.at(-1).shot !== 'cta' || p.scenes.some((x) => !SHOTS.includes(x.shot))) return `Every scene needs a shot from ${SHOTS.join(', ')}; the last is cta`;
  return repeats(p, used);
}

// Everything that already exists: the whole queue (published and declined too) and every post on the Instagram page.
// With Instagram connected, a page that cannot be read stops the run: nothing is accepted unchecked.
export async function history(env) {
  const used = (await sql(env, 'SELECT post FROM marketing_posts ORDER BY created_at')).map((r) => r.post).filter(Boolean);
  if (!(await setting(env, 'ig_token'))) return used;
  const access = await ig.token(env), me = await ig.user(env);
  for (let after = '', i = 0; i < 20; i++) {
    const r = await ig.graph(access, `${me.id}/media`, { fields: 'caption', limit: '50', ...(after ? { after } : {}) });
    for (const m of r.data || []) if (m.caption) used.push({ page: true, caption: m.caption });
    after = r.paging?.next && r.paging.cursors?.after;
    if (!after) break;
  }
  return used;
}
const brief = (o) => (o.page ? `page post: ${o.caption.replace(/\s+/g, ' ').slice(0, 200)}` : `${o.info?.title || ''} | ${o.scenes?.[0]?.say || ''} | ${String(o.info?.summary || o.caption || '').slice(0, 160)}`);
const SAME = `You are a strict duplicate checker for a video page. The NEW idea is a duplicate if any EARLIER video is about the same business problem, or shows an agent doing the same job, even with different words, keyword or industry example. Reply with JSON only: {"duplicate":true|false,"of":"the earlier title, or empty"}`;
// Meaning check by the office AI, over all of history in pieces it can read. An unclear answer counts as a failure.
export async function sameTopic(env, p, used) {
  const lines = used.filter((o) => !o.id || o.id !== p.id).map(brief), parts = [''];
  for (const l of lines) { if (parts.at(-1).length + l.length > 9000) parts.push(''); parts[parts.length - 1] += `- ${l}\n`; }
  for (const part of parts.filter(Boolean)) {
    const j = parseJSON(await think(env, SAME, `NEW: ${brief(p)}\nScript: ${p.scenes.map((x) => x.say).join(' ')}\n\nEARLIER:\n${part}`));
    if (typeof j?.duplicate !== 'boolean') return 'The duplicate check gave no clear answer';
    if (j.duplicate) return `It covers the same topic as "${String(j.of).slice(0, 80)}"`;
  }
  return '';
}

const SYSTEM = `You write one 9:16 Instagram Reel for VAgent (vagent.online, @v_agent961), which builds AI agents for owners of shops, cafes and small businesses in Lebanon. The presenter is a terracotta pixel-art pet. Reply with JSON only, minified on one line (a long reply gets cut off). Keep items to 2 or 3 short ones.
Rules: plain calm English. Never mention WhatsApp, free, cost, price, discounts, subscriptions or money signs. No client names, no invented numbers or results. Invent a fresh everyday problem that none of the already used videos covers, and show it as "an agent we can build". Describe only what such an agent could really do; never promise more sales or results. Nothing goes out until a person approves.
JSON shape:
{"keyword":"1 or 2 words in CAPITALS","info":{"title":"max 80 chars","summary":"1-2 sentences"},"concept":"the visual world of this video, one sentence","scenes":[{"say":"spoken line","title":"on-screen headline, max 40 chars","shot":"hook|flow|browser|list|approve|alert|cta","mood":"talk|think","items":["up to 4 short on-screen lines"]}],"caption":"...","hashtags":["#VAgent"]}
Story, one idea per scene: 1 the hook opens a question and does not answer it; 2 the concrete moment where it hurts (alert or list); 3 to 5 how the agent works, in order (what it reads, what it prepares, what you approve), with at least one flow scene of 3 or 4 items and one approve scene; 6 what your day looks like after, answering the hook; 7 the ask. Short spoken sentences with everyday words, one per scene where possible, each linking to the next. A title is 2 to 5 words and adds to the spoken line instead of repeating it. Items are 1 to 4 words each (hook: exactly 2); an approve scene's first item is the drafted message, under 80 characters.
Exactly 7 scenes. The "say" lines total 70 to 85 words. Scene 1: shot hook, a title of at most 3 short words (18 characters), a say of at most 10 words that is concrete, addresses "you" and puts something at stake. Scene 7: shot cta, its say asks to comment the keyword, title "Comment <KEYWORD>". The caption is 2 to 4 sentences, starts with the first line and says "Comment <KEYWORD>".`;

export async function write(env, used, id) {
  const list = used.slice(-60).map(brief).join('\n').slice(-9000), until = Date.now() + 18e4, rejected = [];
  let why = '';
  for (let i = 0; i < 5 && Date.now() < until; i++) {
    const ask = `Already used (choose a clearly different problem, keyword and opening line):\n${list}${why ? `\n\nRejected just now:\n${rejected.join('\n')}\nYour last answer was rejected: ${why}. Write a corrected or entirely different one.` : ''}`;
    const j = parseJSON(await think(env, SYSTEM, ask));
    if (!j || !Array.isArray(j.scenes)) { why = 'the reply was not complete JSON: answer minified and shorter'; continue; }
    const scenes = j.scenes.map((s, n) => ({ say: s.say, title: s.title, shot: s.shot === 'phone' ? 'list' : s.shot, mood: s.mood === 'think' ? 'think' : 'talk', ...(Array.isArray(s.items) && s.items.length ? { items: s.items.slice(0, 4) } : {}), ...(n === j.scenes.length - 1 ? { end: true } : {}) }));
    const post = { id, keyword: j.keyword, info: j.info, direction: { world: `auto-${id}`, concept: String(j.concept || scenes[0]?.title || id).slice(0, 200) }, scenes, caption: j.caption, hashtags: j.hashtags };
    why = judge(post, used) || await sameTopic(env, post, used);
    if (!why) return post;
    if (post.info?.title) rejected.push(`- ${post.keyword} | ${post.info.title}`);
  }
  throw new Error('No usable idea: ' + why);
}

// Writes one new idea and queues it for rendering. `day` marks a scheduled one; `still` re-checks the schedule afterwards.
export async function generate(env, now = new Date(), day = null, still = async () => '') {
  // one writer at a time; a failed attempt is tried again after 15 minutes
  const lock = await sql(env, "INSERT INTO marketing_settings (k, v) VALUES ('autopilot_lock', $1) ON CONFLICT (k) DO UPDATE SET v = $1 WHERE marketing_settings.v < $2 RETURNING k", [now.toISOString(), new Date(now - 9e5).toISOString()]);
  if (!lock.length) return { skipped: 'busy' };
  const free = () => sql(env, "DELETE FROM marketing_settings WHERE k = 'autopilot_lock'");
  try {
    const c = clock(now), id = `reel-${c.date.replaceAll('-', '')}-${c.time.replace(':', '')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const post = await write(env, await history(env), id);
    const skipped = await still();
    if (!skipped) {
      await sql(env, 'INSERT INTO marketing_posts (id, post, auto_day) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [post.id, JSON.stringify(post), day]);
      await log(env, post.id, day ? 'autopilot_idea' : 'manual_idea', post.info.title);
    }
    await free();
    return skipped ? { skipped } : { post };
  } catch (e) {
    if (!day) await free(); // a person asked: they may try again at once
    await log(env, '-', 'autopilot_failed', e.message); throw e;
  }
}

// Called by the publisher tick on active days.
export async function autopilot(env, now = new Date()) {
  const c = clock(now);
  if (!c.active) return 'idle';
  // past the cutoff, an automatic video that is still rendering is dropped (a person's edit clears auto_day)
  if (c.time >= CUTOFF) {
    for (const r of await sql(env, "UPDATE marketing_posts SET status = 'declined', video_sha = NULL, updated_at = now() WHERE status = 'rendering' AND auto_day <= $1::date RETURNING id", [c.date])) await log(env, r.id, 'autopilot_cutoff');
    return 'cutoff';
  }
  const first = decide(c, await today(env, c.date), now);
  if (first !== 'generate') return first;
  try {
    const r = await generate(env, now, c.date, async () => {
      // writing takes a while: the owner may have approved something meanwhile, or the cutoff passed
      const later = new Date(Math.max(Date.now(), now.getTime())), again = decide(clock(later), await today(env, c.date), later);
      return again === 'generate' ? '' : again;
    });
    return r.skipped || 'generated';
  } catch (e) { return 'failed: ' + e.message.slice(0, 200); }
}

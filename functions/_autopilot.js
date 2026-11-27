// Autopilot (Instagram only). Tue/Thu/Sat Beirut: from 06:00 write one fresh reel so it waits for approval by 08:00.
// A declined (or failed-to-render) one is replaced 2 hours later, until a post holds today's slot or it is 19:00.
// Other days: nothing. It only queues a draft for rendering; approving and publishing stay with the owner and _publish.js.
import { sql } from './_lib.js';
import { think, parseJSON } from './_brain.js';
import { lint, log, SHOTS } from './_marketing.js';

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

const STOP = new Set('a an the and or of to in on is it you your we our for with that this who are be can no not never one get just here want comment words word agent vagent'.split(' '));
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, '')) || []);
export const alike = (a, b) => { const x = words(a), y = words(b), both = [...x].filter((w) => y.has(w)).length; return both / (x.size + y.size - both || 1); };
const said = (p) => (p.scenes || []).map((s) => s.say).join(' ');

// Error text, or '' when the idea is valid and new.
export function judge(p, used) {
  const err = lint(p); if (err) return err;
  const n = said(p).split(/\s+/).length, first = p.scenes[0].say;
  if (p.scenes.length < 6 || p.scenes.length > 8) return 'Use 6 to 8 scenes';
  if (n < 65 || n > 90) return `The spoken script is ${n} words; it must be 65 to 90`;
  if (first.split(/\s+/).length > 12) return 'The first spoken line must be 12 words or fewer';
  if (p.scenes.at(-1).shot !== 'cta' || p.scenes.some((s) => !SHOTS.includes(s.shot))) return `Every scene needs a shot from ${SHOTS.join(', ')}; the last is cta`;
  for (const o of used) {
    if (o.keyword === p.keyword) return `The keyword ${p.keyword} is already used`;
    if (alike(first, o.scenes?.[0]?.say) >= .4) return `The first line is too close to "${o.scenes[0].say}"`;
    if (alike(`${p.info.title} ${p.info.summary}`, `${o.info?.title} ${o.info?.summary}`) >= .35) return `The topic repeats "${o.info?.title}"; pick another`;
    if (alike(said(p), said(o)) >= .3) return 'The script repeats an earlier video';
  }
  return '';
}

const SYSTEM = `You write one 9:16 Instagram Reel for VAgent (vagent.online, @v_agent961), which builds AI agents for owners of shops, cafes and small businesses in Lebanon. The presenter is a terracotta pixel-art pet. Reply with JSON only, minified on one line (a long reply gets cut off). Keep items to 2 or 3 short ones.
Rules: plain calm English. Never mention WhatsApp, free, cost, price, discounts, subscriptions or money signs. No client names, no invented numbers or results. Built and "ready": a voice receptionist (answers from a catalog, takes the order), a website builder (from a chat, owner approves), Sniper (finds prospective businesses by district and niche). Anything else is "an agent we can build". Nothing goes out until a person approves.
JSON shape:
{"keyword":"1 or 2 words in CAPITALS","info":{"title":"max 80 chars","summary":"1-2 sentences"},"concept":"the visual world of this video, one sentence","scenes":[{"say":"spoken line","title":"on-screen headline, max 40 chars","shot":"hook|phone|flow|browser|list|approve|alert|cta","mood":"talk|think","items":["up to 4 short on-screen lines"]}],"caption":"...","hashtags":["#VAgent"]}
Exactly 7 scenes. The "say" lines total 70 to 85 words. Scene 1: shot hook, a say of at most 10 words that is concrete, addresses "you" and puts something at stake. Scene 7: shot cta, its say asks to comment the keyword, title "Comment <KEYWORD>". The caption starts with the first line and says "Comment <KEYWORD>".`;

export async function write(env, used, id) {
  const ask = `Already used (choose a clearly different problem, keyword and opening line):\n${used.slice(-60).map((p) => `${p.keyword} | ${p.info?.title} | ${p.scenes?.[0]?.say}`).join('\n').slice(-9000)}`;
  let why = '';
  for (let i = 0; i < 3; i++) {
    const j = parseJSON(await think(env, SYSTEM, why ? `${ask}\n\nYour last answer was rejected: ${why}. Write a corrected one.` : ask));
    if (!j || !Array.isArray(j.scenes)) { why = 'the reply was not complete JSON: answer minified and shorter'; continue; }
    const scenes = j.scenes.map((s, n) => ({ say: s.say, title: s.title, shot: s.shot, mood: s.mood === 'think' ? 'think' : 'talk', ...(Array.isArray(s.items) && s.items.length ? { items: s.items.slice(0, 4) } : {}), ...(n === j.scenes.length - 1 ? { end: true } : {}) }));
    const post = { id, keyword: j.keyword, info: j.info, direction: { world: `auto-${id}`, concept: String(j.concept || scenes[0]?.title || id).slice(0, 200) }, scenes, caption: j.caption, hashtags: j.hashtags };
    why = judge(post, used);
    if (!why) return post;
  }
  throw new Error('No usable idea: ' + why);
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
  // one writer at a time; a failed attempt is tried again after 15 minutes
  const lock = await sql(env, "INSERT INTO marketing_settings (k, v) VALUES ('autopilot_lock', $1) ON CONFLICT (k) DO UPDATE SET v = $1 WHERE marketing_settings.v < $2 RETURNING k", [now.toISOString(), new Date(now - 9e5).toISOString()]);
  if (!lock.length) return 'busy';
  try {
    const used = (await sql(env, 'SELECT post FROM marketing_posts ORDER BY created_at')).map((r) => r.post);
    const post = await write(env, used, `reel-${c.date.replaceAll('-', '')}-${c.time.replace(':', '')}`);
    // writing takes a while: the owner may have approved something meanwhile, or the cutoff passed
    const later = new Date(Math.max(Date.now(), now.getTime())), again = decide(clock(later), await today(env, c.date), later);
    if (again !== 'generate') return again;
    await sql(env, 'INSERT INTO marketing_posts (id, post, auto_day) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [post.id, JSON.stringify(post), c.date]);
    await sql(env, "DELETE FROM marketing_settings WHERE k = 'autopilot_lock'");
    await log(env, post.id, 'autopilot_idea', post.info.title);
    return 'generated';
  } catch (e) { await log(env, '-', 'autopilot_failed', e.message); return 'failed: ' + e.message.slice(0, 200); }
}

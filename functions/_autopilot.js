// Autopilot (Instagram only). Every day, Beirut: from 06:00 write one fresh reel so it waits for approval by 08:00.
// A declined (or failed-to-render) one is replaced 2 hours later, until a post holds today's slot or it is 19:00.
// The language alternates by calendar day (langFor): 28 Nov 2026 is Lebanese Arabic, the next day English. It only queues a draft for rendering; approving and publishing stay with the owner and _publish.js.
import { sql } from './_lib.js';
import { think, parseJSON } from './_brain.js';
import { lint, log, repeats, setting, SHOTS } from './_marketing.js';
import { langFor, langOf, AR } from './_lang.js';
import * as ig from './_instagram.js';
import { STORY, sceneError, stage, tags } from './_scenario.js';

export const PREP = '06:00', CUTOFF = '19:00', PACE = 2 * 36e5; // 06:00 leaves two hours for a slow render queue
export function clock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, lang: langFor(`${p.year}-${p.month}-${p.day}`) };
}
// state: {approved, pending, closed: time of today's latest decline or failed render}. pending and closed count today's language only.
export function decide(c, state, now = new Date()) {
  if (c.time >= CUTOFF) return 'cutoff';
  if (c.time < PREP) return 'early';
  if (state.approved) return 'approved';
  if (state.pending) return 'pending';
  if (state.closed && now - new Date(state.closed) < PACE) return 'pacing';
  return 'generate';
}

const today = async (env, date) => (await sql(env, `SELECT
  EXISTS (SELECT 1 FROM marketing_posts WHERE (slot AT TIME ZONE 'Asia/Beirut')::date = $1::date AND (status IN ('scheduled', 'publishing', 'published') OR (status = 'failed' AND video_sha IS NOT NULL))) AS approved,
  EXISTS (SELECT 1 FROM marketing_posts WHERE auto_day = $1::date AND coalesce(post->>'lang', 'en') = $2 AND status IN ('rendering', 'review')) AS pending,
  (SELECT max(updated_at) FROM marketing_posts WHERE (updated_at AT TIME ZONE 'Asia/Beirut')::date = $1::date AND coalesce(post->>'lang', 'en') = $2 AND (status = 'declined' OR (auto_day = $1::date AND status = 'failed' AND video_sha IS NULL))) AS closed`, [date, langFor(date)]))[0] || {};

export const HOOK_TITLE = 18; // longer wraps to 3 lines and fails the render's 84 px headline check
// Error text, or '' when the idea is well formed and passes the text duplicate check. `lang` is the language of the day.
export function judge(p, used, lang = langOf(p)) {
  const err = lint(p); if (err) return err;
  if (langOf(p) !== lang) return `Write this one in ${lang === AR ? 'Lebanese Arabic' : 'English'}`;
  if (!p.topic) return 'Add "topic": {"key": "english-slug-of-the-idea", "summary": "one English sentence"}';
  const ar = lang === AR, [lo, hi] = ar ? [45, 70] : [65, 90];
  const n = p.scenes.map((x) => x.say).join(' ').split(/\s+/).length;
  const story = sceneError(p); if (story) return story;
  if (n < lo || n > hi) return `The spoken script is ${n} words; it must be ${lo} to ${hi}`;
  if (p.scenes[0].say.split(/\s+/).length > 12) return 'The first spoken line must be 12 words or fewer';
  if (p.scenes[0].title.length > HOOK_TITLE) return `The first scene's title is too long for large type: at most 3 short words, ${HOOK_TITLE} characters`;
  if (p.scenes.some((x) => ['flow', 'list', 'browser', 'alert'].includes(x.shot) && !x.items?.length)) return 'Every flow, list, browser and alert scene needs items, or its card is empty';
  if (String(p.caption).length < (ar ? 90 : 120)) return 'The caption is too thin: write 2 to 4 sentences before the comment request';
  if (p.scenes.at(-1).shot !== 'cta' || p.scenes.some((x) => !SHOTS.includes(x.shot))) return `Every scene needs a shot from ${SHOTS.join(', ')}; the last is cta`;
  if (ar) { const bad = notLebanese(p); if (bad) return bad; }
  return repeats(p, used);
}
// Spoken Lebanese, in Arabic script: no textbook (MSA) forms, and the everyday words that mark the dialect.
const MSA = /(?<![\p{L}])(سوف|لماذا|ماذا|الذي|التي|الذين|ليس|ليست|أريد|تريد|يمكنك|يمكنكم|الآن|هكذا|لذلك|حيث|إنّ|لقد|قمنا|يقوم|تقوم)(?![\p{L}])/u;
const LEB = /(?<![\p{L}])(و?(شو|رح|هيدا|هيدي|هول|فيك|بدك|بدّك|عم|هلق|هلأ|هلّق|منشان|ليش|كتير|مش|إنت|إنتَ|كيف|لهيك|يلي|اللي|بيّ?ك|ما في))(?![\p{L}])/gu;
// Latin words the voice knows how to say (tools/marketing-render/voice_ar.py SAY): change both together.
const SAID_LATIN = new Set('ai agent agents online google email website app dashboard link order instagram vagent message system'.split(' '));
const bare = (s) => s.replace(/[\u064B-\u0652\u0670]/g, '');
function notLebanese(p) {
  const lines = p.scenes.map((s) => s.say).join(' ');
  if (/[\p{Extended_Pictographic}#@&%$*+=/\\<>|_~^]|www\.|\.(com|online|net)\b/u.test(lines)) return 'The spoken lines are read aloud: no symbols, emoji or web addresses';
  const odd = (lines.match(/[A-Za-z]+/g) || []).find((w) => !SAID_LATIN.has(w.toLowerCase()));
  if (odd) return `Write "${odd}" in Arabic letters in the spoken line, the way people say it`;
  const text = bare([...p.scenes.flatMap((s) => [s.say, s.title, ...(s.items || []), s.chat?.[1] || '']), p.caption].join(' '));
  const ar = (text.match(/\p{Script=Arabic}/gu) || []).length, latin = (text.match(/[a-z]/gi) || []).length;
  if (ar < latin * 4) return 'Write every line, title, item and the caption in Arabic script; Latin only for a few tech names';
  const msa = text.match(MSA); if (msa) return `"${msa[0]}" is textbook Arabic: write it the way people speak in Beirut`;
  return (bare(lines).match(LEB) || []).length < 4 ? 'This does not sound Lebanese: use everyday words like شو, رح, هيدا, فيك, بدك, عم, هلق' : '';
}

// Everything that already exists: the whole queue (published and declined too) and every post on the Instagram page.
// With Instagram connected, a page that cannot be read stops the run: nothing is accepted unchecked. One exception, for the
// scheduled draft only (`scheduled`): while Meta blocks API access it is checked against the queue alone, logged, and still reviewed by the owner.
export async function history(env, scheduled = false) {
  const used = (await sql(env, 'SELECT post FROM marketing_posts ORDER BY created_at')).map((r) => r.post).filter(Boolean);
  if (!(await setting(env, 'ig_token'))) return used;
  const access = await ig.token(env), me = await ig.user(env);
  try {
    for (let after = '', i = 0; i < 20; i++) {
      const r = await ig.graph(access, `${me.id}/media`, { fields: 'caption', limit: '50', ...(after ? { after } : {}) });
      for (const m of r.data || []) if (m.caption) used.push({ page: true, caption: m.caption });
      after = r.paging?.next && r.paging.cursors?.after;
      if (!after) break;
    }
  } catch (e) {
    if (!scheduled || !/API access blocked/i.test(e.message)) throw e;
    await log(env, '-', 'autopilot_page_unchecked', e.message);
  }
  return used;
}
const brief = (o) => (o.page ? `page post: ${o.caption.replace(/\s+/g, ' ').slice(0, 200)}` : o.topic ? `${o.topic.key} | ${o.topic.summary}` : `${o.info?.title || ''} | ${o.scenes?.[0]?.say || ''} | ${String(o.info?.summary || o.caption || '').slice(0, 160)}`);
const SAME = `You are a strict duplicate checker for a video page. Videos are in English or Lebanese Arabic: the same idea in the other language IS a duplicate. The NEW idea is a duplicate if any EARLIER video is about the same business problem, or shows an agent doing the same job, even with different words, keyword or industry example. Reply with JSON only: {"duplicate":true|false,"of":"the earlier title, or empty"}`;
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
{"keyword":"1 or 2 words in CAPITALS","info":{"title":"max 80 chars","summary":"1-2 sentences"},"concept":"the visual world of this video, one sentence","scenes":[{"say":"spoken line","title":"on-screen headline, max 40 chars","shot":"hook|flow|browser|list|approve|alert|cta","mood":"talk|think","items":["up to 4 short on-screen lines"],"chat":["you|agent","scenes 2, 3, 6 only"]}],"caption":"...","hashtags":["#VAgent"]}
${STORY}
Short spoken sentences with everyday words, one or two per scene. The line is read aloud by a voice engine: no symbols, emoji, web addresses or unexplained abbreviations. A title is 2 to 5 words and adds to the spoken line instead of repeating it. Items are 1 to 4 words each (hook: exactly 2); an approve scene's first item is the drafted message, under 80 characters.
The "say" lines total 70 to 85 words. Scene 1: a title of at most 3 short words (18 characters), a say of at most 10 words. Scene 7: title "Comment <KEYWORD>". The caption is 2 to 4 sentences, starts with the first line and says "Comment <KEYWORD>".`;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
// Added to the English rules above on Lebanese Arabic days.
const LEBANESE = `
THIS VIDEO IS IN LEBANESE ARABIC (Beirut spoken dialect, Arabic script). These override the language rules above.
- "say", "title", "items", "chat", "caption", "keyword" and "info" are Lebanese Arabic. Talk like a friendly shop-tech person in Beirut: شو, ليش, هلق, رح, عم, فيك, بدك, هيدا, هيدي, مش, ما في, كتير, منشان, يلي. Never textbook Arabic (no سوف, لماذا, الذي, التي, ليس, يمكنك, الآن, أريد).
- "say" is heard, not read: write it exactly as a lively young person from Beirut would say it out loud to a friend, e.g. "كيف فينا...", "خلّيني فرجيك...", "هيدا الشي بيوفّر عليك...", "شو رأيك؟". Use spoken verb forms (بيقرا، منحضّر، رح تشوف، ما بقى), never case endings or MSA sentence structure.
- In "say" only, add a few harakat (shadda, kasra, fatha, damma) ONLY on words a voice could misread (e.g. خلّيني، هَلّق، بيحضّر، مِش). Never put harakat on "اكتب" or on the keyword, and none in titles, items or the caption.
- Short spoken sentences with ، . ؟ ! punctuation. No symbols, emoji, web addresses or abbreviations in "say". In "say" write tech words in Arabic letters as pronounced; the only Latin words allowed there are AI, agent, online, Google, email, website, app, dashboard, link, order, Instagram, message, system, and only a few. Use Western digits.
- Never mention واتساب, مجاني, ببلاش, سعر, كلفة, خصم, اشتراك or money.
- The customer is a Lebanese owner; the helper talks to them as إنت / إنتي, and every chat bubble is Lebanese too.
The 7 "say" lines total 50 to 62 words (this replaces the 70 to 85 above). Scene 1 title: at most 3 short words, 18 characters.
- "keyword": 1 Arabic word (2 at most), no diacritics. The caption ends with a line "اكتب <KEYWORD> بالتعليقات" (more words may follow). The last scene: say "اكتب <KEYWORD> بالتعليقات ..." and title "اكتب <KEYWORD>".
- Hashtags: mix Arabic and English, e.g. #لبنان #Lebanon.
- "topic" and "concept" stay in English.
Example of the voice: "شو بيصير إذا زبون سألك بالليل وما حدا رد؟" / "خلّيني فرجيك: الـ agent بيقرا السؤال، بيحضّر الجواب، وإنت بس بتوافق."`;
const TOPIC = `
Also return "topic": {"key":"short-english-slug-of-the-business-problem","summary":"one English sentence: the problem and the job the agent does"}. The idea must be new in BOTH languages.`;

export async function write(env, used, id, lang = 'en') {
  const keys = used.map((o) => o.topic?.key || (!o.page && o.info?.title)).filter(Boolean).join('; ').slice(-3000);
  const list = used.slice(-60).map(brief).join('\n').slice(-9000), until = Date.now() + 18e4, rejected = [];
  let why = '';
  for (let i = 0; i < 5 && Date.now() < until; i++) {
    const ask = `Topics already taken, in English or Arabic: ${keys}\n\nAlready used (choose a clearly different problem, keyword and opening line):\n${list}${why ? `\n\nRejected just now:\n${rejected.join('\n')}\nYour last answer was rejected: ${why}. Write a corrected or entirely different one.` : ''}`;
    let j;
    try { j = parseJSON(await think(env, SYSTEM + TOPIC + (lang === AR ? LEBANESE : ''), ask)); } catch (e) { why = e.message; continue; } // a slow or busy answer costs one try
    if (!j || !Array.isArray(j.scenes)) { why = 'the reply was not complete JSON: answer minified and shorter'; continue; }
    const scenes = stage(j.scenes).map((s, n) => ({ say: s.say, title: s.title, shot: s.shot, ...(Array.isArray(s.chat) ? { chat: [s.chat[0], s.chat[1]] } : {}), mood: s.mood === 'think' ? 'think' : 'talk', ...(Array.isArray(s.items) && s.items.length ? { items: s.items.slice(0, 4) } : {}), ...(n === j.scenes.length - 1 ? { end: true } : {}) }));
    const post = { id, lang, topic: j.topic && { key: slug(j.topic.key), summary: String(j.topic.summary || '').slice(0, 300) }, keyword: j.keyword, info: j.info, direction: { world: `auto-${id}`, concept: String(j.concept || scenes[0]?.title || id).slice(0, 200) }, scenes, caption: j.caption, hashtags: tags(j.hashtags) };
    why = judge(post, used, lang) || await sameTopic(env, post, used);
    if (!why) return post;
    if (post.info?.title) rejected.push(`- ${post.keyword} | ${post.info.title}`);
  }
  throw new Error('No usable idea: ' + why);
}

// Writes one new idea and queues it for rendering. `day` marks a scheduled one; `still` re-checks the schedule afterwards.
export async function generate(env, now = new Date(), day = null, still = async () => '', pageOptional = !!day, lang = '') {
  // one writer at a time; a failed attempt is tried again after 15 minutes
  const lock = await sql(env, "INSERT INTO marketing_settings (k, v) VALUES ('autopilot_lock', $1) ON CONFLICT (k) DO UPDATE SET v = $1 WHERE marketing_settings.v < $2 RETURNING k", [now.toISOString(), new Date(now - 9e5).toISOString()]);
  if (!lock.length) return { skipped: 'busy' };
  const free = () => sql(env, "DELETE FROM marketing_settings WHERE k = 'autopilot_lock'");
  try {
    const c = clock(now), id = `reel-${c.date.replaceAll('-', '')}-${c.time.replace(':', '')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const post = await write(env, await history(env, pageOptional), id, lang || c.lang);
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

// Called by every publisher tick.
export async function autopilot(env, now = new Date()) {
  const c = clock(now);
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

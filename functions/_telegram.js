// Phone reminder to cross-post on TikTok by hand, sent before Instagram publishing deletes the video.
// Every day 16:00-19:00 Beirut, on the first publisher tick that finds today's post: the approved one, else the autopilot
// draft waiting for approval. Once per video; a failed send is tried again on the next tick. Nothing is sent to TikTok.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. While Dry Run is on it notifies only if TELEGRAM_NOTIFY_DRY_RUN is "on".
// Also: an alert when a reel is waiting for approval (once per post id, live only) and a confirmation after a real
// Instagram publish. None of them ever throws: a notification must not affect publishing.
import { sql } from './_lib.js';
import { log, setSetting, SITE } from './_marketing.js';
import { clock, CUTOFF } from './_autopilot.js';
import { langOf, LANG_NAME } from './_lang.js';

export const REMIND = '16:00';
const hhmm = (d) => clock(new Date(d)).time;

export async function remindTikTok(env, now, live, captionFor) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID, c = clock(now), dry = !live;
    if (!token || !chat || (dry && env.TELEGRAM_NOTIFY_DRY_RUN !== 'on')) return;
    if (c.time < REMIND || c.time >= CUTOFF) return;
    const [row] = await sql(env, `SELECT * FROM marketing_posts WHERE video_sha IS NOT NULL AND ((status = 'scheduled' AND (slot AT TIME ZONE 'Asia/Beirut')::date = $1::date AND slot > $2)
      OR (status = 'review' AND auto_day = $1::date)) ORDER BY (status = 'scheduled') DESC, slot LIMIT 1`, [c.date, now.toISOString()]);
    if (!row) return;
    // claim first, so overlapping ticks send it once
    const claim = await sql(env, 'INSERT INTO marketing_settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2 WHERE marketing_settings.v <> $2 RETURNING k', ['tg_reminded', `${c.date}:${row.id}:${row.video_sha}`]);
    if (!claim.length) return;
    const p = row.post, title = p.info?.title || p.scenes?.[0]?.say, approved = row.status === 'scheduled', at = approved ? hhmm(row.slot) : CUTOFF, caption = captionFor(p);
    const text = [
      dry ? `🧪 DRY RUN: nothing will be posted on Instagram at ${at}.` : approved ? `⏰ LIVE: Instagram (@v_agent961) publishes today at ${at} Beirut.` : '⏰ LIVE: today\'s video is not approved yet.',
      `Post: ${title ? `${title} (${row.id})` : row.id}`,
      `Language: ${LANG_NAME[langOf(p)]}`,
      !approved && `Approve or decline it first. It must be approved before ${at} to go out today.`,
      `📲 Download the video from /marketing (${approved ? 'Approved' : 'Waiting for approval'} tab) and post it on TikTok before ${at} Beirut.`,
      live && 'The server copy is deleted after Instagram publishes.',
      p.keyword && `Comment keyword: ${p.keyword}`,
      caption && `\nCaption:\n${caption}`,
      `\n${SITE}/marketing`,
    ].filter(Boolean).join('\n');
    const why = await send(token, chat, text);
    if (why) await setSetting(env, 'tg_reminded', '');
    await log(env, row.id, why ? 'telegram_failed' : 'telegram_sent', why || (dry ? 'dry run' : 'live'));
  } catch { /* ignore */ }
}

// Every tick: tell the owner about each reel newly waiting for approval. The `tg_review:<id>` setting is claimed first,
// so a post is announced once (also after an edit renders it again); a failed send frees it for the next tick.
export async function notifyWaiting(env, live) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
    if (!live || !token || !chat) return;
    const rows = await sql(env, `SELECT id, post FROM marketing_posts p WHERE status = 'review' AND video_sha IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM marketing_settings s WHERE s.k = 'tg_review:' || p.id) ORDER BY updated_at LIMIT 5`);
    for (const { id, post: p } of rows) {
      const key = `tg_review:${id}`;
      if (!(await sql(env, 'INSERT INTO marketing_settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO NOTHING RETURNING k', [key, new Date().toISOString()])).length) continue;
      const title = p.info?.title || p.scenes?.[0]?.say;
      const why = await send(token, chat, ['👀 A reel is ready and waiting for your approval.', `Post: ${title ? `${title} (${id})` : id}`, `Language: ${LANG_NAME[langOf(p)]}`,
        p.keyword && `Comment keyword: ${p.keyword}`, `\n${SITE}/marketing`].filter(Boolean).join('\n'));
      if (why) await sql(env, 'DELETE FROM marketing_settings WHERE k = $1', [key]);
      await log(env, id, why ? 'telegram_failed' : 'telegram_review', why);
    }
  } catch { /* ignore */ }
}

async function send(token, chat, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4096), link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(5000) });
    return r.ok ? '' : `Telegram answered ${r.status}`;
  } catch (e) { return `Telegram unreachable (${e.name})`; } // never the message: it can contain the token
}
// Sent once, by the tick that closes a really published post.
export async function confirmPublished(env, row) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID, p = row.post;
    if (!token || !chat) return;
    const why = await send(token, chat, [`✅ Published on Instagram (@v_agent961).`, `Post: ${p.info?.title || row.id} (${row.id})`, `Language: ${LANG_NAME[langOf(p)]}`,
      p.keyword && `Comment keyword: ${p.keyword}`, 'The stored video was deleted.', `\n${SITE}/marketing`].filter(Boolean).join('\n'));
    await log(env, row.id, why ? 'telegram_failed' : 'telegram_published', why);
  } catch { /* ignore */ }
}

// Phone reminder to cross-post on TikTok by hand, sent before Instagram publishing deletes the video.
// Tue/Thu/Sat 16:00-19:00 Beirut, on the first publisher tick that finds today's post: the approved one, else the autopilot
// draft waiting for approval. Once per video; a failed send is tried again on the next tick. Nothing is sent to TikTok.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. While Dry Run is on it notifies only if TELEGRAM_NOTIFY_DRY_RUN is "on".
// It never throws: a notification must not affect publishing.
import { sql } from './_lib.js';
import { log, setSetting, SITE } from './_marketing.js';
import { clock, CUTOFF } from './_autopilot.js';

export const REMIND = '16:00';
const hhmm = (d) => clock(new Date(d)).time;

export async function remindTikTok(env, now, live, captionFor) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID, c = clock(now), dry = !live;
    if (!token || !chat || (dry && env.TELEGRAM_NOTIFY_DRY_RUN !== 'on')) return;
    if (!c.active || c.time < REMIND || c.time >= CUTOFF) return;
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
      !approved && `Approve or decline it first. It must be approved before ${at} to go out today.`,
      `📲 Download the video from /marketing (${approved ? 'Approved' : 'Waiting for approval'} tab) and post it on TikTok before ${at} Beirut.`,
      live && 'The server copy is deleted after Instagram publishes.',
      p.keyword && `Comment keyword: ${p.keyword}`,
      caption && `\nCaption:\n${caption}`,
      `\n${SITE}/marketing`,
    ].filter(Boolean).join('\n');
    let why = '';
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4096), link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(5000) });
      if (!r.ok) why = `Telegram answered ${r.status}`;
    } catch (e) { why = `Telegram unreachable (${e.name})`; } // never the message: it can contain the token
    if (why) await setSetting(env, 'tg_reminded', '');
    await log(env, row.id, why ? 'telegram_failed' : 'telegram_sent', why || (dry ? 'dry run' : 'live'));
  } catch { /* ignore */ }
}

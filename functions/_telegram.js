// Phone reminder to cross-post on TikTok by hand. Sent through the Telegram Bot API; nothing is sent to TikTok.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Dry Run simulations notify only if TELEGRAM_NOTIFY_DRY_RUN is "on".
// It never throws: a notification must not affect publishing.
import { log, SITE } from './_marketing.js';

export async function remindTikTok(env, row, caption, dry) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
    if (!token || !chat || (dry && env.TELEGRAM_NOTIFY_DRY_RUN !== 'on')) return;
    const p = row.post, title = p.info?.title || p.scenes?.[0]?.say;
    const text = [
      dry ? '🧪 DRY RUN (test): nothing was posted on Instagram.' : '✅ LIVE: published on Instagram (@v_agent961).',
      `Post: ${title ? `${title} (${row.id})` : row.id}`,
      dry ? 'On a live publish, this is your reminder to post the same video on TikTok.' : '📲 Now post the same video on TikTok.',
      dry ? 'The video is still available to download on the marketing page.'
        : 'The server copy is now deleted: use the file you downloaded earlier, or save the Reel from the Instagram app.',
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
    await log(env, row.id, why ? 'telegram_failed' : 'telegram_sent', why || (dry ? 'dry run' : 'live'));
  } catch { /* ignore */ }
}

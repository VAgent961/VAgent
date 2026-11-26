import { setting } from '../_marketing.js';

// Only serves the TikTok domain-verification file saved on /marketing (URL prefix https://vagent.online/hook/).
export async function onRequestGet({ env, params }) {
  const name = String(params.name || '');
  if (/^tiktok[A-Za-z0-9_-]{4,80}\.txt$/.test(name)) {
    const v = JSON.parse((await setting(env, 'tt_verify')) || 'null');
    if (v?.file === name) return new Response(v.content, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return new Response('Not found', { status: 404 });
}

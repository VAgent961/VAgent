// POST /api/client/login {email, password} — sign-in for business owners (adminvoice.vagent.online). No signup exists: accounts are created by HQ only.
import { sql, checkPassword, json } from '../../_lib.js';
import { makeClientSession, clientCookie, sameOriginOk } from '../../_client.js';
import { limited } from '../../_voice.js';

const DUMMY = 'pbkdf2$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return json({ error: 'Not allowed from this site' }, 403);
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200), password = String(b.password || '').slice(0, 200);
  if (!email || !password) return json({ error: 'Enter your email and password.' }, 400);
  if (await limited(env, request, 'clogin', 40, 900) || await limited(env, request, 'clogin:' + email.slice(0, 80), 8, 900)) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);
  try {
    const [a] = await sql(env, 'SELECT id, password_hash, status, (subscription_end <= now()) AS expired FROM client_accounts WHERE email = $1', [email]);
    const ok = await checkPassword(password, a ? a.password_hash : DUMMY) && !!a;
    if (!ok) return json({ error: 'Wrong email or password.' }, 401);
    if (a.status === 'canceled') return json({ error: 'This account was canceled. Contact VAgent.' }, 403);
    if (a.expired) return json({ error: 'Your subscription has ended. Contact VAgent to renew.' }, 403);
    return json({ ok: true }, 200, { 'Set-Cookie': clientCookie(await makeClientSession(env, a.id, 12), 12 * 3600) });
  } catch { return json({ error: 'Sign-in is down for a moment. Try again.' }, 500); }
}

import { sql, checkPassword, makeSession, cookie, json } from '../_lib.js';

const DUMMY = 'pbkdf2$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// POST /api/login  {email, password, remember, scope}
// scope 'owner' (the office sign-in) only ever signs in an owner. The same email may also be the marketing account, so the page decides.
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password || '').slice(0, 200);
  if (!email || !password) return json({ error: 'Enter your email and password.' }, 400);

  try {
    // Slow down guessing: max 10 wrong tries per email per 15 minutes.
    const [{ n }] = await sql(env, "SELECT count(*)::int AS n FROM vagent_login_fails WHERE email = $1 AND at > now() - interval '15 minutes'", [email]);
    if (n >= 10) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);

    const days = body.remember ? 30 : 1;
    // The marketing-only account: its email and password hash are Cloudflare settings, never in the repo.
    const office = body.scope === 'owner';
    const marketing = async () => !!env.MARKETING_EMAIL && email === env.MARKETING_EMAIL.toLowerCase() && await checkPassword(password, env.MARKETING_PASS_HASH);
    if (!office && await marketing())
      return json({ ok: true, next: '/marketing' }, 200, { 'Set-Cookie': cookie(await makeSession(env, email, days, 'mk'), days * 86400) });
    const [owner] = await sql(env, 'SELECT email, pass_hash FROM vagent_owners WHERE email = $1', [email]);
    const ok = await checkPassword(password, owner ? owner.pass_hash : DUMMY) && !!owner;
    if (!ok) {
      await sql(env, 'INSERT INTO vagent_login_fails (email) VALUES ($1)', [email]);
      if (office && await marketing()) return json({ error: 'That is the marketing password. Use your owner password to open the office.' }, 401);
      return json({ error: 'Wrong email or password.' }, 401);
    }
    await sql(env, 'UPDATE vagent_owners SET last_login = now() WHERE email = $1', [email]);
    return json({ ok: true, next: '/office' }, 200, { 'Set-Cookie': cookie(await makeSession(env, email, days), days * 86400) });
  } catch (e) {
    return json({ error: 'Sign-in is down for a moment. Try again.' }, 500);
  }
}

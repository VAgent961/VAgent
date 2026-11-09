import { sql, checkPassword, makeSession, cookie, json } from '../_lib.js';

const DUMMY = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// POST /api/login  {email, password, remember}
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

    const [owner] = await sql(env, 'SELECT email, pass_hash FROM vagent_owners WHERE email = $1', [email]);
    const ok = await checkPassword(password, owner ? owner.pass_hash : DUMMY) && !!owner;
    if (!ok) {
      await sql(env, 'INSERT INTO vagent_login_fails (email) VALUES ($1)', [email]);
      return json({ error: 'Wrong email or password.' }, 401);
    }
    await sql(env, 'UPDATE vagent_owners SET last_login = now() WHERE email = $1', [email]);
    const days = body.remember ? 30 : 1;
    return json({ ok: true, next: '/office' }, 200, { 'Set-Cookie': cookie(await makeSession(env, email, days), days * 86400) });
  } catch (e) {
    return json({ error: 'Sign-in is down for a moment. Try again.' }, 500);
  }
}

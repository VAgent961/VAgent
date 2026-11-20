import { sql, json, hashPassword, encrypt, decrypt } from '../_lib.js';
import { ACCOUNT_COLS, stateOf, voiceLinks, slugOk, emailOk, phoneDigits } from '../_client.js';

// HQ "Clients & Accounts" (Voice AI SaaS). OWNER ONLY (role owner; client logins can never reach this: different cookie, different host).
// GET list (no passwords) · GET ?reveal=<id> -> {password} (decrypted for the HQ admin only) · POST create {business_name, slug, email, password, phone, days}
// PUT {id, action: 'extend' (+30 days, reactivates) | 'cancel' | 'password' {password}} · DELETE ?id=&confirm=<slug> (removes the account, its business, items and orders)
const guard = (data) => (data.role !== 'owner' ? json({ error: 'Not allowed.' }, 403) : null);
const fail = (e) => json({ error: String(e && e.message || e).slice(0, 200) }, 500);
const view = (r) => ({ id: r.id, business_id: r.business_id, business_name: r.business_name, slug: r.slug, email: r.email, phone: r.phone || '', subscription_start: r.subscription_start, subscription_end: r.subscription_end, days_left: r.days_left, status: r.status, state: stateOf(r), created_at: r.created_at, ...voiceLinks(r) });

export async function onRequestGet({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const reveal = new URL(request.url).searchParams.get('reveal');
  try {
    if (reveal) {
      const [r] = await sql(env, 'SELECT password_encrypted FROM client_accounts WHERE id = $1', [Number(reveal) || 0]);
      return r ? json({ password: await decrypt(env, r.password_encrypted) }) : json({ error: 'Not found.' }, 404);
    }
    return json((await sql(env, `SELECT ${ACCOUNT_COLS} FROM client_accounts ORDER BY created_at DESC`)).map(view));
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const b = await request.json().catch(() => ({}));
  const name = String(b.business_name || '').trim().slice(0, 80), slug = String(b.slug || '').trim().toLowerCase().replace(/\.vagent\.online$/, ''), email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || ''), phone = phoneDigits(b.phone), days = Math.trunc(Number(b.days || 30));
  if (!name) return json({ error: 'Business name is needed.' }, 400);
  if (!slugOk(slug)) return json({ error: 'Slug: 3-30 letters, numbers or dashes (e.g. voice1). Some names are reserved.' }, 400);
  if (!emailOk(email)) return json({ error: 'Enter a valid client email.' }, 400);
  if (password.length < 6 || password.length > 100) return json({ error: 'Password must be 6-100 characters.' }, 400);
  if (b.phone && !phone) return json({ error: 'WhatsApp number looks wrong. Include the country code, e.g. 96103123456.' }, 400);
  if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: 'Subscription days: 1 to 3650.' }, 400);
  try {
    if ((await sql(env, 'SELECT 1 FROM businesses WHERE id = $1', [slug])).length || (await sql(env, 'SELECT 1 FROM client_accounts WHERE slug = $1', [slug])).length) return json({ error: 'That slug is already used.' }, 409);
    if ((await sql(env, 'SELECT 1 FROM client_accounts WHERE email = $1', [email])).length) return json({ error: 'That email already has an account.' }, 409);
    await sql(env, "INSERT INTO businesses (id, name, profile_context) VALUES ($1, $2, '')", [slug, name]);
    try {
      const [r] = await sql(env, `INSERT INTO client_accounts (business_id, business_name, slug, custom_subdomain, email, phone, password_hash, password_encrypted, subscription_end)
        VALUES ($1, $2, $1, $3, $4, $5, $6, $7, now() + make_interval(days => $8::int)) RETURNING ${ACCOUNT_COLS}`,
        [slug, name, slug + '.vagent.online', email, phone, await hashPassword(password), await encrypt(env, password), days]);
      return json(view(r));
    } catch (e) { await sql(env, 'DELETE FROM businesses WHERE id = $1', [slug]).catch(() => {}); throw e; }
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const b = await request.json().catch(() => ({})), id = Number(b.id) || 0;
  try {
    let r;
    if (b.action === 'extend') r = await sql(env, `UPDATE client_accounts SET subscription_end = GREATEST(now(), subscription_end) + interval '30 days', status = 'active' WHERE id = $1 RETURNING ${ACCOUNT_COLS}`, [id]);
    else if (b.action === 'cancel') r = await sql(env, `UPDATE client_accounts SET status = 'canceled' WHERE id = $1 RETURNING ${ACCOUNT_COLS}`, [id]);
    else if (b.action === 'password') {
      const pw = String(b.password || ''); if (pw.length < 6 || pw.length > 100) return json({ error: 'Password must be 6-100 characters.' }, 400);
      r = await sql(env, `UPDATE client_accounts SET password_hash = $2, password_encrypted = $3 WHERE id = $1 RETURNING ${ACCOUNT_COLS}`, [id, await hashPassword(pw), await encrypt(env, pw)]);
    } else return json({ error: 'Unknown action.' }, 400);
    return r.length ? json(view(r[0])) : json({ error: 'Not found.' }, 404);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const q = new URL(request.url).searchParams, id = Number(q.get('id')) || 0;
  try {
    const [a] = await sql(env, 'SELECT business_id, slug FROM client_accounts WHERE id = $1', [id]);
    if (!a) return json({ error: 'Not found.' }, 404);
    if (q.get('confirm') !== a.slug) return json({ error: 'Pass confirm=<slug> to delete.' }, 400);
    await sql(env, 'DELETE FROM businesses WHERE id = $1', [a.business_id]);   // cascades to the account, items and orders
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

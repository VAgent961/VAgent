// Shared helpers for Cloudflare Pages Functions (no npm packages needed).
// Env vars (set in Cloudflare, never in git): DATABASE_URL (Neon), SESSION_SECRET (long random string).

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Run one SQL query on Neon over HTTPS (same protocol as Neon's serverless driver).
export async function sql(env, query, params = []) {
  const host = new URL(env.DATABASE_URL.replace(/^postgres(ql)?:/, 'https:')).hostname;
  const api = host.replace(/^[^.]+\./, 'api.');
  const r = await fetch('https://' + api + '/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': env.DATABASE_URL },
    body: JSON.stringify({ query, params }),
  });
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return (await r.json()).rows || [];
}

// Password check: stored as pbkdf2$<iterations>$<salt b64>$<hash b64>
export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: Number(iter) }, key, 256);
  const a = new Uint8Array(bits), b = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Session = signed cookie "va_session" (HttpOnly, Secure). No session table needed.
export async function makeSession(env, email, days) {
  const body = b64u(enc.encode(JSON.stringify({ e: email, x: Date.now() + days * 864e5 })));
  return body + '.' + (await hmac(env.SESSION_SECRET, body));
}

export async function readSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)va_session=([^;]+)/);
  if (!m || !env.SESSION_SECRET) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || (await hmac(env.SESSION_SECRET, body)) !== sig) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64u(body))); return p.x > Date.now() ? p : null; } catch { return null; }
}

export const cookie = (value, maxAge) => 'va_session=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

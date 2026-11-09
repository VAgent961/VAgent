// One-time setup: creates the owner tables in Neon and adds/updates the owners.
// usage: DATABASE_URL=... OWNER_PASSWORD=... node scripts/create-owners.mjs a@x.com b@x.com ...
// Passwords are stored only as PBKDF2 hashes (never in git, never in plain text).
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const url = process.env.DATABASE_URL, pass = process.env.OWNER_PASSWORD, emails = process.argv.slice(2);
if (!url || !pass || !emails.length) { console.error('need DATABASE_URL, OWNER_PASSWORD and emails'); process.exit(1); }
const api = new URL(url.replace(/^postgres(ql)?:/, 'https:')).hostname.replace(/^[^.]+\./, 'api.');
const sql = async (query, params = []) => {
  const r = await fetch('https://' + api + '/sql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url }, body: JSON.stringify({ query, params }) });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 300));
  return (await r.json()).rows;
};
const hash = (p) => { const s = randomBytes(16); return 'pbkdf2$100000$' + s.toString('base64') + '$' + pbkdf2Sync(p, s, 100000, 32, 'sha256').toString('base64'); };

await sql('CREATE TABLE IF NOT EXISTS vagent_owners (id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text, role text NOT NULL DEFAULT \'owner\', pass_hash text NOT NULL, created_at timestamptz DEFAULT now(), last_login timestamptz)');
await sql('CREATE TABLE IF NOT EXISTS vagent_login_fails (id bigserial PRIMARY KEY, email text, at timestamptz DEFAULT now())');
await sql('CREATE INDEX IF NOT EXISTS vagent_login_fails_email_at ON vagent_login_fails (email, at)');
for (const e of emails) {
  const email = e.trim().toLowerCase(); const name = email.split('@')[0].replace(/^./, (c) => c.toUpperCase());
  await sql('INSERT INTO vagent_owners (email, name, pass_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET pass_hash = EXCLUDED.pass_hash', [email, name, hash(pass)]);
}
console.log((await sql('SELECT email, name, role FROM vagent_owners ORDER BY id')).map((r) => r.email + ' (' + r.role + ')').join('\n'));

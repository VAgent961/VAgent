// node scripts/generate-reels.mjs [n=1] : HQ invents n new, non-duplicate reels and queues them for rendering. No topics given.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const secret = readFileSync(homedir() + '/agent-tools/.vagent-webhook-secret', 'utf8').trim();
const want = Math.min(5, Number(process.argv[2]) || 1);
let done = 0;
for (let tries = 0; done < want && tries < want + 4; tries++) {
  const r = await fetch('https://vagent.online/hook/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VAgent-Secret': secret }, body: JSON.stringify({ action: 'generate' }), signal: AbortSignal.timeout(29e4) }).catch((e) => e);
  const j = r.json ? await r.json().catch(() => ({ error: 'HTTP ' + r.status })) : { error: r.message };
  if (j.id) { done++; console.log('queued', j.id, '|', j.keyword, '|', j.title, '|', j.first); }
  else { console.log('not queued:', j.error); await new Promise((ok) => setTimeout(ok, 30000)); }
}
console.log(`${done} of ${want} queued`); process.exit(done === want ? 0 : 1);

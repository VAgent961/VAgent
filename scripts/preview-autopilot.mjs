// node scripts/preview-autopilot.mjs : ask the live office AI for one reel idea and print it. Writes nothing.
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { write } from '../functions/_autopilot.js';
const env = { BRAIN_URL: process.env.BRAIN_URL || 'https://hassan.vagent.online/webhook/vagent-brain', WEBHOOK_SECRET: readFileSync(homedir() + '/agent-tools/.vagent-webhook-secret', 'utf8').trim() };
const dir = new URL('../tools/marketing-render/posts/', import.meta.url);
const used = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir))));
console.log(JSON.stringify(await write(env, used, 'reel-preview'), null, 1));

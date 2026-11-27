// node scripts/test-reel-cleanup.mjs : local cleanup takes only closed posts' files; a simulated post is never closed
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { matches } from '../.claude/skills/reel-render-and-cleanup/reel.mjs';
const d = mkdtempSync(join(tmpdir(), 'clean-test-'));
const take = ['vagent-reel-x-1', 'vagent-reel-x-1.mp4', 'vagent-reel-x-1_qa', 'vagent-reel-x-1--frame.jpg'];
for (const f of [...take, 'vagent-reel-x-10.mp4', 'vagent-reel-x-1-b.mp4', 'holiday.mp4', 'x-1.mp4']) writeFileSync(join(d, f), '');
assert.deepEqual(matches([d, join(d, 'missing')], ['x-1']).map((f) => basename(f)).sort(), [...take].sort());
assert.deepEqual(matches([d], []), []);
rmSync(d, { recursive: true });
const src = readFileSync(new URL('../functions/_publish.js', import.meta.url), 'utf8');
assert.ok(src.includes("!['published', 'failed'].includes(s?.state)"));
assert.equal(src.match(/SET status = 'publishing'.*\$\{KEEP\}/g).length, 2);
console.log('ok reel cleanup');

// node tools/marketing-render/lint.test.mjs : every draft obeys the content rules
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert';
import { lint } from '../../functions/_marketing.js';
const dir = new URL('./posts/', import.meta.url);
const posts = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir))));
for (const p of posts) assert.equal(lint(p), '', p.id);
for (const bad of ['It is free', 'Low prices', 'Message us on WhatsApp', 'Only $5']) assert.notEqual(lint({ ...posts[0], caption: bad }), '', bad);
console.log('ok', posts.length, 'posts');

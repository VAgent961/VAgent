// node tools/marketing-render/lint.test.mjs : every draft obeys the content rules and has its own direction
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert';
import { lint } from '../../functions/_marketing.js';
const at = (f) => new URL(f, import.meta.url);
const posts = readdirSync(at('./posts/')).map((f) => JSON.parse(readFileSync(at('./posts/' + f))));
for (const p of posts) assert.equal(lint(p), '', p.id);
for (const bad of ['It is free', 'Low prices', 'Message us on WhatsApp', 'Only $5']) assert.notEqual(lint({ ...posts[0], caption: `${posts[0].caption} ${bad}` }), '', bad);
for (const missing of ['keyword', 'info', 'direction']) assert.notEqual(lint({ ...posts[0], [missing]: undefined }), '', missing);
assert.notEqual(lint({ ...posts[0], keyword: 'THREE WHOLE WORDS' }), '');
// the opening headline must fit two lines at 84 px
for (const p of posts) assert.ok(p.scenes[0].title.length <= 18, `${p.id}: shorten the first title`);
const seen = {};
const unique = (what, value, id) => { const k = what + ':' + value; assert.ok(!seen[k], `${id} repeats the ${what} of ${seen[k]}`); seen[k] = id; };
for (const p of posts) {
  const w = p.direction.world;
  for (const ext of ['mjs', 'json']) assert.ok(existsSync(at(`./worlds/${w}.${ext}`)), `${p.id}: missing worlds/${w}.${ext}`);
  const { sound } = JSON.parse(readFileSync(at(`./worlds/${w}.json`)));
  const look = (await import(at(`./worlds/${w}.mjs`))).default;
  unique('world', w, p.id); unique('keyword', p.keyword, p.id);
  // generated worlds (auto.mjs) share one engine and a handful of options: each only needs its own mix. Hand-made ones differ in every part.
  const code = readFileSync(at(`./worlds/${w}.mjs`), 'utf8');
  if (code.includes('./auto.mjs')) { unique('generated look', code + JSON.stringify(sound), p.id); continue; }
  unique('transition sound', sound.cut, p.id); unique('instrument', sound.wave, p.id); unique('tempo', sound.bpm, p.id);
  for (const part of ['camera', 'enter', 'back', 'front', 'css']) unique(part, String(look[part]), p.id);
  unique('transition', String(look.cut.draw), p.id); unique('layout', JSON.stringify([look.card, look.pet]), p.id);
}
console.log('ok', posts.length, 'posts, each with its own world, sound and keyword');

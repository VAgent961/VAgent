// The reel scenario: Claude helps one lost customer (a business owner). Beats: hook (pain), the lost moment, Claude steps in,
// three fix steps, comment keyword. The narrator talks to the owner; chat bubbles show the owner (2) and Claude (3).
export const BEATS = ['hook', 'phone', 'phone', 'list', 'flow', 'approve', 'cta']; // scene.html recognises this order: change both together
export const CHAT_BY = { 1: 'you', 2: 'agent' }; // scene index -> who is writing
export const BUBBLE = 60; // characters allowed; the prompt asks for 40, about two lines in the chat card
export const HOOK_WORDS = 9; // about 3 seconds
export const NAMED = /claude|كلود/i; // the turning point says who steps in

// One starting situation per draft, rotated, so the writer does not fall back on the same story.
export const SEEDS = ['a bakery losing a birthday cake order while the owner is at the oven', 'a barber double-booking the same chair', 'a mechanic who cannot remember which car was promised for today', 'a florist forgetting a yearly anniversary customer', 'a private tutor chasing parents to confirm tomorrow lessons', 'a dental front desk with empty slots after no-shows', 'a clothing shop asked "do you have my size" under old posts', 'a furniture workshop losing measurements across voice notes', 'a pharmacy with a customer asking when an item is back', 'a gym that never follows up with trial visitors', 'a photographer who sends quotes and never chases them', 'a restaurant taking a large table booking on a scrap of paper', 'a phone repair shop answering "is it ready" all day', 'a real estate agent mixing up who asked about which flat'];

export const STORY = `Reasoning: low. Draft once, do not recount or polish in your head; reply at once.
THE SCENE. One realistic mini-scene: a narrator talks straight to ONE owner (a specific trade) at the exact moment they are about to lose something, and Claude, an AI helper (shown as the pixel-art pet), steps in. Say "you", never "businesses" or "owners". The owner's words appear only on screen as chat bubbles.
The 7 scenes, in exactly this order:
1 shot hook: the pain or loss, immediately, with a concrete detail (a number, a time, an object). At most ${HOOK_WORDS} words. No greeting, no "imagine". items: 2 tiny things piling up.
2 shot phone, chat ["you", the owner, lost, in their own words]. The narrator names what they are about to lose today.
3 shot phone, chat ["agent", Claude's first reply]. The turning point: the line names Claude, who catches the one thing that was about to slip.
4 shot list: step 1 of the fix. One concrete action; 2 or 3 items.
5 shot flow: step 2. The next concrete action; 2 or 3 items.
6 shot approve: step 3. items[0] is the drafted message to the owner's customer, under 80 characters; the owner approves it.
7 shot cta: "Comment <KEYWORD>" plus what they get, in a few words. The keyword is one short word tied to this story.
Steps start with "first", "second", "third" in plain speech and name a real action with this owner's detail; no filler such as "organise everything". Items repeat words of the line, in the order they are said.
Each "chat" is ["you"|"agent", under 40 characters], only on scenes 2 and 3. Each line follows from the one before. No slogans.
"topic.summary" starts with the customer ("A florist ... ; an agent ..."). Use a different trade, mess and opening line than every used video.`;

// Error text, or '' when the scenes make the scene above.
export function sceneError(p) {
  const s = p.scenes;
  if (s.length !== BEATS.length || s.some((x, i) => x.shot !== BEATS[i])) return `Use exactly ${BEATS.length} scenes with these shots in order: ${BEATS.join(', ')}`;
  for (const [i, x] of s.entries()) {
    const who = CHAT_BY[i];
    if (!who) { if (x.chat) return 'Only scenes 2 and 3 have "chat"'; continue; }
    if (x.chat?.[0] !== who || !String(x.chat[1] || '').trim() || x.chat[1].length > BUBBLE) return `Scene ${i + 1} needs "chat": ["${who}", a message of at most ${BUBBLE} characters]`;
  }
  if (!NAMED.test(s[2].say)) return 'Scene 3 is the turning point: its line must name Claude';
  if (String(s[0].say).trim().split(/\s+/).length > HOOK_WORDS) return `The first spoken line must be ${HOOK_WORDS} words or fewer`;
  if ([3, 4, 5].some((i) => !s[i].items?.length)) return 'Each of the three steps needs items';
  return '';
}

// The writer often slips on the fixed parts, so they are set here: the shot order, who types each bubble, and no stray bubbles.
export function stage(scenes) {
  if (scenes.length !== BEATS.length) return scenes;
  return scenes.map((s, i) => {
    const { chat, ...rest } = s || {}, text = String((Array.isArray(chat) ? chat.at(-1) : chat) || '').trim();
    return { ...rest, shot: BEATS[i], ...(CHAT_BY[i] && text ? { chat: [CHAT_BY[i], text] } : {}) };
  });
}
// A space before every hashtag that is glued to the text or tag before it.
export const spaced = (text) => String(text).replace(/(?<=[\p{L}\p{M}\p{N}_.!?؟،])(?=#[\p{L}\p{N}_])/gu, ' ');
// Hashtags the lint accepts: one word each, spaces and dashes become underscores.
export const tags = (list) => [...new Set((Array.isArray(list) ? list : []).flatMap((h) => String(h).split(/(?=#)/)).map((h) => '#' + String(h).trim().replace(/[\s-]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 50)).filter((h) => h.length > 1))].slice(0, 12);

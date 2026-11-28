// The reel scenario: a mini-scene where the VAgent pet (the narrator) helps one lost customer, a business owner.
// The pet speaks; the owner answers in on-screen chat bubbles (phone shot, chat ["you", ...]), so one voice is enough.
export const BEATS = ['hook', 'phone', 'phone', 'flow', 'approve', 'phone', 'cta'];
export const CHAT_BY = { 1: 'you', 2: 'agent', 5: 'you' }; // scene index -> who is writing
export const BUBBLE = 60; // characters allowed; the prompt asks for 40, about two lines in the chat card

export const STORY = `Reasoning: low. Draft once, do not recount or polish in your head; reply at once.
THE SCENE. Every video is one short scene between two characters. YOU are the narrator: a small, warm, sharp pixel-art helper. The other is THE LOST CUSTOMER: one specific owner (pick a trade: baker, barber, florist, mechanic, tutor, dentist's front desk...) stuck in one concrete mess (unanswered messages, forgotten follow-ups, a messy spreadsheet, a slow daily task). Every "say" is the helper talking straight to that owner as "you", never about "businesses" or "owners" in general. The owner's words appear only on screen as chat bubbles; the helper's next line reacts to them.
The 7 scenes, in exactly this order:
1 shot hook: catch them in the act, with one concrete detail ("Forty unread messages, and you're icing a cake?"). items: 2 tiny things piling up.
2 shot phone, chat ["you", the owner admitting they are lost, in their own words]. The helper answers with empathy and names what it costs them today. No solution yet.
3 shot phone, chat ["agent", the helper's turning point]. One surprising, simple insight about where it really breaks.
4 shot flow, 3 or 4 items: "Watch." The first steps, tied to this owner's detail from scene 1, joined with words like first, then. The line names the items in order.
5 shot approve: the helper hands over the draft; the owner stays in charge. items[0] is the drafted message to this owner's customer, under 80 characters.
6 shot phone, chat ["you", the owner's relieved or surprised reaction]. The helper closes the loop on the scene 1 detail. Show the calmer moment, promise nothing.
7 shot cta: "Same mess? Comment <KEYWORD>", in the helper's voice.
Each "chat" is ["you"|"agent", a short message under 40 characters], only on scenes 2, 3 and 6. Each line follows from the one before, like talk: questions, reactions, "okay, here's the thing". No lists read aloud, no slogans.
"topic.summary" starts with the customer ("A florist ... ; an agent ..."). Use a different trade, mess and opening line than every used video.`;

// Error text, or '' when the scenes make the scene above.
export function sceneError(p) {
  const s = p.scenes;
  if (s.length !== BEATS.length || s.some((x, i) => x.shot !== BEATS[i])) return `Use exactly ${BEATS.length} scenes with these shots in order: ${BEATS.join(', ')}`;
  for (const [i, x] of s.entries()) {
    const who = CHAT_BY[i];
    if (!who) { if (x.chat) return 'Only scenes 2, 3 and 6 have "chat"'; continue; }
    if (x.chat?.[0] !== who || !String(x.chat[1] || '').trim() || x.chat[1].length > BUBBLE) return `Scene ${i + 1} needs "chat": ["${who}", a message of at most ${BUBBLE} characters]`;
  }
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
// Hashtags the lint accepts: one word each, spaces and dashes become underscores.
export const tags = (list) => [...new Set((Array.isArray(list) ? list : []).map((h) => '#' + String(h).trim().replace(/[\s-]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 50)).filter((h) => h.length > 1))].slice(0, 12);

// The office AI: calls the "VAgent Brain" n8n workflow (free Gemini, Groq backup). Optional GROQ_API_KEY fallback.
export async function think(env, system, prompt) {
  if (env.BRAIN_URL) {
    try {
      const r = await fetch(env.BRAIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VAgent-Secret': env.WEBHOOK_SECRET || '' }, body: JSON.stringify({ system, prompt }), signal: AbortSignal.timeout(85000) });
      const j = await r.json();
      if (j.ok && j.text) return j.text;
    } catch (e) { var why = String(e && e.message || e); }
  }
  if (env.GROQ_API_KEY) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(40000),
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 900, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
    const t = (await r.json()).choices?.[0]?.message?.content; if (t) return t;
  }
  throw new Error('The AI is busy right now. Try again in a minute.' + (typeof why !== 'undefined' ? ' (' + why + ')' : ''));
}

// Pull a JSON object out of an AI answer (handles ```json fences and extra text).
export function parseJSON(t) {
  const s = String(t || '').replace(/```(json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// Turn an AI answer into readable text (some models wrap plain answers in JSON).
export function plain(t) {
  const j = parseJSON(t);
  if (!j) return String(t || '').trim();
  const k = ['reply', 'response', 'answer', 'text', 'message', 'output'].find((x) => typeof j[x] === 'string');
  return k ? j[k] : String(t).trim();
}

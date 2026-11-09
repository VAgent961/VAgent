import { json } from '../_lib.js';
import { officeData } from '../_office.js';

// GET /api/office -> everything the office screen needs, in one small payload.
export async function onRequestGet({ env, data }) {
  const d = await officeData(env);
  return json({ me: data.owner, ...d, ai: !!(env.BRAIN_URL || env.GROQ_API_KEY) });
}

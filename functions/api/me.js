import { json } from '../_lib.js';

// GET /api/me -> the signed-in owner
export async function onRequestGet({ data }) {
  return json({ email: data.owner, name: data.owner.split('@')[0].replace(/^./, (c) => c.toUpperCase()) });
}

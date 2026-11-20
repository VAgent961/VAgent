import { json } from '../../_lib.js';
import { requireClient, stateOf, voiceLinks } from '../../_client.js';
// GET /api/client/me — who is signed in + subscription numbers (never includes the password).
export async function onRequestGet(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const c = g.client;
  return json({ business_name: c.business_name, slug: c.slug, email: c.email, state: stateOf(c), days_left: c.days_left, subscription_end: c.subscription_end, ...voiceLinks(c) });
}

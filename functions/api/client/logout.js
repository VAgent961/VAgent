import { json } from '../../_lib.js';
import { clientCookie, sameOriginOk } from '../../_client.js';
// POST /api/client/logout — clears the portal cookie.
export async function onRequestPost({ request }) {
  if (!sameOriginOk(request)) return json({ error: 'Not allowed from this site' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': clientCookie('', 0) });
}

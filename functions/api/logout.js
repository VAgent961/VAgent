import { cookie } from '../_lib.js';

// POST /api/logout -> clears the session and goes back to sign-in
export async function onRequestPost() {
  return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookie('', 0) } });
}

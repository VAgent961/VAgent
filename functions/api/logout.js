import { cookie } from '../_lib.js';

// POST /api/logout -> clears the session and goes back to sign-in
export async function onRequestPost({ request }) {
  const back = new URL(request.url).searchParams.get('next') === 'marketing' ? '/marketing' : '/';
  return new Response(null, { status: 303, headers: { Location: back, 'Set-Cookie': cookie('', 0) } });
}

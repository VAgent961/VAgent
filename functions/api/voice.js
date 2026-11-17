// POST /api/voice?business_id=demo-cafe  (multipart: audio + history JSON string, or JSON {text, history})
// Owner-session proxy to the n8n Voice Receptionist (session check is in _middleware.js). Logic lives in ../_voice.js.
import { proxyVoice } from '../_voice.js';
export const onRequestPost = ({ request, env }) => proxyVoice(request, env);

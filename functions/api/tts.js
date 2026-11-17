// POST /api/tts {text ≤200 chars} -> audio (wav) via the n8n "Voice TTS" workflow. Owner session (middleware). Logic lives in ../_voice.js.
import { proxyTts } from '../_voice.js';
export const onRequestPost = ({ request, env }) => proxyTts(request, env);

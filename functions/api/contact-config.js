import { configured, json } from '../../lib/contact.js';

export function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET' });
  if (!configured(env, new URL(request.url).hostname)) return json({ error: 'Contact unavailable.' }, 503);
  return json({ siteKey: env.TURNSTILE_SITE_KEY });
}

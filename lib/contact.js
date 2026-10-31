const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
const MAX_BODY = 32768;

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

export function configured(env, hostname) {
  const hosts = (env.CONTACT_HOSTNAMES || '').split(',').map(h => h.trim().toLowerCase());
  return hosts.includes(hostname) &&
    typeof env.TURNSTILE_SITE_KEY === 'string' && !!env.TURNSTILE_SITE_KEY &&
    typeof env.TURNSTILE_SECRET_KEY === 'string' && !!env.TURNSTILE_SECRET_KEY &&
    // Cloudflare's public test keys must never protect this production endpoint.
    !/^[123]x0/.test(env.TURNSTILE_SITE_KEY) && !/^[123]x0/.test(env.TURNSTILE_SECRET_KEY) &&
    typeof env.CONTACT_RELAY_TOKEN === 'string' && env.CONTACT_RELAY_TOKEN.length >= 32 && validRelayUrl(env.CONTACT_RELAY_URL);
}

function validRelayUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value);
}

export function senderIp(request) {
  // Trust only direct Cloudflare ingress; never form data or X-Forwarded-For.
  if (request.headers.has('CF-Worker')) return null;
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 45) return null;
  if (ip.includes(':')) {
    if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null;
    try {
      const canonical = new URL(`http://[${ip}]/`).hostname;
      if (canonical === '[2a06:98c0:3600::103]') return null; // Worker subrequest sentinel
      return ip;
    } catch { return null; }
  }
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)) return null;
  // Require Pseudo IPv4 Off/Add Header. Overwrite would destroy the real source IP.
  if (Number(parts[0]) >= 240) return null;
  return ip;
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('size');
  if (!request.body) throw new Error('json');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new Error('size');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function handleContact(request, env, fetcher = fetch) {
  const fail = (error, status) => json({ ok: false, error }, status);
  if (request.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405, { Allow: 'POST' });
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || request.headers.get('Origin') !== url.origin) {
    return fail('Submit the form from this website.', 403);
  }
  if (!configured(env, url.hostname)) return fail('Contact is temporarily unavailable. Please try later.', 503);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fail('Expected a JSON submission.', 415);
  }
  let body;
  try { body = await readBody(request); }
  catch (error) { return fail('Invalid or oversized submission.', error.message === 'size' ? 413 : 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid submission.', 400);
  const { name, email, message, token, website } = body;
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\r\n\x00-\x1f\x7f]/.test(name) ||
      !validEmail(email) || typeof message !== 'string' || !message.trim() || message.length > 5000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
      typeof token !== 'string' || !token || token.length > 2048 ||
      (website !== undefined && website !== '')) {
    return fail('Check your details and complete the security check.', 400);
  }
  const ip = senderIp(request);
  if (!ip) return fail('Unable to verify the connection address. Please try later.', 503);
  let verification;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('verification unavailable');
    verification = await response.json();
    if (!verification || typeof verification !== 'object') throw new Error('invalid response');
  } catch { return fail('Security verification is unavailable. Please try again.', 503); }
  if (verification.success !== true || verification.hostname !== url.hostname || verification.action !== 'contact') {
    return fail('Security verification failed or expired. Please try again.', 400);
  }
  const id = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const text = [
    `Name: ${name.trim()}`, `Email: ${email}`, '', 'Message:', message.trim(), '',
    '--- End of submitted message ---',
    'Server-recorded submission details',
    `Sender IP (Cloudflare connection): ${ip}`,
    `Received at (UTC): ${receivedAt}`,
    `Submission ID: ${id}`,
    `Website: ${url.hostname}`,
  ].join('\n');
  try {
    const response = await fetcher(env.CONTACT_RELAY_URL, {
      method: 'POST', redirect: 'error', headers: {
        Authorization: `Bearer ${env.CONTACT_RELAY_TOKEN}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyTo: email, text, id }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok || (await response.json())?.ok !== true) throw new Error('delivery');
  } catch {
    // An interrupted response may still mean the SMTP server accepted the email.
    return fail('Delivery could not be confirmed. Your message is still here; retrying may send a duplicate.', 502);
  }
  // SMTP acceptance, not proof of arrival in the recipient's inbox.
  return json({ ok: true, id });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContact, senderIp } from '../lib/contact.js';
import { onRequest as configEndpoint } from '../functions/api/contact-config.js';

const env = {
  CONTACT_HOSTNAMES: 'rightrice.dev', TURNSTILE_SITE_KEY: 'unit-site-key',
  TURNSTILE_SECRET_KEY: 'unit-secret-key', CONTACT_RELAY_URL: 'https://relay.example.com/contact',
  CONTACT_RELAY_TOKEN: 'unit-test-token-not-a-secret-1234567890',
};
const body = { name: 'Visitor', email: 'visitor@example.org', message: 'Hello <script>alert(1)</script>', token: 'unit-token', website: '' };
function request(payload = body, headers = {}, method = 'POST') {
  return new Request('https://rightrice.dev/api/contact', { method, headers: {
    Origin: 'https://rightrice.dev', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.25', ...headers,
  }, ...(method === 'POST' ? { body: typeof payload === 'string' ? payload : JSON.stringify(payload) } : {}) });
}
function transport(verification = { success: true, hostname: 'rightrice.dev', action: 'contact' }, delivery = { ok: true }) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return Response.json(calls.length === 1 ? verification : delivery);
  } };
}

test('verifies token and appends trusted IP and UTC time to plain-text email', async () => {
  const tx = transport();
  const result = await handleContact(request({ ...body, ip: '1.2.3.4', senderIp: '8.8.8.8' }, { 'X-Forwarded-For': '9.9.9.9', 'CF-Connecting-IPv6': '2001:db8::bad' }), env, tx.fetcher);
  assert.equal(result.status, 200);
  assert.equal(tx.calls.length, 2);
  assert.equal(tx.calls[0].body.remoteip, '203.0.113.25');
  assert.equal(tx.calls[0].body.secret, env.TURNSTILE_SECRET_KEY);
  const email = tx.calls[1];
  assert.equal(email.url, env.CONTACT_RELAY_URL);
  assert.equal(email.options.redirect, 'error');
  assert.equal(email.body.replyTo, body.email);
  assert.match(email.body.text, /End of submitted message ---\nServer-recorded submission details\nSender IP \(Cloudflare connection\): 203\.0\.113\.25\nReceived at \(UTC\): \d{4}-\d\d-\d\dT/);
  assert.ok(email.body.text.indexOf(body.message) < email.body.text.indexOf('Server-recorded'));
  assert.ok(!email.body.text.includes('9.9.9.9'));
  assert.ok(!email.body.text.includes('unit-token'));
  assert.deepEqual(Object.keys(email.body).sort(), ['id', 'replyTo', 'text']);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await result.text()).includes('203.0.113.25'));
});

for (const verification of [{ success: false }, { success: true, hostname: 'other.example', action: 'contact' }, { success: true, hostname: 'rightrice.dev', action: 'login' }]) {
  test(`no mail on failed/mismatched Turnstile ${JSON.stringify(verification)}`, async () => {
    const tx = transport(verification);
    assert.equal((await handleContact(request(), env, tx.fetcher)).status, 400);
    assert.equal(tx.calls.length, 1);
  });
}
for (const [label, payload, headers, expected] of [
  ['missing token', { ...body, token: '' }, {}, 400],
  ['oversized token', { ...body, token: 'a'.repeat(2049) }, {}, 400],
  ['blank message', { ...body, message: '  ' }, {}, 400],
  ['honeypot', { ...body, website: 'spam' }, {}, 400],
  ['email header injection', { ...body, email: 'x@example.org\r\nBcc:evil@example.org' }, {}, 400],
  ['oversized message', { ...body, message: 'x'.repeat(5001) }, {}, 400],
  ['malformed JSON', '{oops', {}, 400],
  ['large streamed body', ' '.repeat(32769), {}, 413],
  ['wrong media type', body, { 'Content-Type': 'text/plain' }, 415],
  ['cross-origin', body, { Origin: 'https://evil.example' }, 403],
  ['missing origin', body, { Origin: '' }, 403],
  ['missing edge IP', body, { 'CF-Connecting-IP': '', 'X-Forwarded-For': '1.2.3.4' }, 503],
  ['worker subrequest', body, { 'CF-Worker': 'rightrice.dev' }, 503],
  ['worker sentinel', body, { 'CF-Connecting-IP': '2a06:98c0:3600::103' }, 503],
  ['pseudo IPv4', body, { 'CF-Connecting-IP': '240.1.2.3', 'CF-Connecting-IPv6': '2001:db8::1' }, 503],
]) {
  test(`rejects ${label} before external calls`, async () => {
    const tx = transport();
    assert.equal((await handleContact(request(payload, headers), env, tx.fetcher)).status, expected);
    assert.equal(tx.calls.length, 0);
  });
}

test('IPv6 used in verification and footer', async () => {
  const tx = transport();
  assert.equal((await handleContact(request(body, { 'CF-Connecting-IP': '2001:db8::abcd' }), env, tx.fetcher)).status, 200);
  assert.equal(tx.calls[0].body.remoteip, '2001:db8::abcd');
  assert.match(tx.calls[1].body.text, /2001:db8::abcd/);
});
test('IP validation rejects malformed addresses', () => {
  for (const ip of ['1.2.3', '1.2.3.999', '01.2.3.4', '1.2.3.4, 5.6.7.8', 'abcd::xyz', '::1]/evil', '[::1]']) {
    assert.equal(senderIp(request(body, { 'CF-Connecting-IP': ip })), null, ip);
  }
});
test('fails closed when configuration is missing or test keys are deployed', async () => {
  for (const overrides of [{ CONTACT_RELAY_TOKEN: '' }, { CONTACT_RELAY_URL: 'http://relay.example.com' }, { CONTACT_HOSTNAMES: 'other.example' }, { TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }]) {
    const tx = transport();
    assert.equal((await handleContact(request(), { ...env, ...overrides }, tx.fetcher)).status, 503);
    assert.equal(tx.calls.length, 0);
  }
});
test('verification service outage sends no email', async () => {
  let count = 0;
  const result = await handleContact(request(), env, async () => { count++; throw new Error('network'); });
  assert.equal(result.status, 503);
  assert.equal(count, 1);
});
test('delivery rejection does not return success or sensitive errors', async () => {
  const tx = transport(undefined, { ok: false, error: 'SMTP password secret' });
  const result = await handleContact(request(), env, tx.fetcher);
  assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes('password'));
});
test('GET cannot send email', async () => {
  assert.equal((await handleContact(request(undefined, {}, 'GET'), env)).status, 405);
});
test('public config exposes only site key', async () => {
  const response = configEndpoint({ request: new Request('https://rightrice.dev/api/contact-config'), env });
  assert.deepEqual(await response.json(), { siteKey: env.TURNSTILE_SITE_KEY });
});

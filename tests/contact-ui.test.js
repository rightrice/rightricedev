import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../dist/contact.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(fetchPost, configOk = true) {
  const elements = new Map();
  for (const id of ['contact-form', 'contact-submit', 'contact-retry', 'contact-status']) {
    elements.set(id, { disabled: false, hidden: false, dataset: {}, handlers: {},
      addEventListener(event, fn) { this.handlers[event] = fn; },
      setAttribute() {}, removeAttribute() {},
    });
  }
  const form = elements.get('contact-form');
  const fields = [{ name: 'name', value: 'Visitor' }, { name: 'email', value: 'visitor@example.org' }, { name: 'message', value: 'Keep my message' }, { name: 'website', value: '' }];
  form.querySelectorAll = () => fields;
  form.reportValidity = () => true;
  form.reset = () => fields.forEach(field => { field.value = ''; });
  let options, resets = 0, postCalls = 0;
  const context = {
    document: { getElementById: id => elements.get(id) },
    window: { turnstile: { render(selector, config) { options = config; return 'widget'; }, remove() {}, reset() { resets++; } } },
    FormData: class { constructor() { this.values = new Map(fields.map(f => [f.name, f.value])); } get(name) { return this.values.get(name); } },
    AbortSignal, setTimeout, clearTimeout,
    fetch: async (url, init) => {
      if (url === '/api/contact-config') return Response.json(configOk ? { siteKey: 'key' } : {}, { status: configOk ? 200 : 503 });
      postCalls++;
      return fetchPost(url, init);
    },
  };
  vm.runInNewContext(source, context);
  await flush();
  return { elements, fields, get options() { return options; }, get resets() { return resets; }, get calls() { return postCalls; }, send: () => form.handlers.submit({ preventDefault() {} }) };
}

test('UI clears fields only after confirmed acceptance and resets token', async () => {
  const ui = await setup(async () => Response.json({ ok: true }));
  ui.options.callback('token');
  assert.equal(ui.elements.get('contact-submit').disabled, false);
  await ui.send();
  assert.equal(ui.fields[2].value, '');
  assert.equal(ui.resets, 1);
  assert.equal(ui.elements.get('contact-submit').disabled, true);
  assert.match(ui.elements.get('contact-status').textContent, /submitted/);
});
test('UI preserves message after failure and requires fresh security token', async () => {
  const ui = await setup(async () => Response.json({ ok: false, error: 'Delivery could not be confirmed.' }, { status: 502 }));
  ui.options.callback('token');
  await ui.send();
  assert.equal(ui.fields[2].value, 'Keep my message');
  assert.equal(ui.resets, 1);
  assert.equal(ui.elements.get('contact-submit').disabled, true);
  assert.equal(ui.fields[2].disabled, false);
});
test('UI prevents double submission and edits while sending', async () => {
  let release;
  const ui = await setup(() => new Promise(resolve => { release = resolve; }));
  ui.options.callback('token');
  const sending = ui.send();
  ui.options.callback('later-token');
  assert.equal(ui.elements.get('contact-submit').disabled, true);
  assert.equal(ui.fields[2].disabled, true);
  await ui.send();
  assert.equal(ui.calls, 1);
  release(Response.json({ ok: true }));
  await sending;
});
test('UI keeps sending disabled when config unavailable', async () => {
  const ui = await setup(() => { throw new Error('must not send'); }, false);
  assert.equal(ui.elements.get('contact-submit').disabled, true);
  assert.equal(ui.elements.get('contact-retry').hidden, false);
  assert.match(ui.elements.get('contact-status').textContent, /unavailable/);
  await ui.send();
  assert.equal(ui.calls, 0);
});

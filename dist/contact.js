'use strict';
(() => {
  const form = document.getElementById('contact-form');
  const submit = document.getElementById('contact-submit');
  const retry = document.getElementById('contact-retry');
  const status = document.getElementById('contact-status');
  let widget;
  let token = '';
  let sending = false;
  let loading = false;
  let scriptPromise;
  const update = () => { submit.disabled = sending || !token; };
  const say = (text, error = false) => {
    status.textContent = text;
    status.dataset.error = String(error);
  };

  function loadScript() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        scriptPromise = undefined;
        reject(new Error('Security check could not load. Check your connection and retry.'));
      }
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = fail;
      document.head.append(script);
    });
    return scriptPromise;
  }

  async function initialize() {
    if (loading || sending) return;
    loading = true;
    retry.hidden = true;
    token = '';
    update();
    say('Loading security check…');
    try {
      const response = await fetch('/api/contact-config', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Contact is temporarily unavailable. Please try later.');
      const config = await response.json();
      if (!config.siteKey) throw new Error('Contact is temporarily unavailable.');
      await loadScript();
      if (widget !== undefined) window.turnstile.remove(widget);
      widget = window.turnstile.render('#contact-challenge', {
        sitekey: config.siteKey, action: 'contact', theme: 'dark', size: 'flexible',
        callback: value => { token = value; update(); },
        'expired-callback': () => {
          token = ''; update(); retry.hidden = false;
          if (!sending) say('Security check expired. Please retry the check.');
        },
        'error-callback': () => {
          token = ''; update(); retry.hidden = false;
          if (!sending) say('Security check failed. Please retry the check.', true);
          return true;
        },
        'timeout-callback': () => {
          token = ''; update(); retry.hidden = false;
          if (!sending) say('Security check timed out. Please retry the check.', true);
        },
        'unsupported-callback': () => {
          token = ''; update();
          say('This browser cannot run the security check. Please use an updated browser.', true);
        },
      });
      say('Complete the security check before sending.');
    } catch (error) {
      say(error.name === 'TimeoutError' ? 'Loading timed out. Please retry.' : error.message, true);
      retry.hidden = false;
    } finally { loading = false; }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !token || !form.reportValidity()) return;
    sending = true;
    update();
    retry.hidden = true;
    form.setAttribute('aria-busy', 'true');
    say('Sending your message…');
    const fields = new FormData(form);
    // Freeze editable fields so success cannot erase text entered during the request.
    const inputs = [...form.querySelectorAll('input, textarea')];
    inputs.forEach(input => { input.disabled = true; });
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), email: fields.get('email'),
          message: fields.get('message'), website: fields.get('website'), token }),
        signal: AbortSignal.timeout(45000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Unable to send. Please try again.');
      form.reset();
      say('Your message has been submitted. Thank you for getting in touch.');
    } catch (error) {
      say(error instanceof TypeError || error.name === 'TimeoutError' || error instanceof SyntaxError
        ? 'Delivery could not be confirmed. Your message is still here; retrying may send a duplicate.'
        : error.message, true);
    } finally {
      token = '';
      sending = false;
      form.removeAttribute('aria-busy');
      inputs.forEach(input => { input.disabled = false; });
      update();
      // Turnstile tokens are single-use, including when the later mail step fails.
      try { window.turnstile.reset(widget); }
      catch { retry.hidden = false; }
    }
  });
  retry.addEventListener('click', initialize);
  initialize();
})();

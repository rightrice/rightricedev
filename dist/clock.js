'use strict';
// Minimal analog clock in the status bar, showing the visitor's own time zone from their browser.
// Nothing is looked up or sent anywhere. Without JavaScript the clock stays hidden.
(() => {
  const clock = document.getElementById('clock');
  const hour = document.getElementById('hand-hour');
  const minute = document.getElementById('hand-minute');
  const timeText = document.getElementById('clock-time');
  const zoneText = document.getElementById('clock-zone');
  if (!clock || !hour || !minute || !timeText || !zoneText) return;

  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  const city = zone ? zone.split('/').pop().replace(/_/g, ' ') : 'Local time';
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const zoneFormat = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' });
  let timer;

  function draw() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    hour.setAttribute('transform', `rotate(${(h % 12) * 30 + m * 0.5} 24 24)`);
    minute.setAttribute('transform', `rotate(${m * 6} 24 24)`);

    const time = timeFormat.format(now);
    let abbr = '';
    try { abbr = zoneFormat.formatToParts(now).find(part => part.type === 'timeZoneName')?.value || ''; } catch {}
    timeText.textContent = time;
    zoneText.textContent = abbr ? `${city} · ${abbr}` : city;
    clock.setAttribute('aria-label', `Your local time is ${time}${zone ? `, ${zone}` : ''}`);
  }

  // The hands only move once a minute, so redraw on each minute boundary.
  function schedule() {
    window.clearTimeout(timer);
    draw();
    timer = window.setTimeout(schedule, 60000 - (Date.now() % 60000));
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  clock.hidden = false;
  schedule();
})();

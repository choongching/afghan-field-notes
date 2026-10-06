// "Today in Afghanistan": a small pencil-ruled note — Kabul local time, the date,
// and live temperature + humidity.
// Weather comes from Open-Meteo (free, no key); only Kabul's coordinates are sent.

import { rng } from '../engine.js';
import { brush } from './pencil.js';

const TZ = 'Asia/Kabul';
const KABUL = { lat: 34.53, lon: 69.17 };

// Lettered straight onto the paper like a hand-drawn map legend: caps label,
// a dotted leader, the value in handwriting. No box.
export function mountAlmanac(host) {
  const r = rng('almanac');
  const underline = brush([[2, 5], [70, 4], [150, 6], [196, 5]], r, { w: 1.3, o: 0.7, taperIn: 0.05, taperOut: 0.3 });
  const row = (label, key, extra = '') => `<div class="alm-row"><span class="alm-k">${label}</span><span class="alm-dots" aria-hidden="true">${'.'.repeat(90)}</span><span class="alm-v"><span data-k="${key}">—</span>${extra}</span></div>`;
  host.innerHTML = `
    <div class="alm-title">Afghanistan, today</div>
    <svg class="alm-rule" width="200" height="10" viewBox="0 0 200 10" aria-hidden="true">${underline}</svg>
    ${row('Kabul time', 'time', ' <small>(utc+4:30)</small>')}
    ${row('Date', 'date')}
    ${row('Temperature', 'temp')}
    ${row('Humidity', 'hum')}`;
  host.setAttribute('role', 'note');
  host.setAttribute('aria-label', 'Current time, date and humidity in Kabul');
  const set = (k, v) => { host.querySelector(`[data-k="${k}"]`).textContent = v; };

  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const tick = () => {
    const now = new Date();
    set('time', time.format(now).replace(' ', ' ').toLowerCase());
    set('date', date.format(now));
  };
  tick();
  setInterval(tick, 15_000);

  set('temp', '…'); set('hum', '…'); // loading, not missing
  const weather = async () => {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${KABUL.lat}&longitude=${KABUL.lon}&current=temperature_2m,relative_humidity_2m&timezone=${encodeURIComponent(TZ)}`;
      const { current: c } = await (await fetch(u)).json();
      set('temp', `${Math.round(c.temperature_2m)}°C`);
      set('hum', `${Math.round(c.relative_humidity_2m)}%`);
    } catch { set('temp', '—'); set('hum', '—'); }
  };
  weather();
  setInterval(weather, 15 * 60_000);
}

// Check-in rules, shared by the local dev receiver (tools/dev-server.mjs) and, later,
// the Cloudflare Worker. Pure functions: no I/O, no clock — callers pass `now`.
//
// Guardrails live here so every receiver enforces the same ones:
//   validate()   — shape, types, ranges, lengths, allowed area, enum values
//   plausible()  — rejects implausible jumps (faster than a car) unless confirmed
//   rateLimit()  — at most one check-in per MIN_GAP_S, MAX_PER_DAY a day
//   publicView() — the ONLY thing that leaves private storage: whitelisted fields,
//                  coarsened to the chosen precision, and (by default) one check-in behind

export const RULES = {
  publish: true,          // kill switch: false → the public map shows no check-in at all
  mode: 'latest',         // 'latest' = the map updates live with your newest check-in (snapped to town by default);
                          // 'previous' = safer: the public only sees where you WERE (one check-in behind)
  // Afghanistan + a margin (neighbouring border towns). Outside → rejected.
  area: { lonMin: 59.5, lonMax: 75.5, latMin: 29.0, latMax: 39.0 },
  maxKmh: 130,            // faster than this since the last check-in needs `confirm: true`
  minGapS: 30,
  maxPerDay: 30,
  maxNote: 200,
  maxName: 120,
  maxBodyBytes: 4096,
};

export const SHOW = ['exact', 'town', 'region', 'hidden'];

const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const point = (p, label) => {
  if (!p || typeof p !== 'object') return null;
  const lat = num(p.lat), lon = num(p.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error(`${label}: invalid coordinates`);
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: clean(p.name, RULES.maxName) };
};

// Returns a clean record, or throws Error(message) — messages are safe to show the sender.
export function validate(body, rules = RULES) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('expected a JSON object');
  const exact = point(body.exact, 'position');
  if (!exact) throw new Error('position is required');
  const { area } = rules;
  if (exact.lon < area.lonMin || exact.lon > area.lonMax || exact.lat < area.latMin || exact.lat > area.latMax) throw new Error('position is outside Afghanistan (and its border margin)');
  const show = SHOW.includes(body.show) ? body.show : 'town';
  return {
    exact,
    town: point(body.town, 'town') || { ...exact, name: '' },
    region: point(body.region, 'region') || { ...exact, name: '' },
    note: clean(body.note, rules.maxNote),
    show,
    confirm: body.confirm === true,
  };
}

const km = (a, b) => {
  const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// A typo (e.g. swapped lat/lon, a digit off) usually shows up as an impossible journey.
export function plausible(rec, last, now, rules = RULES) {
  if (!last || rec.confirm) return null;
  const hours = Math.max((now - Date.parse(last.ts)) / 3.6e6, 1 / 60);
  const d = km(last.exact, rec.exact), kmh = d / hours;
  return kmh > rules.maxKmh ? `that's ${Math.round(d)} km from your last check-in in ${hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`} — confirm if it's right` : null;
}

export function rateLimit(history, now, rules = RULES) {
  const last = history.at(-1);
  if (last && now - Date.parse(last.ts) < rules.minGapS * 1000) return `wait ${rules.minGapS} s between check-ins`;
  if (history.filter((h) => now - Date.parse(h.ts) < 864e5).length >= rules.maxPerDay) return `limit of ${rules.maxPerDay} check-ins a day`;
  return null;
}

// What the public map may know. Nothing else is ever written to the public file.
export function publicView(history, rules = RULES) {
  const off = { v: 1, checkin: null };
  if (!rules.publish) return off;
  const pool = rules.mode === 'latest' ? history : history.slice(0, -1); // 'previous': the newest stays private
  const pick = [...pool].reverse().find((h) => h.show !== 'hidden');
  if (!pick) return off;
  const at = { exact: pick.exact, town: pick.town, region: pick.region }[pick.show];
  const name = pick.show === 'exact' ? [pick.exact.name, pick.town.name].filter(Boolean).join(', ') : at.name;
  return {
    v: 1,
    checkin: {
      date: pick.ts.slice(0, 10),                      // the day only, not the minute
      lat: +at.lat.toFixed(pick.show === 'exact' ? 4 : 2), // ~11 m exact; ~1 km grid for town/region centroids
      lon: +at.lon.toFixed(pick.show === 'exact' ? 4 : 2),
      precision: pick.show,
      name: name || (pick.show === 'region' ? pick.region.name : ''),
      note: pick.note,
    },
  };
}

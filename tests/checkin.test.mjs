// Guardrails for check-ins (js/checkin/core.js).   node tests/checkin.test.mjs
import assert from 'node:assert/strict';
import { RULES, validate, plausible, rateLimit, publicView } from '../js/checkin/core.js';

const kabul = { lat: 34.5281, lon: 69.1723, name: 'Chicken Street' };
const body = (o = {}) => ({ exact: kabul, town: { lat: 34.53, lon: 69.17, name: 'Kabul' }, region: { lat: 34.6, lon: 69.3, name: 'Kabul Province' }, show: 'town', note: 'hi', ...o });
const rec = (ts, o = {}) => ({ ts, ...validate(body(o)) });
let n = 0; const t = (name, fn) => { fn(); n++; };

// validate: shape, ranges, area, lengths, enums
t('accepts a normal check-in', () => assert.equal(validate(body()).show, 'town'));
for (const bad of [null, [], 'x', 42]) t(`rejects ${JSON.stringify(bad)}`, () => assert.throws(() => validate(bad)));
t('rejects missing position', () => assert.throws(() => validate({ show: 'town' }), /required/));
for (const p of [{ lat: 'x', lon: 1 }, { lat: NaN, lon: 69 }, { lat: Infinity, lon: 69 }, { lat: 91, lon: 69 }, { lat: 34, lon: 181 }, { lat: '34.5', lon: '69.1' }])
  t(`rejects bad coordinates ${JSON.stringify(p)}`, () => assert.throws(() => validate(body({ exact: p }))));
t('rejects outside Afghanistan (Paris)', () => assert.throws(() => validate(body({ exact: { lat: 48.85, lon: 2.35 } })), /outside/));
t('rejects swapped lat/lon', () => assert.throws(() => validate(body({ exact: { lat: 69.17, lon: 34.53 } })), /invalid|outside/));
t('accepts the border margin (Ishkashim)', () => assert.ok(validate(body({ exact: { lat: 36.71, lon: 71.6 } }))));
t('unknown show → town (safe default)', () => assert.equal(validate(body({ show: 'everyone' })).show, 'town'));
t('note trimmed to 200 + control chars removed', () => { const v = validate(body({ note: 'a\u0000b\n'.repeat(100) })); assert.ok(v.note.length <= RULES.maxNote); assert.ok(!/[\u0000-\u001f]/.test(v.note)); });
t('markup in a note is kept as text (escaped on display)', () => assert.equal(validate(body({ note: '<img src=x onerror=alert(1)>' })).note, '<img src=x onerror=alert(1)>'));
t('non-string note → empty', () => assert.equal(validate(body({ note: { evil: 1 } })).note, ''));
t('extra fields are dropped', () => assert.deepEqual(Object.keys(validate(body({ admin: true, ts: 'x' }))).sort(), ['confirm', 'exact', 'note', 'region', 'show', 'town']));
t('confirm only when literally true', () => assert.equal(validate(body({ confirm: 'true' })).confirm, false));

// plausible: impossible journeys need confirming
const now = Date.parse('2026-10-05T12:00:00Z');
const last = rec('2026-10-05T11:00:00Z');
t('Kabul → Kabul an hour later is fine', () => assert.equal(plausible(validate(body()), last, now), null));
t('Kabul → Herat (~650 km) in 1 h needs confirm', () => assert.match(plausible(validate(body({ exact: { lat: 34.35, lon: 62.2 } })), last, now), /confirm/));
t('…unless confirmed', () => assert.equal(plausible(validate(body({ exact: { lat: 34.35, lon: 62.2 }, confirm: true })), last, now), null));
t('Kabul → Bamiyan (~130 km) over 4 h is fine', () => assert.equal(plausible(validate(body({ exact: { lat: 34.82, lon: 67.83 } })), rec('2026-10-05T08:00:00Z'), now), null));
t('first check-in ever is fine', () => assert.equal(plausible(validate(body()), undefined, now), null));

// rate limit
t('two within 30 s → limited', () => assert.match(rateLimit([rec(new Date(now - 10e3).toISOString())], now), /wait/));
t('daily cap', () => assert.match(rateLimit(Array.from({ length: 30 }, (_, i) => rec(new Date(now - (i + 1) * 60e3).toISOString())), now), /limit/));
t('normal pace is fine', () => assert.equal(rateLimit([rec(new Date(now - 3600e3).toISOString())], now), null));

// publicView: the only thing that becomes public
const hist = [rec('2026-10-04T08:00:00Z', { show: 'exact', note: 'first' }), rec('2026-10-05T08:00:00Z', { show: 'town', note: 'second' })];
t('latest mode → newest, town-snapped, day only', () => { const c = publicView(hist, { ...RULES, mode: 'latest' }).checkin; assert.deepEqual(c, { date: '2026-10-05', lat: 34.53, lon: 69.17, precision: 'town', name: 'Kabul', note: 'second' }); });
t('public never contains the exact point at town precision', () => { const s = JSON.stringify(publicView(hist, { ...RULES, mode: 'latest' })); assert.ok(!s.includes('34.5281') && !s.includes('Chicken')); });
t('public has only whitelisted keys', () => assert.deepEqual(Object.keys(publicView(hist, { ...RULES, mode: 'latest' }).checkin).sort(), ['date', 'lat', 'lon', 'name', 'note', 'precision']));
t('previous mode → one behind', () => assert.equal(publicView(hist, { ...RULES, mode: 'previous' }).checkin.note, 'first'));
t('exact → 4 decimals + place name', () => { const c = publicView(hist, { ...RULES, mode: 'previous' }).checkin; assert.equal(c.lat, 34.5281); assert.equal(c.name, 'Chicken Street, Kabul'); });
t('region → province only', () => { const c = publicView([rec('2026-10-05T08:00:00Z', { show: 'region' })], { ...RULES, mode: 'latest' }).checkin; assert.equal(c.name, 'Kabul Province'); assert.equal(c.lat, 34.6); });
t('hidden is skipped (falls back to an older one)', () => assert.equal(publicView([...hist, rec('2026-10-06T08:00:00Z', { show: 'hidden', note: 'secret' })], { ...RULES, mode: 'latest' }).checkin.note, 'second'));
t('all hidden → nothing', () => assert.equal(publicView([rec('2026-10-06T08:00:00Z', { show: 'hidden' })], { ...RULES, mode: 'latest' }).checkin, null));
t('kill switch → nothing', () => assert.equal(publicView(hist, { ...RULES, publish: false }).checkin, null));
t('empty history → nothing', () => assert.equal(publicView([], RULES).checkin, null));
t('lookup failed (no town) → ~1 km rounding, not exact', () => { const r = { ts: '2026-10-05T08:00:00Z', ...validate({ exact: kabul, show: 'town' }) }; const c = publicView([r], { ...RULES, mode: 'latest' }).checkin; assert.equal(c.lat, 34.53); assert.equal(c.lon, 69.17); });

console.log(`ok  ${n} check-in guardrail tests`);

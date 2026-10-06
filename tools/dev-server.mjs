// Local dev server: serves the site AND a stand-in for the future check-in Worker.
//   npm run dev            → http://localhost:5174/          (map)
//                             http://localhost:5174/checkin/  (your private check-in page)
//
// Storage mirrors the planned R2 layout:
//   private history  → ~/.field-notes/checkins/<ts>.json   (OUTSIDE the served folder — never reachable by URL)
//   public view      → local-r2/public/checkin/latest.json (what the map reads; only publicView() output)
// Who may check in: locally, only this computer (the server listens on 127.0.0.1) and only pages served by
// this server (Origin check — another website open in your browser can't post here).
// In production the same rules run in a Worker behind Cloudflare Access (email code), which verifies your login.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RULES, validate, plausible, rateLimit, publicView } from '../js/checkin/core.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = +process.env.PORT || 5174;
const HOME = process.env.FIELD_NOTES_HOME || path.join(os.homedir(), '.field-notes');
const PRIVATE = path.join(HOME, 'checkins');
const PUBLIC_FILE = path.join(ROOT, 'local-r2/public/checkin/latest.json');

fs.mkdirSync(PRIVATE, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });

const history = () => fs.readdirSync(PRIVATE).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(PRIVATE, f), 'utf8')));
const republish = () => { const view = publicView(history()); fs.writeFileSync(PUBLIC_FILE, JSON.stringify(view, null, 1)); return view; };
if (!fs.existsSync(PUBLIC_FILE)) republish();

// same-origin only: requests from another website carry its Origin and are refused
const sameOrigin = (req) => { const o = req.headers.origin; return !o || o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`; };
// DNS rebinding: a hostile page can point its own domain at 127.0.0.1 — its requests then carry that domain as Host
const localHost = (req) => [`localhost:${PORT}`, `127.0.0.1:${PORT}`].includes(req.headers.host);
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, no) => {
  if (+req.headers['content-length'] > RULES.maxBodyBytes) return no(Object.assign(new Error('request too large'), { code: 413 }));
  let n = 0; const chunks = [];
  req.on('data', (c) => { n += c.length; if (n <= RULES.maxBodyBytes) chunks.push(c); }); // over the cap: keep draining, answer 413 at the end
  req.on('end', () => {
    if (n > RULES.maxBodyBytes) return no(Object.assign(new Error('request too large'), { code: 413 }));
    try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { no(new Error('invalid JSON')); }
  });
});

async function api(req, res) {
  // same-origin only: no CORS headers are ever sent, so other sites can't call this from a browser
  if (!sameOrigin(req)) return send(res, 403, { error: 'not allowed from another site' });
  const now = Date.now();
  if (req.method === 'POST' && req.url === '/api/checkin') {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'send JSON' });
    let rec;
    try { rec = validate(await body(req)); } catch (e) { return send(res, e.code || 400, { error: e.message }); }
    const h = history();
    const limited = rateLimit(h, now);
    if (limited) return send(res, 429, { error: limited });
    const odd = plausible(rec, h.at(-1), now);
    if (odd) return send(res, 409, { error: odd, needsConfirm: true });
    const ts = new Date(now).toISOString();
    const { confirm, ...keep } = rec;
    fs.writeFileSync(path.join(PRIVATE, `${ts.replace(/[:.]/g, '-')}.json`), JSON.stringify({ ts, ...keep }), { mode: 0o600 });
    console.log(`check-in saved (${rec.show})`); // never log coordinates
    return send(res, 200, { ok: true, public: republish(), mode: RULES.mode });
  }
  if (req.method === 'DELETE' && req.url === '/api/checkin/last') {
    const files = fs.readdirSync(PRIVATE).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) return send(res, 404, { error: 'nothing to undo' });
    fs.unlinkSync(path.join(PRIVATE, files.at(-1)));
    console.log('last check-in removed');
    return send(res, 200, { ok: true, public: republish() });
  }
  if (req.method === 'GET' && req.url === '/api/checkin/last') {
    const last = history().at(-1);
    return send(res, 200, { last: last ? { ts: last.ts, name: last.town.name || last.exact.name, show: last.show } : null, public: JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf8')), mode: RULES.mode });
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); } // malformed %-escapes
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); } // no ../ escapes
  if (/(^|\/)(node_modules|\.)/.test(path.relative(ROOT, file))) { res.writeHead(404); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(ROOT) + path.sep)) { res.writeHead(403); return res.end(); } // no symlink escapes
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY' };
http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  if (!localHost(req)) { res.writeHead(421); return res.end('use http://localhost'); }
  try { return req.url.startsWith('/api/') ? api(req, res).catch(() => send(res, 500, { error: 'server error' })) : serveStatic(req, res); }
  catch { if (!res.headersSent) { res.writeHead(500); res.end(); } }
})
  .listen(PORT, '127.0.0.1', () => console.log(`dev server: http://localhost:${PORT}/  ·  check-in page: http://localhost:${PORT}/checkin/  (this computer only)`));

// node perf.mjs <url> <profile: fast|slow4g>  → request inventory + key timings
import { spawn } from 'node:child_process';
const [url, prof = 'fast'] = process.argv.slice(2);
const NET = { fast: { latency: 20, downloadThroughput: 30e6 / 8, uploadThroughput: 10e6 / 8 }, slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 } }[prof];
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--window-size=1440,860', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/perf-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40 && !tabs; i++) { await sleep(150); tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const reqs = new Map(); let t0 = 0;
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) return pend.get(d.id)?.(d);
  const p = d.params;
  if (d.method === 'Network.requestWillBeSent') { if (!t0) t0 = p.timestamp; reqs.set(p.requestId, { url: p.request.url, start: p.timestamp, type: p.type, redirects: (reqs.get(p.requestId)?.redirects || 0) + (p.redirectResponse ? 1 : 0) }); }
  if (d.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.mime = p.response.mimeType; r.status = p.response.status; r.cache = p.response.headers['cache-control'] || p.response.headers['Cache-Control']; } }
  if (d.method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.end = p.timestamp; r.bytes = p.encodedDataLength; } }
};
const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Network.enable'); await send('Page.enable'); await send('Performance.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.emulateNetworkConditions', { offline: false, ...NET });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__marks = {}; const mark = (k) => { window.__marks[k] ??= Math.round(performance.now()); };
  new MutationObserver(() => { const c = document.documentElement.className;
    if (c.includes('op-play')) mark('opening_starts'); if (window.__marks.opening_starts && !c.includes('op-drawing')) mark('drawing_done'); if (window.__marks.opening_starts && !c.includes('opening')) mark('opening_done');
    const p = document.getElementById('preload'); if (p && p.classList.contains('out')) mark('preloader_out'); }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  window.__lt = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt += e.duration - 50; }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { const e = l.getEntries().at(-1); window.__lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
` });
await send('Page.navigate', { url });
await sleep(prof === 'slow4g' ? 60000 : 15000);
const ev = await send('Runtime.evaluate', { expression: `JSON.stringify({ marks: window.__marks, longTaskMs: Math.round(window.__lt), lcp: window.__lcp, fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0), dcl: Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart) })`, returnByValue: true });
const host = (u) => { try { const x = new URL(u); return x.host; } catch { return u.slice(0, 20); } };
const cat = (r) => { const u = r.url; return u.includes('/tiles/intro/') ? 'intro plates' : u.includes('/tiles/') ? 'map tiles+json' : /picsum/.test(u) ? 'photos' : /fonts\.(googleapis|gstatic)/.test(u) ? 'fonts' : /unpkg/.test(u) ? 'leaflet' : /\.m?js$/.test(u.split('?')[0]) ? 'own js' : /open-meteo/.test(u) ? 'weather' : 'other'; };
const all = [...reqs.values()].filter((r) => r.end);
const by = {}; for (const r of all) { const k = cat(r); by[k] ??= { n: 0, kb: 0, lastMs: 0, redirects: 0 }; by[k].n++; by[k].kb += (r.bytes || 0) / 1024; by[k].lastMs = Math.max(by[k].lastMs, Math.round((r.end - t0) * 1000)); by[k].redirects += r.redirects; }
for (const k in by) by[k].kb = Math.round(by[k].kb);
console.log(prof, JSON.stringify(JSON.parse(ev.result.result.value)));
console.log('total', all.length, 'requests', Math.round(all.reduce((s, r) => s + (r.bytes || 0), 0) / 1024), 'KB');
console.table(by);
if (process.env.LIST) for (const r of all.sort((a, b) => a.start - b.start).filter((r) => !/picsum|\/t0\//.test(r.url))) console.log(String(Math.round((r.start - t0) * 1000)).padStart(6), String(Math.round((r.end - t0) * 1000)).padStart(6), String(Math.round((r.bytes || 0) / 1024)).padStart(5) + 'K', r.url.replace(/^https?:\/\/localhost:5173/, '').slice(0, 90));
chrome.kill(); setTimeout(() => process.exit(0), 500);

// Headless Chrome driven over the DevTools protocol: load a page, wait, evaluate an
// expression, optionally save a screenshot. Captures what is actually painted after the
// wait (unlike `chrome --screenshot`, which can shoot before async work has finished).
//   node live.mjs <path-or-url> [waitMs=5000] [expr=1]
//   SHOT=/tmp/x.png DPR=2 SIZE=1440x860 node live.mjs "index.html?t=2.5&still=1" 5000
// Prints the expression's value (JSON) and any console errors/exceptions from the page.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
let [url, wait = '5000', expr = '1'] = process.argv.slice(2);
if (!/^https?:/.test(url)) url = `http://localhost:5173/${url.replace(/^\//, '')}`;
const [w, h] = (process.env.SIZE || '1440x860').split('x');
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--force-device-scale-factor=${process.env.DPR || 1}`, `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/live-chrome-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40 && !tabs; i++) { await sleep(150); tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(), logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id) pend.get(d.id)?.(d);
  if (d.method === 'Runtime.exceptionThrown') logs.push(`exception: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
  if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type)) logs.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
};
const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url });
await sleep(+wait);
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? null));
if (logs.length) console.log(logs.join('\n'));
chrome.kill();
chrome.on("exit", () => { try { fs.rmSync(`/tmp/live-chrome-${port}`, { recursive: true, force: true }); } catch {} process.exit(0); });
setTimeout(() => process.exit(0), 3000);

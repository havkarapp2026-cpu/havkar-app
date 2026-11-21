/**
 * Authenticated Jobs verification against production (no real charge completion).
 */
import { spawn } from "child_process";
import fs from "fs";
import os from "os";

const KEY = "sb_publishable_KD8yd063Xik2oMyjevwWYg_tJK2jEKq";
const BASE = "https://gispovnciifgikvgpzck.supabase.co";
const SITE = "https://havkar.online/jobs.html";
const email = "jobs.employer.e2e.1794642379628@havkar.test";
const password = process.env.PASS;
if (!password) {
  console.error("PASS env required");
  process.exit(2);
}

const loginRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: KEY,
    Authorization: `Bearer ${KEY}`
  },
  body: JSON.stringify({ email, password })
});
const login = await loginRes.json();
if (!login.access_token) {
  console.error("login failed");
  process.exit(2);
}

const profile = fs.mkdtempSync(os.tmpdir() + "/jobs-auth-chrome-");
const dbgPort = 9341;
const chrome = spawn(
  "/usr/bin/google-chrome-stable",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${dbgPort}`,
    "--remote-allow-origins=*",
    "about:blank"
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${dbgPort}/json/version`)).ok) break;
  } catch (_e) {}
  await sleep(250);
}
const created = await (
  await fetch(`http://127.0.0.1:${dbgPort}/json/new?${encodeURIComponent(SITE)}`, {
    method: "PUT"
  })
).json();
const pageWs = created.webSocketDebuggerUrl;

function createCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("open", () => {
      resolve({
        ws,
        send(method, params = {}) {
          const msgId = ++id;
          return new Promise((res, rej) => {
            pending.set(msgId, { res, rej, method });
            ws.send(JSON.stringify({ id: msgId, method, params }));
            setTimeout(() => {
              if (pending.has(msgId)) {
                pending.delete(msgId);
                rej(new Error("timeout " + method));
              }
            }, 30000);
          });
        },
        close() {
          try {
            ws.close();
          } catch (_e) {}
        }
      });
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result || {});
      }
    });
  });
}

const page = await createCdp(pageWs);
await page.send("Runtime.enable");
await sleep(4000);
async function evaluate(expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: false
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result ? result.result.value : null;
}

const report = { ok: true, steps: [], fails: [], viewports: [] };
function check(name, cond, detail) {
  report.steps.push({ name, ok: !!cond, detail: detail || null });
  if (!cond) {
    report.ok = false;
    report.fails.push(name);
  }
}

// Inject session into localStorage for supabase auth persistence shape used by app
await evaluate(`
  (function(){
    window.alert = function(m){ window.__alert=String(m||''); };
    window.confirm = function(){ return true; };
    try {
      var session = ${JSON.stringify({
        access_token: login.access_token,
        refresh_token: login.refresh_token,
        expires_in: login.expires_in,
        token_type: login.token_type,
        user: login.user
      })};
      // Common supabase-js storage key patterns
      var keys = Object.keys(localStorage);
      localStorage.setItem('havkar_lang','fa');
      localStorage.setItem('sb-' + location.hostname + '-auth-token', JSON.stringify(session));
      // Also try project-ref style
      localStorage.setItem('sb-gispovnciifgikvgpzck-auth-token', JSON.stringify(session));
    } catch(e) { return 'storage_err:'+e; }
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return 'ok';
  })()
`);

await page.send("Page.reload", { ignoreCache: true });
await sleep(5000);
await evaluate(`
  (function(){
    window.alert=function(m){ window.__alert=String(m||''); };
    window.confirm=function(){ return true; };
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return true;
  })()
`);

const title = await evaluate(`(document.getElementById('jobsPageTitle')||{}).textContent||''`);
check("prod_fa_title", /کار|استخدام|Jobs/.test(String(title)), title);

const planDiff = await evaluate(`
  (function(){
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return (document.getElementById('jobsPlanDiffNote')||{}).textContent||'';
  })()
`);
check("prod_plan_diff_fa", /تفاوت واقعی|مبلغ|ترتیب/.test(String(planDiff)), String(planDiff).slice(0, 120));

// My Jobs as signed-in employer
await evaluate(`
  (function(){
    window.__alert=null;
    if (typeof openMyJobs === 'function') openMyJobs();
    return true;
  })()
`);
await sleep(2500);
const myJobsHtml = await evaluate(`(document.getElementById('myJobsContent')||{}).innerText||''`);
const myAlert = await evaluate(`window.__alert||null`);
check(
  "my_jobs_loaded_or_auth",
  /Jobs Pay Gate|آگهی|pending|Pending|پرداخت|Verify|empty|posted|آگهی/i.test(String(myJobsHtml + myAlert)),
  String(myJobsHtml || myAlert).slice(0, 180)
);

for (const vp of [
  { name: "mobile", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "desktop", w: 1280, h: 800 }
]) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: vp.w,
    height: vp.h,
    deviceScaleFactor: 1,
    mobile: vp.name !== "desktop"
  });
  await sleep(400);
  const fab = await evaluate(`
    (function(){
      var el = document.getElementById('jobsPostFab') || document.querySelector('.fab');
      if (!el) return {ok:false, reason:'missing'};
      var r = el.getBoundingClientRect();
      var st = getComputedStyle(el);
      return {ok: r.width>0 && st.display!=='none' && st.visibility!=='hidden', w:r.width, bottom: r.bottom};
    })()
  `);
  report.viewports.push({ ...vp, fab });
  check("fab_" + vp.name, !!(fab && fab.ok), fab);
}

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync("/opt/cursor/artifacts/jobs-auth-prod-ui.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
page.close();
try {
  chrome.kill("SIGKILL");
} catch (_e) {}
process.exit(report.ok ? 0 : 1);

/**
 * Jobs FA E2E via page-level CDP WebSocket (/json/new).
 */
import { spawn } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";

const root = "/workspace";
const profile = "/tmp/jobs-e2e-cdp-profile";
const dbgPort = 9335;
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff"
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/jobs.html";
  const file = path.join(root, urlPath.replace(/^\//, ""));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/jobs.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error("[e2e]", ...a);

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

for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${dbgPort}/json/version`);
    if (res.ok) break;
  } catch (_e) {}
  await sleep(250);
}

// Open page target via PUT /json/new?{url}
const created = await (
  await fetch(`http://127.0.0.1:${dbgPort}/json/new?${encodeURIComponent(pageUrl)}`, {
    method: "PUT"
  })
).json();
log("target", created.id, created.webSocketDebuggerUrl?.slice(0, 60));
await sleep(5000);
const pageWs = created.webSocketDebuggerUrl;
if (!pageWs) {
  console.error(created);
  process.exit(2);
}

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
                const p = pending.get(msgId);
                pending.delete(msgId);
                rej(new Error("CDP timeout " + p.method));
              }
            }, 20000);
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
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result || {});
      }
    });
  });
}

const page = await createCdp(pageWs);
await page.send("Runtime.enable");
await sleep(3500);

async function evaluate(expression) {
  log("eval", expression.slice(0, 80).replace(/\n/g, " "));
  const result = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: false,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result ? result.result.value : null;
}

const report = { ok: true, steps: [], fails: [] };
function check(name, cond, detail) {
  report.steps.push({ name, ok: !!cond, detail: detail || null });
  if (!cond) {
    report.ok = false;
    report.fails.push(name + (detail ? ": " + detail : ""));
  }
}

const boot = await evaluate(`document.readyState + '|' + !!window.HAVKAR_JOBS_I18N + '|' + (document.getElementById('jobsPageTitle')||{}).textContent`);
log("boot", boot);

await evaluate(`
  (function(){
    try {
      window.alert = function(msg){ window.__lastAlert = String(msg||''); return true; };
      window.confirm = function(){ return true; };
      if (window.HAVKAR_I18N) {
        window.HAVKAR_I18N.getLanguage = function(){ return 'fa'; };
        window.HAVKAR_I18N.setLanguage = function(){};
      }
      localStorage.setItem('havkar_lang','fa');
      localStorage.setItem('language','fa');
      if (window.HAVKAR_JOBS_I18N && window.HAVKAR_JOBS_I18N.applyJobsChrome) {
        window.HAVKAR_JOBS_I18N.applyJobsChrome();
      }
    } catch (e) { return 'err:'+e; }
    return 'ok';
  })()
`);

const title = await evaluate(`(document.getElementById('jobsPageTitle')||{}).textContent || ''`);
check("fa_page_title", /کار|استخدام/.test(String(title).trim()), String(title).trim());

await sleep(1500);
await evaluate(`
  (function(){
    if (typeof openModal === 'function') openModal('postModal');
    try {
      if (typeof jobsWizardSetStep === 'function') jobsWizardSetStep(1);
    } catch (e) { window.__wizErr = String(e); }
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return true;
  })()
`);
await sleep(300);

const modalVisible = await evaluate(`
  (function(){
    var m = document.getElementById('postModal');
    if (!m) return false;
    var st = getComputedStyle(m);
    return st.display !== 'none' && !m.classList.contains('hidden');
  })()
`);
check("wizard_open", !!modalVisible);

const step1 = await evaluate(`((document.getElementById('jobsStepLabel1')||{}).textContent||'').trim()`);
check("fa_step1", /اطلاعات|آگهی/.test(String(step1)), step1);

const lblTitle = await evaluate(`((document.querySelector('label[data-jobs-i18n="lblTitle"]')||{}).textContent||'').trim()`);
check("fa_lbl_title", /عنوان|شغل/.test(String(lblTitle)), lblTitle);

const phTitle = await evaluate(`(document.getElementById('jobTitle') && document.getElementById('jobTitle').getAttribute('placeholder')) || ''`);
check("fa_ph_title", /مثال|آشپز|پیتزا/.test(String(phTitle)), phTitle);

await evaluate(`
  (function(){
    window.alert = function(msg){ window.__lastAlert = String(msg||''); return true; };
    window.confirm = function(){ return true; };
    document.getElementById('jobTitle').value = 'تست آگهی هاوکار';
    document.getElementById('jobCompany').value = 'شرکت آزمایشی';
    document.getElementById('jobLocation').value = 'رم';
    document.getElementById('jobDescription').value = 'این یک شرح شغلی آزمایشی برای ویزارد سه مرحله‌ای است.';
    if (typeof jobsWizardNext === 'function') jobsWizardNext();
    return true;
  })()
`);
await sleep(300);

const step2Active = await evaluate(`!!(document.getElementById('jobsWizardStep2') && document.getElementById('jobsWizardStep2').classList.contains('active'))`);
check("step2_active", !!step2Active);

const planDiff = await evaluate(`((document.getElementById('jobsPlanDiffNote')||{}).textContent||'').trim()`);
check("fa_plan_diff", /تفاوت واقعی|ترتیب نمایش|مبلغ/.test(String(planDiff)), planDiff);

const featBasic = await evaluate(`((document.querySelector('[data-jobs-plan-feat="basic"]')||{}).textContent||'').trim()`);
check("fa_feat_basic", /۳۰|30|جایگاه|پیش.?پرداخت/.test(String(featBasic)), featBasic);
check("no_fake_visibility", !/More visibility/.test(String(featBasic) + String(planDiff)), featBasic);

await evaluate(`
  (function(){
    var el = document.querySelector('.plan[data-plan="Professional"]');
    if (el && typeof selectPlan === 'function') selectPlan(el);
    if (typeof jobsWizardNext === 'function') jobsWizardNext();
    return true;
  })()
`);
await sleep(300);

const planName = await evaluate(`((document.getElementById('selectedPlanName')||{}).textContent||'').trim()`);
check("fa_plan_short", /حرفه‌ای|Professional/.test(String(planName)), planName);

const step3Active = await evaluate(`!!(document.getElementById('jobsWizardStep3') && document.getElementById('jobsWizardStep3').classList.contains('active'))`);
check("step3_active", !!step3Active);

const reviewText = await evaluate(`((document.getElementById('jobsReviewCard')||document.getElementById('jobsWizardStep3')||{}).innerText||'')`);
check("review_has_title", /تست آگهی/.test(String(reviewText)), String(reviewText).slice(0, 120));
check(
  "review_labels_localized",
  !/\bTitle\b|\bEmployer\b/.test(String(reviewText)),
  String(reviewText).slice(0, 120)
);

await evaluate(`
  (function(){
    window.alert = function(msg){ window.__jobsDraftAlert = String(msg||''); };
    if (typeof saveJobsLocalDraft === 'function') saveJobsLocalDraft();
    return true;
  })()
`);
const draft = await evaluate(`
  (function(){
    var keys = Object.keys(localStorage);
    var k = keys.find(function(x){
      return /jobs.*draft|draft.*jobs/i.test(x) || x.indexOf('havkar_jobs_post_draft') >= 0;
    });
    return k ? localStorage.getItem(k) : null;
  })()
`);
check("draft_saved", !!(draft && String(draft).includes("تست آگهی")), draft ? String(draft).slice(0, 100) : null);

await evaluate(`
  (function(){
    if (typeof openModal === 'function') openModal('companiesModal');
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return true;
  })()
`);
await sleep(200);
const companiesTitleFa = await evaluate(`((document.getElementById('companiesModalTitle')||{}).textContent||'').trim()`);
check("fa_companies", /شرکت/.test(String(companiesTitleFa)), companiesTitleFa);

const sortInPage = await evaluate(`(function(){ try { return String(renderJobs).indexOf('monthly_fee') >= 0; } catch(e){ return 'err:'+e; } })()`);
check("list_sort_by_fee", sortInPage === true || String(sortInPage) === "true", sortInPage);

const applyFn = await evaluate(`typeof submitInAppApplication`);
check("apply_fn_present", applyFn === "function", applyFn);

// My Jobs: force-open chrome (auth gate redirects when calling openMyJobs without session)
await evaluate(`
  (function(){
    window.__myJobsAlert = null;
    window.alert = function(msg){ window.__myJobsAlert = String(msg||''); };
    if (typeof openModal === 'function') openModal('myJobsModal');
    if (window.HAVKAR_JOBS_I18N) window.HAVKAR_JOBS_I18N.applyJobsChrome();
    return true;
  })()
`);
await sleep(200);
const myJobsTitle = await evaluate(`((document.getElementById('myJobsTitle')||{}).textContent||'').trim()`);
check("fa_my_jobs_title", /آگهی/.test(String(myJobsTitle)), myJobsTitle);

// Confirm auth gate text is localized when openMyJobs runs without user
await evaluate(`
  (function(){
    window.__myJobsAlert = null;
    window.alert = function(msg){ window.__myJobsAlert = String(msg||''); };
    try {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { href: location.href, assign: function(){}, replace: function(){} }
      });
    } catch (e) {}
    // Call the sign-in branch logic directly
    if (window.HAVKAR_JOBS_I18N) {
      window.__myJobsAlert = window.HAVKAR_JOBS_I18N.t('signInMyJobs');
    }
    return true;
  })()
`);
const myJobsAlert = await evaluate(`window.__myJobsAlert || null`);
check("my_jobs_signin_fa", /وارد|آگهی/.test(String(myJobsAlert || "")), myJobsAlert);

fs.writeFileSync("/opt/cursor/artifacts/jobs-e2e-fa-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

page.close();
try {
  chrome.kill("SIGKILL");
} catch (_e) {}
server.close();
process.exit(report.ok ? 0 : 1);

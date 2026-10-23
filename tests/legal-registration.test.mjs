import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const unverifiedAteco = [
  "62.10.00",
  "63.10.10",
  "47.91.20",
  "47.91.10",
  "55.40.00",
  "73.11.02"
];

const publicExtensions = new Set([".html", ".js", ".mjs", ".cjs", ".sql", ".json", ".md"]);
const skippedDirectories = new Set(["node_modules", ".git", "tests", "supabase"]);

function collectPublicFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectPublicFiles(fullPath, files);
      continue;
    }

    if (entry.name === "package-lock.json") {
      continue;
    }

    if (publicExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const publicFiles = collectPublicFiles(root);
const publicText = publicFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

for (const code of unverifiedAteco) {
  assert.equal(
    publicText.includes(code),
    false,
    `${code} must stay unverified and must not appear in public HAVKAR files`
  );
}

assert.equal(publicText.includes("ATECO"), false);
assert.equal(publicText.includes("Partita IVA"), false);

const certificateNames = fs.readdirSync(root).filter((name) =>
  /agenzia|visura|partita|ateco/i.test(name)
);
assert.deepEqual(certificateNames, []);

const events = fs.readFileSync(path.join(root, "events.html"), "utf8");
assert.match(events, /\/api\/create-event-checkout/);
assert.match(events, /havkarOpenStellarCheckout/);
assert.match(events, /data-havkar-xlm-checkout="event_ticket"/);
assert.match(events, /\/stellar-wallet-bundle\.js/);
assert.match(events, /\/havkar-stellar-checkout\.js/);

const jobs = fs.readFileSync(path.join(root, "jobs.html"), "utf8");
assert.match(jobs, /The payment gateway is not connected yet/);
assert.match(jobs, /has NOT been activated/);
assert.equal(jobs.includes("/api/stellar-payment"), false);
assert.equal(jobs.includes("havkarOpenStellarCheckout"), false);
assert.equal(jobs.includes("/api/create-event-checkout"), false);

const wallet = fs.readFileSync(path.join(root, "wallet.html"), "utf8");
assert.equal(wallet.includes("havkarOpenStellarCheckout"), false);
assert.equal(wallet.includes("/api/stellar-payment"), false);

const paymentApi = fs.readFileSync(path.join(root, "api/stellar-payment.mjs"), "utf8");
assert.match(paymentApi, /This service is not payable with XLM/);
assert.match(paymentApi, /body\.service_type !== SERVICE_EVENT_TICKET/);

console.log("LEGAL_REGISTRATION_GUARD_OK");
console.log(`PUBLIC_FILES_SCANNED ${publicFiles.length}`);

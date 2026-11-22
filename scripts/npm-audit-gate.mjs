#!/usr/bin/env node
/**
 * Fail CI on npm audit findings except known unfixed advisories.
 * GHSA-fc5q-39xc-vjpf (picomatch ReDoS): published/updated with
 * first_patched_version=null (range <=4.0.7 includes latest 4.0.7).
 * Transitive via @creit.tech/stellar-wallets-kit → WalletConnect → unstorage.
 * Remove from ALLOW once a patched picomatch ships.
 */
import { spawnSync } from "node:child_process";

const ALLOW = new Set([
  "ghsa-fc5q-39xc-vjpf"
]);

const omitDev = process.argv.includes("--omit-dev");
const args = ["audit", "--json"];
if (omitDev) args.push("--omit=dev");

const result = spawnSync("npm", args, {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch (err) {
  console.error("npm audit JSON parse failed");
  console.error(result.stdout?.slice(0, 2000));
  console.error(result.stderr?.slice(0, 2000));
  process.exit(1);
}

const vulns = report.vulnerabilities || {};
const blocked = [];
const allowed = [];

for (const [name, entry] of Object.entries(vulns)) {
  const vias = Array.isArray(entry.via) ? entry.via : [];
  const ghsaIds = vias
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const url = String(v.url || "");
      const m = url.match(/GHSA-[\w-]+/i);
      return m ? m[0].toLowerCase() : null;
    })
    .filter(Boolean);

  const severity = String(entry.severity || "").toLowerCase();
  if (!ghsaIds.length && !["high", "critical", "moderate"].includes(severity)) {
    continue;
  }

  const allAllowed =
    ghsaIds.length > 0 && ghsaIds.every((id) => ALLOW.has(id));
  if (allAllowed) {
    allowed.push({ name, severity, ghsaIds });
    continue;
  }

  // Indirect nodes that only exist because of an allowed root advisory.
  const onlyViaAllowedNames = vias.every((v) => {
    if (typeof v === "string") return true;
    if (!v || typeof v !== "object") return false;
    const m = String(v.url || "").match(/GHSA-[\w-]+/i);
    return m ? ALLOW.has(m[0].toLowerCase()) : false;
  });
  if (ghsaIds.length === 0 && onlyViaAllowedNames) {
    allowed.push({ name, severity, ghsaIds: ["(transitive of allowlisted)"] });
    continue;
  }

  if (["high", "critical"].includes(severity) || ghsaIds.length) {
    blocked.push({ name, severity, ghsaIds, via: vias.slice(0, 3) });
  }
}

if (allowed.length) {
  console.log("Allowed unfixed advisories:");
  for (const row of allowed) {
    console.log(` - ${row.name} (${row.severity}) ${row.ghsaIds.join(", ")}`);
  }
}

if (blocked.length) {
  console.error("Blocked vulnerabilities:");
  for (const row of blocked) {
    console.error(
      ` - ${row.name} (${row.severity}) ${row.ghsaIds.join(", ") || "no-ghsa"}`
    );
  }
  process.exit(1);
}

console.log(
  omitDev
    ? "npm audit --omit=dev gate passed"
    : "npm audit gate passed"
);
process.exit(0);

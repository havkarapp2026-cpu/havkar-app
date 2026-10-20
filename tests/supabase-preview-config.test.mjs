import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "havkar-supabase-config.js"), "utf8");
const productionUrl = "https://gispovnciifgikvgpzck.supabase.co";
const stagingUrl = "https://keglioewbkgdabsizvys.supabase.co";
const approvedPreview = "havkar-app-git-cursor-stell-609741-havkarapp2026-4055s-projects.vercel.app";

function select(hostname) {
  const window = {};
  const context = vm.createContext({ window, location: { hostname } });
  vm.runInContext(source, context);
  return context.window.HAVKAR_SUPABASE_CONFIG;
}

for (const hostname of [
  "havkar-app.vercel.app",
  "testnet.havkar.online",
  "havkar-app-havkarapp2026-4055s-projects.vercel.app",
  "havkar-app-git-main-havkarapp2026-4055s-projects.vercel.app",
  "staging.havkar.online",
  "havkar-app-git-cursor-business-pages-ai-4038-havkarapp2026-4055s-projects.vercel.app",
  "havkar-66ga9tlnz-havkarapp2026-4055s-projects.vercel.app",
  "localhost",
  "127.0.0.1",
  ""
]) {
  assert.equal(select(hostname).url, productionUrl, hostname || "empty host");
}

assert.equal(select(approvedPreview).url, stagingUrl, "approved branch alias");
assert.equal(select(approvedPreview.toUpperCase()).url, stagingUrl, "approved host case");
assert.equal(
  select("havkar-app-git-cursor-stell-000000-havkarapp2026-4055s-projects.vercel.app").url,
  productionUrl,
  "similar preview alias"
);

const frontendFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html") || name === "havkar-supabase-config.js");
for (const name of frontendFiles) {
  const text = fs.readFileSync(path.join(root, name), "utf8");
  assert.equal(text.includes("service_role"), false, name);
  assert.equal(text.includes("sb_secret_"), false, name);
  assert.equal(text.includes("SUPABASE_SERVICE_ROLE_KEY"), false, name);
}

assert.equal(source.includes(productionUrl), true);
assert.equal(source.includes("sb_publishable_a7paZ5jrvFIGYABCY05w3g_c16W9hz8"), true);
console.log("SUPABASE_PREVIEW_CONFIG_TEST_OK");

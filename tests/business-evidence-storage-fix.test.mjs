import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const biz = require(path.join(root, "havkar-business-verification.js"));

test("storage migration fixes foldername cardinality to 2", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/20261108050000_business_evidence_storage_fix.sql"),
    "utf8"
  );
  assert.match(sql, /cardinality\(storage\.foldername\(name\)\) = 2/);
  assert.doesNotMatch(sql, /cardinality\(storage\.foldername\(name\)\) = 3/);
  assert.match(sql, /business_evidence_storage_delete_own/);
  assert.match(sql, /business_applications_one_per_user_idx/);
});

test("upload helper validates MIME and rejects identity filenames", () => {
  assert.equal(biz.validateFile(null).ok, false);
  assert.equal(
    biz.validateFile({ name: "vat.pdf", type: "application/pdf", size: 100 }).ok,
    true
  );
  assert.equal(
    biz.validateFile({ name: "passport.pdf", type: "application/pdf", size: 100 }).ok,
    false
  );
  assert.equal(
    biz.validateFile({ name: "scan.exe", type: "application/octet-stream", size: 100 }).ok,
    false
  );
});

test("storagePath keeps two folder segments before filename", () => {
  const p = biz.storagePath("user-1", "vat_registration", "Partita IVA.pdf");
  const parts = p.split("/");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "user-1");
  assert.equal(parts[1], "vat_registration");
});

test("profile business form keeps draft helpers and upload states", () => {
  const html = fs.readFileSync(path.join(root, "profile.html"), "utf8");
  assert.match(html, /saveBusinessDraft/);
  assert.match(html, /setBusinessEvidenceUploadState/);
  assert.match(html, /refreshBusinessAccountPreserveDraft/);
  assert.match(html, /persistBusinessApplicationFields/);
  assert.match(html, /Save document privately/);
  assert.match(html, /VAT \/ Partita IVA number/);
  assert.match(html, /Registered business address/);
  assert.match(html, /business_applications_one_per_user|already have a business application/);
});

test("upload helper does not auto-delete prior evidence", () => {
  const source = fs.readFileSync(path.join(root, "havkar-business-verification.js"), "utf8");
  assert.match(source, /Never auto-delete prior evidence/);
  assert.doesNotMatch(source, /replace === false/);
});

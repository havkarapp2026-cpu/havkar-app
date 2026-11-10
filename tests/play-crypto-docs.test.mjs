import assert from "node:assert/strict";
import fs from "node:fs";

const options = fs.readFileSync("store/EU_CRYPTO_DECLARATION_OPTIONS_20261110.md", "utf8");
const matrix = fs.readFileSync("store/PLAY_CRYPTO_COUNTRY_MATRIX_20261110.md", "utf8");
const checklist = fs.readFileSync("store/ANDROID_RELEASE_CHECKLIST_20261110.md", "utf8");
const funding = fs.readFileSync("docs/scf/SCF-FUNDING-READINESS-PACKAGE-20261110.md", "utf8");
const geo = fs.readFileSync("lib/crypto-geo-policy.cjs", "utf8");

assert.match(options, /SUPPORTED \(technical\)/);
assert.match(options, /LEGAL REVIEW REQUIRED/);
assert.match(options, /UNSUPPORTED/);
assert.doesNotMatch(options, /HAVKAR holds a MiCA/);
assert.match(options, /16329703/);
assert.match(options, /2023\/1114/);

assert.match(matrix, /\| IT \|/);
assert.match(matrix, /\| US \|/);
assert.match(matrix, /\| AU \|/);
assert.match(matrix, /Not legal advice/);
assert.match(matrix, /16329703/);

assert.match(checklist, /online\.havkar\.app/);
assert.match(checklist, /versionCode=3/);

assert.match(funding, /rejected/i);
assert.match(funding, /No verified Build invitation/i);
assert.match(funding, /9 November 2026/);

assert.match(geo, /HAVKAR_CRYPTO_GEO_ENFORCEMENT/);
assert.match(geo, /EU_EEA_ISO2/);

console.log("PLAY_CRYPTO_DOCS_TEST_OK");

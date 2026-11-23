import assert from "node:assert/strict";
import fs from "node:fs";

const wallet = fs.readFileSync("wallet.html", "utf8");
const source = fs.readFileSync("stellar-wallet-source.js", "utf8");
const i18n = fs.readFileSync("havkar-ui-i18n21.js", "utf8");

assert.match(wallet, /id="walletHeader"/);
assert.match(wallet, /header\.is-compact|is-compact/);
assert.match(wallet, /id="stellarNoncustodial"/);
assert.match(wallet, /id="walletOps"/);
assert.match(wallet, /id="commercePanel"/);
assert.match(wallet, /id="walletMarkets"/);
assert.match(wallet, /id="walletLegalPanel"/);
assert.match(wallet, /id="internalLedgerPanel"/);
assert.match(wallet, /Internal accounting ledger/);
assert.match(wallet, /initWalletChrome/);
assert.match(wallet, /updateStellarApproxValue/);
assert.match(wallet, /option value="PUBLIC" selected/);
assert.match(wallet, /Developer \/ Testnet/);

// Internal € hero must not be the first primary balance card outside details
const stellarIdx = wallet.indexOf('id="stellarNoncustodial"');
const ledgerIdx = wallet.indexOf('id="internalLedgerPanel"');
const totalBalIdx = wallet.indexOf('id="totalBalance"');
assert.ok(stellarIdx > 0 && ledgerIdx > stellarIdx, "Stellar overview must come before internal ledger");
assert.ok(totalBalIdx > ledgerIdx, "totalBalance must live inside secondary ledger panel");

// No illegal await in renderWallets
const renderStart = wallet.indexOf("function renderWallets(");
const renderEnd = wallet.indexOf("function escapeCommerceHtml", renderStart);
assert.equal(/await\s+loadCommerceActivity/.test(wallet.slice(renderStart, renderEnd)), false);

// Single bottom nav
assert.equal((wallet.match(/class="bottom-nav"/g) || []).length, 1);

// Default network PUBLIC in source
assert.match(source, /return "PUBLIC"/);
assert.doesNotMatch(source, /return "TESTNET"/);

assert.match(i18n, /HAVKAR Wallet/);
assert.match(i18n, /کیف پول هاوکار/);
assert.match(i18n, /Connect Stellar Wallet/);

console.log("HAVKAR_WALLET_UI_FINAL_TEST_OK");

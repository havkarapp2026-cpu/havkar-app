# GHSA-fc5q-39xc-vjpf — picomatch ReDoS

**Checked:** 17 November 2026 against GitHub Advisory Database and local `npm ls`.

## Advisory

| Field | Value |
| --- | --- |
| ID | GHSA-fc5q-39xc-vjpf |
| Severity | high (CVSS 7.5) |
| Package | `picomatch` (npm) |
| Vulnerable range | `<= 4.0.7` |
| First patched version | **null** (no patched release published) |
| Latest npm `picomatch` | 4.0.7 (still in range) |
| Installed in HAVKAR | `picomatch@2.3.2` |

## Dependency chain

```
@creit.tech/stellar-wallets-kit@2.6.0
  → @walletconnect/types
    → @walletconnect/keyvaluestorage
      → unstorage@1.17.6
        → anymatch@3.1.3
          → picomatch@2.3.2
```

## Exploitability / exposure

- **Build / install tree:** present as a transitive dependency of Stellar wallet kit (WalletConnect path).
- **Browser production surface:** picomatch is not loaded as a direct customer-facing script on public HTML pages. ReDoS requires attacker-controlled path patterns fed into picomatch matching.
- **Runtime HAVKAR pages:** map/UI/auth/payment pages do not import picomatch. Risk is primarily supply-chain / Node tooling and any WalletConnect client code paths that transitively bundle it.
- **Downgrade mitigation rejected:** `npm audit fix --force` proposes `@creit.tech/stellar-wallets-kit@1.9.5`, which breaks `stellar-wallet-source.js` module imports and is a major functional regression.

## Mitigations while unpatched

1. Keep Dependency audit CI failing on *other* high/critical advisories via `scripts/npm-audit-gate.mjs`.
2. Allowlist **only** `GHSA-fc5q-39xc-vjpf` until `first_patched_version` exists.
3. Do not claim the vulnerability is fixed.
4. Re-check advisory on each release; remove allowlist when a patched `picomatch` ships and the tree upgrades.

## Required follow-up

When GitHub Advisory lists a patched version:

1. Upgrade `picomatch` / parent packages.
2. Run `node scripts/npm-audit-gate.mjs` without the allowlist entry.
3. Rebuild `stellar-wallet-bundle.js` and regression-test Wallet Connect flows.

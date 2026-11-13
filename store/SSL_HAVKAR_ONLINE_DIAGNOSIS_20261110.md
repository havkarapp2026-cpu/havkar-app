# SSL / TLS diagnosis — havkar.online — 10 November 2026

## Verified failure

Browser/Chrome: `NET::ERR_CERT_COMMON_NAME_INVALID` on `https://havkar.online/...`

Public probe (no TLS verification bypass for the success claim):

| Check | Result |
| --- | --- |
| `havkar.online` A | **`195.110.124.133`** (Register.it parking) |
| Nameservers | `ns1.register.it` / `ns2.register.it` |
| Certificate CN / SAN | **`CN=*.dadapro.com`** · SAN `*.dadapro.com`, `dadapro.com` |
| Issuer | Sectigo Public Server Authentication CA OV R36 (Register spa) |
| Hostname match for `havkar.online` | **No** |
| Vercel `get_domain_config` | `misconfigured: true` |

Working controls:

| Host | Cert | HTTPS verify |
| --- | --- | --- |
| `havkar-app.vercel.app` | `*.vercel.app` | OK (HTTP 200 on Owner page) |
| `staging.havkar.online` | `staging.havkar.online` via Vercel DNS CNAME | OK |

## Root cause

Apex/www DNS still points at Register.it parking, which serves a **dadapro.com** wildcard certificate. That is a classic common-name mismatch — not an application bug and not fixed by disabling TLS checks.

`havkar.online` / `www.havkar.online` were **missing** from the Production project domain list (only `staging`, `testnet`, and `havkar-app.vercel.app` were attached).

## Agent actions completed

1. Attached `havkar.online` (verified) to project `havkar-app` / `prj_caZKaj3BAJ4oabhqxgThuvCknJbA`.
2. Attached `www.havkar.online` → redirect 308 to `havkar.online` (verified).
3. Confirmed Vercel DNS zone is **not** authoritative (`invalid_zone` on record create) — DNS must be edited at Register.it.
4. Left `HAVKAR_REAL_PAYMENTS_ENABLED` / public card collection **paused**.

## Exact Owner action (Register.it DNS)

In Register.it DNS for `havkar.online`:

1. **Remove** the parking A record `@ → 195.110.124.133` (and any dadapro/parking URL redirect).
2. **Add** apex A records (Vercel recommended rank 1):
   - `@` A `216.198.79.1`
   - `@` A `64.29.17.1`
3. **Set** `www` CNAME to:
   - `cname.vercel-dns.com`
   - (project-specific alternative also accepted: `20d0e45d97f72993.vercel-dns-017.com`)
4. Wait for DNS propagation. Vercel will issue a Let's Encrypt / Vercel cert for `havkar.online` automatically once A records hit Vercel.
5. Re-test in Chrome **without** bypassing the certificate warning.

Until then, use the temporary valid HTTPS path:

```
https://havkar-app.vercel.app/owner-eur1-checkout.html
```

## Success criteria (must re-verify on public apex)

- `openssl` / browser shows a certificate whose SAN includes `havkar.online`
- `curl https://havkar.online/owner-eur1-checkout.html` returns HTTP 200 with TLS verify success
- No parking IP `195.110.124.133`

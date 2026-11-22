# HAVKAR Owner / Admin identity — audit & pending actions

Updated: 2026-11-09

## Production evidence (read-only)

| Check | Result |
| --- | --- |
| Account `9b34b0bb-271a-49ee-aeb7-a9d28be06a06` | EXISTS — email `havkarapp2026@gmail.com`, confirmed |
| Google/`user_metadata` name | `Amir Jalilnia` |
| `havkar_private.owner_identity` rows | **0** (schema present, no primary Owner assigned) |
| `havkar_private.role_assignments` rows | **0** |
| JWT `app_metadata.role=admin` | Present on **different** account `amirjalilnia@gmail.com` (`d3869a63-…`) |
| `caller_is_admin()` in Production | JWT-only (`app_metadata.role = admin`) — no `role_assignments` / generation check |
| Primary Owner status for legal account | **FAIL — not Owner yet** |

Conclusion: the legal Owner account exists, but Production has **no** `owner_identity` singleton. A separate Gmail account currently has a legacy JWT admin claim.

## Emails

| Address | Finding |
| --- | --- |
| `info@havkar.online` | Configured in app (support notify, business notify, About). Domain MX → `mail.register.it`. SPF/DMARC present. SMTP RCPT from this environment **timed out** — mailbox send/receive not proven here. |
| `support@havkar.online` | Public support contact; same MX. SMTP probe **timed out**. |
| Soran | Only comment reference `soran@havkar.online` in `support.html` (not published). **Not verified** — no mailbox invent / no UI publish. |

## Pending Production (requires explicit Owner confirmation)

1. Apply hardening migration `20261109210000_owner_admin_hardening_and_bootstrap_helpers.sql`.
2. Run `store/OWNER_IDENTITY_BOOTSTRAP.sql` with real phrase/recovery digests for user `9b34b0bb-…`.
3. Decide whether `amirjalilnia@gmail.com` remains Admin (Owner grant via `owner_grant_admin`) or loses JWT admin after hardening.
4. Optional profile fill for Owner: `full_name='Amir Jalilnia'`, business phone on Support only (already set).

## Staging verification (applied helpers only; rolled back)

- Hardening helpers applied on `havkar-staging`
- Unauthorized `owner_identity` insert denied
- Bootstrap + delete-without-rollback denied + admin-grant-without-owner denied
- `rollback_bootstrap_owner` restored `owner_rows=0`
- Result marker: `STAGING_OWNER_BOOTSTRAP_ROLLBACK_OK`

## Not done without confirmation

- No Production role write / no Production migration apply
- No Mainnet / XLM / payment actions
- No final Production publish of Owner bootstrap
- Soran mailbox not published (unverified)

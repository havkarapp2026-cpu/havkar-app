# HAVKAR three-phase completion status — 10 November 2026

## Phase 1 — Stripe + Revolut

| Item | Evidence |
| --- | --- |
| Default EUR bank | REVOLUT PAYMENTS UAB · last4 **8455** · sole external account · `default_for_currency=true` |
| charges / payouts | `charges_enabled=true` · `payouts_enabled=true` |
| Bank status | still **`new`** (not forced; no second bank created) |
| Live webhook id | `we_1UK6rgECWiUpELSPIQKXo4E9` → Production `/api/stripe-webhook` |
| Subscribed events (API read) | **only** `checkout.session.completed` |
| App handlers | refund / dispute.created|updated|closed / payout.created|paid|failed acknowledged + ticket settlement helpers |
| MCP write expand events | **Unauthorized** (read-only MCP token) |

### Exact Owner actions (Phase 1)

1. Grant Stripe MCP **write** (or edit Dashboard directly):

```
https://access.stripe.com/mcp/oauth2/authorize/sessions/oases_VaofAI0tgNrbUd
```

2. Stripe Dashboard → Developers → Webhooks → `we_1UK6rgECWiUpELSPIQKXo4E9` → enable:
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
   - `payout.created`
   - `payout.paid`
   - `payout.failed`

## Phase 2 — Real card €1 prep (public collection stays off)

| Item | Status |
| --- | --- |
| Public `HAVKAR_REAL_PAYMENTS_ENABLED` | **false** / paused |
| Owner prep path | `/owner-eur1-checkout.html` → `/api/owner-eur1-checkout` |
| Confirm phrase | `PREPARE_EUR_1_00_LIVE_CHECKOUT` |
| Agent-created Checkout URL | blocked without Owner session + Live key in request context |
| Charge without Owner Checkout | **not** performed |

### Exact Owner actions (Phase 2)

1. Sign in as Owner on HAVKAR.
2. Open:

```
https://havkar.online/owner-eur1-checkout.html
```

3. Tap **Prepare EUR 1.00 Checkout**, open the Stripe link, pay €1.00.
4. Return page verifies `payment_status` via the same Owner API.

## Phase 3 — Android + iOS

| Item | Status |
| --- | --- |
| Agent `workflow_dispatch` | HTTP **403** |
| Signed build trigger added | tag `havkar-android-signed-*` / `havkar-ios-signed-*` |
| Android signed AAB | ✅ run `42744481961` tag `havkar-android-signed-20261110a` · artifact `havkar-app-release-signed-42744481961` · jarsigner-strict + fingerprint OK · package `online.havkar.app` · versionName `1.0.0` · versionCode `2` |
| iOS signed IPA | ⛔ run `42744829769` archive path reached; export exit 70 — `Cloud signing permission error` / `No profiles for online.havkar.app` (secret `APPLE_PROVISIONING_PROFILE_BASE64` missing or ASC cloud signing disabled) |
| Play / App Store submit | not performed (no console credentials in agent) |

### Exact Owner actions (Phase 3)

1. Download Android artifact from run `42744481961` and upload in Google Play Console when ready.
2. Add GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64` (App Store Distribution profile for `online.havkar.app`) **or** enable ASC cloud signing for the API key, then re-run tag `havkar-ios-signed-*`.
3. Upload IPA in App Store Connect and report review IDs.

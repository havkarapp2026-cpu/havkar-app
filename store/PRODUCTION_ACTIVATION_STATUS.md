# HAVKAR — Production activation status (8 November 2026, live MCP verified)

Owner authorized preparation/activation **after verified eligibility**.  
Live Stripe MCP access is now present (read-only). **No auto-merge. No irreversible charges.**

## A. Stripe live readiness

| Status | Detail |
| --- | --- |
| Account eligibility | **GREEN** — `charges_enabled=true`, `payouts_enabled=true`, requirements clear |
| Live webhook | **GREEN** — enabled → `https://havkar-app.vercel.app/api/stripe-webhook` (`checkout.session.completed`) |
| Customer collection | **RED / NOT ACTIVATED** — Production still `paused` |
| Exact evidence | `store/STRIPE_LIVE_VERIFICATION_20261108.md` |

### Exact remaining Stripe blockers

1. Production `STRIPE_SECRET_KEY` mode = **`unknown`** → replace with Live `sk_live_…` for `acct_1UJwZZECWiUpELSP`
2. Set `HAVKAR_STRIPE_LIVE_ENABLED=true` then `HAVKAR_REAL_PAYMENTS_ENABLED=true` on Vercel Production (after key mode is `live`)
3. Confirm payout bank: live bank is **PosteMobile …0596** status **`new`** (Revolut is **not** attached)
4. Separate exact-amount confirmation before any real charge
5. Review/merge PR #133 (no auto-merge)
6. MCP is read-only — Dashboard required for webhook/secret writes

## Actually activated now

| Rail | Activated? |
| --- | --- |
| Stripe live customer collection | **NO** |
| Stripe live account (Dashboard/MCP) | Connected / charges+payouts enabled |
| Pi / Trade / Stellar Mainnet | **NO** |
| Google Play worldwide production | **NO** |
| SCF #46 official submit | **NO** (package ready) |

## GREEN — verified this pass

- Live MCP account `HAVKAR` / `acct_1UJwZZECWiUpELSP`
- Sandbox still available for tests
- Identity verified; requirements empty
- Webhook live endpoint enabled to production
- Fee rules preserved (market 2%/3%, services 10%)
- SCF submission-ready package + deadline hedge documented
- Pi / Trade / Stellar Mainnet remain individually off

## YELLOW — awaiting owner

1. Fix Production Stripe secret so status reports `live`
2. Flip live+master flags after review
3. Confirm PosteMobile (or attach Revolut) for payouts
4. SCF invitation email + Submit (deadline **9 Nov 2026**; prefer before end of **8 Nov 2026 UTC**)
5. Merge approval for PR #133

## RED

- Live collection not armed
- Secret key mode unknown on Production
- SCF not submitted
- Play closed-testing gate not claimed complete

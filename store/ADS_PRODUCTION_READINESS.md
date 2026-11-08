# HAVKAR Ads — production readiness report

Date: 2026-11-08  
Branch: `cursor/havkar-ads-production-d4b2`  
**Not merged / not deployed / production DB not modified / paid features not enabled.**

## What already worked (reused)

- `ads.html` advertising feed + create modal (`listing_surface=advertising`)
- Shared `havkar-ad-images.js` + `ad-images` bucket
- `havkar-ad-publish.js` uncertain-insert guard
- Marketplace isolation helpers in `havkar-marketplace.js`
- Existing owner update/delete RLS + `ad_has_blocking_dependencies`
- Business applications in Profile (now used as advertiser entitlement)

## Implemented in this branch

| Area | Implementation |
| --- | --- |
| Detail / preview | New `ad-view.html`; Ads cards + Saved + Buy & Sell detail redirect advertising rows there |
| Advertiser accounts | Publish gated on approved `business_applications` |
| Create / edit / schedule / targeting | Country, city, audience, starts/expires, campaign name; owner edit on `ad-view.html` |
| Campaign management | `ad_campaigns` + pause/end/resubmit status controls |
| Reporting | Owner impression/click/save counters via `ad_metric_events` |
| Moderation / abuse | `ad_reports`, `create_ad_report`, `moderate_advertisement` (admin JWT), audit events, rate-limited metrics |
| Security | DB-enforced: no pending_review→paused→active bypass; listing_surface locked for owners; INSERT accepts pending_review; legacy public SELECTs replaced with schedule-aware policies; reported_count/audit/moderation_notes protected |
| Stripe | Test-only boost via `lib/ad-boost-*.cjs`, rewritten onto existing `/api/create-event-checkout` + `/api/stripe-webhook` (Hobby 12-function limit) |
| Separation | No Ads insert from AI; Buy & Sell still rejects advertising in `ad-details` by redirect |
| i18n / a11y / mobile | `data-i18n` hooks on ad-view; responsive layout; reduced-motion; aria labels |

## Automated tests

- `tests/ads-lifecycle-security.test.js` — live local Postgres RLS/trigger regression for every PR #126 blocker
- `tests/ads-production.test.mjs`
- Existing: `tests/marketplace-isolation.test.js`, `tests/ad-image-upload.test.js`, `tests/ad-public-status.test.js`, `tests/ad-insert-uncertain.test.js`, `tests/real-payments-pause.test.mjs`, `tests/pi-payment.test.js`

## Migration compatibility / rollback notes

- Additive columns (`campaign_id`, `starts_at`, `target_audience`, `moderation_notes`, `reported_count`) preserve existing rows.
- Replaces `enforce_ad_listing_status()` in place (`CREATE OR REPLACE`); restore prior function from `20261103223000_marketplace_surface_and_media.sql` to roll back trigger behavior.
- Drops legacy ads SELECT/INSERT policies and recreates narrow ones — rollback requires re-applying those legacy policy definitions from the marketplace migration.
- New tables (`ad_campaigns`, `ad_reports`, `ad_audit_events`, `ad_metric_events`, `ad_rate_buckets`, `ad_boost_intents`) can be dropped if unused; do not drop if production already wrote rows.
- **Not applied to production by the agent.** Apply to staging first.

## Visible in current Android release?

Android WebView loads the live website. **Until this branch is merged and the website deployed, the current Android release still shows the previous Ads UI** (toast View, no `ad-view.html`, no advertiser gate). Native package itself has no Ads SDK.

## Blocked / owner actions required

1. **Review + approve** migration `20261108010000_ads_production_lifecycle.sql` then apply to production (agent did **not** apply it).
2. **Deploy** web app after merge approval (agent will not merge/deploy).
3. Approve at least one **business application** before advertisers can publish under the new gate.
4. Admin users need JWT `app_metadata.role=admin` for moderation RPC.
5. Stripe Ads boost test: set `HAVKAR_ADS_BOOST_TEST_ENABLED=true`, `STRIPE_SECRET_KEY=sk_test_…`, webhook secret; never enable live Ads charges without explicit approval.
6. Multi-image Ads create still uses single-image picker (shared uploader supports arrays later).
7. Omio/hotels/Mainnet/real payments remain unrelated and off.

## Proposed release plan

1. Owner reviews PR code + migration SQL.  
2. Apply migration to a staging project first; smoke: approved business create → pending_review → admin approve → public visible; report; pause; boost test checkout.  
3. Apply migration to production.  
4. Merge PR and deploy Vercel web.  
5. Re-verify Android WebView against production URL.  
6. Only later: consider enabling Ads boost test flag; live Stripe Ads boost remains separate explicit approval.

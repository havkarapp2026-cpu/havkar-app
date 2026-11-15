# HAVKAR CREATE — audit of prior work (15 Nov 2026)

## Healthy baseline before this completion pass
- Branch inspected: `cursor/ideas-studio-ecosystem-d4b2`
- Healthy commit: `ee9045656ca34deebc504bb5d2dc19beb1fbfedf`
- Open PR: https://github.com/havkarapp2026-cpu/havkar-app/pull/189

## Evidence of prior related directives (from Git/code — not claimed as exact prior prompt text)
1. Ideas Portal + Studio + Aldo foundation landed in `efb3f14d` / PR #189.
2. Follow-up commits fixed Vercel Hobby 12-function limit by mounting `/api/ideas-studio` on `eur-usd-quote`.
3. No separate historical branch named `havkar-create` was found; CREATE branding was not yet a first-class product name in UI.

## Already implemented (real)
- Private idea drafts/submit/review schema + RLS
- Template catalog + venture multi-tenant members/versions
- Payments/public publish/payouts forced OFF
- Aldo simulation sessions (no invented force/accuracy)
- Entry from HAVKAR AI + Profile; Home remains 15 tiles

## Not previously present / incomplete (before CREATE completion branch)
- Product name **HAVKAR CREATE** as dedicated layer
- Structured AI idea analysis endpoint
- Sandboxed interactive project runtime (editable preview)
- Playable 2D football demo distinct from Aldo hardware pilot
- Billing quote structure for CREATE resources
- Marketplace prepare-bridge for approved unpublished ventures
- Maps / full 3D / live shop checkout / social video pipeline

## Completed on `cursor/havkar-create-complete-d4b2` (this pass)
- CREATE branding on `ideas-studio.html`, `havkar-ai.html`, Profile entry
- `analyze_idea`, `billing_quote`, `marketplace_prepare` API actions
- `havkar-create-runtime.js` iframe sandbox renderer (no arbitrary user code)
- `create-football-2d.html` playable demo + `game_2d_football` template
- Salon / repair templates; draft billing quotes with live charges OFF
- Unit tests: `tests/havkar-create.test.mjs` + updated `tests/ideas-studio.test.mjs`

## Still blocked / not started without Owner or infra
- Live CREATE charges / commission rates
- Public publish of user ventures
- Maps location services, social video pipeline, real 3D games
- Live shop/booking payments inside CREATE ventures
- Aldo physical sensors / field deployment

## 503 root cause (Preview) — verified 15 Nov 2026
- `analyze_idea` previously required `createServiceClient()` for every call.
- Vercel Preview for `cursor/havkar-create-complete-d4b2` has **no** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (those exist on Production target only; other Preview values are branch-scoped to unrelated branches).
- Production Supabase project `gispovnciifgikvgpzck` is ACTIVE_HEALTHY and already has `venture_*` / `aldo_*` tables with RLS (verified via MCP — no secrets invented).
- Staging project `keglioewbkgdabsizvys` does **not** contain CREATE tables.
- Fix: ephemeral `analyze_idea` (no `idea_id`) works without service role; status reports `backend_configured` + missing env **names** only.
- Auth-backed save/venture/Aldo/marketplace_prepare on Preview remain blocked until Owner adds Preview env pointing at the production CREATE schema project (or applies CREATE migration to staging + staging keys).

## save_idea 503 — exact dependency (no secrets invented)
**Cause:** handler calls `createServiceClient()` before `save_idea`. Client requires both:
1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`

On Preview for `cursor/havkar-create-complete-d4b2` both are **missing** (verified by API `missing_env`).  
After env is present, `save_idea` also requires a signed-in user `Authorization: Bearer <access_token>` (otherwise **401**).

**Where these already exist:** Vercel project `havkar-app` → Environment Variables → **Production** target (sensitive). Values were not readable/decryptable from this agent session; Cursor workspace secrets list is empty; agent VM env has neither key.

**Where Owner must add them for Preview CREATE:**
- Vercel Dashboard → Project **havkar-app** → Settings → Environment Variables
- Add (or copy from Production) for target **Preview**, preferably git branch `cursor/havkar-create-complete-d4b2`:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Point URL at project `gispovnciifgikvgpzck` (CREATE tables already present) — or migrate staging first if using staging URL
- Redeploy the Preview deployment after saving env

**Do not paste secret values into chat.** Agent will not invent keys.

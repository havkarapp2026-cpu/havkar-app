# HAVKAR AI Edge Function — bundled production deploy

Production project: `gispovnciifgikvgpzck`  
Function: `havkar-ai-assistant`

## Current production status (verified)

| Check | Result |
| --- | --- |
| Active version | **21** |
| Runtime GitHub `raw.githubusercontent.com` import | **REMOVED** |
| Source shape | Single bundled `index.ts` (from `index.bundled.ts`) |
| `verify_jwt` | `true` |
| Play review policy in body | PASS (`play_review`, reviewer email present) |
| No-auth HTTP | `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| Anon key, language `en`, no user JWT | `401` app JSON: sign-in required |
| Real payments gate in policy | Requires `HAVKAR_REAL_PAYMENTS_ENABLED === "true"` |

Do not claim a newer version without re-checking `get_edge_function`.

## Why the bundle exists

Older production versions were a one-line import of GitHub raw source. That created a runtime dependency on GitHub availability and made audits harder.

`supabase/functions/havkar-ai-assistant/index.bundled.ts` is the minified, self-contained build of:

- `index.ts`
- `policy.mjs`

No relative imports. No GitHub URL.

## Redeploy (owner / authorized agent)

1. Confirm the bundled file still contains Play review entitlement strings.
2. Deploy **only** that file as `index.ts` to `havkar-ai-assistant` with `verify_jwt: true`.
3. Smoke-test:
   - missing Authorization → gateway `401`
   - anon JWT + `language: "en"` → application sign-in error (not `WORKER_ERROR`)
4. Keep source modules (`index.ts`, `policy.mjs`) as the editable sources; regenerate the bundle after policy changes.

## Migration note (Play review)

Repo file: `supabase/migrations/20261106143000_play_review_entitlement.sql`  
Production `schema_migrations` row: version `20261106204613`, name `play_review_entitlement`

Do **not** re-run or manually insert the file version. Objects already exist (`havkar_private.play_review_business`).

## Failed approach (do not repeat)

A gzip + `data:application/javascript` loader was briefly tried (version 20). It returned `WORKER_ERROR` / HTTP 500 under Deno Edge. Prefer the direct bundled TypeScript deploy (version 21+).

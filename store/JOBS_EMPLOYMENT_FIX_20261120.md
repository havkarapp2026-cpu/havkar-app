# Jobs / Employment fix — 2026-11-20

Branch: `cursor/jobs-employment-stabilize-d4b2`  
Buy & Sell freeze: `buysell-stable-20261120-pr244` / `affb20f0` — **not modified**.

## Approved tariffs (no invented prices)

### Ordinary employer — one-time prepaid 30 days
Source: `havkar-job-billing.js` `ORDINARY_PLANS` (unchanged amounts)

| Plan | EUR | Window |
| --- | ---: | --- |
| Basic | 9.99 | 30 days |
| Professional | 19.99 | 30 days |
| Business (ordinary) | 39.99 | 30 days |

### Verified company — monthly auto-renew (Stripe only)
Source: owner decision + `COMPANY_PLANS`

| Plan | EUR / month | Active ads |
| --- | ---: | ---: |
| Business | 49.99 | 10 |
| Business Plus | 99.99 | 30 |
| Enterprise | 199.99 | 100 |

## Gates kept OFF
- `HAVKAR_JOB_PAYMENTS_ENABLED` must stay unset/`false`
- Card Checkout sessions are not created from Jobs UI
- XLM quotes only; corporate XLM refused (no auto-renew)
- Company insert RLS forces `verification_status=unverified`; clients cannot self-verify

## Delivered on this branch
- Ordinary vs corporate plan UI clarity
- Company register + verification gate for corporate quotes
- In-app applications + employer application view
- `jobs.html?mine=1` opens My Jobs
- Currency display labels (133 fiat + separate XLM)
- Expanded Jobs i18n glossary
- Automated tests + two-account security script

## Explicitly NOT done
- No merge to main
- No production deploy
- No live Stripe/Stellar activation
- No Buy & Sell file changes

# SCF Build eligibility matrix — HAVKAR (8 November 2026)

Sources (official):

- https://communityfund.stellar.org/awards
- https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines.md
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/resubmission.md

## Confirmed history (owner evidence)

| Fact | Status |
| --- | --- |
| Interest Form submitted ~6 October 2026 | Owner-reported |
| SCF email 16 October 2026: proposal did **not** meet Build Award requirements | Confirmed by owner (no project-specific feedback) |
| Invitation to full Build submission | **NONE verified** |
| Italian business registration | Owner-stated: HAVKAR DI JALILNIA AMIR, Chamber of Commerce **3 November 2026** (after rejection) |
| Formal SCF #46 full application submitted | **NO** |

## Deadline

| Item | Value |
| --- | --- |
| SCF #46 published deadline | **9 November 2026** |
| Official timezone | **Not published** |
| Same-round Interest Form re-entry after rejection | **Not confirmed** in handbook — contact `communityfund@stellar.org` |
| Earliest guaranteed next path | Next open Build round after #46 if #46 invitation is not obtained |

## Requirement-by-requirement matrix

| Requirement | HAVKAR evidence | Verdict |
| --- | --- | --- |
| Interest Form first | Rejected Oct 16; corrected draft prepared for resubmit | YELLOW — must resubmit Interest Form |
| Invitation required for full Build proposal | No invite email verified | RED for full submission |
| Participant eligibility (rules § team/age/sanctions) | Not fully verifiable in repo; owner must complete | YELLOW |
| ≥2 eligible individuals (webinars/demo) | Not verified in repo | YELLOW / likely prior gap |
| Product–market fit: traction **or** validated need by Stellar-experienced person | No verified user counts; wallet Mainnet evidence exists but is not product traction | RED / likely Oct failure mode |
| Clear Stellar use case | Non-custodial wallet works; **order settlement not built** | YELLOW — use case must be future funded work, stated honestly |
| Technical architecture | Wallet + Horizon + XDR checks in repo | GREEN for wallet path; YELLOW for order binding |
| Build readiness / roadmap | Draft roadmap exists; must stay future-only (no past reimbursement) | YELLOW |
| Stellar relevance (not superficial) | Risk if application looks like “add wallet to app” without order settlement | YELLOW / likely Oct failure mode |
| Open-source contracts | No Soroban contracts planned in current draft | GREEN (N/A) |
| Budget alignment | $54,000 draft flagged for owner approval; excludes marketing/legal/past work | YELLOW |
| Tranche structure ending in Mainnet (or jurisdiction-limited Testnet) | Draft has 3 tranches + 10/20/30/40 payments | GREEN structure / YELLOW content quality |
| Tranche 2 threat model + monitoring | Planned in draft, not written yet | YELLOW |
| Mainnet customer payments already live | Source flag `false` — **not required** to apply; funding is to reach Mainnet | GREEN (correctly off) |
| Significant improvement since rejection | Company registered; clearer docs; Mainnet hash evidence; gates hardened | YELLOW — must be explicit in Interest Form |
| Referral | Not verified | YELLOW (not mandatory) |

## Hypotheses vs confirmed facts about the October rejection

### Confirmed

- SCF stated the proposal did not meet Build Award requirements.
- No project-specific written feedback was provided.
- Interest Form ≠ Build Award invitation.

### Hypotheses (not confirmed by SCF)

1. Stellar integration looked superficial (wallet without order settlement).
2. Missing verifiable traction / Stellar-experienced validator of need.
3. Incomplete team eligibility presentation.
4. Business entity not yet registered at interest time.
5. Roadmap/budget unclear or requested funding for past work.

Do not present hypotheses as SCF’s stated reasons.

## Mainnet activation vs SCF eligibility

**Mainnet customer payments are NOT a prerequisite for Interest Form or Build Award eligibility.**  
SCF Build funds work toward Mainnet launch (tranche 3). Keeping `STELLAR_MAINNET_PAYMENTS_ENABLED = false` until a separate checklist is correct and should be stated honestly.

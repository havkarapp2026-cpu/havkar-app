# Partita IVA / REA status — 10 November 2026

## Published (verified source)

| Field | Value | Source |
| --- | --- | --- |
| Legal name | HAVKAR DI JALILNIA AMIR | Revolut Business document 9 Nov 2026 + prior Production legal config |
| Registration / REA | KR234170 / **KR-234170** | Same Revolut Business registration number; Crotone province code `KR` |
| Registered address | Francesco Antonio Lucifero 40, 88900 Crotone, Italy | Revolut Business document |

## Not published

| Field | Status |
| --- | --- |
| Partita IVA | **Not published** |

Evidence searched:

- Repo docs / SCF notes — no Visura PDF or verified VAT number
- Stripe Live account — `company.tax_id_provided=false`
- Public Registro Imprese / web search — no authoritative Partita published for this entity
- Production `business_applications` id=1: self-entered `vat_number` present, status `pending`, `documents={}` — **rejected as legal proof**

Owner action: upload/confirm Visura camerale (or Agenzia delle Entrate proof). Only then publish Partita IVA.

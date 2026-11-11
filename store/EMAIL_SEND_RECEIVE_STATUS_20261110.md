# Official email send/receive — 10 November 2026

## Addresses

- `info@havkar.online`
- `support@havkar.online`
- `soran@havkar.online` (Owner-only confidential)

## DNS probe

| Record | Result |
| --- | --- |
| MX | `10 mail.register.it.` |
| SPF | `v=spf1 include:spf.webapps.net ~all` |
| DMARC | `v=DMARC1; p=none;` |
| DKIM (common selectors) | empty in this probe |

## Send/receive proof

| Path | Result |
| --- | --- |
| SMTP 25/587/465 to `mail.register.it` from this agent | no usable banner / blocked or timed out |
| Mailbox password AUTH | **not available** (must not be stored in git) |
| Resend outbound (`notifications@havkar.online`) | Production `RESEND_API_KEY` exists for app notifications — separate from INFO/SUPPORT/SORAN inbox login |

## Owner actions

1. Log into Register.it webmail for INFO, SUPPORT, and SORAN; send a round-trip test to a personal mailbox and confirm delivery both ways.
2. Confirm SORAN credentials are Owner-only (not shared with Staff).
3. After DKIM is configured at Register.it, tighten DMARC beyond `p=none`.

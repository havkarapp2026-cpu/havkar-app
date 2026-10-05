# HAVKAR – Permanent Agent Instructions

## 1. Communication

- Communicate with the user in Persian by default.
- Keep explanations concise, clear, direct, and practical.
- Work on one requested task at a time.
- Do not overwhelm the user with unnecessary steps.
- Do not repeat steps that have already been completed.
- When the next action depends on a result, give one clear next step and wait for the result before continuing.
- Never send the user through menus, settings, files, or procedures based on guesses.

## 2. Copyable Output Requirements

The user frequently works from a phone/tablet and must be able to copy important information easily.

### URLs / Addresses
When the user asks for a URL, web address, endpoint, repository address, API address, or similar address:
- Put the exact address in its own copyable code block.
- Do not hide the address behind clickable anchor text.
- Do not mix explanatory text inside the same code block.

Example:

https://example.com/path

### Code
When the user asks for code:
- Provide code in a proper copyable code block.
- If a complete file is requested, provide the COMPLETE final file, not fragments, patches, partial snippets, or instructions telling the user where to manually merge code.
- Clearly state the exact filename.
- When the environment allows creation of downloadable artifacts, provide the complete file in a downloadable form as well.
- Never describe partial code as a complete final file.
- Do not shorten a working file in a way that silently removes existing functionality.

### Emails
When the user asks for an email:
- Provide the recipient email address separately in its own copyable code block.
- Provide the email subject separately in its own copyable code block.
- Provide the complete email body separately in its own copyable code block.
- Do not combine recipient, subject, and body into one block unless the user explicitly requests that format.

## 3. Inspect Before Editing

- The CURRENT GitHub repository is the source of truth for HAVKAR.
- Always inspect the actual current repository and the relevant files before making changes.
- Do not rely on old conversation descriptions when the repository can be inspected.
- Never guess file names, routes, functions, database schemas, tables, columns, APIs, environment variables, dependencies, integrations, or existing behavior.
- Determine the root cause of a problem before changing code.
- Trace relevant functions, event handlers, database operations, and dependencies before editing.
- If required information cannot be verified, explicitly state what is unknown instead of guessing.
- If Supabase schema or backend behavior is relevant but cannot be verified from the available environment, say so before making assumptions.

## 4. Protect Existing Functionality

- Preserve all existing working functionality.
- Make the smallest scoped change necessary to accomplish the requested task.
- Never rewrite or replace an entire working page merely to fix a small problem.
- Never remove working code, features, integrations, UI elements, navigation, translations, or data flows unless explicitly requested.
- Do not replace a large existing file with a shorter reconstruction unless every existing required feature has been verified and preserved.
- Before a broad, architectural, destructive, or high-risk change, explain what would be affected and obtain confirmation from the user.

## 5. Testing and Verification

- Test changes in the available HAVKAR Cloud Environment whenever technically possible.
- Test the affected user flow end-to-end, not only syntax.
- Test relevant navigation and user interactions when changing frontend behavior.
- Check for regressions in related functionality.
- Never claim that something is fixed, completed, working, or production-ready unless it has actually been verified.
- If a test fails, report exactly what failed.
- If something cannot be tested, explicitly state that it was NOT verified.
- Do not hide warnings, failed tests, or uncertainty.

## 6. Git and Production Safety

- Do not blindly modify production/main.
- Prefer an isolated branch and Pull Request for code changes when the workflow supports it.
- Clearly report which files were changed.
- Do not merge or deploy potentially breaking changes without explicit user approval.
- Never make unrelated modifications while fixing a specific problem.

## 7. Security

- Never commit, expose, or print API keys, private keys, seed phrases, wallet secrets, access tokens, passwords, verification codes, card information, or other sensitive credentials.
- Never invent credentials, API keys, tokens, secrets, environment-variable values, database columns, database tables, endpoints, or account information.
- Never present placeholders, simulations, mocked payments, or fake integrations as real production functionality.
- Use proper environment-variable or secret-management systems for credentials.
- If a required secret is missing, identify the exact secret that is required without inventing its value.

## 8. Production Quality

- HAVKAR is intended to become a real production application.
- Do not implement fake payments, fake transactions, fake API responses, fake balances, or cosmetic functionality presented as operational.
- Prefer real, secure, maintainable, production-oriented implementations.
- Do not introduce unnecessary dependencies or architectural rewrites.
- Respect the existing HAVKAR design, backend, authentication, database, integrations, and application structure unless a change is explicitly required.

## 9. HAVKAR Delivery – Special Protection

IMPORTANT:
Delivery development has progressed and its implementation may continue changing.

Therefore:
- Always inspect the CURRENT delivery.html and related current repository/backend code before making any Delivery change.
- The current repository is authoritative. Do not rely on an older description of Delivery.
- Preserve all currently working Delivery functionality unless the user explicitly asks to change it.
- Do not rebuild Delivery from an older version.
- Do not replace delivery.html with a reconstructed or shortened version.

The current Delivery implementation includes important functionality such as:
- Request Delivery.
- Active Deliveries.
- Recent Deliveries / Delivery History inside the Delivery experience.
- Customer cancellation behavior.
- Driver application and approval state.
- Approved Driver workspace / Driver Jobs.
- Driver job lifecycle including states such as:
  pending
  accepted
  picked_up
  in_transit
  delivered
  cancelled
- Driver actions progressing through the delivery lifecycle.
- Vehicle information fields.
- Multilingual Delivery UI.
- Bottom navigation.
- Driver floating action button and Driver Jobs panel.

These features must be treated as protected existing functionality and verified from current code before editing.

CRITICAL NAVIGATION RULE:
- Do NOT assume history.html is Delivery history.
- history.html belongs to HAVKAR Wallet transaction history unless the current repository explicitly proves otherwise.
- Delivery History / Recent Deliveries currently belongs to the Delivery experience.
- Never redirect Delivery History to Wallet history.

If permanent-delete functionality or a red trash/delete control exists in the current Delivery implementation, preserve it unless the user explicitly asks to remove or change it.

If diagnostic/debug code exists in Delivery:
- Do not remove it automatically.
- First determine whether it is temporary, still needed, or safe to remove.
- Ask before removing diagnostic code unless its removal is explicitly part of the requested task.

## 10. Other HAVKAR Integrations

Treat existing working integrations carefully, including:
- Supabase
- Authentication
- Wallet
- Stellar/XLM
- Pi Network
- Market
- Tickets
- Delivery
- language/translation systems
- external APIs and partner integrations

Before changing any integration:
- Inspect its actual current implementation.
- Determine whether it is test, sandbox, testnet, or production/mainnet.
- Never describe a test/sandbox integration as production.
- Never replace a real integration with fake or simulated data.

## 11. User Approval and Risk

For a small, clearly scoped, reversible fix:
- inspect,
- implement,
- test,
- report the result.

For a broad or potentially destructive change:
- inspect first,
- explain the intended change,
- identify affected files/features,
- obtain user approval before implementing.

Never use experimentation on production code when the root cause has not been identified.

## 12. Final Delivery of Work

After completing a coding task:
- State exactly what was changed.
- State exactly which files were changed.
- State what was tested.
- State the test result.
- State anything that remains unverified.
- Do not claim success beyond what the tests prove.

If the user requested a complete file:
- provide the complete final file,
- make it easy to copy,
- and provide a downloadable file when supported.

## 13. Core Decision Rule

Accuracy and preservation of working functionality are more important than speed.

When uncertain:

INSPECT FIRST.
VERIFY SECOND.
CHANGE THIRD.
TEST FOURTH.
REPORT ONLY WHAT WAS PROVEN.

Never guess and then modify HAVKAR based on that guess.

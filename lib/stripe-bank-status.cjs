/*
 * Stripe external bank account status helpers.
 * For platform payout destinations, status "new" means no validation
 * activity yet — it is NOT itself a verification failure.
 * Blocking statuses: errored, verification_failed,
 * tokenized_account_number_deactivated.
 */

const HEALTHY_EXTERNAL_BANK_STATUSES = Object.freeze([
  "new",
  "validated",
  "verified"
]);

const BLOCKING_EXTERNAL_BANK_STATUSES = Object.freeze([
  "errored",
  "verification_failed",
  "tokenized_account_number_deactivated"
]);

function normalizeBankStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function isHealthyExternalBankStatus(status) {
  return HEALTHY_EXTERNAL_BANK_STATUSES.includes(normalizeBankStatus(status));
}

function isBlockingExternalBankStatus(status) {
  return BLOCKING_EXTERNAL_BANK_STATUSES.includes(normalizeBankStatus(status));
}

function describeExternalBankPayoutReadiness(bank, account = {}) {
  const status = normalizeBankStatus(bank && bank.status);
  const payoutsEnabled = account.payouts_enabled === true;
  const chargesEnabled = account.charges_enabled === true;
  const methods = Array.isArray(bank && bank.available_payout_methods)
    ? bank.available_payout_methods
    : [];
  const standardOk =
    methods.length === 0 || methods.map(String).includes("standard");
  const healthyStatus = isHealthyExternalBankStatus(status);
  const blockingStatus = isBlockingExternalBankStatus(status);

  return {
    status: status || null,
    status_is_healthy: healthyStatus,
    status_blocks_payouts: blockingStatus,
    payouts_enabled: payoutsEnabled,
    charges_enabled: chargesEnabled,
    available_payout_methods_ok: standardOk,
    eligible_for_scheduled_payouts:
      payoutsEnabled && healthyStatus && !blockingStatus && standardOk,
    note: blockingStatus
      ? "External bank status blocks scheduled payouts until details are replaced."
      : status === "new"
        ? "status=new is normal for unused/unvalidated payout banks; rely on payouts_enabled + absence of errored/verification_failed."
        : "External bank status is healthy for payout eligibility checks."
  };
}

module.exports = {
  HEALTHY_EXTERNAL_BANK_STATUSES,
  BLOCKING_EXTERNAL_BANK_STATUSES,
  normalizeBankStatus,
  isHealthyExternalBankStatus,
  isBlockingExternalBankStatus,
  describeExternalBankPayoutReadiness
};

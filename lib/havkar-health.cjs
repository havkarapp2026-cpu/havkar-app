/**
 * HAVKAR Global Health Platform — catalogs and gated billing helpers.
 * Live doctor/pharmacy subscriptions stay OFF until final Owner approval.
 * Patients remain FREE. No fake providers or medical claims.
 */

"use strict";

const HEALTH_CATEGORIES = Object.freeze([
  { id: "gp", group: "doctors", label: "General practitioners", regulated: true, subscription_required: true },
  { id: "specialist", group: "doctors", label: "Medical specialists and subspecialists", regulated: true, subscription_required: true },
  { id: "surgeon", group: "doctors", label: "Surgeons", regulated: true, subscription_required: true },
  { id: "dentist", group: "doctors", label: "Dentists and dental specialists", regulated: true, subscription_required: true },
  { id: "psychiatrist", group: "doctors", label: "Psychiatrists and licensed mental-health professionals", regulated: true, subscription_required: true },
  { id: "psychologist", group: "doctors", label: "Psychologists and psychotherapy providers", regulated: true, subscription_required: true },
  { id: "hospital", group: "facilities", label: "Hospitals", regulated: true, subscription_required: false },
  { id: "clinic", group: "facilities", label: "Medical clinics", regulated: true, subscription_required: false },
  { id: "lab", group: "diagnostics", label: "Diagnostic laboratories", regulated: true, subscription_required: false },
  { id: "mri", group: "diagnostics", label: "MRI centers", regulated: true, subscription_required: false },
  { id: "ct", group: "diagnostics", label: "CT scan centers", regulated: true, subscription_required: false },
  { id: "ultrasound", group: "diagnostics", label: "Ultrasound centers", regulated: true, subscription_required: false },
  { id: "radiology", group: "diagnostics", label: "X-ray and radiology centers", regulated: true, subscription_required: false },
  { id: "genetics", group: "diagnostics", label: "Genetic testing and other diagnostic services", regulated: true, subscription_required: false },
  { id: "physio", group: "care", label: "Rehabilitation and physiotherapy", regulated: true, subscription_required: false },
  { id: "addiction", group: "care", label: "Licensed addiction treatment and rehabilitation centers", regulated: true, subscription_required: false },
  { id: "cosmetic", group: "doctors", label: "Cosmetic medicine", regulated: true, subscription_required: true },
  { id: "hair_transplant", group: "doctors", label: "Hair transplantation", regulated: true, subscription_required: true },
  { id: "plastic", group: "doctors", label: "Plastic and reconstructive surgery", regulated: true, subscription_required: true },
  { id: "fertility", group: "doctors", label: "Fertility and reproductive medicine", regulated: true, subscription_required: true },
  { id: "rare_disease", group: "doctors", label: "Rare diseases and highly specialized treatment", regulated: true, subscription_required: true },
  { id: "medical_travel", group: "travel", label: "International medical travel", regulated: true, subscription_required: false },
  { id: "pharmacy", group: "pharmacy", label: "Pharmacies", regulated: true, subscription_required: true },
  { id: "pharmacy_24h", group: "pharmacy", label: "24-hour pharmacies", regulated: true, subscription_required: true },
  { id: "herbal_pharmacy", group: "herbal", label: "Licensed herbal pharmacies", regulated: true, subscription_required: false },
  { id: "herbal_shop", group: "herbal", label: "Herbal shops and traditional medicine providers", regulated: false, subscription_required: false },
  { id: "medicine_info", group: "information", label: "Evidence-based medical and herbal medicine information", regulated: false, subscription_required: false }
]);

/** Owner-approved INITIAL proposed EUR pricing — live charging remains OFF. */
const HEALTH_SUBSCRIPTION_PLANS = Object.freeze([
  { id: "health_gp_monthly", role: "gp", name: "General practitioner", list_price_eur: 19.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_specialist_monthly", role: "specialist", name: "Medical specialist", list_price_eur: 29.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_subspecialist_monthly", role: "subspecialist", name: "Subspecialist/surgeon", list_price_eur: 39.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_cosmetic_monthly", role: "cosmetic", name: "Cosmetic/hair transplant doctor", list_price_eur: 49.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_psychiatrist_monthly", role: "psychiatrist", name: "Psychiatrist", list_price_eur: 29.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_pharmacy_monthly", role: "pharmacy", name: "Regular pharmacy", list_price_eur: 24.99, interval: "month", first_month_free: true, live_billing: false },
  { id: "health_pharmacy_24h_monthly", role: "pharmacy_24h", name: "24-hour pharmacy", list_price_eur: 34.99, interval: "month", first_month_free: true, live_billing: false }
]);

const FREE_UNDER_POLICY = Object.freeze([
  "patients",
  "herbal_pharmacy",
  "herbal_shop",
  "hospital",
  "clinic",
  "lab",
  "mri",
  "ct",
  "ultrasound",
  "radiology",
  "genetics",
  "physio",
  "addiction",
  "medical_travel"
]);

function healthLiveBillingEnabled(env) {
  const e = env || process.env;
  return String(e.HAVKAR_HEALTH_LIVE_BILLING_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
}

function subscriptionCatalog(env) {
  const live = healthLiveBillingEnabled(env);
  return {
    ok: true,
    module: "health",
    patients_platform_fee: "free",
    live_billing_enabled: live,
    charge_allowed_now: false,
    note: live
      ? "Owner-enabled health live billing flag is ON, but charge_allowed_now remains false until final Owner activation."
      : "Proposed doctor/pharmacy subscription pricing is catalog-only. Live charging stays OFF until final Owner approval.",
    free_under_current_policy: FREE_UNDER_POLICY.slice(),
    plans: HEALTH_SUBSCRIPTION_PLANS.map((p) => ({
      ...p,
      charge_allowed_now: false,
      status: live ? "awaiting_owner_final_activation" : "proposed_gated"
    })),
    ranking_note:
      "Subscription payments cannot purchase better clinical rankings."
  };
}

function rankingMethodology() {
  return {
    ok: true,
    levels: ["city", "region", "country", "continent", "global"],
    within: "comparable specialties and services only",
    signals: [
      "verified_patient_reviews",
      "review_volume",
      "professional_license_verification",
      "relevant_qualifications",
      "statistical_confidence",
      "fraud_prevention"
    ],
    excluded: [
      "purchased_rank_boosts",
      "misleading_raw_success_rates",
      "unlabeled_self_reported_outcomes_as_verified"
    ],
    self_reported_stats_label:
      "Optional self-reported statistics must be clearly labeled and never presented as independently verified."
  };
}

function platformRoleNotice() {
  return {
    en: "HAVKAR is a platform that connects patients with independent licensed professionals. HAVKAR itself does not provide medical treatment, diagnosis, prescriptions or emergency services.",
    fa: "HAVKAR یک پلتفرم اتصال بیماران به متخصصان دارای مجوز مستقل است. خود HAVKAR درمان پزشکی، تشخیص، نسخه یا خدمات اورژانس ارائه نمی‌دهد."
  };
}

module.exports = {
  HEALTH_CATEGORIES,
  HEALTH_SUBSCRIPTION_PLANS,
  FREE_UNDER_POLICY,
  healthLiveBillingEnabled,
  subscriptionCatalog,
  rankingMethodology,
  platformRoleNotice
};

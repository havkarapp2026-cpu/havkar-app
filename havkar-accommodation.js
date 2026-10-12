(function (root, factory) {
    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    root.HAVKAR_ACCOMMODATION = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    var MARKETING_TYPES = [
        "hotel",
        "bnb",
        "apartment",
        "holiday_home",
        "villa",
        "guesthouse"
    ];

    var LEGAL_CATEGORIES = [
        "hotel_structure",
        "non_hotel_structure",
        "short_let",
        "tourist_lease"
    ];

    var EVIDENCE_TYPES = [
        "ownership_record",
        "management_mandate",
        "cin_record",
        "regional_code",
        "local_permit",
        "exterior_photo",
        "safety_declaration"
    ];

    var REVIEW_DECISIONS = [
        "needs_more_info",
        "rejected",
        "approved",
        "suspended",
        "revoked"
    ];

    function normalizeCin(value) {
        return String(value || "").trim().toUpperCase();
    }

    function cinShapeValid(value) {
        return /^[A-Z0-9]{15}$/.test(normalizeCin(value));
    }

    function identityEvidenceBlocked(type) {
        return /identity|passport|selfie|id_document/i.test(String(type || ""));
    }

    function evidencePathAllowed(userId, path, evidenceType) {
        var parts = String(path || "").split("/");

        if (identityEvidenceBlocked(evidenceType) || identityEvidenceBlocked(path)) {
            return false;
        }

        return parts.length === 4 &&
            parts[0].toLowerCase() === String(userId || "").toLowerCase() &&
            parts[2] === evidenceType &&
            EVIDENCE_TYPES.indexOf(evidenceType) !== -1;
    }

    function identityVerifiedAllowed() {
        return false;
    }

    function verifiedFromMetadata() {
        return {
            identity: false,
            property: false
        };
    }

    function publicationAllowed(record) {
        var source = record || {};

        return source.identityStatus === "verified" &&
            source.propertyStatus === "approved" &&
            source.countryPublishEnabled === true &&
            identityVerifiedAllowed();
    }

    function reviewDecisionError(decision) {
        if (
            decision === "verified" ||
            decision === "identity_verified" ||
            decision === "publish"
        ) {
            return "This decision is not available.";
        }

        if (REVIEW_DECISIONS.indexOf(decision) === -1) {
            return "Unknown decision.";
        }

        return "";
    }

    function planIsChargeable(plan) {
        var source = plan || {};

        return source.status === "active" &&
            source.monthly_amount_cents > 0 &&
            !!source.stripe_price_id;
    }

    return {
        MARKETING_TYPES: MARKETING_TYPES,
        LEGAL_CATEGORIES: LEGAL_CATEGORIES,
        EVIDENCE_TYPES: EVIDENCE_TYPES,
        REVIEW_DECISIONS: REVIEW_DECISIONS,
        normalizeCin: normalizeCin,
        cinShapeValid: cinShapeValid,
        identityEvidenceBlocked: identityEvidenceBlocked,
        evidencePathAllowed: evidencePathAllowed,
        identityVerifiedAllowed: identityVerifiedAllowed,
        verifiedFromMetadata: verifiedFromMetadata,
        publicationAllowed: publicationAllowed,
        reviewDecisionError: reviewDecisionError,
        planIsChargeable: planIsChargeable
    };
});

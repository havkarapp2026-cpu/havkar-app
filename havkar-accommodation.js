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

    function availabilityState(value) {
        const state = String(value || "").trim();
        if (state === "open" || state === "blocked") {
            return state;
        }
        return "";
    }

    function priceDraftChargeable() {
        return false;
    }

    function ownerPhotoAllowed(userId, propertyId, fileName) {
        const name = String(fileName || "");
        const safeName = name.split(/[/\\]/).pop();

        if (!safeName || safeName.length > 80 || !/^[A-Za-z0-9._-]+$/.test(safeName)) {
            return false;
        }

        if (/identity|passport|selfie/i.test(safeName)) {
            return false;
        }

        const property = String(propertyId || "");
        const owner = String(userId || "");

        if (!/^[0-9a-f-]{36}$/i.test(property) || !/^[0-9a-f-]{36}$/i.test(owner)) {
            return false;
        }

        return true;
    }

    function ownerPhotoPath(userId, propertyId, fileName) {
        if (!ownerPhotoAllowed(userId, propertyId, fileName)) {
            return "";
        }

        const safeName = String(fileName).split(/[/\\]/).pop();
        return String(userId) + "/" + propertyId + "/photo/" + safeName;
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

    function applicationError(record) {
        var source = record || {};
        var streetNumber = String(source.streetNumber || "").trim();

        if (MARKETING_TYPES.indexOf(source.marketingType) === -1) {
            return "Choose a property type.";
        }

        if (LEGAL_CATEGORIES.indexOf(source.legalCategory) === -1) {
            return "Choose an Italian legal category.";
        }

        if (String(source.displayName || "").trim().length < 2) {
            return "Property name is required.";
        }

        if (!String(source.city || "").trim()) {
            return "City is required.";
        }

        if (!String(source.street || "").trim()) {
            return "Street is required.";
        }

        if (!streetNumber) {
            return "Building number is required.";
        }

        if (streetNumber.length > 20) {
            return "Building number is too long.";
        }

        if (!cinShapeValid(source.cin)) {
            return "Italian CIN must be 15 letters or digits.";
        }

        if (source.countryCode && source.countryCode !== "IT") {
            return "Submission is open for Italy only.";
        }

        return "";
    }

    function identityStatusText(status) {
        if (status === "not_started") {
            return "Not started. Identity Verified stays off.";
        }

        if (status === "awaiting_provider") {
            return "Waiting for an identity provider. None is connected.";
        }

        if (status === "needs_more_info") {
            return "The identity file needs more information.";
        }

        if (status === "rejected") {
            return "The identity file was rejected.";
        }

        if (status === "suspended") {
            return "The identity file is suspended.";
        }

        return "Identity Verified stays off.";
    }

    function propertyStatusText(status) {
        if (status === "draft") {
            return "Draft saved. Submit it when the property file is complete.";
        }

        if (status === "submitted") {
            return "Submitted for review. The listing stays unpublished.";
        }

        if (status === "in_review") {
            return "A reviewer has the property file. The listing stays unpublished.";
        }

        if (status === "needs_more_info") {
            return "More property information is required before another review.";
        }

        if (status === "approved") {
            return "The property file was approved. Identity stays unverified and the listing stays unpublished.";
        }

        if (status === "rejected") {
            return "The property file was rejected.";
        }

        if (status === "suspended") {
            return "The property file is suspended.";
        }

        if (status === "revoked") {
            return "The property file was revoked.";
        }

        return "The property file is recorded.";
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
        availabilityState: availabilityState,
        priceDraftChargeable: priceDraftChargeable,
        ownerPhotoAllowed: ownerPhotoAllowed,
        ownerPhotoPath: ownerPhotoPath,
        verifiedFromMetadata: verifiedFromMetadata,
        publicationAllowed: publicationAllowed,
        reviewDecisionError: reviewDecisionError,
        planIsChargeable: planIsChargeable,
        applicationError: applicationError,
        identityStatusText: identityStatusText,
        propertyStatusText: propertyStatusText
    };
});

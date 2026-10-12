import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const accommodation = window.HAVKAR_ACCOMMODATION;
const page = document.body.dataset.accommodationPage || "";

function show(id, text) {
    const node = document.getElementById(id);

    if (node) {
        node.textContent = text || "";
    }

    if (window.HAVKAR_ACCOMMODATION_I18N) {
        window.HAVKAR_ACCOMMODATION_I18N.apply();
    }
}

async function sessionUser(supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session || null;
}

async function loadPublic(supabase) {
    const { data, error } = await supabase
        .from("accommodation_listings")
        .select("id,title,summary,publication_status")
        .eq("publication_status", "published");
    const list = document.getElementById("listings");

    if (error) {
        show("message", error.message);
        return;
    }

    if (!data || !data.length) {
        list.innerHTML = "";
        document.getElementById("empty").hidden = false;
        return;
    }

    document.getElementById("empty").hidden = true;
    list.innerHTML = data.map(function (listing) {
        const title = document.createElement("h2");
        title.textContent = listing.title || "";
        const summary = document.createElement("p");
        summary.textContent = listing.summary || "";
        const card = document.createElement("article");
        card.className = "card listing";
        card.append(title, summary);
        return card.outerHTML;
    }).join("");
}

async function saveOperator(supabase, user) {
    const legalName = document.getElementById("legalName").value.trim();
    const actingAs = document.getElementById("actingAs").value;

    if (legalName.length < 2) {
        show("message", "Enter the legal name of the owner or representative.");
        return;
    }

    const { error } = await supabase.from("accommodation_operators").insert({
        user_id: user.id,
        legal_name: legalName,
        acting_as: actingAs,
        identity_status: "not_started"
    });

    show("message", error ? error.message : "The application was saved. Identity verification stays off.");

    if (!error) {
        window.location.href = "accommodation-property.html";
    }
}

async function saveProperty(supabase, user, submitAfter) {
    const saveButton = document.getElementById("saveProperty");
    const submitButton = document.getElementById("submitProperty");

    if (saveButton) {
        saveButton.disabled = true;
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    const { data: operator, error: operatorError } = await supabase
        .from("accommodation_operators")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (operatorError || !operator) {
        if (saveButton) {
            saveButton.disabled = false;
        }

        if (submitButton) {
            submitButton.disabled = false;
        }

        show("message", operatorError ? operatorError.message : "Create the operator record first.");
        return;
    }

    const cin = accommodation.normalizeCin(document.getElementById("cin").value);
    const displayName = document.getElementById("displayName").value.trim();
    const city = document.getElementById("city").value.trim();
    const street = document.getElementById("street").value.trim();
    const streetNumber = document.getElementById("streetNumber").value.trim();
    const fieldError = accommodation.applicationError({
        displayName: displayName,
        marketingType: document.getElementById("marketingType").value,
        legalCategory: document.getElementById("legalCategory").value,
        cin: cin,
        city: city,
        street: street,
        streetNumber: streetNumber,
        countryCode: "IT"
    });

    function releasePropertyButtons() {
        if (saveButton) {
            saveButton.disabled = false;
        }

        if (submitButton) {
            submitButton.disabled = false;
        }
    }

    if (fieldError) {
        releasePropertyButtons();
        show("message", fieldError);
        return;
    }

    const { data: property, error: propertyError } = await supabase
        .from("accommodation_properties")
        .insert({
            operator_id: operator.id,
            marketing_type: document.getElementById("marketingType").value,
            legal_category: document.getElementById("legalCategory").value,
            display_name: displayName,
            property_status: "draft"
        })
        .select("id")
        .single();

    if (propertyError) {
        releasePropertyButtons();
        show("message", propertyError.message);
        return;
    }

    const { error: addressError } = await supabase.from("accommodation_addresses").insert({
        property_id: property.id,
        country_code: "IT",
        region: document.getElementById("region").value.trim() || null,
        city: city,
        postal_code: document.getElementById("postalCode").value.trim() || null,
        street: street,
        street_number: streetNumber,
        cadastral_sheet: document.getElementById("cadastralSheet").value.trim() || null,
        cadastral_parcel: document.getElementById("cadastralParcel").value.trim() || null,
        cadastral_subaltern: document.getElementById("cadastralSubaltern").value.trim() || null
    });

    if (addressError) {
        releasePropertyButtons();
        show("message", addressError.message);
        return;
    }

    const { error: cinError } = await supabase.from("accommodation_credentials").insert({
        property_id: property.id,
        credential_type: "cin",
        credential_value: cin,
        issuing_country: "IT"
    });

    if (cinError) {
        releasePropertyButtons();
        show("message", cinError.message);
        return;
    }

    if (submitAfter) {
        await submitApplication(supabase, user, property.id);
        return;
    }

    show("message", "Draft property saved. It is not published.");
    window.location.href = "accommodation-documents.html?property=" + property.id;
}

async function submitApplication(supabase, user, propertyId) {
    const clicked = document.activeElement;

    function releaseSubmitButton() {
        if (clicked && clicked.tagName === "BUTTON") {
            clicked.disabled = false;
        }
    }

    if (clicked && clicked.tagName === "BUTTON") {
        clicked.disabled = true;
    }

    const { data: operator, error: operatorError } = await supabase
        .from("accommodation_operators")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
    const { data: property, error: propertyError } = await supabase
        .from("accommodation_properties")
        .select("id,operator_id,display_name,marketing_type,legal_category,property_status")
        .eq("id", propertyId)
        .maybeSingle();

    if (operatorError || propertyError || !operator || !property || property.operator_id !== operator.id) {
        releaseSubmitButton();
        show("message", "Property not found.");
        return;
    }

    if (property.property_status !== "draft" && property.property_status !== "needs_more_info") {
        releaseSubmitButton();
        show("message", "This application was already submitted.");
        return;
    }

    const { data: address, error: addressError } = await supabase
        .from("accommodation_addresses")
        .select("country_code,city,street,street_number")
        .eq("property_id", propertyId)
        .maybeSingle();
    const { data: credential, error: credentialError } = await supabase
        .from("accommodation_credentials")
        .select("credential_value")
        .eq("property_id", propertyId)
        .eq("credential_type", "cin")
        .maybeSingle();

    if (addressError || credentialError) {
        releaseSubmitButton();
        show("message", addressError ? addressError.message : credentialError.message);
        return;
    }

    const fieldError = accommodation.applicationError({
        displayName: property.display_name,
        marketingType: property.marketing_type,
        legalCategory: property.legal_category,
        cin: credential ? credential.credential_value : "",
        city: address ? address.city : "",
        street: address ? address.street : "",
        streetNumber: address ? address.street_number : "",
        countryCode: address ? address.country_code : ""
    });

    if (fieldError) {
        releaseSubmitButton();
        show("message", fieldError);
        return;
    }

    const { data: updated, error: updateError } = await supabase
        .from("accommodation_properties")
        .update({ property_status: "submitted" })
        .eq("id", propertyId)
        .eq("operator_id", operator.id)
        .in("property_status", ["draft", "needs_more_info"])
        .select("id");

    if (updateError) {
        releaseSubmitButton();
        show("message", updateError.message);
        return;
    }

    if (!updated || !updated.length) {
        releaseSubmitButton();
        show("message", "This application was already submitted.");
        return;
    }

    show("message", "Submitted for review. The listing stays unpublished.");

    if (page === "status") {
        await loadStatus(supabase, user);
        return;
    }

    window.location.href = "accommodation-status.html";
}

async function uploadEvidence(supabase, user) {
    const propertyId = new URLSearchParams(window.location.search).get("property") || "";
    const evidenceType = document.getElementById("evidenceType").value;
    const file = document.getElementById("evidenceFile").files[0];

    if (accommodation.identityEvidenceBlocked(evidenceType)) {
        show("message", "Identity document upload is not open.");
        return;
    }

    if (!file || !propertyId) {
        show("message", "Choose a property document and open this page from the property draft.");
        return;
    }

    const extension = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = [
        user.id,
        propertyId,
        evidenceType,
        crypto.randomUUID() + "." + extension
    ].join("/");

    if (!accommodation.evidencePathAllowed(user.id, path, evidenceType)) {
        show("message", "Evidence path is not allowed.");
        return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest)).map(function (part) {
        return part.toString(16).padStart(2, "0");
    }).join("");

    const { error: uploadError } = await supabase.storage
        .from("accommodation-evidence")
        .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) {
        show("message", uploadError.message);
        return;
    }

    const { error } = await supabase.from("accommodation_evidence").insert({
        property_id: propertyId,
        evidence_type: evidenceType,
        storage_path: path,
        content_sha256: sha256,
        byte_size: file.size,
        mime_type: file.type
    });

    show("message", error ? error.message : "Document stored in private storage. It does not verify the property.");
}

async function loadStatus(supabase, user) {
    const { data: operator } = await supabase
        .from("accommodation_operators")
        .select("id,legal_name,identity_status")
        .eq("user_id", user.id)
        .maybeSingle();
    const { data: identity } = operator
        ? await supabase
            .from("accommodation_identity_checks")
            .select("provider,status")
            .eq("operator_id", operator.id)
            .maybeSingle()
        : { data: null };

    show("identityStatus", accommodation.identityStatusText(operator ? operator.identity_status : "not_started"));
    show("identityCheck", "No identity provider is connected.");

    const target = document.getElementById("properties");

    if (!operator) {
        target.textContent = "No property file yet.";

        if (window.HAVKAR_ACCOMMODATION_I18N) {
            window.HAVKAR_ACCOMMODATION_I18N.apply();
        }

        return;
    }

    const { data: properties } = await supabase
        .from("accommodation_properties")
        .select("id,operator_id,display_name,property_status")
        .eq("operator_id", operator.id);

    target.replaceChildren();

    if (!properties || !properties.length) {
        target.textContent = "No property file yet.";
        return;
    }

    properties.forEach(function (property) {
        const card = document.createElement("article");
        card.className = "card";
        const title = document.createElement("h2");
        title.dataset.userText = "true";
        title.textContent = property.display_name || "";
        const status = document.createElement("p");
        status.textContent = accommodation.propertyStatusText(property.property_status);
        card.append(title, status);

        if (property.property_status === "draft" || property.property_status === "needs_more_info") {
            const button = document.createElement("button");
            button.className = "primary";
            button.type = "button";
            button.textContent = "Submit for review";
            button.addEventListener("click", function () {
                submitApplication(supabase, user, property.id);
            });
            card.append(button);
        }

        target.append(card);
    });

    if (window.HAVKAR_ACCOMMODATION_I18N) {
        window.HAVKAR_ACCOMMODATION_I18N.apply();
    }
}

async function loadReviewQueue(supabase) {
    const { data, error } = await supabase
        .from("accommodation_properties")
        .select("id,display_name,property_status,marketing_type,legal_category")
        .in("property_status", ["submitted", "in_review", "needs_more_info"]);
    const list = document.getElementById("queue");

    if (error) {
        show("message", error.message);
        return;
    }

    if (!data || !data.length) {
        list.textContent = "No property is waiting for review.";
        return;
    }

    list.innerHTML = "";
    data.forEach(function (property) {
        const link = document.createElement("a");
        link.href = "accommodation-review-case.html?property=" + property.id;
        const name = document.createElement("span");
        name.dataset.userText = "true";
        name.textContent = property.display_name || "";
        const state = document.createElement("span");
        state.textContent = accommodation.propertyStatusText(property.property_status);
        link.append(name, document.createTextNode(" — "), state);
        const row = document.createElement("p");
        row.appendChild(link);
        list.appendChild(row);
    });
}

async function submitDecision(session) {
    const decision = document.getElementById("decision").value;
    const decisionError = accommodation.reviewDecisionError(decision);

    if (decisionError) {
        show("message", decisionError);
        return;
    }

    const response = await fetch("/api/accommodation-review", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + session.access_token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            propertyId: new URLSearchParams(window.location.search).get("property"),
            decision: decision,
            notes: document.getElementById("notes").value
        })
    });
    const payload = await response.json().catch(function () { return {}; });

    show("message", payload.error || (response.ok
        ? "Property decision recorded. Identity Verified remains off and the listing stays unpublished."
        : "The decision was not recorded."));
}

async function start() {
    const config = window.HAVKAR_SUPABASE_CONFIG;

    if (!config?.url || !config.publishableKey) {
        show("message", "Supabase configuration is missing.");
        return;
    }

    const supabase = createClient(config.url, config.publishableKey);
    const session = await sessionUser(supabase);
    const user = session?.user || null;
    const authLinks = document.getElementById("authLinks");

    if (authLinks && user) {
        authLinks.hidden = true;
    }

    if (page !== "public" && !user) {
        show("message", "Sign in before continuing.");
        return;
    }

    if ((page === "apply" || page === "property" || page === "documents") && !user.email_confirmed_at && !user.confirmed_at) {
        show("message", "Confirm the account email before creating an accommodation file.");
        return;
    }

    if (page === "public") {
        await loadPublic(supabase);
    }

    if (page === "apply") {
        document.getElementById("saveOperator").addEventListener("click", function () {
            saveOperator(supabase, user);
        });
    }

    if (page === "property") {
        document.getElementById("saveProperty").addEventListener("click", function () {
            saveProperty(supabase, user, false);
        });
        document.getElementById("submitProperty").addEventListener("click", function () {
            saveProperty(supabase, user, true);
        });
    }

    if (page === "documents") {
        document.getElementById("uploadEvidence").addEventListener("click", function () {
            uploadEvidence(supabase, user);
        });
        document.getElementById("submitApplication").addEventListener("click", function () {
            const propertyId = new URLSearchParams(window.location.search).get("property") || "";

            if (!propertyId) {
                show("message", "Choose a property document and open this page from the property draft.");
                return;
            }

            submitApplication(supabase, user, propertyId);
        });
    }

    if (page === "status") {
        await loadStatus(supabase, user);
    }

    if (page === "review" || page === "review-case") {
        const { data: reviewer } = await supabase
            .from("accommodation_reviewers")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("active", true)
            .maybeSingle();

        if (!reviewer) {
            show("message", "Review access is assigned on the server.");
            return;
        }
    }

    if (page === "review") {
        await loadReviewQueue(supabase);
    }

    if (page === "review-case") {
        const propertyId = new URLSearchParams(window.location.search).get("property");
        const { data, error } = await supabase
            .from("accommodation_properties")
            .select("display_name,property_status,legal_category,marketing_type")
            .eq("id", propertyId)
            .maybeSingle();

        if (error || !data) {
            show("case", error ? error.message : "Property not found.");
            return;
        }

        const caseNode = document.getElementById("case");
        const caseName = document.createElement("span");
        caseName.dataset.userText = "true";
        caseName.textContent = data.display_name || "";
        const caseState = document.createElement("span");
        caseState.textContent = accommodation.propertyStatusText(data.property_status);
        caseNode.replaceChildren(caseName, document.createTextNode(" — "), caseState);

        if (window.HAVKAR_ACCOMMODATION_I18N) {
            window.HAVKAR_ACCOMMODATION_I18N.apply();
        }
        document.getElementById("recordDecision").addEventListener("click", function () {
            submitDecision(session);
        });
    }
}

start();

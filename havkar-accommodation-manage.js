import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const accommodation = window.HAVKAR_ACCOMMODATION;
const message = document.getElementById("message");
const form = document.getElementById("tools");
const propertySelect = document.getElementById("propertyId");

function show(text) {
  message.textContent = text || "";
}

function selectedProperty() {
  return propertySelect.value || "";
}

async function start() {
  const config = window.HAVKAR_SUPABASE_CONFIG;

  if (!config || !accommodation) {
    show("Property tools are not available.");
    return;
  }

  const db = createClient(config.url, config.publishableKey);
  const session = await db.auth.getSession();
  const user = session.data.session && session.data.session.user;

  if (!user) {
    show("Sign in before managing a property.");
    return;
  }

  const booking = await db.rpc("havkar_accommodation_booking_enabled");

  if (booking.error) {
    show("Property tools are not available until the database migration is applied.");
    return;
  }

  if (booking.data !== false) {
    show("Stay booking is not available.");
    return;
  }

  const operator = await db
    .from("accommodation_operators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (operator.error || !operator.data) {
    show("Create a property application before using these tools.");
    return;
  }

  const properties = await db
    .from("accommodation_properties")
    .select("id,display_name,property_status")
    .eq("operator_id", operator.data.id);

  if (properties.error || !properties.data || !properties.data.length) {
    show("No property file was found.");
    return;
  }

  properties.data.forEach(function(property) {
    const option = document.createElement("option");
    option.value = property.id;
    option.textContent = property.display_name + " · unpublished";
    propertySelect.appendChild(option);
  });

  form.hidden = false;
  show("Photos stay private. Draft prices are not charged. Stays are not accepted.");

  document.getElementById("saveDate").addEventListener("click", async function() {
    const state = accommodation.availabilityState(document.getElementById("stayState").value);
    const stayDate = document.getElementById("stayDate").value;

    if (!state || !stayDate) {
      show("Choose an open or blocked date.");
      return;
    }

    const saved = await db
      .from("accommodation_availability")
      .upsert({
        property_id: selectedProperty(),
        stay_date: stayDate,
        state: state
      }, { onConflict: "property_id,stay_date" });

    show(saved.error ? saved.error.message : "Date saved. No stay was booked.");
    await loadDays(db);
  });

  document.getElementById("savePrice").addEventListener("click", async function() {
    const raw = document.getElementById("nightly").value.trim();
    const amount = raw === "" ? null : Number(raw);

    if (raw !== "" && (!Number.isInteger(amount) || amount < 0 || amount > 100000000)) {
      show("Enter the nightly draft in whole cents, or leave it empty.");
      return;
    }

    const saved = await db
      .from("accommodation_price_drafts")
      .upsert({
        property_id: selectedProperty(),
        nightly_amount_cents: amount,
        charge_status: "not_charged"
      }, { onConflict: "property_id" });

    show(saved.error ? saved.error.message : "Draft price saved. It was not charged.");
  });

  document.getElementById("savePhoto").addEventListener("click", async function() {
    const file = document.getElementById("photo").files && document.getElementById("photo").files[0];
    const path = file
      ? accommodation.ownerPhotoPath(user.id, selectedProperty(), file.name)
      : "";

    if (!file || !path) {
      show("Choose a JPEG, PNG, or WebP photo without an identity-document name.");
      return;
    }

    const uploaded = await db.storage.from("accommodation-owner").upload(path, file, {
      upsert: false,
      contentType: file.type
    });

    if (uploaded.error) {
      show(uploaded.error.message);
      return;
    }

    const recorded = await db.from("accommodation_owner_photos").insert({
      property_id: selectedProperty(),
      storage_path: path
    });

    show(recorded.error ? recorded.error.message : "Private photo stored. It is not published.");
  });

  propertySelect.addEventListener("change", function() {
    loadDays(db);
  });
  await loadDays(db);
}

async function loadDays(db) {
  const days = document.getElementById("days");
  const result = await db
    .from("accommodation_availability")
    .select("stay_date,state")
    .eq("property_id", selectedProperty())
    .order("stay_date", { ascending: true });

  if (result.error) {
    days.textContent = result.error.message;
    return;
  }

  days.textContent = (result.data || []).map(function(day) {
    return day.stay_date + " " + day.state;
  }).join(", ");
}

start();

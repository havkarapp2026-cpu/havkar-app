/**
 * Limited template catalog for HAVKAR Studio.
 * Unsupported capabilities are explicitly listed — no unrestricted app generation.
 */

const TEMPLATES = Object.freeze([
  {
    id: "landing_business",
    name: "Business website / landing",
    category: "website",
    supported: [
      "hero",
      "about",
      "services_list",
      "contact_form_fields",
      "brand_colors",
      "logo_slot"
    ],
    unsupported: [
      "custom_server_code",
      "arbitrary_third_party_api_keys",
      "unreviewed_public_domain_bind"
    ],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#1c9a43", surface: "#07140b" },
      sections: ["hero", "about", "services", "contact"],
      heroTitle: "Your business",
      heroSubtitle: "Built with HAVKAR Studio templates"
    }
  },
  {
    id: "restaurant_ordering",
    name: "Restaurant & ordering interface",
    category: "restaurant",
    supported: ["menu_categories", "item_cards", "hours", "pickup_note"],
    unsupported: ["live_card_checkout", "kitchen_printer_drivers"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#c9a227", surface: "#0a160f" },
      sections: ["menu", "hours", "location"],
      orderingMode: "inquiry_only",
      paymentsNote: "Venture payments remain OFF until owner authorization."
    }
  },
  {
    id: "online_shop",
    name: "Online shop (catalog)",
    category: "shop",
    supported: ["product_grid", "categories", "price_display"],
    unsupported: ["live_stripe_charges", "inventory_sync_erp"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#2ecc71", surface: "#07140b" },
      sections: ["catalog", "about"],
      checkoutMode: "disabled"
    }
  },
  {
    id: "community_creator",
    name: "Community / creator profile",
    category: "community",
    supported: ["profile", "post_feed_placeholder", "links"],
    unsupported: ["short_video_transcoding", "open_social_graph"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#58d68d", surface: "#08150e" },
      sections: ["profile", "posts", "links"]
    }
  },
  {
    id: "booking_services",
    name: "Booking & services",
    category: "booking",
    supported: ["service_list", "request_form", "availability_note"],
    unsupported: ["calendar_sync_google", "live_deposits"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#27ae60", surface: "#07140b" },
      sections: ["services", "request", "faq"],
      bookingMode: "request_only"
    }
  },
  {
    id: "sports_training",
    name: "Sports / training / challenges",
    category: "sports",
    supported: ["session_log", "leaderboard_placeholder", "coach_notes"],
    unsupported: ["live_sensor_force", "calibrated_accuracy_scoring"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#f1c40f", surface: "#0a160f" },
      sections: ["sessions", "leaderboard", "coach"],
      sensorMode: "simulation_only"
    }
  },
  {
    id: "hardware_connected",
    name: "Hardware-connected experience",
    category: "hardware",
    supported: ["pairing_contract", "device_status", "simulation_events"],
    unsupported: ["untrusted_firmware_upload", "raw_binary_execution"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#1abc9c", surface: "#07140b" },
      sections: ["devices", "protocol", "safety"],
      protocol: "havkar-aldo-ble-v0"
    }
  },
  {
    id: "dashboard_forms",
    name: "Dashboard, forms & analytics shell",
    category: "dashboard",
    supported: ["kpi_cards", "simple_form", "table_placeholder"],
    unsupported: ["cross_tenant_queries", "export_of_other_ventures"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#52be80", surface: "#07140b" },
      sections: ["kpis", "forms", "reports"]
    }
  },
  {
    id: "game_2d_football",
    name: "2D football mini-game (demo)",
    category: "sports",
    supported: ["canvas_game_link", "custom_rules_panel", "score_clock"],
    unsupported: [
      "3d_engine",
      "aldo_hardware_sensors",
      "multiplayer_networking"
    ],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#f1c40f", surface: "#0a160f" },
      sections: ["game", "rules"],
      heroTitle: "2D Football Demo",
      heroSubtitle: "Playable demo — not Aldo SPEED UP MY TOUCH hardware",
      gameUrl: "create-football-2d.html",
      sensorMode: "not_applicable"
    }
  },
  {
    id: "salon_services",
    name: "Salon / barber booking page",
    category: "booking",
    supported: ["service_list", "request_form", "hours"],
    unsupported: ["live_deposits", "staff_calendar_sync"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#bb8fce", surface: "#07140b" },
      sections: ["services", "request", "hours"],
      bookingMode: "request_only",
      heroTitle: "Salon & grooming"
    }
  },
  {
    id: "repair_workshop",
    name: "Repair workshop / garage page",
    category: "booking",
    supported: ["service_list", "request_form", "status_note"],
    unsupported: ["parts_inventory_erp", "live_card_checkout"],
    defaultConfig: {
      theme: { primary: "#0d3d16", accent: "#e67e22", surface: "#07140b" },
      sections: ["services", "request"],
      bookingMode: "request_only",
      heroTitle: "Repair workshop"
    }
  }
]);

function listTemplates() {
  return TEMPLATES.map(function (t) {
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      supported: t.supported.slice(),
      unsupported: t.unsupported.slice()
    };
  });
}

function getTemplate(id) {
  const key = String(id || "").trim();
  for (let i = 0; i < TEMPLATES.length; i += 1) {
    if (TEMPLATES[i].id === key) return TEMPLATES[i];
  }
  return null;
}

function buildConfigFromTemplate(templateId, overrides) {
  const template = getTemplate(templateId);
  if (!template) {
    return { ok: false, error: "Unknown or unsupported template." };
  }
  const base = JSON.parse(JSON.stringify(template.defaultConfig));
  const extra = overrides && typeof overrides === "object" ? overrides : {};
  const merged = Object.assign({}, base, extra, {
    template_id: template.id,
    template_name: template.name,
    unsupported: template.unsupported.slice(),
    payments_enabled: false,
    public_publish_enabled: false
  });
  return { ok: true, template: template, config: merged };
}

module.exports = {
  TEMPLATES,
  listTemplates,
  getTemplate,
  buildConfigFromTemplate
};

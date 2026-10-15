const BUSINESS_CATEGORIES = Object.freeze([
  ["restaurant", "Restaurant"],
  ["cafe", "Cafe"],
  ["bakery", "Bakery"],
  ["grocery", "Grocery"],
  ["factory", "Factory"],
  ["retail", "Retail shop"],
  ["wholesale", "Wholesale"],
  ["professional_services", "Professional services"],
  ["health", "Health and care"],
  ["education", "Education"],
  ["construction", "Construction"],
  ["transport", "Transport"],
  ["beauty", "Beauty"],
  ["hospitality", "Hospitality"],
  ["technology", "Technology"],
  ["agriculture", "Agriculture"],
  ["arts", "Arts and media"],
  ["nonprofit", "Nonprofit"],
  ["other", "Other legitimate business"]
].map(([code, label]) => Object.freeze({ code, label })));

const CATEGORY_CODES = new Set(BUSINESS_CATEGORIES.map((category) => category.code));

const RESERVED_SLUGS = Object.freeze([
  "about", "admin", "api", "business", "delivery", "index", "login",
  "owner", "profile", "signup", "staff", "support", "wallet"
]);

const LIMITS = Object.freeze({
  pagesPerOwner: 8,
  name: 120,
  summary: 280,
  description: 4000,
  otherLabel: 80,
  sections: 40,
  sectionTitle: 120,
  sectionBody: 4000,
  offerings: 200,
  offeringTitle: 160,
  offeringDetails: 2000,
  menuItems: 500,
  menuName: 160,
  menuDetails: 1000,
  priceLabel: 40,
  images: 12,
  altText: 160
});

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const IMAGE_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:logo|cover|image-(?:[1-9]|1[0-2]))\.webp$/;

function categoryByCode(code) {
  return BUSINESS_CATEGORIES.find((category) => category.code === code) || null;
}

function isPublicSlug(slug) {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.includes(slug);
}

function publicPagePath(slug) {
  if (!isPublicSlug(slug)) {
    return "";
  }

  return "business.html?slug=" + encodeURIComponent(slug);
}

function cleanLine(value, max) {
  return String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseMenuText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const items = [];

  for (const line of lines) {
    const cleaned = line.replace(/^\s*\d+\s*[.)]\s*/, "").trim();
    if (!cleaned) {
      continue;
    }
    const parts = cleaned.split("|").map((part) => part.trim());
    items.push({
      name: parts[0] || "",
      details: parts[1] || "",
      priceLabel: parts[2] || ""
    });
  }

  return normalizeMenuItems(items);
}

function normalizeMenuItems(items) {
  const source = Array.isArray(items) ? items : [];
  const menu = [];

  for (const item of source) {
    const name = cleanLine(item && item.name, LIMITS.menuName);
    const details = cleanLine(item && item.details, LIMITS.menuDetails);
    const priceLabel = cleanLine(item && (item.priceLabel ?? item.price_label), LIMITS.priceLabel);

    if (!name && !details && !priceLabel) {
      continue;
    }

    if (!name) {
      return { ok: false, error: "Each menu item needs a name." };
    }

    menu.push({ name, details, priceLabel });
  }

  if (menu.length > LIMITS.menuItems) {
    return { ok: false, error: "A menu can contain at most 500 items." };
  }

  return {
    ok: true,
    items: menu.map((item, index) => ({
      position: index + 1,
      itemNumber: index + 1,
      name: item.name,
      details: item.details,
      priceLabel: item.priceLabel
    }))
  };
}

function normalizeOfferings(items, kind) {
  const source = Array.isArray(items) ? items : [];
  const offerings = [];

  for (const item of source) {
    const title = cleanLine(item && (item.title || item.name), LIMITS.offeringTitle);
    const details = cleanLine(item && item.details, LIMITS.offeringDetails);
    const priceLabel = cleanLine(item && (item.priceLabel ?? item.price_label), LIMITS.priceLabel);

    if (!title && !details && !priceLabel) {
      continue;
    }

    if (!title) {
      return { ok: false, error: "Each " + kind + " needs a title." };
    }

    offerings.push({ title, details, priceLabel });
  }

  if (offerings.length > LIMITS.offerings) {
    return { ok: false, error: "Too many " + kind + " entries." };
  }

  return {
    ok: true,
    items: offerings.map((item, index) => ({
      kind,
      position: index + 1,
      title: item.title,
      details: item.details,
      priceLabel: item.priceLabel
    }))
  };
}

function normalizeSections(items) {
  const source = Array.isArray(items) ? items : [];
  const sections = [];

  for (const item of source) {
    const title = cleanLine(item && item.title, LIMITS.sectionTitle);
    const body = cleanLine(item && (item.body || item.details), LIMITS.sectionBody);

    if (!title && !body) {
      continue;
    }

    if (!title) {
      return { ok: false, error: "Each section needs a title." };
    }

    sections.push({ title, body });
  }

  if (sections.length > LIMITS.sections) {
    return { ok: false, error: "Too many sections." };
  }

  return {
    ok: true,
    items: sections.map((item, index) => ({
      position: index + 1,
      title: item.title,
      body: item.body
    }))
  };
}

function normalizeImages(items, ownerId) {
  const source = Array.isArray(items) ? items : [];
  const images = [];

  for (const item of source) {
    const objectPath = String(item && (item.objectPath || item.object_path) || "").trim();
    const altText = cleanLine(item && (item.altText || item.alt_text), LIMITS.altText);

    if (!objectPath) {
      continue;
    }

    if (!IMAGE_PATH_PATTERN.test(objectPath) || objectPath.split("/")[0] !== ownerId) {
      return { ok: false, error: "An image path is not valid for this business page." };
    }

    images.push({ objectPath, altText });
  }

  if (images.length > LIMITS.images) {
    return { ok: false, error: "A page can show at most 12 images." };
  }

  return {
    ok: true,
    items: images.map((item, index) => ({
      position: index + 1,
      objectPath: item.objectPath,
      altText: item.altText
    }))
  };
}

function buildPageWrite(input) {
  const source = input && typeof input === "object" ? input : {};
  const ownerId = String(source.ownerId || "").toLowerCase();
  const slug = cleanLine(source.slug, 64).toLowerCase();
  const displayName = cleanLine(source.displayName || source.display_name, LIMITS.name);
  const categoryCode = String(source.categoryCode || source.category_code || "").trim();
  const categoryLabel = categoryCode === "other"
    ? cleanLine(source.categoryLabel || source.category_label, LIMITS.otherLabel)
    : "";
  const summary = cleanLine(source.summary, LIMITS.summary);
  const description = cleanLine(source.description, LIMITS.description);
  const logoPath = String(source.logoPath || source.logo_path || "").trim();
  const coverPath = String(source.coverPath || source.cover_path || "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ownerId)) {
    return { ok: false, error: "Sign in before saving a business page." };
  }

  if (!isPublicSlug(slug)) {
    return { ok: false, error: "Choose a public link using lowercase letters, numbers, and hyphens." };
  }

  if (!displayName) {
    return { ok: false, error: "Enter the business name." };
  }

  if (!CATEGORY_CODES.has(categoryCode)) {
    return { ok: false, error: "Choose a business category." };
  }

  if (categoryCode === "other" && categoryLabel.length < 2) {
    return { ok: false, error: "Name the business category." };
  }

  for (const path of [logoPath, coverPath]) {
    if (path && (!IMAGE_PATH_PATTERN.test(path) || path.split("/")[0] !== ownerId)) {
      return { ok: false, error: "An image path is not valid for this business page." };
    }
  }

  const sections = normalizeSections(source.sections);
  const services = normalizeOfferings(source.services, "service");
  const products = normalizeOfferings(source.products, "product");
  const menu = normalizeMenuItems(source.menu);
  const images = normalizeImages(source.images, ownerId);

  for (const result of [sections, services, products, menu, images]) {
    if (!result.ok) {
      return result;
    }
  }

  return {
    ok: true,
    page: {
      owner_id: ownerId,
      slug,
      display_name: displayName,
      category_code: categoryCode,
      category_label: categoryLabel,
      summary,
      description,
      logo_path: logoPath || null,
      cover_path: coverPath || null,
      published: source.published === true
    },
    sections: sections.items,
    services: services.items,
    products: products.items,
    menu: menu.items,
    images: images.items,
    sharePath: publicPagePath(slug)
  };
}

function categoryLabel(page) {
  if (page.category_code === "other" && page.category_label) {
    return page.category_label;
  }

  return (categoryByCode(page.category_code) || {}).label || "Business";
}

function mediaUrl(baseUrl, objectPath) {
  if (!baseUrl || !objectPath) {
    return "";
  }

  return String(baseUrl).replace(/\/$/, "") +
    "/storage/v1/object/public/business-media/" +
    objectPath.split("/").map(encodeURIComponent).join("/");
}

function priceMarkup(priceLabel) {
  if (!priceLabel) {
    return "";
  }

  return '<span class="price">' + escapeText(priceLabel) + "</span>";
}

function renderPublicPage(model) {
  const page = model && model.page;
  if (!page || page.published !== true || !isPublicSlug(page.slug)) {
    return "";
  }

  const baseUrl = model.mediaBaseUrl || "";
  const logo = mediaUrl(baseUrl, page.logo_path);
  const cover = mediaUrl(baseUrl, page.cover_path);
  const sections = Array.isArray(model.sections) ? model.sections : [];
  const services = Array.isArray(model.services) ? model.services : [];
  const products = Array.isArray(model.products) ? model.products : [];
  const menu = Array.isArray(model.menu) ? model.menu : [];
  const images = Array.isArray(model.images) ? model.images : [];
  const orderedMenu = menu.slice().sort((a, b) => a.position - b.position);

  const parts = ['<article class="business-page">'];
  parts.push('<p class="category">' + escapeText(categoryLabel(page)) + "</p>");
  parts.push("<h1>" + escapeText(page.display_name) + "</h1>");

  if (logo) {
    parts.push('<img class="logo" src="' + escapeText(logo) + '" alt="' + escapeText(page.display_name) + ' logo">');
  }

  if (page.summary) {
    parts.push('<p class="summary">' + escapeText(page.summary) + "</p>");
  }

  if (cover) {
    parts.push('<img class="cover" src="' + escapeText(cover) + '" alt="">');
  }

  if (page.description) {
    parts.push('<p class="description">' + escapeText(page.description) + "</p>");
  }

  if (images.length) {
    parts.push('<section><h2>Images</h2><div class="image-grid">');
    for (const image of images.slice().sort((a, b) => a.position - b.position)) {
      const src = mediaUrl(baseUrl, image.object_path || image.objectPath);
      if (src) {
        parts.push('<img src="' + escapeText(src) + '" alt="' + escapeText(image.alt_text || image.altText || "") + '">');
      }
    }
    parts.push("</div></section>");
  }

  function offeringList(title, rows) {
    if (!rows.length) {
      return;
    }
    parts.push("<section><h2>" + title + "</h2><ol>");
    for (const row of rows.slice().sort((a, b) => a.position - b.position)) {
      parts.push("<li><strong>" + escapeText(row.title) + "</strong> " + priceMarkup(row.price_label || row.priceLabel));
      if (row.details) {
        parts.push("<span>" + escapeText(row.details) + "</span>");
      }
      parts.push("</li>");
    }
    parts.push("</ol></section>");
  }

  offeringList("Services", services);
  offeringList("Products", products);

  for (const section of sections.slice().sort((a, b) => a.position - b.position)) {
    parts.push("<section><h2>" + escapeText(section.title) + "</h2>");
    if (section.body) {
      parts.push("<p>" + escapeText(section.body) + "</p>");
    }
    parts.push("</section>");
  }

  if (orderedMenu.length) {
    parts.push('<section class="menu"><h2>Menu</h2><ol class="menu-list">');
    for (const item of orderedMenu) {
      parts.push('<li value="' + Number(item.item_number || item.itemNumber) + '"><strong>' + escapeText(item.name) + "</strong> " + priceMarkup(item.price_label || item.priceLabel));
      if (item.details) {
        parts.push("<span>" + escapeText(item.details) + "</span>");
      }
      parts.push("</li>");
    }
    parts.push("</ol></section>");
  }

  parts.push('<p class="price-note">Prices shown here are display text. This page does not take a payment.</p>');
  parts.push("</article>");
  return parts.join("");
}

function unavailableMessage(error) {
  const code = error && (error.code || error.status || "");
  const text = String(error && error.message || "");

  if (code === "PGRST205" || /schema cache|could not find the table|does not exist/i.test(text)) {
    return "Public business pages are not enabled on this server yet.";
  }

  return "The business page could not be loaded.";
}

export {
  BUSINESS_CATEGORIES,
  IMAGE_PATH_PATTERN,
  LIMITS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  buildPageWrite,
  categoryByCode,
  escapeText,
  isPublicSlug,
  normalizeMenuItems,
  parseMenuText,
  publicPagePath,
  renderPublicPage,
  unavailableMessage
};

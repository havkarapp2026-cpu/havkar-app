/*
 * Shared Buy & Sell categories.
 * New advertisements store the stable code.
 * An existing value is shown unchanged unless it already is
 * one of these codes or its exact English label.
 */
(function () {
    "use strict";

    const CATEGORIES = Object.freeze([
        Object.freeze({ code: "electronics", label: "Electronics", icon: "fa-microchip", emoji: "🔌" }),
        Object.freeze({ code: "mobile_phones", label: "Mobile Phones", icon: "fa-mobile-screen", emoji: "📱" }),
        Object.freeze({ code: "computers", label: "Computers", icon: "fa-laptop", emoji: "💻" }),
        Object.freeze({ code: "tv_audio", label: "TV & Audio", icon: "fa-tv", emoji: "📺" }),
        Object.freeze({ code: "appliances", label: "Appliances", icon: "fa-plug", emoji: "🔌" }),
        Object.freeze({ code: "furniture", label: "Furniture", icon: "fa-couch", emoji: "🛋️" }),
        Object.freeze({ code: "home_garden", label: "Home & Garden", icon: "fa-house", emoji: "🏡" }),
        Object.freeze({ code: "kitchen", label: "Kitchen", icon: "fa-kitchen-set", emoji: "🍳" }),
        Object.freeze({ code: "restaurant_equipment", label: "Restaurant Equipment", icon: "fa-utensils", emoji: "🍽️" }),
        Object.freeze({ code: "food", label: "Food", icon: "fa-basket-shopping", emoji: "🛒" }),
        Object.freeze({ code: "tools", label: "Tools & Machinery", icon: "fa-screwdriver-wrench", emoji: "🛠️" }),
        Object.freeze({ code: "vehicles", label: "Vehicles", icon: "fa-car", emoji: "🚗" }),
        Object.freeze({ code: "cars", label: "Cars", icon: "fa-car", emoji: "🚗" }),
        Object.freeze({ code: "motorcycles", label: "Motorcycles", icon: "fa-motorcycle", emoji: "🏍️" }),
        Object.freeze({ code: "trucks", label: "Trucks", icon: "fa-truck", emoji: "🚚" }),
        Object.freeze({ code: "bicycles", label: "Bicycles", icon: "fa-bicycle", emoji: "🚲" }),
        Object.freeze({ code: "clothing", label: "Clothing", icon: "fa-shirt", emoji: "👕" }),
        Object.freeze({ code: "books", label: "Books", icon: "fa-book", emoji: "📚" }),
        Object.freeze({ code: "baby_kids", label: "Baby & Kids", icon: "fa-baby", emoji: "🍼" }),
        Object.freeze({ code: "sports", label: "Sports", icon: "fa-futbol", emoji: "⚽" }),
        Object.freeze({ code: "beauty", label: "Beauty & Personal Care", icon: "fa-spa", emoji: "💄" }),
        Object.freeze({ code: "real_estate", label: "Real Estate", icon: "fa-house-chimney", emoji: "🏠" }),
        Object.freeze({ code: "housing", label: "Housing", icon: "fa-house-chimney", emoji: "🏠" }),
        Object.freeze({ code: "services", label: "Services", icon: "fa-handshake", emoji: "🤝" }),
        Object.freeze({ code: "jobs", label: "Jobs", icon: "fa-briefcase", emoji: "💼" }),
        Object.freeze({ code: "construction", label: "Construction & Industrial", icon: "fa-helmet-safety", emoji: "🏗️" }),
        Object.freeze({ code: "agriculture", label: "Agricultural Equipment", icon: "fa-tractor", emoji: "🚜" }),
        Object.freeze({ code: "other", label: "Other", icon: "fa-box", emoji: "📦" })
    ]);

    const BY_CODE = new Map(
        CATEGORIES.map(function (category) {
            return [category.code, category];
        })
    );

    const BY_LABEL = new Map(
        CATEGORIES.map(function (category) {
            return [category.label.toLowerCase(), category.code];
        })
    );

    function normalize(value) {
        return String(value || "").trim();
    }

    function resolveCode(value) {
        const text = normalize(value);

        if (!text) {
            return "";
        }

        const lower = text.toLowerCase();

        if (BY_CODE.has(lower)) {
            return lower;
        }

        if (BY_LABEL.has(lower)) {
            return BY_LABEL.get(lower);
        }

        return "";
    }

    function displayLabel(value) {
        const text = normalize(value);
        const code = resolveCode(text);

        if (!code) {
            return text;
        }

        return BY_CODE.get(code).label;
    }

    function matches(stored, filterCode) {
        const filter = normalize(filterCode).toLowerCase();

        if (!filter || filter === "all") {
            return true;
        }

        return resolveCode(stored) === filter;
    }

    function icon(value) {
        const code = resolveCode(value);

        if (!code) {
            return "fa-box";
        }

        return BY_CODE.get(code).icon;
    }

    function emoji(value) {
        const code = resolveCode(value);

        if (!code) {
            return "";
        }

        return BY_CODE.get(code).emoji;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fillSelect(select, placeholder, currentValue) {
        if (!select) {
            return;
        }

        const current = normalize(currentValue);
        const resolved = resolveCode(current);
        const options = [];

        if (typeof placeholder === "string") {
            options.push(
                '<option value="">' +
                escapeHtml(placeholder) +
                "</option>"
            );
        }

        CATEGORIES.forEach(function (category) {
            const value = resolved === category.code
                ? current
                : category.code;

            options.push(
                '<option value="' +
                escapeHtml(value) +
                '">' +
                escapeHtml(category.label) +
                "</option>"
            );
        });

        if (current && !resolved) {
            options.push(
                '<option value="' +
                escapeHtml(current) +
                '" data-legacy="true" class="notranslate">' +
                escapeHtml(current) +
                "</option>"
            );
        }

        select.innerHTML = options.join("");
        select.value = current;
    }

    window.HAVKAR_CATEGORIES = {
        list: CATEGORIES,
        resolveCode: resolveCode,
        displayLabel: displayLabel,
        matches: matches,
        icon: icon,
        emoji: emoji,
        fillSelect: fillSelect
    };
})();

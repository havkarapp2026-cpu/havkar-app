/*
 * Points the Welcome Pickups transfer form at the HAVKAR language
 * when that partner has a matching locale. Sorani (ckb) and
 * Kurmanji (kmr) stay separate: the partner has neither, so HAVKAR
 * translation is allowed to translate the English form.
 */
(function (root, factory) {

    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    root.HAVKAR_TRANSFER_WIDGET = api;

    if (typeof document !== "undefined") {
        api.install();
    }

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    const PARTNER_LOCALES = Object.freeze([
        "ar",
        "tr",
        "de",
        "el",
        "en",
        "es",
        "fr",
        "it",
        "pl",
        "sr",
        "ru",
        "sv",
        "nl",
        "ja"
    ]);

    function readLanguage() {

        try {

            const stored =
                localStorage.getItem(
                    "havkar_language"
                );

            const code =
                String(stored || "en").trim().toLowerCase();

            return code || "en";

        } catch (error) {

            return "en";
        }
    }

    function partnerLocale(language) {

        const code =
            String(language || "en").trim().toLowerCase();

        if (PARTNER_LOCALES.indexOf(code) === -1) {
            return "en";
        }

        return code;
    }

    function widgetShouldUseHavkarTranslation(language) {

        const code =
            String(language || "en").trim().toLowerCase();

        return partnerLocale(code) !== code;
    }

    function applyProps(props, language) {

        return Object.assign({}, props || {}, {
            locale: partnerLocale(language)
        });
    }

    function bookingUrl(language) {

        return (
            "https://www.book-online-transfers.com/" +
            partnerLocale(language) +
            "/havkar"
        );
    }

    function install() {

        const language = readLanguage();
        const propsNode = document.getElementById("welcomePickupsProps");

        if (propsNode) {

            let props = {};

            try {
                props = JSON.parse(propsNode.textContent);
            } catch (error) {
                props = {};
            }

            propsNode.textContent =
                "\n" +
                JSON.stringify(applyProps(props, language), null, 2) +
                "\n";
        }

        const host = document.getElementById("welcomepickups");

        if (host) {

            if (widgetShouldUseHavkarTranslation(language)) {
                host.setAttribute("data-havkar-translate-widget", "true");
                host.removeAttribute("data-i18n-ignore");
                host.removeAttribute("translate");
            } else {
                host.removeAttribute("data-havkar-translate-widget");
                host.setAttribute("data-i18n-ignore", "");
                host.setAttribute("translate", "no");
            }
        }

        function applyLinks() {
            document.querySelectorAll("[data-transfer-booking-link]").forEach(function (link) {
                link.href = bookingUrl(language);
            });
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", applyLinks);
        } else {
            applyLinks();
        }
    }

    return {
        PARTNER_LOCALES: PARTNER_LOCALES,
        partnerLocale: partnerLocale,
        widgetShouldUseHavkarTranslation: widgetShouldUseHavkarTranslation,
        applyProps: applyProps,
        bookingUrl: bookingUrl,
        install: install
    };

});

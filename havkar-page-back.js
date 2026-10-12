/*
 * HAVKAR in-app back destination.
 *
 * A safe previous HAVKAR page uses the browser history so form
 * data can be restored. Login, signup, the first language entry,
 * an external site, or a direct visit does not use history.back().
 * The Android back control is trapped only in those unsafe cases.
 */
(function (root, factory) {

    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    root.HAVKAR_PAGE_BACK = api;
    root.havkarNavigateBack = api.navigateBack;

    if (typeof document !== "undefined") {
        api.install();
    }

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    const FALLBACK = "index.html";

    function pageUrl(value, base) {

        try {
            return new URL(String(value || ""), base || "https://havkar.invalid");
        } catch (error) {
            return null;
        }
    }

    function isHtmlPage(url) {

        const path = url.pathname || "/";

        if (path.indexOf("\\") !== -1) {
            return false;
        }

        return path === "/" || /\.html$/i.test(path);
    }

    function relativePage(url) {

        if (url.pathname === "/") {
            return FALLBACK;
        }

        const relative =
            url.pathname.replace(/^\/+/, "") +
            url.search +
            url.hash;

        if (
            !relative ||
            relative.indexOf("//") === 0 ||
            relative.indexOf("\\") !== -1
        ) {
            return "";
        }

        return relative;
    }

    function isBlockedPrevious(url) {

        const path = url.pathname || "";

        if (/\/(?:login|signup)\.html$/i.test(path)) {
            return true;
        }

        if (
            /\/language\.html$/i.test(path) &&
            url.searchParams.get("entry") === "1"
        ) {
            return true;
        }

        return false;
    }

    function safeParent(parentHref) {

        const parent = String(parentHref || "").trim();

        if (!/^[A-Za-z0-9._-]+\.html(?:[?#][^\s\\]*)?$/.test(parent)) {
            return "";
        }

        if (/^(?:login|signup)\.html(?:[?#]|$)/i.test(parent)) {
            return "";
        }

        return parent;
    }

    function havkarBackDestination(currentHref, referrer, parentHref) {

        const current = pageUrl(currentHref, "https://havkar.invalid");
        const fallback = safeParent(parentHref) || FALLBACK;

        if (!current) {
            return {
                action: "assign",
                href: fallback
            };
        }

        const previous = pageUrl(referrer, current.href);

        if (
            !previous ||
            previous.origin !== current.origin ||
            !isHtmlPage(previous) ||
            previous.pathname === current.pathname ||
            isBlockedPrevious(previous)
        ) {
            return {
                action: "assign",
                href: fallback
            };
        }

        const relative = relativePage(previous);

        if (!relative) {
            return {
                action: "assign",
                href: fallback
            };
        }

        return {
            action: "history",
            href: relative
        };
    }

    function parentFromDocument() {

        if (typeof document === "undefined" || !document.body) {
            return "";
        }

        return document.body.getAttribute("data-havkar-parent") || "";
    }

    function navigateBack() {

        const decision = havkarBackDestination(
            window.location.href,
            document.referrer,
            parentFromDocument()
        );

        if (decision.action === "history") {
            window.history.back();
            return;
        }

        window.location.assign(decision.href);
    }

    function installAndroidBack() {

        if (
            !document.documentElement ||
            document.documentElement.getAttribute("data-havkar-android-back") === "off"
        ) {
            return;
        }

        const decision = havkarBackDestination(
            window.location.href,
            document.referrer,
            parentFromDocument()
        );

        if (decision.action === "history") {
            return;
        }

        if (window.history.state && window.history.state.havkarBackGuard) {
            return;
        }

        window.history.pushState({ havkarBackGuard: true }, "");

        window.addEventListener("popstate", function onPop() {
            window.removeEventListener("popstate", onPop);
            window.location.replace(decision.href);
        });
    }

    function install() {

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", installAndroidBack);
            return;
        }

        installAndroidBack();
    }

    return {
        havkarBackDestination: havkarBackDestination,
        navigateBack: navigateBack,
        install: install
    };

});

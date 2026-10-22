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

    function internalAssignHref(href) {

        const value = String(href || "").trim();

        if (
            !value ||
            value.indexOf("\\") !== -1 ||
            value.indexOf("//") === 0
        ) {
            return "";
        }

        const url = pageUrl(value, "https://havkar.invalid");

        if (
            !url ||
            url.origin !== "https://havkar.invalid" ||
            !isHtmlPage(url)
        ) {
            return "";
        }

        return relativePage(url);
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

            /*
             * A normal Home visit still has a previous entry, so
             * history.back() restores that page. A direct open can
             * keep the Home referrer while history.length is 1, and
             * history.back() would then leave this page in place.
             */
            if (window.history.length > 1) {
                window.history.back();
                return;
            }

            window.location.assign(
                internalAssignHref(decision.href) || FALLBACK
            );
            return;
        }

        /*
         * The Android guard is already the current history entry.
         * Pop it so the same listener replaces this page with the
         * parent. Assigning here would leave the guard underneath
         * and the next system back would reopen this page.
         */
        if (window.history.state && window.history.state.havkarBackGuard) {
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

        function replaceOnSystemBack() {
            window.addEventListener("popstate", function onPop() {
                window.removeEventListener("popstate", onPop);
                window.location.replace(decision.href);
            });
        }

        /*
         * A reload keeps the guard state but drops the listener.
         * Attach it again without pushing a second guard entry, so
         * a language reload does not leave this page by itself.
         */
        if (window.history.state && window.history.state.havkarBackGuard) {
            replaceOnSystemBack();
            return;
        }

        window.history.pushState({ havkarBackGuard: true }, "");
        replaceOnSystemBack();
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

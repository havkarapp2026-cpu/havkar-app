(function () {
    "use strict";

    var STORAGE_KEY = "havkar_preview_share";
    var TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

    function valid(value) {
        return TOKEN.test(value || "");
    }

    function previewHost() {
        var host = String(location.hostname || "");
        return host.endsWith(".vercel.app") && host !== "havkar-app.vercel.app";
    }

    function storedToken() {
        try {
            return sessionStorage.getItem(STORAGE_KEY) || "";
        } catch (error) {
            return "";
        }
    }

    function currentToken() {
        if (!previewHost()) {
            return "";
        }
        var params = new URLSearchParams(location.search);
        var token = params.get("_vercel_share") || params.get("havkar_share") || storedToken();
        if (!valid(token)) {
            return "";
        }
        try {
            sessionStorage.setItem(STORAGE_KEY, token);
        } catch (error) {}
        return token;
    }

    function withAccess(href) {
        var url = new URL(String(href || ""), location.href);
        var token = currentToken();
        if (!token || url.origin !== location.origin) {
            return url.href;
        }
        url.searchParams.set("havkar_share", token);
        url.searchParams.set("_vercel_share", token);
        return url.href;
    }

    window.havkarWithPreviewAccess = withAccess;

    if (!previewHost()) {
        return;
    }

    var token = currentToken();
    if (token) {
        var current = new URL(location.href);
        if (current.searchParams.get("havkar_share") !== token) {
            current.searchParams.set("havkar_share", token);
            history.replaceState(history.state, "", current.pathname + current.search + current.hash);
        }
    }

    function rewriteAnchor(anchor) {
        var raw = anchor.getAttribute("href");
        if (!raw || raw.charAt(0) === "#" || raw.indexOf("mailto:") === 0 || raw.indexOf("tel:") === 0 || raw.indexOf("javascript:") === 0) {
            return;
        }
        var next;
        try {
            next = withAccess(raw);
        } catch (error) {
            return;
        }
        if (anchor.href !== next) {
            anchor.href = next;
        }
    }

    document.addEventListener("click", function (event) {
        var node = event.target && event.target.closest ? event.target.closest("a[href]") : null;
        if (node) {
            rewriteAnchor(node);
        }
    }, true);

    function rewriteAnchors() {
        var anchors = document.querySelectorAll("a[href]");
        for (var i = 0; i < anchors.length; i++) {
            rewriteAnchor(anchors[i]);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", rewriteAnchors);
    } else {
        rewriteAnchors();
    }

    try {
        var assign = Location.prototype.assign;
        var replace = Location.prototype.replace;
        Location.prototype.assign = function (url) {
            return assign.call(this, withAccess(url));
        };
        Location.prototype.replace = function (url) {
            return replace.call(this, withAccess(url));
        };
    } catch (error) {}
})();

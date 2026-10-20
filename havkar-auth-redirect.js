(function (root, factory) {
    var api = factory();
    root.havkarAuthRedirect = api.havkarAuthRedirect;

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function havkarAuthRedirect(page, currentHref) {
        var current = new URL(currentHref);
        var target = new URL(page || "login.html", current);

        if (target.origin !== current.origin) {
            target = new URL("login.html", current.origin + "/");
        }

        target.search = "";
        target.hash = "";
        return target.href;
    }

    return {
        havkarAuthRedirect: havkarAuthRedirect
    };
});

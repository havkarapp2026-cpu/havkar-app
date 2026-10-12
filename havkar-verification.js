/*
 * Verified badges come only from app_metadata.
 * A signed-in user can change user_metadata, so that object
 * cannot grant Verified or administrator status.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_VERIFICATION = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  function serverVerifiedType(user) {
    const app = user && user.app_metadata;

    if (!app || typeof app !== "object" || Array.isArray(app)) {
      return "";
    }

    if (app.verified !== true && app.is_verified !== true) {
      return "";
    }

    const type = String(
      app.verification_type ||
      app.verificationType ||
      app.account_type ||
      "personal"
    ).toLowerCase();

    if (type === "company" || type === "factory") {
      return "company";
    }

    if (type === "business") {
      return "business";
    }

    if (type === "personal") {
      return "personal";
    }

    return "";
  }

  return {
    serverVerifiedType: serverVerifiedType
  };

});

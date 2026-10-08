/*
 * HAVKAR advertisement publish guard.
 *
 * This file only classifies advertisement INSERT results and
 * stops a second submission while the first result is unknown.
 * It does not upload files, change Storage, or touch the database.
 */
(function (root, factory) {

  const api =
    factory();

  if (
    typeof module === "object" &&
    module.exports
  ) {

    module.exports =
      api;

  }

  root.HAVKAR_AD_PUBLISH =
    api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const UNCERTAIN_PUBLISH_MESSAGE =
    "The server has not confirmed this advertisement yet. It may still be published. Do not submit it again. Check your existing advertisements before posting again.";


  function classifyInsertResult(
    result
  ) {

    const uncertain = {
      outcome: "uncertain",
      claimNotSaved: false,
      allowRetry: false,
      message: UNCERTAIN_PUBLISH_MESSAGE
    };

    if (
      !result ||
      typeof result !== "object"
    ) {

      return uncertain;

    }

    if (!result.error) {

      return {
        outcome: "saved",
        claimNotSaved: false,
        allowRetry: false,
        message: ""
      };

    }

    const status =
      Number(
        result.status
      );

    const code =
      String(
        result.error.code ||
        ""
      );

    const serverCode =
      /^[0-9A-Z]{5}$/.test(code) ||
      code.indexOf("PGRST") === 0;

    if (
      status === 0 ||
      status === 408 ||
      status >= 500
    ) {

      return uncertain;

    }

    if (
      (
        Number.isInteger(status) &&
        status >= 400 &&
        status < 500
      ) ||
      serverCode
    ) {

      const reason =
        result.error.message ||
        result.error.details ||
        result.error.hint ||
        "Supabase could not create the ad.";

      return {
        outcome: "rejected",
        claimNotSaved: true,
        allowRetry: true,
        message: String(reason)
      };

    }

    return uncertain;

  }


  function createPostingGuard() {

    let phase =
      "idle";


    function canSubmit() {

      return phase === "idle";

    }


    function blockedMessage() {

      if (phase === "publishing") {

        return "Publishing is still in progress. Do not submit it again.";

      }

      if (phase === "saved") {

        return "Your ad has been published successfully!";

      }

      if (phase === "uncertain") {

        return UNCERTAIN_PUBLISH_MESSAGE;

      }

      return "Publishing is still in progress. Do not submit it again.";

    }


    return {
      canSubmit: canSubmit,
      phase: function () {

        return phase;

      },
      blockedMessage: blockedMessage,
      uncertainMessage: function () {

        return UNCERTAIN_PUBLISH_MESSAGE;

      },
      beginPublish: function () {

        if (!canSubmit()) {

          return null;

        }

        phase =
          "publishing";

        return true;

      },
      markUncertain: function () {

        if (phase === "uncertain") {

          return {
            changed: false,
            claimNotSaved: false,
            allowRetry: false,
            message: UNCERTAIN_PUBLISH_MESSAGE
          };

        }

        if (phase !== "publishing") {

          return {
            changed: false,
            claimNotSaved: false,
            allowRetry: false,
            message: ""
          };

        }

        phase =
          "uncertain";

        return {
          changed: true,
          claimNotSaved: false,
          allowRetry: false,
          message: UNCERTAIN_PUBLISH_MESSAGE
        };

      },
      markSaved: function () {

        if (
          phase !== "publishing" &&
          phase !== "uncertain"
        ) {

          return false;

        }

        phase =
          "saved";

        return true;

      },
      releaseAfterSave: function () {

        if (phase !== "saved") {

          return false;

        }

        phase =
          "idle";

        return true;

      },
      markFailed: function () {

        if (
          phase !== "publishing" &&
          phase !== "uncertain"
        ) {

          return false;

        }

        phase =
          "idle";

        return true;

      }
    };

  }


  return {
    UNCERTAIN_PUBLISH_MESSAGE: UNCERTAIN_PUBLISH_MESSAGE,
    classifyInsertResult: classifyInsertResult,
    createPostingGuard: createPostingGuard
  };

});

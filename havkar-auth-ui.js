/*
 * HAVKAR sign-in messages.
 * A Gmail address is not a HAVKAR password account until registration
 * or Google sign-in creates one. Password errors must not claim otherwise.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_AUTH_UI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function passwordSignInFailure(error) {
    const code = String(
      (error && (error.code || error.error_code)) || ""
    ).toLowerCase();
    const message = String((error && error.message) || "");

    if (
      code === "email_not_confirmed" ||
      /email not confirmed/i.test(message)
    ) {
      return {
        code: "email_not_confirmed",
        text: "Your email address is not confirmed. Confirm the HAVKAR message before using a password, or continue with Google."
      };
    }

    if (
      code === "over_request_rate_limit" ||
      /too many requests|rate limit/i.test(message)
    ) {
      return {
        code: "rate_limited",
        text: "Too many sign-in attempts. Wait a moment and try again."
      };
    }

    if (
      code === "invalid_credentials" ||
      /invalid login credentials|invalid credentials|invalid password/i.test(message)
    ) {
      return {
        code: "no_password_account",
        text: "HAVKAR could not sign in with this email and password. A new Gmail or Google account is not a HAVKAR password account. Create an account, or continue with Google. Password reset is only for an existing HAVKAR password."
      };
    }

    return {
      code: "unavailable",
      text: "Sign-in could not be completed. Please try again."
    };
  }

  function authDeliveryFailure(error) {
    const code = String(
      (error && (error.code || error.error_code)) || ""
    ).toLowerCase();
    const message = String((error && error.message) || "");

    if (
      code === "over_request_rate_limit" ||
      /too many requests|rate limit/i.test(message)
    ) {
      return {
        code: "rate_limited",
        text: "Too many email requests. Wait a moment and try again."
      };
    }

    return {
      code: "unavailable",
      text: "The email could not be sent. Please try again."
    };
  }

  function confirmationResendResult(error) {
    if (error) {
      return authDeliveryFailure(error);
    }

    return {
      code: "accepted",
      text: "If this address is waiting for HAVKAR confirmation, another message was requested. Creating a Gmail account does not register it until you use Create Account or Continue with Google."
    };
  }

  function signupResult(data) {
    const user = data && data.user;

    if (!user) {
      return {
        code: "unconfirmed",
        text: "Account creation could not be confirmed. Please try again."
      };
    }

    if (Array.isArray(user.identities) && user.identities.length === 0) {
      return {
        code: "existing_account",
        text: "This email is already connected to HAVKAR. Continue with Google or return to login. No new confirmation email is sent."
      };
    }

    if (data.session) {
      return {
        code: "signed_in",
        text: "Account created and signed in. You can open HAVKAR."
      };
    }

    return {
      code: "confirmation_required",
      text: "Account created. Confirm the HAVKAR email before password login. If no message arrives, use Continue with Google."
    };
  }

  return {
    passwordSignInFailure: passwordSignInFailure,
    authDeliveryFailure: authDeliveryFailure,
    confirmationResendResult: confirmationResendResult,
    signupResult: signupResult
  };
});

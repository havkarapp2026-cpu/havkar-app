const assert = require("assert");
const fs = require("fs");
const path = require("path");
const auth = require("../havkar-auth-ui.js");

const unknown = auth.passwordSignInFailure({
  code: "invalid_credentials",
  message: "Invalid login credentials"
});
assert.strictEqual(unknown.code, "no_password_account");
assert.ok(!/incorrect/i.test(unknown.text));
assert.ok(/continue with Google/i.test(unknown.text));
assert.ok(unknown.text.includes("not a HAVKAR password account"));

const unconfirmed = auth.passwordSignInFailure({
  code: "email_not_confirmed",
  message: "Email not confirmed"
});
assert.strictEqual(unconfirmed.code, "email_not_confirmed");

const limited = auth.passwordSignInFailure({
  message: "Request rate limit reached"
});
assert.strictEqual(limited.code, "rate_limited");

const created = auth.signupResult({
  user: { identities: [{ provider: "email" }] },
  session: null
});
assert.strictEqual(created.code, "confirmation_required");

const existing = auth.signupResult({
  user: { identities: [] },
  session: null
});
assert.strictEqual(existing.code, "existing_account");
assert.ok(existing.text.includes("No new confirmation email"));

const signedIn = auth.signupResult({
  user: { identities: [{ provider: "email" }] },
  session: { access_token: "present" }
});
assert.strictEqual(signedIn.code, "signed_in");

const limitedMail = auth.authDeliveryFailure({
  code: "over_request_rate_limit",
  message: "email rate limit exceeded"
});
assert.strictEqual(limitedMail.code, "rate_limited");
const accepted = auth.confirmationResendResult(null);
assert.strictEqual(accepted.code, "accepted");
assert.ok(accepted.text.includes("Create Account"));

const login = fs.readFileSync(path.join(__dirname, "../login.html"), "utf8");
const signup = fs.readFileSync(path.join(__dirname, "../signup.html"), "utf8");
assert.ok(login.includes("havkar-auth-ui.js"));
assert.ok(login.includes("passwordSignInFailure"));
assert.ok(!login.includes("Email or password is incorrect"));
assert.ok(login.includes('class="google-btn"'));
assert.ok(login.includes("min-height: 56px"));
assert.ok(login.includes('prompt: "select_account"'));
assert.ok(login.includes('id="resendConfirmBtn"'));
assert.ok(login.includes('type: "signup"'));
assert.ok(signup.includes("havkar-auth-ui.js"));
assert.ok(signup.includes("signupResult"));
assert.ok(signup.includes("min-height:56px"));

console.log("AUTH_SIGNIN_MESSAGE_TEST_OK");

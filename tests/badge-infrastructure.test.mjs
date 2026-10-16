import assert from "node:assert/strict";
import fs from "node:fs";
import { renderPublicPage } from "../js/business-catalog.mjs";
import badges from "../havkar-badges.js";

const sql = fs.readFileSync(
  new URL("../supabase/migrations/20261016140000_badge_infrastructure.sql", import.meta.url),
  "utf8"
);
const profile = fs.readFileSync(new URL("../profile.html", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../business-studio.html", import.meta.url), "utf8");
const business = fs.readFileSync(new URL("../business.html", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../havkar-badges.js", import.meta.url), "utf8");

assert.match(sql, /issuance_enabled\)\s*VALUES \(true, false\)/);
assert.match(sql, /badge issuance is not active/);
assert.match(sql, /awarded_by <> user_id/);
assert.match(sql, /REVOKE ALL ON FUNCTION havkar_private\.award_badge/);
assert.match(sql, /FROM PUBLIC, anon, authenticated, service_role/);
assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION havkar_private\.award_badge/);
assert.doesNotMatch(sql, /INSERT INTO havkar_private\.user_badges \(\s*\n\s*'[0-9a-f-]+'/);
assert.doesNotMatch(client, /\.insert\(|\.update\(|\.upsert\(|award_badge/);

const markup = badges.accountMarkup([], "");
assert.match(markup, /Verified identity · Not issued/);
assert.match(markup, /Verified business · Not issued/);
assert.match(markup, /Diamond · Not issued/);
assert.match(markup, /cannot award or edit/);
assert.equal(
  badges.accountMarkup([{ badge_code: "diamond" }], "personal").includes("Diamond · Issued"),
  true
);
assert.equal(badges.accountMarkup([], "company").includes("Verified business · Issued"), true);
assert.equal(badges.accountMarkup([], "company").includes("Diamond · Issued"), false);
assert.equal(badges.pageMarkup([{ badge_code: "identity_verified" }]), "");
assert.match(badges.pageMarkup([{ badge_code: "business_verified" }]), /Verified business · Issued/);

const page = {
  slug: "mill",
  display_name: "Mill",
  category_code: "shop",
  summary: "Grain",
  description: "Local",
  published: true
};
assert.doesNotMatch(renderPublicPage({ page, menu: [], badges: [] }), /Verified business/);
assert.match(renderPublicPage({
  page,
  menu: [],
  badges: ["business_verified", "<script>"]
}), /★ Verified business/);
assert.doesNotMatch(renderPublicPage({
  page,
  menu: [],
  badges: ["business_verified", "<script>"]
}), /<script>/);

assert.match(profile, /havkar-badges\.js/);
assert.match(profile, /serverBadgeRow/);
assert.match(profile, /HAVKAR_VERIFICATION\.serverVerifiedType/);
assert.match(studio, /badgeRow/);
assert.match(business, /list_visible_page_badges/);
assert.doesNotMatch(profile + studio + business, /award_badge|record_reputation_event/);

console.log("BADGE_INFRASTRUCTURE_TEST_OK");

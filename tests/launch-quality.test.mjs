import assert from "node:assert/strict";
import fs from "node:fs";

const robots = fs.readFileSync("robots.txt", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

assert.match(robots, /Sitemap: https:\/\/havkar-app\.vercel\.app\/sitemap\.xml/);
assert.match(robots, /Disallow: \/admin\.html/);
assert.match(sitemap, /buy-sell\.html/);
assert.match(sitemap, /havkar-ai\.html/);
assert.match(sitemap, /about\.html/);
assert.doesNotMatch(sitemap, /admin\.html/);
assert.doesNotMatch(sitemap, /ai-assistant-test\.html/);
assert.match(vercel, /X-Content-Type-Options/);
assert.match(vercel, /nosniff/);
assert.match(vercel, /Referrer-Policy/);
assert.match(vercel, /\/api\/pi-complete/);
assert.match(vercel, /X-Frame-Options/);
assert.match(vercel, /SAMEORIGIN/);
assert.match(vercel, /camera=\(\), microphone=\(\)/);
assert.doesNotMatch(vercel, /geolocation=\(\)/);
assert.doesNotMatch(vercel, /wallet\.html/);
const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /navigator\.geolocation\.getCurrentPosition/);
assert.match(profile, /HAVKAR did not save it/);

console.log("LAUNCH_QUALITY_TEST_OK");

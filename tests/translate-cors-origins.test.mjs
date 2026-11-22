import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import handler from "../api/translate.js";

const src = fs.readFileSync("api/translate.js", "utf8");
assert.match(src, /https:\/\/havkar\.online/);
assert.match(src, /https:\/\/www\.havkar\.online/);
assert.match(src, /isHavkarAppOrigin/);
assert.match(src, /Android WebView on https:\/\/havkar\.online/);

function runOptions(origin) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch(reject);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/translate",
          method: "OPTIONS",
          headers: origin ? { Origin: origin } : {}
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            server.close();
            let body = raw;
            try {
              body = JSON.parse(raw || "{}");
            } catch (_e) {
              /* keep raw */
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body
            });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

const prod = await runOptions("https://havkar.online");
assert.notEqual(
  prod.status,
  403,
  "Production Android Origin https://havkar.online must not be CORS-blocked"
);
assert.equal(
  prod.headers["access-control-allow-origin"],
  "https://havkar.online"
);

const www = await runOptions("https://www.havkar.online");
assert.notEqual(www.status, 403);
assert.equal(
  www.headers["access-control-allow-origin"],
  "https://www.havkar.online"
);

const preview = await runOptions(
  "https://havkar-app-git-demo-havkarapp2026-4055s-projects.vercel.app"
);
assert.notEqual(preview.status, 403);

const evil = await runOptions("https://evil.example");
assert.equal(evil.status, 403);
assert.match(String(evil.body && evil.body.error), /Origin is not allowed/);

console.log("TRANSLATE_CORS_ORIGINS_TEST_OK");

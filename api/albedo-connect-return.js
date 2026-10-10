import { albedoReturnQuery } from "../stellar-albedo-connect.js";

const MAX_BODY_BYTES = 8192;

function send(res, status, message) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function headerValue(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? "";
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = typeof req.body === "string"
    ? req.body
    : Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : await new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            reject(new Error("body too large"));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
      });

  if (raw.length > MAX_BODY_BYTES) {
    throw new Error("body too large");
  }

  if (headerValue(req, "content-type").includes("application/json")) {
    return JSON.parse(raw || "{}");
  }

  return Object.fromEntries(new URLSearchParams(raw || ""));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, "Method not allowed");
  }

  try {
    const target = albedoReturnQuery(await readBody(req));

    if (!target || !target.startsWith("/albedo-return.html?")) {
      return send(res, 400, "Invalid Albedo response");
    }

    res.statusCode = 303;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", target);
    res.end();
  } catch (error) {
    return send(res, 400, "Invalid Albedo response");
  }
}

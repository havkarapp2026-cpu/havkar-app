/**
 * Public Maps Plus status — never starts billing.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mapsPlusStatus } = require("./havkar-maps-plus.cjs");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  res.setHeader("Cache-Control", "public, max-age=120");
  return res.status(200).json(mapsPlusStatus());
}

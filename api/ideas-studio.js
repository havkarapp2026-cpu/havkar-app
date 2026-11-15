import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { handleIdeasStudioRequest } = require("../lib/ideas-studio-api.cjs");

export default async function handler(req, res) {
  return handleIdeasStudioRequest(req, res);
}

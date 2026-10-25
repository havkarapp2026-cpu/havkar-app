import { createRequire } from "node:module";

export function installPiStellarServerCompat() {
  const require = createRequire(import.meta.url);
  const Module = require("module");
  if (Module.prototype.require.__havkarPiStellar) return;

  const original = Module.prototype.require;
  const wrapped = function (id) {
    const exported = original.apply(this, arguments);
    if (
      id === "stellar-sdk" &&
      exported &&
      typeof exported.Server !== "function" &&
      typeof exported.Horizon?.Server === "function"
    ) {
      exported.Server = exported.Horizon.Server;
    }
    return exported;
  };
  wrapped.__havkarPiStellar = true;
  Module.prototype.require = wrapped;
}

export function piNetworkFromModule(mod) {
  const exported = mod?.default ?? mod;
  if (typeof exported === "function") return exported;
  if (exported && typeof exported.default === "function") return exported.default;
  return exported;
}

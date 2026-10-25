const Module = require("module");

function installPiStellarServerCompat() {
  if (Module.prototype.require.__havkarPiStellar) return;

  const original = Module.prototype.require;
  const wrapped = function (id) {
    const exported = original.apply(this, arguments);
    if (
      id === "stellar-sdk" &&
      exported &&
      typeof exported.Server !== "function" &&
      exported.Horizon &&
      typeof exported.Horizon.Server === "function"
    ) {
      exported.Server = exported.Horizon.Server;
    }
    return exported;
  };
  wrapped.__havkarPiStellar = true;
  Module.prototype.require = wrapped;
}

function piNetworkFromModule(mod) {
  const exported = mod && Object.prototype.hasOwnProperty.call(mod, "default") ? mod.default : mod;
  if (typeof exported === "function") return exported;
  if (exported && typeof exported.default === "function") return exported.default;
  return exported;
}

module.exports = {
  installPiStellarServerCompat,
  piNetworkFromModule
};

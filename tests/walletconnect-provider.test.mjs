import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./freighter-esm-hook.mjs", import.meta.url);

const provider = await import("@walletconnect/universal-provider");
const UniversalProvider = provider.default;

if (typeof UniversalProvider?.init !== "function") {
    throw new Error("UniversalProvider.init is not a function");
}

const bundle = readFileSync(new URL("../stellar-wallet-bundle.js", import.meta.url), "utf8");
if (!bundle.includes("static async init")) {
    throw new Error("browser bundle is missing UniversalProvider.init");
}
if (!bundle.includes("Please call connect() before request()")) {
    throw new Error("browser bundle is missing the WalletConnect provider class");
}
if (!bundle.includes("albedo.link")) {
    throw new Error("browser bundle is missing Albedo");
}

console.log("WALLETCONNECT_PROVIDER_TEST_OK");
process.exit(0);

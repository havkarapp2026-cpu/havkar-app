import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));

const COMMONJS_NAMED_EXPORTS = new Set([
    "@stellar/freighter-api",
    "@lobstrco/signer-extension-api",
    "@creit.tech/xbull-wallet-connect",
    "@hot-wallet/sdk"
]);

function identifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "@walletconnect/universal-provider") {
        return {
            shortCircuit: true,
            url: new URL(
                "../node_modules/@walletconnect/universal-provider/dist/index.js",
                import.meta.url
            ).href
        };
    }
    if (COMMONJS_NAMED_EXPORTS.has(specifier)) {
        return {
            shortCircuit: true,
            url: `wallet-cjs:${encodeURIComponent(specifier)}`
        };
    }

    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (!url.startsWith("wallet-cjs:")) {
        return nextLoad(url, context);
    }

    const specifier = decodeURIComponent(url.slice("wallet-cjs:".length));
    const api = require(specifier);
    const names = Object.keys(api).filter((name) => name !== "default" && name !== "__esModule" && identifier(name));
    const parent = JSON.stringify(fileURLToPath(new URL("../package.json", import.meta.url)));
    const lines = names.map((name) => `export const ${name} = api[${JSON.stringify(name)}];`);
    const source = [
        `import { createRequire } from "node:module";`,
        `const require = createRequire(${parent});`,
        `const api = require(${JSON.stringify(specifier)});`,
        ...lines,
        `export default api;`
    ].join("\n");

    return {
        format: "module",
        source,
        shortCircuit: true
    };
}

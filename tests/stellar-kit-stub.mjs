export const WalletConnectTargetChain = {
    TESTNET: "testnet",
    PUBLIC: "public"
};

export class WalletConnectModule {
    constructor() {}
}

export function defaultModules() {
    return [];
}

export const StellarWalletsKit = {
    init() {},
    setNetwork() {},
    signTransaction() {
        throw new Error("External wallet signing is not available in this test.");
    },
    authModal() {
        throw new Error("External wallet connection requires a person.");
    },
    async disconnect() {},
    async getAddress() {
        return { address: "" };
    }
};

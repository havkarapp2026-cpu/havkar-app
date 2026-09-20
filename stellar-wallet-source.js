import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import {
    WalletConnectModule,
    WalletConnectTargetChain
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

const HAVKAR_STELLAR = {
    network: "PUBLIC",
    connected: false,
    address: null
};

window.HAVKAR_STELLAR = HAVKAR_STELLAR;

StellarWalletsKit.init({
    modules: [
        ...defaultModules(),

        new WalletConnectModule({
            projectId: "8c21324f756127dbb906a072cc18f7e6",

            metadata: {
                name: "HAVKAR",
                description: "HAVKAR multi-service platform",
                url: "https://havkar.online",
                icons: [
                    "https://havkar.online/icon.png"
                ]
            },

            allowedChains: [
                WalletConnectTargetChain.PUBLIC
            ]
        })
    ]
});

async function havkarConnectStellarWallet() {
    try {
        const { address } = await StellarWalletsKit.getAddress();

        if (!address) {
            throw new Error("No Stellar wallet address returned.");
        }

        HAVKAR_STELLAR.connected = true;
        HAVKAR_STELLAR.address = address;

        window.dispatchEvent(
            new CustomEvent("havkar-stellar-connected", {
                detail: { address }
            })
        );

        return address;

    } catch (error) {
        console.error(
            "HAVKAR Stellar wallet connection failed:",
            error
        );

        throw error;
    }
}

async function havkarDisconnectStellarWallet() {
    try {
        await StellarWalletsKit.disconnect();
    } catch (error) {
        console.warn(
            "HAVKAR Stellar disconnect:",
            error
        );
    }

    HAVKAR_STELLAR.connected = false;
    HAVKAR_STELLAR.address = null;

    window.dispatchEvent(
        new CustomEvent("havkar-stellar-disconnected")
    );
}

window.havkarConnectStellarWallet =
    havkarConnectStellarWallet;

window.havkarDisconnectStellarWallet =
    havkarDisconnectStellarWallet;

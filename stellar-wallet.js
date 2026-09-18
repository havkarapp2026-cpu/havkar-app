// HAVKAR — Stellar Wallet Integration
// Stellar Wallets Kit v2
// This file is prepared for the browser integration layer.
// No Stellar private keys are stored or handled by HAVKAR.

const HAVKAR_STELLAR = {
    network: "PUBLIC",
    connected: false,
    address: null
};

window.HAVKAR_STELLAR = HAVKAR_STELLAR;

window.addEventListener("havkar-stellar-connected", (event) => {
    if (!event.detail || !event.detail.address) return;

    HAVKAR_STELLAR.connected = true;
    HAVKAR_STELLAR.address = event.detail.address;

    console.log(
        "HAVKAR Stellar wallet connected:",
        HAVKAR_STELLAR.address
    );
});

window.addEventListener("havkar-stellar-disconnected", () => {
    HAVKAR_STELLAR.connected = false;
    HAVKAR_STELLAR.address = null;

    console.log("HAVKAR Stellar wallet disconnected.");
});

function havkarSetStellarWallet(address) {
    if (!address) return;

    HAVKAR_STELLAR.connected = true;
    HAVKAR_STELLAR.address = address;

    window.dispatchEvent(
        new CustomEvent("havkar-stellar-connected", {
            detail: {
                address: address
            }
        })
    );
}

function havkarClearStellarWallet() {
    HAVKAR_STELLAR.connected = false;
    HAVKAR_STELLAR.address = null;

    window.dispatchEvent(
        new CustomEvent("havkar-stellar-disconnected")
    );
}

window.havkarSetStellarWallet = havkarSetStellarWallet;
window.havkarClearStellarWallet = havkarClearStellarWallet;

/*
 * Pure Stellar payment checks.
 * This file never connects to Horizon, never signs, and never holds a secret.
 */

const PUBLIC_PASSPHRASE =
    "Public Global Stellar Network ; September 2015";

const TESTNET_PASSPHRASE =
    "Test SDF Network ; September 2015";

const PUBLIC_HORIZON =
    "https://horizon.stellar.org";

const TESTNET_HORIZON =
    "https://horizon-testnet.stellar.org";

const DEFAULT_STELLAR_NETWORK =
    "PUBLIC";

const STROOPS =
    10000000n;


function clean(value){

    return String(
        value == null ? "" : value
    ).trim();

}


function formatStroops(stroops){

    const amount =
        BigInt(stroops);

    const negative =
        amount < 0n;

    const absolute =
        negative ? -amount : amount;

    const whole =
        absolute / STROOPS;

    const fraction =
        (absolute % STROOPS).toString().padStart(7, "0");

    return (negative ? "-" : "") +
        whole.toString() +
        "." +
        fraction;

}


function parseXlmAmount(value){

    const text =
        clean(value);

    if(!/^\d+(\.\d{1,7})?$/.test(text)){

        throw new Error(
            "Enter an XLM amount with at most 7 decimal places."
        );

    }

    const parts =
        text.split(".");

    const whole =
        parts[0];

    const fraction =
        parts[1] || "";

    const stroops =
        BigInt(whole) * STROOPS +
        BigInt(fraction.padEnd(7, "0"));

    if(stroops <= 0n){

        throw new Error(
            "Enter an XLM amount greater than zero."
        );

    }

    return {
        text:formatStroops(stroops),
        stroops:stroops
    };

}


function spendableStroops(balanceStroops, minimumStroops, feeStroops){

    const balance =
        BigInt(balanceStroops);

    const minimum =
        BigInt(minimumStroops);

    const fee =
        BigInt(feeStroops);

    const spendable =
        balance - minimum - fee;

    return spendable > 0n ? spendable : 0n;

}


function hasExplicitApproval(options){

    return options != null &&
        options.approved === true;

}


function stellarExplorerTxUrl(networkId, hash){

    const id =
        clean(hash).toLowerCase();

    if(!/^[a-f0-9]{64}$/.test(id)){

        return "";

    }

    if(networkId === "PUBLIC"){

        return "https://stellar.expert/explorer/public/tx/" + id;

    }

    if(networkId === "TESTNET"){

        return "https://stellar.expert/explorer/testnet/tx/" + id;

    }

    return "";

}


const api = {
    PUBLIC_PASSPHRASE:PUBLIC_PASSPHRASE,
    TESTNET_PASSPHRASE:TESTNET_PASSPHRASE,
    PUBLIC_HORIZON:PUBLIC_HORIZON,
    TESTNET_HORIZON:TESTNET_HORIZON,
    DEFAULT_STELLAR_NETWORK:DEFAULT_STELLAR_NETWORK,
    formatStroops:formatStroops,
    parseXlmAmount:parseXlmAmount,
    spendableStroops:spendableStroops,
    hasExplicitApproval:hasExplicitApproval,
    stellarExplorerTxUrl:stellarExplorerTxUrl
};


export {
    PUBLIC_PASSPHRASE,
    TESTNET_PASSPHRASE,
    PUBLIC_HORIZON,
    TESTNET_HORIZON,
    DEFAULT_STELLAR_NETWORK,
    formatStroops,
    parseXlmAmount,
    spendableStroops,
    hasExplicitApproval,
    stellarExplorerTxUrl
};


export default api;

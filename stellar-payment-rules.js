/*
 * Stellar payment checks.
 * This file never submits a transaction, never asks for a secret,
 * and never holds a seed or recovery phrase.
 */

import {
    FeeBumpTransaction,
    Keypair,
    StrKey,
    TransactionBuilder
} from "@stellar/stellar-sdk";

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


const MEMO_REQUIRED_VALUE =
    "MQ==";

const PROTOCOL_MIN_FEE =
    100n;


function selectNetworkFeeStroops(stats){

    const charged =
        stats && stats.fee_charged;

    const candidates = [
        stats && stats.last_ledger_base_fee,
        charged && charged.min,
        charged && charged.mode
    ];

    let selected =
        0n;

    candidates.forEach(function(candidate){

        if(
            candidate == null ||
            candidate === ""
        ){

            return;

        }

        const value =
            BigInt(candidate);

        if(value > selected){

            selected = value;

        }

    });


    if(selected < PROTOCOL_MIN_FEE){

        throw new Error(
            "Could not read the current Stellar network fee."
        );

    }


    return selected;

}


function accountDataRequiresMemo(dataAttr){

    return !!dataAttr &&
        dataAttr["config.memo_required"] ===
            MEMO_REQUIRED_VALUE;

}


function passphraseForNetwork(networkId){

    if(networkId === "PUBLIC"){

        return PUBLIC_PASSPHRASE;

    }

    if(networkId === "TESTNET"){

        return TESTNET_PASSPHRASE;

    }

    throw new Error(
        "The signed transaction targets a different Stellar network."
    );

}


function rawBytes(value){

    if(!value){

        return null;

    }

    if(value instanceof Uint8Array){

        return value;

    }

    if(value.value instanceof Uint8Array){

        return value.value;

    }

    return null;

}


function sameBytes(left, right){

    if(
        !left ||
        !right ||
        left.length !== right.length
    ){

        return false;

    }

    for(
        let index = 0;
        index < left.length;
        index += 1
    ){

        if(left[index] !== right[index]){

            return false;

        }

    }

    return true;

}


function signatureParts(signature){

    const rawSignature =
        typeof signature.signature === "function"
        ? signature.signature()
        : signature.signature;

    const rawHint =
        typeof signature.hint === "function"
        ? signature.hint()
        : signature.hint;

    return {
        signature:rawBytes(rawSignature),
        hint:rawBytes(rawHint)
    };

}


function transactionHashHex(transaction){

    return Array.from(transaction.hash())
        .map(function(byte){

            return byte.toString(16).padStart(2, "0");

        })
        .join("");

}


function memoValue(memo){

    if(
        !memo ||
        memo.type === "none"
    ){

        return "";

    }

    if(memo.type !== "text"){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    if(typeof memo.value === "string"){

        return memo.value;

    }

    if(memo.value instanceof Uint8Array){

        return new TextDecoder().decode(memo.value);

    }

    throw new Error(
        "The signed transaction does not match the payment you reviewed."
    );

}


function operationAmount(operation){

    if(operation.type === "createAccount"){

        return operation.startingBalance;

    }

    if(operation.type === "payment"){

        return operation.amount;

    }

    throw new Error(
        "The signed transaction does not match the payment you reviewed."
    );

}


function accountAuthorization(account){

    const signers =
        (account && account.signers || [])
            .map(function(signer){

                const key =
                    clean(signer && signer.key);

                const weight =
                    Number(signer && signer.weight);


                if(
                    !StrKey.isValidEd25519PublicKey(key) ||
                    !Number.isInteger(weight) ||
                    weight < 1 ||
                    weight > 255
                ){

                    return null;

                }


                return {
                    key:key,
                    weight:weight
                };

            })
            .filter(Boolean);

    const medThreshold =
        Number(
            account &&
            account.thresholds &&
            account.thresholds.med_threshold
        );

    /*
     * A new Stellar account has medium threshold 0 and master weight 1.
     * Payment authorization is weight >= threshold. Threshold 0 is valid.
     * HAVKAR still requires one ed25519 signer so the returned signature
     * can be checked. WalletConnect does not provide that signing key.
     */
    if(
        signers.length < 1 ||
        !Number.isInteger(medThreshold) ||
        medThreshold < 0 ||
        medThreshold > 255
    ){

        throw new Error(
            "This Stellar account has no verifiable signer for a payment."
        );

    }


    return {
        signers:signers,
        medThreshold:medThreshold
    };

}


function assertReviewedShape(prepared){

    const passphrase =
        passphraseForNetwork(prepared && prepared.network);

    if(prepared.passphrase !== passphrase){

        throw new Error(
            "The signed transaction targets a different Stellar network."
        );

    }

    if(!StrKey.isValidEd25519PublicKey(prepared.source || "")){

        throw new Error(
            "The signed transaction is not from the connected wallet."
        );

    }

    if(!/^\d+$/.test(String(prepared.sequence || ""))){

        throw new Error(
            "The signed transaction sequence does not match the reviewed sequence."
        );

    }

    if(!/^\d+$/.test(String(prepared.fee || ""))){

        throw new Error(
            "The signed transaction fee does not match the reviewed fee."
        );

    }

    const medThreshold =
        Number(prepared.medThreshold);

    if(
        !Array.isArray(prepared.signers) ||
        prepared.signers.length < 1 ||
        !Number.isInteger(medThreshold) ||
        medThreshold < 0 ||
        medThreshold > 255
    ){

        throw new Error(
            "The signed transaction is not authorized by the source account."
        );

    }

}


function assertSignedPaymentMatches(signedXdr, prepared){

    assertReviewedShape(prepared);

    const signed =
        TransactionBuilder.fromXDR(
            signedXdr,
            prepared.passphrase
        );

    if(signed instanceof FeeBumpTransaction){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    if(signed.networkPassphrase !== prepared.passphrase){

        throw new Error(
            "The signed transaction targets a different Stellar network."
        );

    }

    if(signed.source !== prepared.source){

        throw new Error(
            "The signed transaction is not from the connected wallet."
        );

    }

    if(signed.sequence !== String(prepared.sequence)){

        throw new Error(
            "The signed transaction sequence does not match the reviewed sequence."
        );

    }

    if(signed.fee !== String(prepared.fee)){

        throw new Error(
            "The signed transaction fee does not match the reviewed fee."
        );

    }

    if(
        !signed.timeBounds ||
        signed.timeBounds.minTime !== String(prepared.minTime) ||
        signed.timeBounds.maxTime !== String(prepared.maxTime)
    ){

        throw new Error(
            "The signed transaction time bounds do not match the review."
        );

    }

    if(
        signed.ledgerBounds ||
        signed.minAccountSequence ||
        signed.minAccountSequenceAge != null ||
        signed.minAccountSequenceLedgerGap != null ||
        (
            signed.extraSigners &&
            signed.extraSigners.length > 0
        )
    ){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    const operations =
        signed.operations || [];

    if(operations.length !== 1){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    const operation =
        operations[0];

    if(
        operation.type !== prepared.kind ||
        operation.destination !== prepared.destination
    ){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    if(
        operation.type === "payment" &&
        (
            !operation.asset ||
            !operation.asset.isNative()
        )
    ){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    if(
        parseXlmAmount(operationAmount(operation)).text !==
        prepared.amount
    ){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }

    if(memoValue(signed.memo) !== (prepared.memo || "")){

        throw new Error(
            "The signed memo does not match the memo you entered."
        );

    }

    const signatures =
        signed.signatures || [];

    if(signatures.length < 1){

        throw new Error(
            "The wallet did not attach a signature."
        );

    }

    let weight =
        0;

    const used =
        new Set();

    signatures.forEach(function(signature){

        const parts =
            signatureParts(signature);

        let matched =
            false;

        prepared.signers.forEach(function(signer){

            if(
                matched ||
                used.has(signer.key) ||
                !StrKey.isValidEd25519PublicKey(signer.key)
            ){

                return;

            }

            const keypair =
                Keypair.fromPublicKey(signer.key);

            if(
                !parts.signature ||
                !parts.hint ||
                !sameBytes(keypair.signatureHint(), parts.hint)
            ){

                return;

            }

            let valid =
                false;

            try{

                valid =
                    keypair.verify(
                        signed.hash(),
                        parts.signature
                    );

            }
            catch(error){

                valid = false;

            }

            if(!valid){

                return;

            }

            used.add(signer.key);

            weight += Number(signer.weight);

            matched = true;

        });

        if(!matched){

            throw new Error(
                "The signed transaction is not authorized by the source account."
            );

        }

    });

    if(weight < Number(prepared.medThreshold)){

        throw new Error(
            "The signed transaction is not authorized by the source account."
        );

    }

    return {
        transaction:signed,
        hash:transactionHashHex(signed)
    };

}


function initialSubmissionState(){

    return {
        phase:"idle",
        record:null
    };

}


function submissionBlocksNewPayment(state){

    return !!state &&
        (
            state.phase === "locked" ||
            state.phase === "uncertain"
        ) &&
        !!state.record;

}


function assertCanStartSubmission(state){

    if(
        state &&
        (
            state.phase === "locked" ||
            state.phase === "uncertain"
        )
    ){

        throw new Error(
            "A Stellar payment is already in progress. HAVKAR will not create another transaction."
        );

    }

}


function lockSubmission(state){

    assertCanStartSubmission(state);

    return {
        phase:"locked",
        record:null
    };

}


function submissionRecordIsValid(record){

    return !!record &&
        (
            record.network === "PUBLIC" ||
            record.network === "TESTNET"
        ) &&
        /^[a-f0-9]{64}$/.test(record.hash || "") &&
        /^\d+$/.test(String(record.sequence || "")) &&
        /^\d+$/.test(String(record.maxTime || "")) &&
        StrKey.isValidEd25519PublicKey(record.source || "");

}


function rememberSignedSubmission(state, record){

    if(
        !state ||
        state.phase !== "locked" ||
        state.record
    ){

        throw new Error(
            "A Stellar payment is already in progress. HAVKAR will not create another transaction."
        );

    }

    if(!submissionRecordIsValid(record)){

        throw new Error(
            "The original transaction hash is missing."
        );

    }

    return {
        phase:"locked",
        record:record
    };

}


function releaseUnsentSubmission(state){

    if(state && state.record){

        return {
            phase:"uncertain",
            record:state.record
        };

    }

    return initialSubmissionState();

}


function classifySubmitError(info){

    if(
        !info ||
        info.timeout ||
        !info.resultCode ||
        info.resultCode === "tx_bad_seq"
    ){

        return "uncertain";

    }

    return "rejected";

}


function applySubmitResult(state, info){

    if(!submissionRecordIsValid(state && state.record)){

        throw new Error(
            "The original transaction hash is missing."
        );

    }

    const hash =
        state.record.hash;

    const sequence =
        state.record.sequence;

    if(classifySubmitError(info) === "rejected"){

        return {
            phase:"idle",
            record:null,
            outcome:"rejected",
            hash:hash,
            sequence:sequence
        };

    }

    return {
        phase:"uncertain",
        record:state.record,
        outcome:"uncertain",
        hash:hash,
        sequence:sequence
    };

}


function applySubmissionLookup(state, lookup){

    if(!submissionRecordIsValid(state && state.record)){

        throw new Error(
            "The original transaction hash is missing."
        );

    }

    const record =
        state.record;

    if(!lookup || lookup.timeout){

        return {
            phase:"uncertain",
            record:record,
            outcome:"uncertain",
            hash:record.hash,
            sequence:record.sequence
        };

    }

    if(lookup.consumedByOther === true){

        return {
            phase:"idle",
            record:null,
            outcome:"rejected",
            hash:record.hash,
            sequence:record.sequence
        };

    }

    if(lookup.found === true){

        if(
            lookup.hash === record.hash &&
            lookup.successful === true &&
            lookup.source === record.source
        ){

            return {
                phase:"idle",
                record:null,
                outcome:"confirmed",
                hash:record.hash,
                sequence:record.sequence,
                confirmed:record
            };

        }

        if(
            lookup.hash === record.hash &&
            lookup.successful === false
        ){

            return {
                phase:"idle",
                record:null,
                outcome:"rejected",
                hash:record.hash,
                sequence:record.sequence
            };

        }

        return {
            phase:"uncertain",
            record:record,
            outcome:"uncertain",
            hash:record.hash,
            sequence:record.sequence
        };

    }

    if(
        lookup.accountSequence == null ||
        lookup.now == null
    ){

        return {
            phase:"uncertain",
            record:record,
            outcome:"uncertain",
            hash:record.hash,
            sequence:record.sequence
        };

    }

    const accountSequence =
        BigInt(lookup.accountSequence);

    const txSequence =
        BigInt(record.sequence);

    const now =
        BigInt(lookup.now);

    const maxTime =
        BigInt(record.maxTime);

    if(
        accountSequence + 1n === txSequence &&
        now > maxTime
    ){

        return {
            phase:"idle",
            record:null,
            outcome:"expired",
            hash:record.hash,
            sequence:record.sequence
        };

    }

    return {
        phase:"uncertain",
        record:record,
        outcome:"uncertain",
        hash:record.hash,
        sequence:record.sequence
    };

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
    MEMO_REQUIRED_VALUE:MEMO_REQUIRED_VALUE,
    formatStroops:formatStroops,
    parseXlmAmount:parseXlmAmount,
    spendableStroops:spendableStroops,
    hasExplicitApproval:hasExplicitApproval,
    selectNetworkFeeStroops:selectNetworkFeeStroops,
    accountDataRequiresMemo:accountDataRequiresMemo,
    accountAuthorization:accountAuthorization,
    assertSignedPaymentMatches:assertSignedPaymentMatches,
    initialSubmissionState:initialSubmissionState,
    submissionBlocksNewPayment:submissionBlocksNewPayment,
    lockSubmission:lockSubmission,
    rememberSignedSubmission:rememberSignedSubmission,
    releaseUnsentSubmission:releaseUnsentSubmission,
    classifySubmitError:classifySubmitError,
    applySubmitResult:applySubmitResult,
    applySubmissionLookup:applySubmissionLookup,
    stellarExplorerTxUrl:stellarExplorerTxUrl
};


export {
    PUBLIC_PASSPHRASE,
    TESTNET_PASSPHRASE,
    PUBLIC_HORIZON,
    TESTNET_HORIZON,
    DEFAULT_STELLAR_NETWORK,
    MEMO_REQUIRED_VALUE,
    formatStroops,
    parseXlmAmount,
    spendableStroops,
    hasExplicitApproval,
    selectNetworkFeeStroops,
    accountDataRequiresMemo,
    accountAuthorization,
    assertSignedPaymentMatches,
    initialSubmissionState,
    submissionBlocksNewPayment,
    lockSubmission,
    rememberSignedSubmission,
    releaseUnsentSubmission,
    classifySubmitError,
    applySubmitResult,
    applySubmissionLookup,
    stellarExplorerTxUrl
};


export default api;

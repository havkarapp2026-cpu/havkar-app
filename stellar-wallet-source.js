import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";

import {
    defaultModules
} from "@creit.tech/stellar-wallets-kit/modules/utils";

import {
    WalletConnectModule,
    WalletConnectTargetChain
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

import {
    AlbedoModule
} from "@creit.tech/stellar-wallets-kit/modules/albedo";

import albedoImport from "@albedo-link/intent";

import {
    ALBEDO_CONNECT_CHANNEL,
    albedoCallbackValue,
    createAlbedoNamedPopupOpen,
    isAndroidBrowser,
    raceAlbedoPublicKey,
} from "./stellar-albedo-connect.js";

import {
    AccountRequiresMemoError,
    Asset,
    Horizon,
    Memo,
    Networks,
    NotFoundError,
    Operation,
    StrKey,
    TransactionBuilder,
    TransactionFailedError
} from "@stellar/stellar-sdk";

import {
    DEFAULT_STELLAR_NETWORK,
    PUBLIC_HORIZON,
    PUBLIC_PASSPHRASE,
    TESTNET_HORIZON,
    TESTNET_PASSPHRASE,
    accountDataRequiresMemo,
    applySubmissionLookup,
    applySubmitResult,
    assertSignedPaymentMatches,
    formatStroops as formatRuleStroops,
    hasExplicitApproval,
    initialSubmissionState,
    lockSubmission,
    parseXlmAmount,
    releaseUnsentSubmission,
    rememberSignedSubmission,
    selectNetworkFeeStroops,
    spendableStroops,
    stellarExplorerTxUrl,
    submissionBlocksNewPayment
} from "./stellar-payment-rules.js";


/* =========================================================
   NETWORKS
   Passphrases were read from the live Horizon root documents.
   TESTNET: Test SDF Network ; September 2015
   PUBLIC:  Public Global Stellar Network ; September 2015
   ========================================================= */

if(
    Networks.PUBLIC !== PUBLIC_PASSPHRASE ||
    Networks.TESTNET !== TESTNET_PASSPHRASE
){

    throw new Error(
        "Stellar network passphrase does not match the official value."
    );

}


const STELLAR_NETWORKS = {

    TESTNET:{
        id:"TESTNET",
        label:"Testnet",
        horizon:TESTNET_HORIZON,
        passphrase:Networks.TESTNET
    },

    PUBLIC:{
        id:"PUBLIC",
        label:"Mainnet",
        horizon:PUBLIC_HORIZON,
        passphrase:Networks.PUBLIC
    }

};


const NETWORK_STORAGE_KEY =
    "havkar_stellar_network";


/* =========================================================
   HAVKAR STELLAR STATE
   Public address only. No secret, seed, or signer.
   ========================================================= */

const HAVKAR_STELLAR = {

    network:readStoredNetwork(),

    connected:false,

    address:null

};


window.HAVKAR_STELLAR =
    HAVKAR_STELLAR;


const PENDING_STORAGE_KEY =
    "havkar_stellar_pending_submission";

let reviewedPayment =
    null;

let submissionState =
    initialSubmissionState();


function persistSubmissionState(){

    try{

        if(
            typeof sessionStorage === "undefined"
        ){

            return;

        }

        if(submissionState.record){

            sessionStorage.setItem(
                PENDING_STORAGE_KEY,
                JSON.stringify({
                    phase:submissionState.phase,
                    record:submissionState.record
                })
            );

            return;

        }

        sessionStorage.removeItem(
            PENDING_STORAGE_KEY
        );

    }
    catch(error){

    }

}


function restoreSubmissionState(){

    try{

        if(
            typeof sessionStorage === "undefined"
        ){

            return initialSubmissionState();

        }

        const saved =
            sessionStorage.getItem(
                PENDING_STORAGE_KEY
            );

        if(!saved){

            return initialSubmissionState();

        }

        const parsed =
            JSON.parse(saved);

        if(
            parsed &&
            parsed.record &&
            parsed.record.hash
        ){

            return {
                phase:"uncertain",
                record:parsed.record
            };

        }

    }
    catch(error){

    }

    return initialSubmissionState();

}


submissionState =
    restoreSubmissionState();


/* =========================================================
   STELLAR WALLET KIT
   ========================================================= */

const albedo =
    albedoImport &&
    typeof albedoImport.publicKey === "function"
    ? albedoImport
    : albedoImport.default;


function browserUserAgent(){

    try{

        return navigator.userAgent || "";

    }
    catch(error){

        return "";

    }

}


function walletConnectModule(){

    return new WalletConnectModule({

            projectId:
                "8c21324f756127dbb906a072cc18f7e6",

            metadata:{

                name:
                    "HAVKAR",

                description:
                    "HAVKAR multi-service platform",

                url:
                    "https://havkar-app.vercel.app",

                icons:[
                    "https://havkar-app.vercel.app/icon.png"
                ]

            },

            allowedChains:[
                WalletConnectTargetChain.TESTNET,
                WalletConnectTargetChain.PUBLIC
            ]

        });

}


class HavkarAndroidAlbedoModule{

    constructor(){

        this.moduleType = "HOT_WALLET";
        this.productId = "albedo";
        this.productName = "Albedo";
        this.productUrl = "https://albedo.link/confirm";
        this.productIcon =
            "https://stellar.creit.tech/wallet-icons/albedo.png";

    }


    async isAvailable(){

        return true;

    }


    async getAddress(){

        const token =
            albedo.generateRandomToken();

        const callback =
            albedoCallbackValue(
                window.location.origin
            );

        const originalOpen =
            window.open.bind(window);

        let popup =
            null;

        const openAlbedo =
            createAlbedoNamedPopupOpen(
                originalOpen,
                {

                    token:token,

                    callback:callback,

                    schedule:function(fn, ms){

                        return window.setTimeout(
                            fn,
                            ms
                        );

                    },

                    clearSchedule:function(timer){

                        window.clearTimeout(timer);

                    },

                    onPopup:function(value){

                        popup = value;

                    }

                }
            );

        window.open = openAlbedo;

        let pending;

        try{

            pending =
                albedo.publicKey({
                    token:token,
                    callback:callback
                });

        }
        finally{

            window.open = originalOpen;

        }


        const channel =
            typeof BroadcastChannel === "function"
            ? new BroadcastChannel(
                ALBEDO_CONNECT_CHANNEL
            )
            : null;


        try{

            const pubkey =
                await raceAlbedoPublicKey({

                    token:token,

                    popup:popup,

                    pending:pending,

                    timeoutMs:180000,

                    schedule:function(fn, ms){

                        return window.setTimeout(
                            fn,
                            ms
                        );

                    },

                    clearSchedule:function(timer){

                        window.clearTimeout(timer);

                    },

                    interval:function(fn, ms){

                        return window.setInterval(
                            fn,
                            ms
                        );

                    },

                    clearInterval:function(timer){

                        window.clearInterval(timer);

                    },

                    listen:function(handler){

                        if(!channel){

                            return;

                        }


                        channel.onmessage =
                            function(event){

                                handler(
                                    event && event.data
                                );

                            };

                    },

                    closeChannel:function(){

                        if(channel){

                            channel.close();

                        }


                        openAlbedo.cancel();


                        try{

                            if(
                                popup &&
                                !popup.closed
                            ){

                                popup.close();

                            }

                        }
                        catch(error){

                        }

                    }

                });


            if(!StrKey.isValidEd25519PublicKey(pubkey)){

                throw new Error(
                    "The wallet did not return a valid Stellar public key."
                );

            }


            return {
                address:pubkey
            };

        }
        finally{

            openAlbedo.cancel();

        }

    }


    async signTransaction(xdr, opts){

        const result =
            await albedo.tx({

                xdr:xdr,

                pubkey:opts && opts.address,

                network:
                    opts && opts.networkPassphrase
                    ? opts.networkPassphrase === Networks.PUBLIC
                        ? "public"
                        : "testnet"
                    : undefined

            });

        return {
            signedTxXdr:result.signed_envelope_xdr,
            signerAddress:opts && opts.address
        };

    }


    async signAuthEntry(){

        throw new Error(
            'Albedo does not support the "signAuthEntry" function'
        );

    }


    async signMessage(){

        throw new Error(
            'Albedo does not support the "signMessage" function'
        );

    }


    async getNetwork(){

        throw new Error(
            'Albedo does not support the "getNetwork" function'
        );

    }

}


function stellarKitModules(){

    const modules =
        defaultModules().filter(
            function(module){

                return module.productId !== "albedo";

            }
        );

    modules.unshift(
        isAndroidBrowser(browserUserAgent())
        ? new HavkarAndroidAlbedoModule()
        : new AlbedoModule()
    );

    modules.push(
        walletConnectModule()
    );

    return modules;

}


StellarWalletsKit.init({

    network:currentNetwork().passphrase,

    authModal:{

        showInstallLabel:true,

        hideUnsupportedWallets:false

    },

    modules:stellarKitModules()

});


/* =========================================================
   NETWORK HELPERS
   ========================================================= */

function readStoredNetwork(){

    try{

        const saved =
            localStorage.getItem(
                NETWORK_STORAGE_KEY
            );

        if(
            saved === "PUBLIC" ||
            saved === "TESTNET"
        ){

            return saved;

        }

    }
    catch(error){

    }


    return DEFAULT_STELLAR_NETWORK;

}


function currentNetwork(){

    return STELLAR_NETWORKS[
        HAVKAR_STELLAR.network
    ] || STELLAR_NETWORKS.TESTNET;

}


function rememberNetwork(
    networkId
){

    try{

        localStorage.setItem(
            NETWORK_STORAGE_KEY,
            networkId
        );

    }
    catch(error){

    }

}


function horizonServer(
    network
){

    return new Horizon.Server(
        network.horizon,
        {
            allowHttp:false
        }
    );

}


function havkarGetStellarNetwork(){

    const network =
        currentNetwork();


    return {

        id:network.id,

        label:network.label,

        horizon:network.horizon

    };

}


function havkarSetStellarNetwork(
    networkId
){

    const next =
        networkId === "PUBLIC"
        ? "PUBLIC"
        : "TESTNET";


    HAVKAR_STELLAR.network =
        next;


    rememberNetwork(
        next
    );


    StellarWalletsKit.setNetwork(
        currentNetwork().passphrase
    );


    window.dispatchEvent(

        new CustomEvent(
            "havkar-stellar-network",
            {

                detail:havkarGetStellarNetwork()

            }
        )

    );


    return havkarGetStellarNetwork();

}


/* =========================================================
   AMOUNT AND ADDRESS
   ========================================================= */

function isPublicKey(
    value
){

    return StrKey.isValidEd25519PublicKey(
        String(value || "").trim()
    );

}


function parseXlm(
    value
){

    return parseXlmAmount(value);

}


function formatStroops(
    stroops
){

    return formatRuleStroops(stroops);

}


function describeHorizonFailure(
    error
){

    const response =
        error &&
        error.response
        ? error.response
        : {};

    const data =
        response.data || {};

    let codes =
        null;


    try{

        if(
            typeof error.getResultCodes ===
            "function"
        ){

            codes =
                error.getResultCodes();

        }

    }
    catch(readError){

        codes =
            null;

    }


    if(
        !codes &&
        data.extras &&
        data.extras.result_codes
    ){

        codes =
            data.extras.result_codes;

    }


    const transaction =
        codes &&
        codes.transaction
        ? String(
            codes.transaction
        )
        : "unavailable";

    let operations =
        [];


    if(
        codes &&
        Array.isArray(
            codes.operations
        )
    ){

        operations =
            codes.operations.map(
                function(code){

                    return String(
                        code
                    );

                }
            );

    }
    else if(
        codes &&
        codes.operations
    ){

        operations =
            [
                String(
                    codes.operations
                )
            ];

    }


    const parts =
        [];


    if(
        typeof response.status ===
        "number"
    ){

        parts.push(
            "HTTP " +
            response.status
        );

    }


    if(data.title){

        parts.push(
            String(
                data.title
            )
        );

    }


    if(data.detail){

        parts.push(
            String(
                data.detail
            )
        );

    }


    parts.push(
        "Transaction code: " +
        transaction
    );

    parts.push(
        "Operation codes: " +
        (
            operations.length
            ? operations.join(", ")
            : "none"
        )
    );


    return {

        transaction:transaction,

        operations:operations,

        text:parts.join(". ")

    };

}


function safeErrorMessage(
    error
){

    const message =
        typeof error === "string"
        ? error
        : String(
            error?.message || ""
        );


    if(
        /reject|denied|cancel|closed|dismiss/i
            .test(message)
    ){

        return "The wallet did not approve this request.";

    }


    if(
        error instanceof NotFoundError ||
        error?.response?.status === 404
    ){

        return "No Stellar account was found on " +
            currentNetwork().label +
            ".";

    }


    if(
        error instanceof TransactionFailedError
    ){

        const horizon =
            describeHorizonFailure(
                error
            );

        const operations =
            horizon.operations;

        let friendly =
            "The Stellar network rejected the transaction.";


        if(
            operations.includes(
                "op_underfunded"
            )
        ){

            friendly =
                "The wallet does not have enough XLM for this payment.";

        }
        else if(
            operations.includes(
                "op_no_destination"
            )
        ){

            friendly =
                "The destination account does not exist on " +
                currentNetwork().label +
                ".";

        }
        else if(
            horizon.transaction ===
            "tx_bad_seq"
        ){

            friendly =
                "The account sequence changed. Refresh the balance and try again.";

        }
        else if(
            horizon.transaction ===
            "tx_insufficient_fee"
        ){

            friendly =
                "The Stellar network rejected the transaction fee.";

        }


        return friendly +
            " " +
            horizon.text;

    }


    if(
        /failed to fetch|networkerror|load failed|timeout/i
            .test(message)
    ){

        return "Could not reach the Stellar network.";

    }


    if(
        message &&
        message.length <= 180 &&
        !/xdr|secret|seed|private|mnemonic/i
            .test(message)
    ){

        return message;

    }


    return "Stellar request failed.";

}


/* =========================================================
   ACCOUNT AND BALANCE
   ========================================================= */

async function ledgerLimits(
    server
){

    const page =
        await server
            .ledgers()
            .order("desc")
            .limit(1)
            .call();


    const ledger =
        page.records?.[0];


    const baseReserve =
        BigInt(
            ledger?.base_reserve_in_stroops ||
            0
        );

    const baseFee =
        BigInt(
            ledger?.base_fee_in_stroops ||
            0
        );


    if(
        baseReserve <= 0n ||
        baseFee <= 0n
    ){

        throw new Error(
            "Could not read the current Stellar ledger limits."
        );

    }


    return {

        baseReserve:baseReserve,

        baseFee:baseFee

    };

}


async function currentNetworkFee(
    server
){

    const stats =
        await server.feeStats();

    return selectNetworkFeeStroops(
        stats
    );

}


function sourceAuthorization(
    account
){

    const signers =
        (account.signers || [])
            .map(function(signer){

                return {
                    key:String(signer.key || ""),
                    weight:Number(signer.weight || 0)
                };

            })
            .filter(function(signer){

                return signer.weight > 0 &&
                    isPublicKey(signer.key);

            });

    const medThreshold =
        Number(
            account.thresholds &&
            account.thresholds.med_threshold
        );


    if(
        !(medThreshold >= 1) ||
        signers.length < 1
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


function networkById(
    networkId
){

    if(networkId === "PUBLIC"){

        return STELLAR_NETWORKS.PUBLIC;

    }

    if(networkId === "TESTNET"){

        return STELLAR_NETWORKS.TESTNET;

    }

    throw new Error(
        "The original transaction network is unknown."
    );

}


function nativeBalance(
    account
){

    const row =
        (account.balances || [])
            .find(
                function(item){

                    return item.asset_type ===
                        "native";

                }
            );


    if(!row){

        throw new Error(
            "The account has no native XLM balance."
        );

    }


    return parseXlm(
        row.balance
    );

}


function minimumBalance(
    account,
    baseReserve
){

    const subentries =
        BigInt(
            account.subentry_count || 0
        );

    const sponsoring =
        BigInt(
            account.num_sponsoring || 0
        );

    const sponsored =
        BigInt(
            account.num_sponsored || 0
        );

    let entries =
        2n +
        subentries +
        sponsoring -
        sponsored;


    if(entries < 2n){

        entries = 2n;

    }


    return entries * baseReserve;

}


async function havkarFetchStellarBalance(
    address
){

    const network =
        currentNetwork();

    const publicKey =
        String(
            address ||
            HAVKAR_STELLAR.address ||
            ""
        ).trim();


    if(!isPublicKey(publicKey)){

        throw new Error(
            "A valid Stellar public key is required."
        );

    }


    const server =
        horizonServer(network);


    try{

        const account =
            await server.loadAccount(
                publicKey
            );

        const limits =
            await ledgerLimits(
                server
            );

        const fee =
            await currentNetworkFee(
                server
            );

        const balance =
            nativeBalance(
                account
            );

        const minimum =
            minimumBalance(
                account,
                limits.baseReserve
            );

        const spendable =
            spendableStroops(
                balance.stroops,
                minimum,
                fee
            );


        return {

            network:network.id,

            label:network.label,

            horizon:network.horizon,

            address:publicKey,

            exists:true,

            balance:balance.text,

            minimumBalance:formatStroops(
                minimum
            ),

            spendable:formatStroops(
                spendable > 0n
                ? spendable
                : 0n
            )

        };

    }
    catch(error){

        if(
            error instanceof NotFoundError
        ){

            return {

                network:network.id,

                label:network.label,

                horizon:network.horizon,

                address:publicKey,

                exists:false,

                balance:"0.0000000",

                minimumBalance:null,

                spendable:"0.0000000"

            };

        }


        throw new Error(
            safeErrorMessage(error)
        );

    }

}


/* =========================================================
   BUILD AN UNSIGNED PAYMENT
   This never signs and never submits.
   ========================================================= */

function readUnsignedPaymentRequest(
    options
){

    const network =
        currentNetwork();

    const source =
        String(
            HAVKAR_STELLAR.address || ""
        ).trim();

    const destination =
        String(
            options?.destination || ""
        ).trim();

    const memo =
        String(
            options?.memo || ""
        ).trim();


    if(!isPublicKey(source)){

        throw new Error(
            "Connect a Stellar wallet before sending."
        );

    }


    if(!isPublicKey(destination)){

        throw new Error(
            "Enter a valid Stellar destination public key."
        );

    }


    if(destination === source){

        throw new Error(
            "The destination must be a different Stellar account."
        );

    }


    if(
        memo &&
        new TextEncoder()
            .encode(memo)
            .length > 28
    ){

        throw new Error(
            "A Stellar text memo can contain at most 28 bytes."
        );

    }


    return {

        network:network,

        source:source,

        destination:destination,

        memo:memo,

        amount:parseXlm(
            options?.amount
        )

    };

}


async function havkarPrepareStellarPayment(
    options
){

    if(
        submissionState.phase === "locked" ||
        submissionState.phase === "uncertain"
    ){

        throw new Error(
            "A Stellar payment is already in progress. HAVKAR will not create another transaction."
        );

    }


    const request =
        readUnsignedPaymentRequest(
            options
        );

    const network =
        request.network;

    const source =
        request.source;

    const destination =
        request.destination;

    const memo =
        request.memo;

    const amount =
        request.amount;

    const server =
        horizonServer(network);

    const sourceAccount =
        await server.loadAccount(
            source
        );

    const limits =
        await ledgerLimits(
            server
        );

    const fee =
        await currentNetworkFee(
            server
        );

    const authorization =
        sourceAuthorization(
            sourceAccount
        );

    const balance =
        nativeBalance(
            sourceAccount
        );

    const minimum =
        minimumBalance(
            sourceAccount,
            limits.baseReserve
        );

    const spendable =
        spendableStroops(
            balance.stroops,
            minimum,
            fee
        );


    if(amount.stroops > spendable){

        throw new Error(
            "The available XLM is not enough for this payment and the account reserve."
        );

    }


    let destinationAccount =
        null;


    try{

        destinationAccount =
            await server.loadAccount(
                destination
            );

    }
    catch(error){

        if(
            !(error instanceof NotFoundError)
        ){

            throw error;

        }


        destinationAccount =
            null;

    }


    if(
        destinationAccount &&
        accountDataRequiresMemo(
            destinationAccount.data_attr
        ) &&
        !memo
    ){

        throw new Error(
            "This destination requires a memo before it can receive XLM."
        );

    }


    const kind =
        destinationAccount
        ? "payment"
        : "createAccount";

    const createMinimum =
        2n * limits.baseReserve;


    if(
        kind === "createAccount" &&
        amount.stroops < createMinimum
    ){

        throw new Error(
            "A new Stellar account on " +
            network.label +
            " needs at least " +
            formatStroops(createMinimum) +
            " XLM."
        );

    }


    let builder =
        new TransactionBuilder(
            sourceAccount,
            {

                fee:fee.toString(),

                networkPassphrase:
                    network.passphrase

            }
        );


    if(kind === "payment"){

        builder =
            builder.addOperation(

                Operation.payment({

                    destination:destination,

                    asset:Asset.native(),

                    amount:amount.text

                })

            );

    }
    else{

        builder =
            builder.addOperation(

                Operation.createAccount({

                    destination:destination,

                    startingBalance:amount.text

                })

            );

    }


    if(memo){

        builder =
            builder.addMemo(
                Memo.text(memo)
            );

    }


    const transaction =
        builder
            .setTimeout(180)
            .build();


    try{

        await server.checkMemoRequired(
            transaction
        );

    }
    catch(error){

        if(
            error instanceof AccountRequiresMemoError
        ){

            throw new Error(
                "This destination requires a memo before it can receive XLM."
            );

        }

        throw error;

    }


    if(
        !transaction.timeBounds ||
        !transaction.sequence
    ){

        throw new Error(
            "The payment review did not receive a sequence and time bound."
        );

    }


    reviewedPayment = {

        xdr:transaction.toXDR(),

        network:network.id,

        label:network.label,

        passphrase:network.passphrase,

        horizon:network.horizon,

        source:source,

        destination:destination,

        amount:amount.text,

        kind:kind,

        memo:memo,

        fee:fee.toString(),

        feeXlm:formatStroops(fee),

        sequence:transaction.sequence,

        minTime:transaction.timeBounds.minTime,

        maxTime:transaction.timeBounds.maxTime,

        signers:authorization.signers,

        medThreshold:authorization.medThreshold

    };


    return reviewedPayment;

}


function submitErrorInfo(
    error
){

    if(
        error instanceof TransactionFailedError
    ){

        let resultCode =
            "";

        try{

            resultCode =
                error.getResultCodes().transaction ||
                "";

        }
        catch(readError){

        }


        return {
            timeout:false,
            resultCode:resultCode
        };

    }


    return {
        timeout:true,
        resultCode:""
    };

}


function isMissingHorizonRecord(
    error
){

    return error instanceof NotFoundError ||
        error?.response?.status === 404;

}


function publicSubmission(
    record
){

    if(!record){

        return null;

    }


    return {
        network:record.network,
        label:record.label,
        horizon:record.horizon,
        hash:record.hash,
        sequence:record.sequence,
        source:record.source,
        destination:record.destination,
        amount:record.amount,
        fee:record.fee,
        memo:record.memo || "",
        minTime:record.minTime,
        maxTime:record.maxTime
    };

}


function submissionResult(
    status,
    record,
    message
){

    const network =
        record
        ? networkById(record.network)
        : currentNetwork();


    return {
        status:status,
        successful:status === "confirmed",
        hash:record ? record.hash : "",
        sequence:record ? record.sequence : "",
        network:record ? record.network : network.id,
        label:record ? record.label : network.label,
        source:record ? record.source : "",
        destination:record ? record.destination : "",
        amount:record ? record.amount : "",
        fee:record ? record.fee : "",
        feeXlm:record && record.fee
            ? formatStroops(record.fee)
            : "",
        horizon:record ? record.horizon : network.horizon,
        memo:record ? (record.memo || "") : "",
        explorer:record
            ? stellarExplorerTxUrl(
                record.network,
                record.hash
            )
            : "",
        message:message
    };

}


function uncertainMessage(
    record
){

    return "The Stellar network has not confirmed transaction " +
        record.hash +
        ". Sequence " +
        record.sequence +
        " is still reserved in HAVKAR. No new payment will be created until this original transaction is resolved.";

}


async function lookupOriginalTransaction(
    record
){

    const network =
        networkById(record.network);

    const server =
        horizonServer(network);


    try{

        const found =
            await server
                .transactions()
                .transaction(record.hash)
                .call();


        return {
            timeout:false,
            found:true,
            successful:found.successful === true,
            hash:String(found.hash || "").toLowerCase(),
            source:found.source_account
        };

    }
    catch(error){

        if(!isMissingHorizonRecord(error)){

            return {
                timeout:true
            };

        }

    }


    try{

        const page =
            await server
                .transactions()
                .forAccount(record.source)
                .order("desc")
                .limit(20)
                .call();

        const match =
            (page.records || [])
                .find(function(item){

                    return String(
                        item.source_account_sequence
                    ) === String(record.sequence);

                });


        if(match){

            const matchHash =
                String(match.hash || "").toLowerCase();


            if(matchHash === record.hash){

                return {
                    timeout:false,
                    found:true,
                    successful:match.successful === true,
                    hash:matchHash,
                    source:match.source_account
                };

            }


            return {
                timeout:false,
                found:false,
                consumedByOther:true
            };

        }

    }
    catch(error){

        if(!isMissingHorizonRecord(error)){

            return {
                timeout:true
            };

        }

    }


    try{

        const account =
            await server.loadAccount(
                record.source
            );


        return {
            timeout:false,
            found:false,
            accountSequence:account.sequence,
            now:Math.floor(Date.now() / 1000)
        };

    }
    catch(error){

        return {
            timeout:true
        };

    }

}


function storeSubmissionOutcome(
    next
){

    submissionState = {
        phase:next.phase,
        record:next.record
    };


    if(next.phase === "idle"){

        reviewedPayment = null;

    }


    persistSubmissionState();


    return next;

}


async function havkarResolveStellarSubmission(){

    if(!submissionState.record){

        return {
            status:"idle",
            successful:false,
            message:"No original Stellar transaction is waiting."
        };

    }


    const record =
        submissionState.record;

    const lookup =
        await lookupOriginalTransaction(
            record
        );

    const next =
        storeSubmissionOutcome(
            applySubmissionLookup(
                {
                    phase:"uncertain",
                    record:record
                },
                lookup
            )
        );


    if(next.outcome === "confirmed"){

        return submissionResult(
            "confirmed",
            next.confirmed,
            "Confirmed on " + next.confirmed.label + "."
        );

    }


    if(next.outcome === "rejected"){

        return submissionResult(
            "rejected",
            record,
            "The Stellar network rejected transaction " +
            record.hash +
            ". No new payment was created."
        );

    }


    if(next.outcome === "expired"){

        return submissionResult(
            "expired",
            record,
            "Transaction " +
            record.hash +
            " expired before the network accepted it. You can review a new payment."
        );

    }


    return submissionResult(
        "uncertain",
        record,
        uncertainMessage(record)
    );

}


function havkarStellarSubmissionPending(){

    return submissionBlocksNewPayment(
        submissionState
    );

}


function havkarGetStellarSubmission(){

    return publicSubmission(
        submissionState.record
    );

}


function assertSignedPayment(
    signedXdr,
    prepared
){

    return assertSignedPaymentMatches(
        signedXdr,
        prepared
    );

}


/* =========================================================
   ALBEDO SIGNING WINDOW
   Albedo only shows the approval screen after the parent
   posts the unsigned XDR. That post happens after Albedo
   announces that its confirm page loaded. Opening the page
   after an await drops the browser user gesture, so mobile
   Chrome keeps the logo and never delivers the request.
   The named window is reserved in the click turn instead.
   ========================================================= */

const ALBEDO_WALLET_ID =
    "albedo";

const ALBEDO_WINDOW_NAME =
    "auth.albedo.link";

const ALBEDO_CONFIRM_URL =
    "https://albedo.link/confirm";

const ALBEDO_MODULE_STORAGE_KEY =
    "@StellarWalletsKit/selectedModuleId";

const ALBEDO_HANDSHAKE_MS =
    20000;

const WALLET_SIGNATURE_MS =
    150000;


function selectedStellarWalletId(){

    try{

        return String(
            localStorage.getItem(
                ALBEDO_MODULE_STORAGE_KEY
            ) || ""
        );

    }
    catch(error){

        return "";

    }

}


function closeSigningPopup(
    popup
){

    if(!popup){

        return;

    }


    try{

        if(!popup.closed){

            popup.close();

        }

    }
    catch(error){

    }

}


function reserveAlbedoSigningWindow(){

    if(
        selectedStellarWalletId() !==
        ALBEDO_WALLET_ID
    ){

        return null;

    }


    const popup =
        window.open(

            "about:blank",

            ALBEDO_WINDOW_NAME,

            "height=600,width=480,top=80,left=80,menubar=0,toolbar=0,location=0,status=0,personalbar=0,scrollbars=0,dependent=1"

        );


    if(
        !popup ||
        popup.closed
    ){

        throw new Error(
            "The browser blocked the Albedo window. Allow popups for this site, then try again."
        );

    }


    try{

        popup.document.title =
            "Albedo";

        popup.document.body.textContent =
            "Opening Albedo to sign the " +
            currentNetwork().label +
            " transaction...";

    }
    catch(error){

    }


    try{

        popup.focus();

    }
    catch(error){

    }


    return popup;

}


function waitForWalletSignature(
    signPromise,
    popup
){

    return new Promise(
        function(
            resolve,
            reject
        ){

            let settled =
                false;

            let sawHandshake =
                false;


            function finish(
                settle,
                value
            ){

                if(settled){

                    return;

                }


                settled =
                    true;

                clearTimeout(
                    signatureTimer
                );

                clearTimeout(
                    handshakeTimer
                );

                clearInterval(
                    closedTimer
                );

                window.removeEventListener(
                    "message",
                    onHandshake
                );

                settle(value);

            }


            function onHandshake(
                event
            ){

                if(
                    event &&
                    event.data &&
                    event.data.albedo
                ){

                    sawHandshake =
                        true;

                }

            }


            const signatureTimer =
                setTimeout(
                    function(){

                        closeSigningPopup(
                            popup
                        );

                        finish(
                            reject,
                            new Error(
                                "The wallet did not return a signature. You can try again."
                            )
                        );

                    },
                    WALLET_SIGNATURE_MS
                );

            const handshakeTimer =
                popup
                ? setTimeout(
                    function(){

                        if(sawHandshake){

                            return;

                        }


                        closeSigningPopup(
                            popup
                        );

                        finish(
                            reject,
                            new Error(
                                "Albedo opened but did not receive the transaction. Allow popups for this site, then try again."
                            )
                        );

                    },
                    ALBEDO_HANDSHAKE_MS
                )
                : null;

            const closedTimer =
                setInterval(
                    function(){

                        if(
                            popup &&
                            popup.closed
                        ){

                            finish(
                                reject,
                                new Error(
                                    "The Albedo window went away before the transaction was signed."
                                )
                            );

                        }

                    },
                    700
                );


            if(popup){

                window.addEventListener(
                    "message",
                    onHandshake
                );

            }


            Promise.resolve(
                signPromise
            ).then(

                function(value){

                    finish(
                        resolve,
                        value
                    );

                },

                function(error){

                    finish(
                        reject,
                        error
                    );

                }

            );

        }
    );

}


function requestWalletSignature(
    prepared,
    network,
    albedoPopup
){

    const originalOpen =
        window.open.bind(
            window
        );

    let patched =
        false;


    if(albedoPopup){

        window.open =
            function(
                url,
                target,
                features
            ){

                const next =
                    String(
                        url || ""
                    );


                if(
                    target ===
                        ALBEDO_WINDOW_NAME &&
                    next.indexOf(
                        ALBEDO_CONFIRM_URL
                    ) === 0
                ){

                    if(
                        !albedoPopup ||
                        albedoPopup.closed
                    ){

                        throw new Error(
                            "The Albedo window went away before the transaction was signed."
                        );

                    }


                    try{

                        albedoPopup.location.href =
                            ALBEDO_CONFIRM_URL;

                    }
                    catch(error){

                        throw new Error(
                            "The browser blocked the Albedo window. Allow popups for this site, then try again."
                        );

                    }


                    try{

                        albedoPopup.focus();

                    }
                    catch(error){

                    }


                    return albedoPopup;

                }


                return originalOpen(
                    url,
                    target,
                    features
                );

            };

        patched =
            true;

    }


    let signPromise;


    try{

        StellarWalletsKit.setNetwork(
            network.passphrase
        );

        signPromise =
            StellarWalletsKit.signTransaction(

                prepared.xdr,

                {

                    networkPassphrase:
                        network.passphrase,

                    address:prepared.source

                }

            );

    }
    finally{

        if(patched){

            window.open =
                originalOpen;

        }

    }


    return waitForWalletSignature(
        signPromise,
        albedoPopup
    );

}


async function havkarSignAndSubmitStellarPayment(
    options
){

    if(submissionState.record){

        return havkarResolveStellarSubmission();

    }


    if(submissionState.phase === "locked"){

        throw new Error(
            "A Stellar payment is already in progress. HAVKAR will not create another transaction."
        );

    }


    if(!hasExplicitApproval(options)){

        throw new Error(
            "Review the payment and approve it before your wallet signs it."
        );

    }


    const prepared =
        reviewedPayment;


    if(!prepared){

        throw new Error(
            "Review the payment and approve it before your wallet signs it."
        );

    }


    const request =
        readUnsignedPaymentRequest(
            options
        );


    if(
        request.destination !== prepared.destination ||
        request.amount.text !== prepared.amount ||
        request.memo !== prepared.memo ||
        request.network.id !== prepared.network ||
        request.source !== prepared.source
    ){

        reviewedPayment = null;

        throw new Error(
            "Review this payment before your wallet signs it."
        );

    }


    if(
        BigInt(Math.floor(Date.now() / 1000)) >
        BigInt(prepared.maxTime)
    ){

        reviewedPayment = null;

        throw new Error(
            "This payment review expired. Review it again before signing. Nothing was submitted."
        );

    }


    submissionState =
        lockSubmission(submissionState);

    persistSubmissionState();

    let albedoPopup =
        null;


    try{

        const server =
            horizonServer(
                networkById(prepared.network)
            );

        const account =
            await server.loadAccount(
                prepared.source
            );


        if(
            BigInt(account.sequence) + 1n !==
            BigInt(prepared.sequence)
        ){

            reviewedPayment = null;

            throw new Error(
                "The account sequence changed. Review the payment again. Nothing was submitted."
            );

        }


        const authorization =
            sourceAuthorization(account);

        const balance =
            nativeBalance(account);

        const limits =
            await ledgerLimits(server);

        const minimum =
            minimumBalance(
                account,
                limits.baseReserve
            );

        const spendable =
            spendableStroops(
                balance.stroops,
                minimum,
                BigInt(prepared.fee)
            );


        if(
            parseXlm(prepared.amount).stroops >
            spendable
        ){

            throw new Error(
                "The available XLM is not enough for this payment and the account reserve."
            );

        }


        albedoPopup =
            reserveAlbedoSigningWindow();

        const signedResult =
            await requestWalletSignature(
                prepared,
                networkById(prepared.network),
                albedoPopup
            );

        const signedXdr =
            signedResult?.signedTxXdr || "";


        if(!signedXdr){

            throw new Error(
                "The wallet did not return a signed transaction."
            );

        }


        const checked =
            assertSignedPayment(
                signedXdr,
                {
                    network:prepared.network,
                    passphrase:prepared.passphrase,
                    source:prepared.source,
                    destination:prepared.destination,
                    amount:prepared.amount,
                    kind:prepared.kind,
                    memo:prepared.memo,
                    fee:prepared.fee,
                    sequence:prepared.sequence,
                    minTime:prepared.minTime,
                    maxTime:prepared.maxTime,
                    signers:authorization.signers,
                    medThreshold:authorization.medThreshold
                }
            );

        const record = {
            network:prepared.network,
            label:prepared.label,
            horizon:prepared.horizon,
            hash:checked.hash,
            sequence:prepared.sequence,
            source:prepared.source,
            destination:prepared.destination,
            amount:prepared.amount,
            fee:prepared.fee,
            memo:prepared.memo,
            minTime:prepared.minTime,
            maxTime:prepared.maxTime
        };


        submissionState =
            rememberSignedSubmission(
                submissionState,
                record
            );

        persistSubmissionState();


        try{

            const submitted =
                await server.submitTransaction(
                    checked.transaction
                );


            if(
                !submitted ||
                String(submitted.hash || "").toLowerCase() !==
                    checked.hash ||
                submitted.successful !== true
            ){

                submissionState = {
                    phase:"uncertain",
                    record:record
                };

                persistSubmissionState();

                return havkarResolveStellarSubmission();

            }

        }
        catch(error){

            const next =
                storeSubmissionOutcome(
                    applySubmitResult(
                        submissionState,
                        submitErrorInfo(error)
                    )
                );


            if(next.outcome === "uncertain"){

                return havkarResolveStellarSubmission();

            }


            return submissionResult(
                "rejected",
                record,
                safeErrorMessage(error)
            );

        }


        return havkarResolveStellarSubmission();

    }
    catch(error){

        if(!submissionState.record){

            submissionState =
                releaseUnsentSubmission(
                    submissionState
                );

            persistSubmissionState();

            throw new Error(
                safeErrorMessage(error)
            );

        }


        submissionState = {
            phase:"uncertain",
            record:submissionState.record
        };

        persistSubmissionState();


        return submissionResult(
            "uncertain",
            submissionState.record,
            uncertainMessage(
                submissionState.record
            )
        );

    }
    finally{

        closeSigningPopup(
            albedoPopup
        );

    }

}

/* =========================================================
   CONNECT STELLAR WALLET
   ========================================================= */

async function havkarConnectStellarWallet(){

    try{

        StellarWalletsKit.setNetwork(
            currentNetwork().passphrase
        );

        const result =
            await StellarWalletsKit.authModal();


        const address =
            String(
                result?.address || ""
            ).trim();


        if(!isPublicKey(address)){

            throw new Error(
                "The wallet did not return a valid Stellar public key."
            );

        }


        HAVKAR_STELLAR.connected =
            true;

        HAVKAR_STELLAR.address =
            address;


        window.dispatchEvent(

            new CustomEvent(
                "havkar-stellar-connected",
                {

                    detail:{
                        address:address
                    }

                }
            )

        );


        return address;

    }
    catch(error){

        HAVKAR_STELLAR.connected =
            false;

        HAVKAR_STELLAR.address =
            null;


        window.dispatchEvent(

            new CustomEvent(
                "havkar-stellar-error",
                {

                    detail:{
                        message:safeErrorMessage(
                            error
                        )
                    }

                }
            )

        );


        throw new Error(
            safeErrorMessage(error)
        );

    }

}


/* =========================================================
   DISCONNECT STELLAR WALLET
   ========================================================= */

async function havkarDisconnectStellarWallet(){

    try{

        if(
            typeof StellarWalletsKit.disconnect ===
            "function"
        ){

            await StellarWalletsKit.disconnect();

        }

    }
    catch(error){

    }


    HAVKAR_STELLAR.connected =
        false;

    HAVKAR_STELLAR.address =
        null;


    window.dispatchEvent(

        new CustomEvent(
            "havkar-stellar-disconnected"
        )

    );

}


/* =========================================================
   ADDRESS
   ========================================================= */

function havkarGetStellarAddress(){

    return HAVKAR_STELLAR.address;

}


function havkarIsStellarConnected(){

    return (
        HAVKAR_STELLAR.connected === true &&
        isPublicKey(
            HAVKAR_STELLAR.address
        )
    );

}


async function havkarRestoreStellarAddress(){

    try{

        const result =
            await StellarWalletsKit.getAddress();

        const address =
            String(
                result?.address || ""
            ).trim();


        if(!isPublicKey(address)){

            return null;

        }


        HAVKAR_STELLAR.connected =
            true;

        HAVKAR_STELLAR.address =
            address;


        return address;

    }
    catch(error){

        return null;

    }

}


/* =========================================================
   EXPOSE HAVKAR FUNCTIONS
   ========================================================= */

window.havkarConnectStellarWallet =
    havkarConnectStellarWallet;

window.havkarDisconnectStellarWallet =
    havkarDisconnectStellarWallet;

window.havkarGetStellarAddress =
    havkarGetStellarAddress;

window.havkarIsStellarConnected =
    havkarIsStellarConnected;

window.havkarGetStellarNetwork =
    havkarGetStellarNetwork;

window.havkarSetStellarNetwork =
    havkarSetStellarNetwork;

window.havkarFetchStellarBalance =
    havkarFetchStellarBalance;

window.havkarPrepareStellarPayment =
    havkarPrepareStellarPayment;

window.havkarSignAndSubmitStellarPayment =
    havkarSignAndSubmitStellarPayment;

window.havkarResolveStellarSubmission =
    havkarResolveStellarSubmission;

window.havkarStellarSubmissionPending =
    havkarStellarSubmissionPending;

window.havkarGetStellarSubmission =
    havkarGetStellarSubmission;

window.havkarRestoreStellarAddress =
    havkarRestoreStellarAddress;


/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(

    new CustomEvent(
        "havkar-stellar-ready"
    )

);

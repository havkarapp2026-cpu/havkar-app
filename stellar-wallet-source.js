import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";

import {
    defaultModules
} from "@creit.tech/stellar-wallets-kit/modules/utils";

import {
    WalletConnectModule,
    WalletConnectTargetChain
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

import {
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
    formatStroops as formatRuleStroops,
    hasExplicitApproval,
    parseXlmAmount,
    spendableStroops,
    stellarExplorerTxUrl
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


/* =========================================================
   STELLAR WALLET KIT
   ========================================================= */

StellarWalletsKit.init({

    network:currentNetwork().passphrase,

    modules:[

        ...defaultModules(),

        new WalletConnectModule({

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

        })

    ]

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
                limits.baseFee
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
            limits.baseFee
        );


    if(amount.stroops > spendable){

        throw new Error(
            "The available XLM is not enough for this payment and the account reserve."
        );

    }


    let destinationExists =
        true;


    try{

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


        destinationExists =
            false;

    }


    const kind =
        destinationExists
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

                fee:limits.baseFee.toString(),

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


    return {

        xdr:transaction.toXDR(),

        network:network.id,

        label:network.label,

        source:source,

        destination:destination,

        amount:amount.text,

        kind:kind,

        memo:memo,

        fee:limits.baseFee.toString(),

        feeXlm:formatStroops(
            limits.baseFee
        ),

        horizon:network.horizon

    };

}


function memoText(
    memo
){

    if(
        !memo ||
        memo.type !== "text"
    ){

        return "";

    }


    if(
        typeof memo.value === "string"
    ){

        return memo.value;

    }


    if(
        memo.value instanceof Uint8Array
    ){

        return new TextDecoder().decode(
            memo.value
        );

    }


    return "";

}


function assertSignedPayment(
    signedXdr,
    prepared
){

    const network =
        currentNetwork();

    const signed =
        TransactionBuilder.fromXDR(
            signedXdr,
            network.passphrase
        );


    if(
        signed.source !==
        prepared.source
    ){

        throw new Error(
            "The signed transaction is not from the connected wallet."
        );

    }


    if(
        !signed.signatures ||
        signed.signatures.length < 1
    ){

        throw new Error(
            "The wallet did not attach a signature."
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

    const amount =
        operation.type === "createAccount"
        ? operation.startingBalance
        : operation.amount;


    if(
        operation.type !== prepared.kind ||
        operation.destination !==
            prepared.destination ||
        parseXlm(amount).text !==
            prepared.amount ||
        (
            operation.asset &&
            !operation.asset.isNative()
        )
    ){

        throw new Error(
            "The signed transaction does not match the payment you reviewed."
        );

    }


    const signedMemo =
        memoText(
            signed.memo
        );


    if(signedMemo !== prepared.memo){

        throw new Error(
            "The signed memo does not match the memo you entered."
        );

    }


    return signed;

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


/* =========================================================
   SIGN WITH THE USER WALLET, THEN SUBMIT
   ========================================================= */

async function havkarSignAndSubmitStellarPayment(
    options
){

    const network =
        currentNetwork();


    if(!hasExplicitApproval(options)){

        throw new Error(
            "Review the payment and approve it before your wallet signs it."
        );

    }


    let albedoPopup =
        null;


    try{

        readUnsignedPaymentRequest(
            options
        );

        albedoPopup =
            reserveAlbedoSigningWindow();


        const prepared =
            await havkarPrepareStellarPayment(
                options
            );


        if(prepared.network !== network.id){

            throw new Error(
                "The Stellar network changed before the payment was signed."
            );

        }


        const signedResult =
            await requestWalletSignature(
                prepared,
                network,
                albedoPopup
            );


        const signedXdr =
            signedResult?.signedTxXdr || "";


        if(!signedXdr){

            throw new Error(
                "The wallet did not return a signed transaction."
            );

        }


        const signed =
            assertSignedPayment(
                signedXdr,
                prepared
            );

        const server =
            horizonServer(network);

        const submitted =
            await server.submitTransaction(
                signed
            );


        if(
            !submitted?.hash ||
            submitted.successful !== true
        ){

            throw new Error(
                "The Stellar network did not confirm this transaction."
            );

        }


        const record =
            await server
                .transactions()
                .transaction(
                    submitted.hash
                )
                .call();


        if(
            !record ||
            record.successful !== true ||
            record.hash !== submitted.hash ||
            record.source_account !==
                prepared.source
        ){

            throw new Error(
                "The transaction hash could not be confirmed on Horizon."
            );

        }


        return {

            hash:record.hash,

            ledger:record.ledger,

            network:network.id,

            label:network.label,

            source:prepared.source,

            destination:prepared.destination,

            amount:prepared.amount,

            feeXlm:prepared.feeXlm,

            horizon:prepared.horizon,

            explorer:stellarExplorerTxUrl(
                network.id,
                record.hash
            ),

            successful:true

        };

    }
    catch(error){

        closeSigningPopup(
            albedoPopup
        );


        throw new Error(
            safeErrorMessage(error)
        );

    }

}


/* =========================================================
   CONNECT STELLAR WALLET
   ========================================================= */

async function havkarConnectStellarWallet(){

    try{

        const result =
            await StellarWalletsKit.authModal({

                showInstallLabel:true,

                hideUnsupportedWallets:false

            });


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

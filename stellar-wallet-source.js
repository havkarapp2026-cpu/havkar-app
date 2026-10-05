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


/* =========================================================
   NETWORKS
   Passphrases were read from the live Horizon root documents.
   TESTNET: Test SDF Network ; September 2015
   PUBLIC:  Public Global Stellar Network ; September 2015
   ========================================================= */

const STELLAR_NETWORKS = {

    TESTNET:{
        id:"TESTNET",
        label:"Testnet",
        horizon:"https://horizon-testnet.stellar.org",
        passphrase:Networks.TESTNET
    },

    PUBLIC:{
        id:"PUBLIC",
        label:"Mainnet",
        horizon:"https://horizon.stellar.org",
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


    return "TESTNET";

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

    const text =
        String(value ?? "").trim();


    if(
        !/^\d+(\.\d{1,7})?$/.test(
            text
        )
    ){

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
        BigInt(whole) * 10000000n +
        BigInt(
            fraction.padEnd(7,"0")
        );


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


function formatStroops(
    stroops
){

    const negative =
        stroops < 0n;

    const absolute =
        negative
        ? -stroops
        : stroops;

    const whole =
        absolute / 10000000n;

    const fraction =
        (absolute % 10000000n)
            .toString()
            .padStart(7,"0");


    return (
        (negative ? "-" : "") +
        whole.toString() +
        "." +
        fraction
    );

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

        const codes =
            error.getResultCodes();

        const operations =
            codes?.operations || [];


        if(
            operations.includes(
                "op_underfunded"
            )
        ){

            return "The wallet does not have enough XLM for this payment.";

        }


        if(
            operations.includes(
                "op_no_destination"
            )
        ){

            return "The destination account does not exist on " +
                currentNetwork().label +
                ".";

        }


        if(
            codes?.transaction ===
            "tx_bad_seq"
        ){

            return "The account sequence changed. Refresh the balance and try again.";

        }


        if(
            codes?.transaction ===
            "tx_insufficient_fee"
        ){

            return "The Stellar network rejected the transaction fee.";

        }


        return "The Stellar network rejected the transaction.";

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
            balance.stroops -
            minimum -
            limits.baseFee;


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

async function havkarPrepareStellarPayment(
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


    const amount =
        parseXlm(
            options?.amount
        );

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
        balance.stroops -
        minimum -
        limits.baseFee;


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

        fee:limits.baseFee.toString()

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
   SIGN WITH THE USER WALLET, THEN SUBMIT
   ========================================================= */

async function havkarSignAndSubmitStellarPayment(
    options
){

    const network =
        currentNetwork();


    if(
        network.id === "PUBLIC" &&
        options?.confirmMainnet !== true
    ){

        throw new Error(
            "Mainnet payment was not confirmed."
        );

    }


    try{

        const prepared =
            await havkarPrepareStellarPayment(
                options
            );


        const signedResult =
            await StellarWalletsKit.signTransaction(

                prepared.xdr,

                {

                    networkPassphrase:
                        network.passphrase,

                    address:prepared.source

                }

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

            successful:true

        };

    }
    catch(error){

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

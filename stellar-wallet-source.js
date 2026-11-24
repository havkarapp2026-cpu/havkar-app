import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";

import {
    defaultModules
} from "@creit.tech/stellar-wallets-kit/modules/utils";

import {
    WalletConnectModule,
    WalletConnectTargetChain
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

import {
    Account,
    Asset,
    Horizon,
    Keypair,
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

const PENDING_PAYMENT_KEY =
    "havkar_stellar_pending_payment";

const LAST_SUCCESS_PAYMENT_KEY =
    "havkar_stellar_last_success_payment";

const PAYMENT_LOCK_KEY =
    "havkar_stellar_payment_lock";

/* Block accidental identical peer re-sends shortly after a confirmed success.
   localStorage is same-browser only; Horizon history is the cross-device check.
   Neither is global exactly-once — Stellar has no payment idempotency key. */
const RECENT_SUCCESS_GUARD_MS =
    15 * 60 * 1000;

/* Review-panel informational lookback for an identical peer payment.
   Outside RECENT_SUCCESS_GUARD_MS this never blocks signing; it only informs. */
const REVIEW_MATCH_LOOKBACK_MS =
    24 * 60 * 60 * 1000;

const PAYMENT_LOCK_STALE_MS =
    3 * 60 * 1000;

const HAVKAR_PAYMENT_TAB_ID =
    (
        typeof crypto !== "undefined" &&
        crypto.randomUUID
    )
    ? crypto.randomUUID()
    : (
        "tab-" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2)
    );

/* Owner-authorized Mainnet client capability.
   Server still requires HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true
   and HAVKAR_STELLAR_MAINNET_DESTINATION before any quote is payable.
   Submission remains restricted to the matching Horizon + passphrase. */
const STELLAR_MAINNET_PAYMENTS_ENABLED =
    true;

let paymentInFlight =
    false;


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
   Prefer Albedo (web), Freighter (extension), LOBSTR (extension).
   On Android/iOS browsers, extension-only modules are hidden so
   users are not shown a false "Install" for the LOBSTR mobile app.
   Mobile LOBSTR/Freighter connect through WalletConnect instead.
   ========================================================= */

const PREFERRED_STELLAR_WALLET_IDS = [
    "albedo",
    "freighter",
    "lobstr"
];

/* WalletConnect explorer IDs (Stellar). Used so AppKit search is not
   filtered to Ethereum-only wallets (root cause of "No Wallet found"). */
const WC_STELLAR_LOBSTR_ID =
    "76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b";

const WC_STELLAR_FREIGHTER_ID =
    "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380";

const WC_STELLAR_SCOPULY_ID =
    "9c78aee7d8a771255942334d06d2cbab89e2178ee49fee4ea3b6c78032fcac76";

const EXTENSION_ONLY_WALLET_IDS = [
    "freighter",
    "lobstr",
    "rabet",
    "xbull",
    "hana",
    "klever",
    "onekey",
    "bitget",
    "fordefi",
    "cactuslink",
    "dcent",
    "scopuly"
];

const HAVKAR_STELLAR_APPKIT_NETWORKS = [
    {
        id:"pubnet",
        name:"Stellar Public",
        nativeCurrency:{
            name:"Lumens",
            symbol:"XLM",
            decimals:7
        },
        rpcUrls:{
            default:{
                http:[
                    "https://horizon.stellar.org"
                ]
            }
        },
        blockExplorers:{
            default:{
                name:"StellarExpert",
                url:"https://stellar.expert/explorer/public"
            }
        },
        chainNamespace:"stellar",
        caipNetworkId:"stellar:pubnet"
    },
    {
        id:"testnet",
        name:"Stellar Testnet",
        nativeCurrency:{
            name:"Test Lumens",
            symbol:"XLM",
            decimals:7
        },
        rpcUrls:{
            default:{
                http:[
                    "https://horizon-testnet.stellar.org"
                ]
            }
        },
        blockExplorers:{
            default:{
                name:"StellarExpert Testnet",
                url:"https://stellar.expert/explorer/testnet"
            }
        },
        chainNamespace:"stellar",
        caipNetworkId:"stellar:testnet"
    }
];


function isLikelyMobileBrowser(){

    try{

        const ua =
            String(
                navigator.userAgent ||
                navigator.vendor ||
                ""
            );

        return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i
            .test(ua);

    }
    catch(error){

        return false;

    }

}


function orderedStellarModules(){

    const modules =
        defaultModules();

    const mobile =
        isLikelyMobileBrowser();

    const preferred =
        [];

    const rest =
        [];

    for(
        let index = 0;
        index < modules.length;
        index += 1
    ){

        const module =
            modules[index];

        const id =
            String(
                module?.productId || ""
            ).toLowerCase();

        if(
            mobile &&
            EXTENSION_ONLY_WALLET_IDS.includes(
                id
            )
        ){

            /* Hide extension-only entries on phones.
               LOBSTR Install pointed at lobstr.co and never
               detected the installed Android app. */
            continue;

        }

        if(
            PREFERRED_STELLAR_WALLET_IDS.includes(
                id
            )
        ){

            preferred.push(
                module
            );

        }
        else{

            rest.push(
                module
            );

        }

    }


    preferred.sort(
        function(left, right){

            return PREFERRED_STELLAR_WALLET_IDS.indexOf(
                String(left.productId || "").toLowerCase()
            ) - PREFERRED_STELLAR_WALLET_IDS.indexOf(
                String(right.productId || "").toLowerCase()
            );

        }
    );


    return preferred.concat(
        rest
    );

}


function havkarListPreferredStellarWallets(){

    const mobile =
        isLikelyMobileBrowser();

    return [

        {
            id:"albedo",
            name:"Albedo",
            kind:"web",
            installUrl:"https://albedo.link/",
            connect:"Opens albedo.link in a browser window; always available without an extension.",
            sign:"Signs unsigned XDR after the user approves in Albedo; network can be Testnet or Mainnet.",
            notes:"Best default for mobile and desktop browsers. Popup blockers can interrupt signing."
        },

        {
            id:"freighter",
            name:"Freighter",
            kind:mobile
                ? "walletconnect_mobile"
                : "browser_extension",
            installUrl:"https://freighter.app",
            connect:mobile
                ? "Android/iOS: use WalletConnect → Freighter Mobile (not the browser-extension row)."
                : "Desktop: Freighter browser extension.",
            sign:"Payment XDR via signTransaction; challenge via signMessage / signAuthEntry when the WC session negotiated those methods (Freighter Mobile).",
            challengeSign:mobile
                ? "walletconnect_message_if_negotiated"
                : "supported",
            notes:"Extension module is hidden on mobile browsers. Connect through WalletConnect so Freighter Mobile can deep-link. Freighter Mobile can negotiate stellar_signMessage; LOBSTR mobile typically does not."
        },

        {
            id:"lobstr",
            name:"LOBSTR",
            kind:mobile
                ? "walletconnect_mobile"
                : "browser_extension",
            installUrl:"https://lobstr.co",
            connect:mobile
                ? "Android/iOS: use WalletConnect → LOBSTR Wallet (or Connect LOBSTR via WalletConnect). Do not use the extension Install row."
                : "Desktop: LOBSTR browser signer extension.",
            sign:mobile
                ? "WalletConnect supports stellar_signXDR (payments / no-submit challenge XDR). stellar_signMessage is not implemented by LOBSTR Android WC."
                : "Extension: signTransaction + signMessage. LOBSTR ignores dApp networkPassphrase options.",
            challengeSign:mobile
                ? "walletconnect_sign_xdr_only"
                : "supported",
            notes:"Android LOBSTR rejects stellar_signMessage (missing request method). HAVKAR uses a no-payment manageData challenge XDR via stellar_signXDR and never submits it."
        }

    ];

}


function selectedStellarModuleId(){

    try{

        return String(
            localStorage.getItem(
                "@StellarWalletsKit/selectedModuleId"
            ) || ""
        ).toLowerCase();

    }
    catch(error){

        return "";

    }

}


function havkarStellarExplorerTxUrl(
    hash,
    networkId
){

    const clean =
        String(hash || "").trim();

    if(
        !/^[a-fA-F0-9]{64}$/.test(clean)
    ){

        return "";

    }

    const pathNetwork =
        String(
            networkId || currentNetwork().id
        ) === "PUBLIC"
        ? "public"
        : "testnet";

    return "https://stellar.expert/explorer/" +
        pathNetwork +
        "/tx/" +
        clean;

}


const HAVKAR_WALLET_CONNECT_MODULE =
    new WalletConnectModule({

        projectId:
            "8c21324f756127dbb906a072cc18f7e6",

        metadata:{

            name:
                "HAVKAR",

            description:
                "HAVKAR multi-service platform",

            url:
                "https://havkar.online",

            icons:[
                "https://havkar.online/icon.png"
            ]

        },

        allowedChains:[
            WalletConnectTargetChain.TESTNET,
            WalletConnectTargetChain.PUBLIC
        ],

        /* Override kit default Ethereum `mainnet` AppKit network.
           With eip155:1, AppKit search filters out stellar:pubnet
           wallets → LOBSTR search returns "No Wallet found". */
        appKitOptions:{

            networks:HAVKAR_STELLAR_APPKIT_NETWORKS,

            featuredWalletIds:[
                WC_STELLAR_LOBSTR_ID,
                WC_STELLAR_FREIGHTER_ID,
                WC_STELLAR_SCOPULY_ID
            ],

            includeWalletIds:[
                WC_STELLAR_LOBSTR_ID,
                WC_STELLAR_FREIGHTER_ID,
                WC_STELLAR_SCOPULY_ID
            ]

        }

    });


StellarWalletsKit.init({

    network:currentNetwork().passphrase,

    modules:[

        ...orderedStellarModules(),

        HAVKAR_WALLET_CONNECT_MODULE

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


    // Public product default: Mainnet. Testnet remains selectable for development.
    return "PUBLIC";

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

        horizon:network.horizon,

        paymentsEnabled:
            network.id === "TESTNET" ||
            (
                network.id === "PUBLIC" &&
                STELLAR_MAINNET_PAYMENTS_ENABLED === true
            )

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
   Classic peer payments use G… account keys only.
   Protocol 30 CAP-84 W… muxed-contract addresses are recognized
   and rejected here with a clear message (not used as Payment destinations).
   ========================================================= */

function classifyStellarAddress(
    value
){

    const text =
        String(value || "").trim();

    if(
        !text
    ){

        return {
            kind:"empty",
            value:text
        };

    }

    if(
        StrKey.isValidEd25519PublicKey(
            text
        )
    ){

        return {
            kind:"account",
            value:text
        };

    }

    if(
        typeof StrKey.isValidMed25519PublicKey === "function" &&
        StrKey.isValidMed25519PublicKey(
            text
        )
    ){

        return {
            kind:"muxed_account",
            value:text
        };

    }

    if(
        typeof StrKey.isValidMuxedContract === "function" &&
        StrKey.isValidMuxedContract(
            text
        )
    ){

        return {
            kind:"muxed_contract",
            value:text
        };

    }

    if(
        typeof StrKey.isValidContract === "function" &&
        StrKey.isValidContract(
            text
        )
    ){

        return {
            kind:"contract",
            value:text
        };

    }

    return {
        kind:"invalid",
        value:text
    };

}


function isPublicKey(
    value
){

    return classifyStellarAddress(
        value
    ).kind === "account";

}


function requireClassicPaymentDestination(
    value
){

    const classified =
        classifyStellarAddress(
            value
        );

    if(
        classified.kind === "account"
    ){

        return classified.value;

    }

    if(
        classified.kind === "muxed_contract"
    ){

        throw new Error(
            "W… muxed contract addresses (Protocol 30 / CAP-84) are not valid destinations for HAVKAR classic XLM Payment. Use a G… account public key."
        );

    }

    if(
        classified.kind === "muxed_account"
    ){

        throw new Error(
            "M… muxed account addresses are not used for HAVKAR classic peer Payment. Use a G… account public key."
        );

    }

    if(
        classified.kind === "contract"
    ){

        throw new Error(
            "C… contract addresses are not valid destinations for HAVKAR classic XLM Payment. Use a G… account public key."
        );

    }

    throw new Error(
        "Enter a valid Stellar destination public key (G…)."
    );

}


async function havkarFetchStellarProtocolInfo(
    networkId
){

    const network =
        STELLAR_NETWORKS[
            String(
                networkId || HAVKAR_STELLAR.network || "PUBLIC"
            ).toUpperCase()
        ] || currentNetwork();

    const server =
        horizonServer(
            network
        );

    const page =
        await server
            .ledgers()
            .order(
                "desc"
            )
            .limit(
                1
            )
            .call();

    const ledger =
        page.records &&
        page.records[0]
        ? page.records[0]
        : null;

    return {

        network:network.id,

        label:network.label,

        horizon:network.horizon,

        protocol_version:ledger
            ? Number(
                ledger.protocol_version
            )
            : null,

        ledger_sequence:ledger
            ? Number(
                ledger.sequence
            )
            : null,

        closed_at:ledger
            ? ledger.closed_at
            : null,

        protocol30:ledger
            ? Number(
                ledger.protocol_version
            ) >= 30
            : false,

        money_moved_by_this_helper:false

    };

}


function parseXlmAmount(
    value,
    allowZero
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


    if(
        stroops < 0n ||
        (
            stroops === 0n &&
            allowZero !== true
        )
    ){

        throw new Error(
            "Enter an XLM amount greater than zero."
        );

    }


    return {

        text:formatStroops(stroops),

        stroops:stroops

    };

}


function parseXlm(
    value
){

    return parseXlmAmount(
        value,
        false
    );

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
        /set the wallet first/i
            .test(message)
    ){

        return "Connect a Stellar wallet before signing.";

    }


    if(
        /the user closed the modal/i
            .test(message)
    ){

        return "Albedo did not finish connecting. The window closed before it returned a public address.";

    }


    if(
        /reject|denied|cancel|closed|dismiss|user declined|user refused/i
            .test(message)
    ){

        return "Signature declined or cancelled in the wallet. No transaction was submitted.";

    }


    if(
        /not connected|not installed|is not connected|freighter is not|lobstr is not/i
            .test(message)
    ){

        return "The selected wallet extension is not available. Install or unlock Albedo, Freighter, or LOBSTR, then reconnect.";

    }


    if(
        /failed to fetch|networkerror|load failed|err_network|timeout|timed out|offline/i
            .test(message)
    ){

        return "Network connection to Horizon or the wallet was interrupted. Check connectivity and try again.";

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
        else if(
            horizon.transaction ===
            "tx_too_late"
        ){

            friendly =
                "The payment timed out before Horizon accepted it. Review again to build a fresh transaction; nothing extra was charged if the previous hash never confirmed.";

        }
        else if(
            horizon.transaction ===
            "tx_too_early"
        ){

            friendly =
                "The payment is not valid yet for the Stellar network. Wait a moment and try again.";

        }


        return friendly +
            " " +
            horizon.text;

    }


    if(
        /did not return a signature|signature timed out|wallet.?timeout|session.?expir/i
            .test(message)
    ){

        return "The wallet did not return a signature in time. No transaction was submitted. Review the payment again if you still want to send.";

    }


    if(
        /failed to fetch|networkerror|load failed|timeout/i
            .test(message)
    ){

        return "Could not reach the Stellar network.";

    }


    if(
        /identical payment already confirmed/i
            .test(message)
    ){

        return message.length <= 220
            ? message
            : message.slice(0, 217) + "...";

    }


    if(
        message &&
        message.length <= 220 &&
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


function nativeBalanceRow(
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


    return row;

}


function nativeBalance(
    account
){

    return parseXlmAmount(
        nativeBalanceRow(account).balance,
        true
    );

}


function availableNative(
    account
){

    const row =
        nativeBalanceRow(account);

    const gross =
        parseXlmAmount(
            row.balance,
            true
        );

    const selling =
        parseXlmAmount(
            row.selling_liabilities || "0",
            true
        );

    const stroops =
        gross.stroops > selling.stroops
        ? gross.stroops - selling.stroops
        : 0n;


    return {

        text:formatStroops(stroops),

        stroops:stroops

    };

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


async function havkarFetchStellarRecentPayments(
    address,
    limit
){

    const network =
        currentNetwork();

    const publicKey =
        String(
            address ||
            HAVKAR_STELLAR.address ||
            ""
        ).trim();

    const max =
        Math.max(
            1,
            Math.min(
                Number(limit) || 12,
                40
            )
        );

    if(!isPublicKey(publicKey)){

        throw new Error(
            "A valid Stellar public key is required."
        );

    }

    const server =
        horizonServer(network);

    try{

        const page =
            await server
                .payments()
                .forAccount(publicKey)
                .order("desc")
                .limit(max)
                .call();

        const records =
            Array.isArray(page && page.records)
            ? page.records
            : [];

        const rows = [];

        for(
            let index = 0;
            index < records.length;
            index += 1
        ){

            const row =
                records[index] || {};

            const type =
                String(row.type || "");

            if(
                type !== "payment" &&
                type !== "create_account"
            ){

                continue;

            }

            const assetType =
                String(
                    row.asset_type ||
                    ""
                );

            if(
                type === "payment" &&
                assetType !== "native"
            ){

                continue;

            }

            const amountText =
                type === "create_account"
                ? String(
                    row.starting_balance ||
                    "0"
                )
                : String(
                    row.amount ||
                    "0"
                );

            const from =
                String(
                    row.from ||
                    row.funder ||
                    ""
                );

            const to =
                String(
                    row.to ||
                    row.account ||
                    ""
                );

            const inbound =
                to === publicKey;

            rows.push({

                id:String(
                    row.id ||
                    row.paging_token ||
                    ""
                ),

                type:type,

                direction:
                    inbound
                    ? "in"
                    : "out",

                amount:amountText,

                asset:"XLM",

                counterparty:
                    inbound
                    ? from
                    : to,

                transaction_hash:String(
                    row.transaction_hash ||
                    ""
                ),

                created_at:String(
                    row.created_at ||
                    ""
                ),

                successful:
                    row.transaction_successful !== false,

                network:network.id,

                label:network.label,

                horizon:network.horizon

            });

        }

        return {

            ok:true,

            network:network.id,

            label:network.label,

            horizon:network.horizon,

            address:publicKey,

            payments:rows

        };

    }
    catch(error){

        if(
            error instanceof NotFoundError
        ){

            return {

                ok:true,

                network:network.id,

                label:network.label,

                horizon:network.horizon,

                address:publicKey,

                payments:[],

                exists:false

            };

        }

        throw new Error(
            safeErrorMessage(error)
        );

    }

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

        const available =
            availableNative(
                account
            );

        const minimum =
            minimumBalance(
                account,
                limits.baseReserve
            );

        const spendable =
            available.stroops -
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

function readUnsignedPaymentRequest(
    options
){

    const network =
        currentNetwork();

    const source =
        String(
            HAVKAR_STELLAR.address || ""
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


    const rawPayments =
        Array.isArray(options?.payments)
        ? options.payments
        : null;

    let payments =
        null;

    if(
        rawPayments &&
        rawPayments.length > 0
    ){

        payments =
            rawPayments.map(
                function(entry){

                    const destination =
                        requireClassicPaymentDestination(
                            entry?.destination
                        );

                    if(destination === source){

                        throw new Error(
                            "The destination must be a different Stellar account."
                        );

                    }

                    return {

                        destination:destination,

                        amount:parseXlm(
                            entry?.amount
                        )

                    };

                }
            );

        let totalStroops =
            0n;

        payments.forEach(
            function(entry){

                totalStroops +=
                    entry.amount.stroops;

            }
        );

        return {

            network:network,

            source:source,

            destination:payments[0].destination,

            memo:memo,

            amount:{

                text:(Number(totalStroops) / 1e7).toFixed(7),

                stroops:totalStroops

            },

            payments:payments

        };

    }


    const destination =
        requireClassicPaymentDestination(
            options?.destination
        );


    if(destination === source){

        throw new Error(
            "The destination must be a different Stellar account."
        );

    }


    return {

        network:network,

        source:source,

        destination:destination,

        memo:memo,

        amount:parseXlm(
            options?.amount
        ),

        payments:null

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

    const splitPayments =
        Array.isArray(request.payments) &&
        request.payments.length > 0
        ? request.payments
        : null;

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

    const available =
        availableNative(
            sourceAccount
        );

    const minimum =
        minimumBalance(
            sourceAccount,
            limits.baseReserve
        );

    const opCount =
        BigInt(
            splitPayments
            ? splitPayments.length
            : 1
        );

    const spendable =
        available.stroops -
        minimum -
        limits.baseFee * opCount;


    if(amount.stroops > spendable){

        throw new Error(
            "The available XLM is not enough for this payment and the account reserve."
        );

    }


    let builder =
        new TransactionBuilder(
            sourceAccount,
            {

                fee:(limits.baseFee * opCount).toString(),

                networkPassphrase:
                    network.passphrase

            }
        );


    let kind =
        "payment";


    if(splitPayments){

        for(
            let index = 0;
            index < splitPayments.length;
            index += 1
        ){

            const entry =
                splitPayments[index];

            try{

                await server.loadAccount(
                    entry.destination
                );

            }
            catch(error){

                if(
                    error instanceof NotFoundError
                ){

                    throw new Error(
                        "Destination account does not exist on " +
                        network.label +
                        ". Fund or create it before split XLM settlement."
                    );

                }

                throw error;

            }

            builder =
                builder.addOperation(

                    Operation.payment({

                        destination:entry.destination,

                        asset:Asset.native(),

                        amount:entry.amount.text

                    })

                );

        }

    }
    else{

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


        kind =
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

        passphrase:network.passphrase,

        horizon:network.horizon,

        source:source,

        destination:destination,

        amount:amount.text,

        kind:kind,

        memo:memo,

        fee:String(transaction.fee),

        feeXlm:formatStroops(
            BigInt(
                String(
                    transaction.fee
                )
            )
        ),

        balance:available.text,

        minimumBalance:formatStroops(
            minimum
        ),

        spendable:formatStroops(
            spendable > 0n
            ? spendable
            : 0n
        ),

        sequence:String(transaction.sequence),

        timeBounds:{

            minTime:String(
                transaction.timeBounds?.minTime || "0"
            ),

            maxTime:String(
                transaction.timeBounds?.maxTime || "0"
            )

        },

        hash:bytesToHex(
            transaction.hash()
        ),

        signed:false,

        submitted:false,

        payments:splitPayments
            ? splitPayments.map(
                function(entry){

                    return {

                        destination:entry.destination,

                        amount:entry.amount.text

                    };

                }
            )
            : null

    };

}


function bytesToHex(
    bytes
){

    return Array.from(
        bytes,
        function(value){

            return value
                .toString(16)
                .padStart(2,"0");

        }
    ).join("");

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

    const signed =
        TransactionBuilder.fromXDR(
            signedXdr,
            prepared.passphrase
        );

    const mismatch =
        "The signed transaction does not match the payment you reviewed.";


    if(
        signed.source !== prepared.source ||
        String(signed.sequence) !==
            String(prepared.sequence) ||
        String(signed.fee) !==
            String(prepared.fee) ||
        String(signed.timeBounds?.minTime || "0") !==
            String(prepared.timeBounds.minTime) ||
        String(signed.timeBounds?.maxTime || "0") !==
            String(prepared.timeBounds.maxTime) ||
        bytesToHex(signed.hash()) !==
            prepared.hash
    ){

        throw new Error(
            mismatch
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

    const expectedPayments =
        Array.isArray(prepared.payments) &&
        prepared.payments.length > 0
        ? prepared.payments
        : null;


    if(expectedPayments){

        if(operations.length !== expectedPayments.length){

            throw new Error(
                mismatch
            );

        }

        expectedPayments.forEach(
            function(expected, index){

                const operation =
                    operations[index];

                if(
                    !operation ||
                    operation.type !== "payment" ||
                    operation.destination !==
                        expected.destination ||
                    parseXlm(operation.amount).text !==
                        expected.amount ||
                    (
                        operation.asset &&
                        !operation.asset.isNative()
                    )
                ){

                    throw new Error(
                        mismatch
                    );

                }

            }
        );

    }
    else{

        if(operations.length !== 1){

            throw new Error(
                mismatch
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
                mismatch
            );

        }

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


    const signer =
        Keypair.fromPublicKey(
            prepared.source
        );

    const hash =
        signed.hash();

    const valid =
        signed.signatures.some(
            function(signature){

                const raw =
                    signature &&
                    signature.signature;

                const bytes =
                    typeof raw === "function"
                    ? raw.call(signature)
                    : raw;


                if(!bytes){

                    return false;

                }


                return signer.verify(
                    hash,
                    bytes
                );

            }
        );


    if(!valid){

        throw new Error(
            "The signature does not match the connected wallet on this network."
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

/* Albedo's confirm page posts {albedo:{protocol:3}} to window.opener.
   On Android Chrome a direct cross-origin window.open leaves opener null,
   so that message never reaches HAVKAR. The page then stays on its logo,
   and the logo is a link to the Albedo dashboard. Opening about:blank in
   this browsing context keeps the opener, then the same window navigates
   to the confirm URL. Other wallets are not intercepted. */
function openAlbedoConfirmWindow(
    nativeOpen,
    features
){

    const popup =
        nativeOpen(

            "about:blank",

            ALBEDO_WINDOW_NAME,

            features

        );


    if(!popup){

        return null;

    }


    try{

        popup.location.href =
            ALBEDO_CONFIRM_URL;

    }
    catch(error){

        try{

            popup.close();

        }
        catch(closeError){

        }


        return null;

    }


    return popup;

}


function installAlbedoConfirmBridge(){

    if(
        window.__havkarAlbedoOpenBridge === true ||
        typeof window.open !== "function"
    ){

        return;

    }


    const nativeOpen =
        window.open.bind(
            window
        );


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
                target === ALBEDO_WINDOW_NAME &&
                next.indexOf(ALBEDO_CONFIRM_URL) === 0
            ){

                return openAlbedoConfirmWindow(
                    nativeOpen,
                    features
                );

            }


            return nativeOpen(
                url,
                target,
                features
            );

        };


    window.__havkarAlbedoOpenBridge =
        true;

}


installAlbedoConfirmBridge();

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
            "Opening Albedo to sign the Testnet transaction...";

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

        /* Localhost tests may supply this signer.
           A production hostname never reaches it. */
        const testSigner =
            globalThis.HAVKAR_STELLAR_TEST_SIGN;

        const testHost =
            String(
                window.location?.hostname || ""
            );

        if(
            typeof testSigner === "function" &&
            (
                testHost === "localhost" ||
                testHost === "127.0.0.1"
            )
        ){

            signPromise =
                Promise.resolve(
                    testSigner(
                        prepared,
                        network
                    )
                );

        }
        else signPromise =
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
   A lost response is resolved by the same transaction hash.
   It is never replaced with a second payment.
   ========================================================= */

function parsePendingPaymentRaw(
    raw
){

    if(!raw){

        return null;

    }

    const parsed =
        JSON.parse(raw);

    if(
        !parsed ||
        typeof parsed.hash !== "string" ||
        typeof parsed.signedXdr !== "string"
    ){

        return null;

    }

    return parsed;

}


function readPendingPayment(){

    try{

        const fromSession =
            parsePendingPaymentRaw(
                sessionStorage.getItem(
                    PENDING_PAYMENT_KEY
                )
            );

        if(fromSession){

            return fromSession;

        }

        /* localStorage recovers the same signed XDR after refresh / WC reconnect
           in this browser profile. It is not a secret key, but treat as sensitive. */
        const fromLocal =
            parsePendingPaymentRaw(
                localStorage.getItem(
                    PENDING_PAYMENT_KEY
                )
            );

        if(fromLocal){

            try{

                sessionStorage.setItem(
                    PENDING_PAYMENT_KEY,
                    JSON.stringify(fromLocal)
                );

            }
            catch(error){

            }

        }

        return fromLocal;

    }
    catch(error){

        return null;

    }

}


function writePendingPayment(
    pending
){

    const raw =
        JSON.stringify(pending);

    try{

        sessionStorage.setItem(
            PENDING_PAYMENT_KEY,
            raw
        );

    }
    catch(error){

    }

    try{

        localStorage.setItem(
            PENDING_PAYMENT_KEY,
            raw
        );

    }
    catch(error){

    }

}


function clearPendingPayment(){

    try{

        sessionStorage.removeItem(
            PENDING_PAYMENT_KEY
        );

    }
    catch(error){

    }

    try{

        localStorage.removeItem(
            PENDING_PAYMENT_KEY
        );

    }
    catch(error){

    }

}


function readPaymentLock(){

    try{

        const raw =
            localStorage.getItem(
                PAYMENT_LOCK_KEY
            );

        if(!raw){

            return null;

        }

        const parsed =
            JSON.parse(raw);

        if(
            !parsed ||
            typeof parsed.tabId !== "string" ||
            typeof parsed.at !== "number"
        ){

            return null;

        }

        return parsed;

    }
    catch(error){

        return null;

    }

}


function acquirePaymentLock(){

    const existing =
        readPaymentLock();

    const now =
        Date.now();

    if(
        existing &&
        existing.tabId !== HAVKAR_PAYMENT_TAB_ID &&
        now - Number(existing.at || 0) <
            PAYMENT_LOCK_STALE_MS
    ){

        throw new Error(
            "A Stellar payment is already in progress in another browser tab."
        );

    }

    try{

        localStorage.setItem(
            PAYMENT_LOCK_KEY,
            JSON.stringify({
                tabId:HAVKAR_PAYMENT_TAB_ID,
                at:now
            })
        );

    }
    catch(error){

    }

}


function releasePaymentLock(){

    try{

        const existing =
            readPaymentLock();

        if(
            !existing ||
            existing.tabId === HAVKAR_PAYMENT_TAB_ID
        ){

            localStorage.removeItem(
                PAYMENT_LOCK_KEY
            );

        }

    }
    catch(error){

    }

}


function readLastSuccessfulPayment(){

    try{

        const raw =
            localStorage.getItem(
                LAST_SUCCESS_PAYMENT_KEY
            );

        if(!raw){

            return null;

        }

        const parsed =
            JSON.parse(raw);

        if(
            !parsed ||
            typeof parsed.hash !== "string" ||
            typeof parsed.at !== "number"
        ){

            return null;

        }

        return parsed;

    }
    catch(error){

        return null;

    }

}


function writeLastSuccessfulPayment(
    confirmed,
    prepared
){

    try{

        localStorage.setItem(
            LAST_SUCCESS_PAYMENT_KEY,
            JSON.stringify({
                at:Date.now(),
                hash:confirmed.hash,
                network:confirmed.network || prepared.network,
                source:prepared.source,
                destination:prepared.destination,
                amount:prepared.amount,
                memo:prepared.memo || "",
                kind:prepared.kind || "payment"
            })
        );

    }
    catch(error){

    }

}


function findRecentSuccessfulDuplicate(
    request
){

    const last =
        readLastSuccessfulPayment();

    if(!last){

        return null;

    }

    if(
        Date.now() - Number(last.at || 0) >
        RECENT_SUCCESS_GUARD_MS
    ){

        return null;

    }

    const networkId =
        String(
            request?.network?.id ||
            request?.network ||
            currentNetwork().id
        );

    if(
        last.network !== networkId ||
        last.source !== request.source ||
        last.destination !== request.destination ||
        last.amount !== request.amount.text ||
        String(last.memo || "") !==
            String(request.memo || "")
    ){

        return null;

    }

    return last;

}


function paymentRecordMatchesRequest(
    record,
    request
){

    if(!record || !request){

        return false;

    }

    const amountText =
        request.amount?.text ||
        request.amount;

    if(record.type === "payment"){

        return (
            record.asset_type === "native" &&
            record.from === request.source &&
            record.to === request.destination &&
            parseXlmAmount(
                record.amount,
                true
            ).text === amountText
        );

    }

    if(
        record.type === "create_account" &&
        (
            request.kind === "createAccount" ||
            !request.kind
        )
    ){

        return (
            record.account === request.destination &&
            parseXlmAmount(
                record.starting_balance,
                true
            ).text === amountText
        );

    }

    return false;

}


async function horizonTransactionMemoText(
    server,
    hash
){

    try{

        const tx =
            await readHorizonTransaction(
                server,
                hash
            );

        if(!tx){

            return "";

        }

        const memoType =
            String(
                tx.memo_type ||
                ""
            ).toLowerCase();

        if(
            !memoType ||
            memoType === "none"
        ){

            return "";

        }

        return String(
            tx.memo ||
            ""
        );

    }
    catch(error){

        return null;

    }

}


async function findRecentHorizonDuplicatePayment(
    server,
    request,
    options
){

    const opts =
        options && typeof options === "object"
        ? options
        : {};

    const windowMs =
        Number(
            opts.windowMs ||
            RECENT_SUCCESS_GUARD_MS
        );

    const sinceMs =
        Date.now() - windowMs;

    const wantMemo =
        String(
            request.memo ||
            ""
        );

    try{

        const page =
            await server
                .payments()
                .forAccount(
                    request.source
                )
                .order(
                    "desc"
                )
                .limit(
                    25
                )
                .call();

        const records =
            page.records || [];

        for(
            let index = 0;
            index < records.length;
            index += 1
        ){

            const record =
                records[index];

            const createdMs =
                Date.parse(
                    String(
                        record.created_at ||
                        ""
                    )
                );

            if(
                !Number.isFinite(createdMs) ||
                createdMs < sinceMs
            ){

                continue;

            }

            if(
                !paymentRecordMatchesRequest(
                    record,
                    request
                )
            ){

                continue;

            }

            const hash =
                String(
                    record.transaction_hash ||
                    record.transactionHash ||
                    ""
                ).trim();

            if(
                !/^[a-fA-F0-9]{64}$/.test(hash)
            ){

                continue;

            }

            const memoText =
                await horizonTransactionMemoText(
                    server,
                    hash
                );

            if(memoText === null){

                continue;

            }

            if(memoText !== wantMemo){

                continue;

            }

            return {

                hash:hash,

                at:createdMs,

                network:String(
                    request?.network?.id ||
                    request?.network ||
                    currentNetwork().id
                ),

                source:request.source,

                destination:request.destination,

                amount:request.amount?.text || request.amount,

                memo:wantMemo,

                kind:record.type === "create_account"
                    ? "createAccount"
                    : "payment",

                sourceGuard:"horizon"

            };

        }

    }
    catch(error){

        if(
            error instanceof NotFoundError ||
            error?.response?.status === 404
        ){

            return null;

        }

        /* Horizon read failures must not block a deliberate send after review;
           local guards and hash-idempotent submit still apply. */
        return null;

    }

    return null;

}


async function findAnyRecentDuplicate(
    server,
    request,
    options
){

    const local =
        findRecentSuccessfulDuplicate(
            request
        );

    if(local){

        return {
            ...local,
            sourceGuard:"localStorage"
        };

    }

    if(!server){

        return null;

    }

    return findRecentHorizonDuplicatePayment(
        server,
        request,
        options
    );

}


function lastSuccessfulMatchesRequest(
    last,
    request
){

    if(!last || !request){

        return false;

    }

    const networkId =
        String(
            request?.network?.id ||
            request?.network ||
            currentNetwork().id
        );

    const amountText =
        request.amount?.text ||
        request.amount;

    return (
        last.network === networkId &&
        last.source === request.source &&
        last.destination === request.destination &&
        last.amount === amountText &&
        String(last.memo || "") ===
            String(request.memo || "")
    );

}


/* Review UX: surface matching peer payments early.
   - withinGuardWindow: still inside the 15-minute hard guard
   - otherwise informational only (lookback up to 24h / local last success) */
async function findPaymentDuplicateNotice(
    server,
    request
){

    const recent =
        await findAnyRecentDuplicate(
            server,
            request
        );

    if(recent){

        return {
            ...recent,
            withinGuardWindow:true,
            severity:"guard"
        };

    }

    const last =
        readLastSuccessfulPayment();

    if(
        lastSuccessfulMatchesRequest(
            last,
            request
        )
    ){

        return {
            ...last,
            sourceGuard:"localStorage",
            withinGuardWindow:false,
            severity:"info"
        };

    }

    if(!server){

        return null;

    }

    const older =
        await findRecentHorizonDuplicatePayment(
            server,
            request,
            {
                windowMs:REVIEW_MATCH_LOOKBACK_MS
            }
        );

    if(!older){

        return null;

    }

    return {
        ...older,
        withinGuardWindow:false,
        severity:"info"
    };

}


function samePayment(
    pending,
    prepared
){

    if(
        !pending ||
        pending.network !== prepared.network ||
        pending.source !== prepared.source ||
        pending.destination !== prepared.destination ||
        pending.amount !== prepared.amount ||
        pending.memo !== prepared.memo ||
        pending.kind !== prepared.kind
    ){

        return false;

    }

    const pendingPayments =
        Array.isArray(pending.payments)
        ? pending.payments
        : null;

    const preparedPayments =
        Array.isArray(prepared.payments)
        ? prepared.payments
        : null;

    if(!pendingPayments && !preparedPayments){

        return true;

    }

    if(
        !pendingPayments ||
        !preparedPayments ||
        pendingPayments.length !== preparedPayments.length
    ){

        return false;

    }

    return pendingPayments.every(
        function(entry, index){

            const expected =
                preparedPayments[index];

            return (
                entry &&
                expected &&
                entry.destination === expected.destination &&
                entry.amount === expected.amount
            );

        }
    );

}


function pendingStillOpen(
    pending
){

    const maxTime =
        Number(
            pending?.maxTime || 0
        );


    return (
        Number.isFinite(maxTime) &&
        maxTime > Math.floor(Date.now() / 1000)
    );

}


async function readHorizonTransaction(
    server,
    hash
){

    try{

        return await server
            .transactions()
            .transaction(hash)
            .call();

    }
    catch(error){

        if(
            error instanceof NotFoundError ||
            error?.response?.status === 404
        ){

            return null;

        }


        throw error;

    }

}


async function horizonOperationMatches(
    server,
    hash,
    prepared
){

    const page =
        await server
            .operations()
            .forTransaction(hash)
            .limit(5)
            .call();

    const records =
        page.records || [];

    const expectedPayments =
        Array.isArray(prepared.payments) &&
        prepared.payments.length > 0
        ? prepared.payments
        : null;


    if(expectedPayments){

        if(records.length < expectedPayments.length){

            return false;

        }

        return expectedPayments.every(
            function(expected){

                return records.some(
                    function(operation){

                        const source =
                            operation.source_account ||
                            operation.funder ||
                            prepared.source;

                        return (
                            source === prepared.source &&
                            operation.type === "payment" &&
                            (operation.to || operation.destination) ===
                                expected.destination &&
                            operation.asset_type === "native" &&
                            parseXlm(operation.amount).text ===
                                expected.amount
                        );

                    }
                );

            }
        );

    }


    if(records.length !== 1){

        return false;

    }


    const operation =
        records[0];

    const source =
        operation.source_account ||
        operation.funder ||
        prepared.source;


    if(source !== prepared.source){

        return false;

    }


    if(prepared.kind === "payment"){

        return (
            operation.type === "payment" &&
            (operation.to || operation.destination) ===
                prepared.destination &&
            operation.asset_type === "native" &&
            parseXlm(operation.amount).text ===
                prepared.amount
        );

    }


    return (
        operation.type === "create_account" &&
        operation.account === prepared.destination &&
        parseXlm(operation.starting_balance).text ===
            prepared.amount
    );

}


async function confirmedPayment(
    server,
    hash,
    prepared,
    network
){

    const record =
        await readHorizonTransaction(
            server,
            hash
        );


    if(!record){

        return null;

    }


    if(
        record.successful !== true ||
        record.hash !== hash ||
        record.source_account !== prepared.source
    ){

        throw new Error(
            "The Stellar network rejected the transaction."
        );

    }


    const matched =
        await horizonOperationMatches(
            server,
            hash,
            prepared
        );


    if(!matched){

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

        memo:prepared.memo || "",

        fee:record.fee_charged != null
            ? String(record.fee_charged)
            : prepared.fee || null,

        successful:true,

        explorerUrl:havkarStellarExplorerTxUrl(
            record.hash,
            network.id
        )

    };

}


function assertStellarSubmissionAllowed(
    network
){

    let host =
        "";


    try{

        host =
            new URL(
                String(network?.horizon || "")
            ).hostname;

    }
    catch(error){

        host =
            "";

    }


    if(!network){
        throw new Error(
            "Stellar network is not selected."
        );
    }

    if(
        network.id === "TESTNET" &&
        network.passphrase === Networks.TESTNET &&
        host === "horizon-testnet.stellar.org"
    ){
        return;
    }

    if(
        STELLAR_MAINNET_PAYMENTS_ENABLED === true &&
        network.id === "PUBLIC" &&
        network.passphrase === Networks.PUBLIC &&
        host === "horizon.stellar.org"
    ){
        return;
    }

    throw new Error(
        "This Stellar network is not allowed for HAVKAR payments."
    );

}


async function havkarSignAndSubmitStellarPayment(
    options
){

    const network =
        currentNetwork();


    assertStellarSubmissionAllowed(
        network
    );


    if(paymentInFlight){

        throw new Error(
            "A Stellar payment is already in progress."
        );

    }


    acquirePaymentLock();

    paymentInFlight =
        true;

    let albedoPopup =
        null;


    try{

        const request =
            readUnsignedPaymentRequest(
                options
            );

        const server =
            horizonServer(network);

        const recentDuplicate =
            await findAnyRecentDuplicate(
                server,
                request
            );

        if(
            recentDuplicate &&
            options?.allowRecentDuplicate !== true
        ){

            throw new Error(
                "Identical payment already confirmed recently (hash " +
                recentDuplicate.hash +
                "). Wait or open that receipt before sending the same amount again."
            );

        }

        const pending =
            readPendingPayment();

        let prepared =
            null;

        let signedXdr =
            "";


        if(
            pending &&
            pending.network === network.id &&
            pending.source === request.source &&
            pendingStillOpen(pending)
        ){

            const replay =
                {
                    network:network.id,
                    source:request.source,
                    destination:request.destination,
                    amount:request.amount.text,
                    memo:request.memo,
                    kind:pending.kind,
                    payments:Array.isArray(request.payments)
                        ? request.payments.map(
                            function(entry){

                                return {

                                    destination:entry.destination,

                                    amount:entry.amount.text

                                };

                            }
                        )
                        : null
                };


            if(
                samePayment(
                    pending,
                    replay
                )
            ){

                let existing =
                    null;


                try{

                    existing =
                        await confirmedPayment(
                            server,
                            pending.hash,
                            replay,
                            network
                        );

                }
                catch(error){

                    clearPendingPayment();

                    throw error;

                }


                if(existing){

                    clearPendingPayment();

                    writeLastSuccessfulPayment(
                        existing,
                        replay
                    );

                    return existing;

                }


                if(
                    !pending.fee ||
                    !pending.sequence ||
                    !pending.timeBounds
                ){

                    throw new Error(
                        "An earlier Stellar payment is still unresolved. Wait for it to expire before sending another."
                    );

                }


                prepared =
                    {

                        network:pending.network,

                        passphrase:network.passphrase,

                        source:pending.source,

                        destination:pending.destination,

                        amount:pending.amount,

                        kind:pending.kind,

                        memo:pending.memo,

                        fee:pending.fee,

                        sequence:pending.sequence,

                        timeBounds:pending.timeBounds,

                        hash:pending.hash

                    };

                signedXdr =
                    pending.signedXdr;

            }
            else{

                const earlier =
                    await readHorizonTransaction(
                        server,
                        pending.hash
                    );


                if(!earlier){

                    throw new Error(
                        "An earlier Stellar payment is still unresolved. Wait for it to expire before sending a different one."
                    );

                }


                clearPendingPayment();

            }

        }
        else if(pending){

            clearPendingPayment();

        }


        if(!prepared){

            /* Never auto-build a new payment while a different signed pending
               is still open — user must wait for expiry or finish that hash. */
            albedoPopup =
                reserveAlbedoSigningWindow();


            prepared =
                await havkarPrepareStellarPayment(
                    options
                );


            const signedResult =
                await requestWalletSignature(
                    prepared,
                    network,
                    albedoPopup
                );


            signedXdr =
                signedResult?.signedTxXdr || "";

        }


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


        writePendingPayment({

            network:prepared.network,

            source:prepared.source,

            destination:prepared.destination,

            amount:prepared.amount,

            memo:prepared.memo,

            kind:prepared.kind,

            hash:prepared.hash,

            signedXdr:signedXdr,

            fee:prepared.fee,

            sequence:prepared.sequence,

            timeBounds:prepared.timeBounds,

            maxTime:prepared.timeBounds.maxTime,

            payments:prepared.payments || null

        });


        /* Hash-idempotent: if this exact tx already landed, never submit again. */
        let alreadyConfirmed =
            null;

        try{

            alreadyConfirmed =
                await confirmedPayment(
                    server,
                    prepared.hash,
                    prepared,
                    network
                );

        }
        catch(error){

            clearPendingPayment();

            throw error;

        }


        if(alreadyConfirmed){

            clearPendingPayment();

            writeLastSuccessfulPayment(
                alreadyConfirmed,
                prepared
            );

            return alreadyConfirmed;

        }


        let submitError =
            null;


        try{

            assertStellarSubmissionAllowed(
                network
            );


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

        }
        catch(error){

            submitError =
                error;

            /* Delayed signature / double-tap: Horizon may already have the hash. */
            try{

                const raced =
                    await confirmedPayment(
                        server,
                        prepared.hash,
                        prepared,
                        network
                    );

                if(raced){

                    clearPendingPayment();

                    writeLastSuccessfulPayment(
                        raced,
                        prepared
                    );

                    return raced;

                }

            }
            catch(confirmError){

                clearPendingPayment();

                throw confirmError;

            }

        }


        let confirmed =
            null;


        try{

            confirmed =
                await confirmedPayment(
                    server,
                    prepared.hash,
                    prepared,
                    network
                );

        }
        catch(error){

            clearPendingPayment();

            throw error;

        }


        if(confirmed){

            clearPendingPayment();

            writeLastSuccessfulPayment(
                confirmed,
                prepared
            );

            return confirmed;

        }


        throw submitError ||
            new Error(
                "The transaction hash could not be confirmed on Horizon."
            );

    }
    catch(error){

        closeSigningPopup(
            albedoPopup
        );


        throw new Error(
            safeErrorMessage(error)
        );

    }
    finally{

        paymentInFlight =
            false;

        releasePaymentLock();

    }

}


/* =========================================================
   CONNECT STELLAR WALLET
   ========================================================= */

function rememberConnectedAddress(
    address
){

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

}


function failConnect(
    error
){

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


async function havkarConnectStellarWallet(){

    try{

        const mobile =
            isLikelyMobileBrowser();

        const result =
            await StellarWalletsKit.authModal({

                /* On phones, Install for LOBSTR/Freighter is misleading
                   (extension URL, not the installed Android app). */
                showInstallLabel:!mobile,

                hideUnsupportedWallets:mobile

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


        rememberConnectedAddress(
            address
        );


        return address;

    }
    catch(error){

        failConnect(
            error
        );

    }

}


/* Direct WalletConnect path for Android LOBSTR / Freighter Mobile.
   Skips the extension row that only shows Install. */
async function havkarConnectStellarWalletConnect(){

    try{

        if(
            typeof StellarWalletsKit.setWallet !==
            "function"
        ){

            throw new Error(
                "WalletConnect is not available in this wallet kit build."
            );

        }


        StellarWalletsKit.setWallet(
            "wallet_connect"
        );


        const result =
            typeof StellarWalletsKit.fetchAddress ===
            "function"
            ? await StellarWalletsKit.fetchAddress()
            : await StellarWalletsKit.getAddress();


        const address =
            String(
                result?.address || ""
            ).trim();


        if(!isPublicKey(address)){

            throw new Error(
                "WalletConnect did not return a valid Stellar public key. Open LOBSTR → WalletConnect and approve the session."
            );

        }


        rememberConnectedAddress(
            address
        );


        return address;

    }
    catch(error){

        failConnect(
            error
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

window.havkarConnectStellarWalletConnect =
    havkarConnectStellarWalletConnect;

window.havkarIsLikelyMobileBrowser =
    isLikelyMobileBrowser;

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

window.havkarFetchStellarRecentPayments =
    havkarFetchStellarRecentPayments;

window.havkarFetchStellarProtocolInfo =
    havkarFetchStellarProtocolInfo;

/* =========================================================
   WALLET CHALLENGE (NO PAYMENT / NO SUBMIT)

   Protocol facts:
   - WalletConnect required method in this kit: stellar_signXDR
   - stellar_signMessage is OPTIONAL; Freighter Mobile may negotiate it
   - LOBSTR Android WC rejects stellar_signMessage
     ("Saknad eller ogiltig request()-metod: stellar_signMessage")
   - Official kit docs: message signing is not generally available via WC
   - LOBSTR browser extension supports SEP-43 signMessage

   HAVKAR therefore:
   - extension lobstr/freighter → signMessage
   - wallet_connect with stellar_signMessage negotiated → signMessage
   - wallet_connect otherwise → no-payment manageData challenge XDR
     via stellar_signXDR, verified locally, NEVER submitted
   ========================================================= */

const WC_METHOD_SIGN_XDR =
    "stellar_signXDR";

const WC_METHOD_SIGN_MESSAGE =
    "stellar_signMessage";


function challengeNonce(){

    if(
        typeof crypto !== "undefined" &&
        crypto.randomUUID
    ){

        return crypto.randomUUID();

    }

    return Date.now().toString(36) +
        Math.random().toString(36).slice(2);

}


function buildStellarWalletChallengeMessage(){

    const network =
        currentNetwork();

    const address =
        String(
            HAVKAR_STELLAR.address || ""
        ).trim();

    return [
        "HAVKAR Stellar wallet challenge",
        "This is NOT a payment and moves no XLM.",
        "Network: " + network.label + " (" + network.id + ")",
        "Address: " + (address || "(not connected)"),
        "Nonce: " + challengeNonce(),
        "IssuedAt: " + new Date().toISOString()
    ].join("\n");

}


async function havkarListWalletConnectMethods(){

    try{

        if(
            typeof HAVKAR_WALLET_CONNECT_MODULE.getSessions !==
            "function"
        ){

            return [];

        }

        const sessions =
            await HAVKAR_WALLET_CONNECT_MODULE.getSessions();

        const methods =
            new Set();

        const list =
            Array.isArray(sessions)
            ? sessions
            : Object.values(
                sessions || {}
            );

        for(
            let index = 0;
            index < list.length;
            index += 1
        ){

            const session =
                list[index];

            const nsMethods =
                session?.namespaces?.stellar?.methods ||
                [];

            for(
                let m = 0;
                m < nsMethods.length;
                m += 1
            ){

                methods.add(
                    String(
                        nsMethods[m]
                    )
                );

            }

        }

        return Array.from(
            methods
        );

    }
    catch(error){

        return [];

    }

}


function isLocalTestHost(){

    const host =
        String(
            window.location?.hostname || ""
        );

    return host === "localhost" ||
        host === "127.0.0.1";

}


function formatSignMessageUnsupportedError(
    moduleId,
    methods
){

    const methodList =
        Array.isArray(methods) &&
        methods.length
        ? methods.join(", ")
        : "(none read from session)";

    return [
        "LOBSTR via WalletConnect does not support stellar_signMessage.",
        "The wallet returned: missing/invalid request method stellar_signMessage.",
        "Negotiated WalletConnect methods: " + methodList + ".",
        "HAVKAR will use stellar_signXDR with a no-payment challenge (manageData) and will not submit it.",
        "Alternatives: Freighter Mobile via WalletConnect (if it negotiates stellar_signMessage), or LOBSTR browser extension on desktop for SEP-43 signMessage.",
        "Connected address, balance, and history are unaffected. Module: " +
            (moduleId || "wallet_connect") + "."
    ].join(" ");

}


async function buildStellarWalletChallengeTransaction(
    options
){

    const opts =
        options && typeof options === "object"
        ? options
        : {};

    const network =
        currentNetwork();

    const address =
        String(
            HAVKAR_STELLAR.address || ""
        ).trim();

    if(
        !isPublicKey(address)
    ){

        throw new Error(
            "Connect a valid Stellar public key before the challenge."
        );

    }

    const nonce =
        String(
            opts.nonce ||
            challengeNonce()
        ).replace(
            /[^a-zA-Z0-9_-]/g,
            ""
        ).slice(0, 28) || "havkar";

    const valueBytes =
        new TextEncoder().encode(
            nonce
        );

    let sourceAccount;

    if(
        opts.account instanceof Account
    ){

        sourceAccount =
            opts.account;

    }
    else if(
        isLocalTestHost() &&
        opts.sequence != null
    ){

        sourceAccount =
            new Account(
                address,
                String(
                    opts.sequence
                )
            );

    }
    else{

        const server =
            horizonServer(
                network
            );

        sourceAccount =
            await server.loadAccount(
                address
            );

    }

    const fee =
        String(
            opts.fee ||
            "100"
        );

    const now =
        Math.floor(
            Date.now() / 1000
        );

    const built =
        new TransactionBuilder(
            sourceAccount,
            {

                fee:fee,

                networkPassphrase:
                    network.passphrase,

                timebounds:{
                    minTime:0,
                    maxTime:now + 300
                }

            }
        )
        .addOperation(
            Operation.manageData({
                name:"havkar_chal",
                value:valueBytes
            })
        )
        .addMemo(
            Memo.text(
                "HAVKAR no-XLM challenge"
            )
        )
        .build();


    const operations =
        built.operations || [];

    for(
        let index = 0;
        index < operations.length;
        index += 1
    ){

        const op =
            operations[index];

        if(
            op.type === "payment" ||
            op.type === "pathPaymentStrictReceive" ||
            op.type === "pathPaymentStrictSend" ||
            op.type === "createAccount" ||
            op.type === "accountMerge"
        ){

            throw new Error(
                "Refusing to build a challenge that contains a financial operation."
            );

        }

    }


    return {

        unsignedXdr:built.toXDR(),

        hash:bytesToHex(
            built.hash()
        ),

        network:network,

        address:address,

        nonce:nonce,

        memo:"HAVKAR no-XLM challenge",

        operation:"manageData:havkar_chal",

        fee:fee,

        sequence:String(
            built.sequence
        )

    };

}


function assertChallengeSignedXdr(
    signedXdr,
    prepared
){

    const signed =
        TransactionBuilder.fromXDR(
            signedXdr,
            prepared.network.passphrase
        );

    if(
        signed.source !== prepared.address
    ){

        throw new Error(
            "Challenge signer source does not match the connected public key."
        );

    }

    if(
        bytesToHex(
            signed.hash()
        ) !== prepared.hash
    ){

        throw new Error(
            "Signed challenge XDR hash does not match the unsigned challenge."
        );

    }

    const operations =
        signed.operations || [];

    if(
        operations.length !== 1 ||
        operations[0].type !== "manageData" ||
        operations[0].name !== "havkar_chal"
    ){

        throw new Error(
            "Signed challenge must be exactly one manageData(havkar_chal) operation."
        );

    }

    for(
        let index = 0;
        index < operations.length;
        index += 1
    ){

        const op =
            operations[index];

        if(
            op.type === "payment" ||
            op.type === "pathPaymentStrictReceive" ||
            op.type === "pathPaymentStrictSend" ||
            op.type === "createAccount" ||
            op.type === "accountMerge"
        ){

            throw new Error(
                "Signed challenge contains a financial operation; refusing result."
            );

        }

    }

    if(
        !signed.signatures ||
        signed.signatures.length < 1
    ){

        throw new Error(
            "The wallet did not attach a signature to the challenge XDR."
        );

    }

    const keypair =
        Keypair.fromPublicKey(
            prepared.address
        );

    const hash =
        signed.hash();

    let verified =
        false;

    let signatureB64 =
        "";

    for(
        let index = 0;
        index < signed.signatures.length;
        index += 1
    ){

        const decorated =
            signed.signatures[index];

        const rawSignature =
            typeof decorated.signature ===
            "function"
            ? decorated.signature()
            : decorated.signature;

        const signatureBytes =
            rawSignature?.value instanceof Uint8Array
            ? rawSignature.value
            : rawSignature instanceof Uint8Array
            ? rawSignature
            : null;

        if(
            !signatureBytes
        ){

            continue;

        }

        if(
            keypair.verify(
                hash,
                signatureBytes
            )
        ){

            verified =
                true;

            signatureB64 =
                typeof btoa === "function"
                ? btoa(
                    String.fromCharCode.apply(
                        null,
                        Array.from(
                            signatureBytes
                        )
                    )
                )
                : Buffer.from(
                    signatureBytes
                ).toString(
                    "base64"
                );

            break;

        }

    }

    if(
        !verified
    ){

        throw new Error(
            "Challenge XDR signature does not verify for the connected public key."
        );

    }

    return {
        signature:signatureB64,
        signedTxXdr:signedXdr
    };

}


async function verifyChallengeViaSignMessage(
    message,
    network
){

    const testSigner =
        globalThis.HAVKAR_STELLAR_TEST_SIGN_MESSAGE;

    let result;

    if(
        typeof testSigner === "function" &&
        isLocalTestHost()
    ){

        result =
            await testSigner(
                message,
                network
            );

    }
    else{

        result =
            await StellarWalletsKit.signMessage(
                message,
                {

                    networkPassphrase:
                        network.passphrase,

                    address:HAVKAR_STELLAR.address

                }
            );

    }

    const signature =
        String(
            result?.signedMessage ||
            result?.signature ||
            ""
        ).trim();

    if(
        !signature
    ){

        throw new Error(
            "The wallet did not return a challenge signature. Nothing was submitted to the network."
        );

    }

    return {

        kind:"challenge_message",

        method:WC_METHOD_SIGN_MESSAGE,

        message:message,

        signature:signature,

        signerAddress:String(
            result?.signerAddress ||
            HAVKAR_STELLAR.address ||
            ""
        ).trim() || null,

        signedTxXdr:null,

        note:"SEP-43/53 message signature only. No XLM moved and no Horizon submit."

    };

}


async function verifyChallengeViaSignXdr(
    options
){

    const prepared =
        await buildStellarWalletChallengeTransaction(
            options
        );

    const testSigner =
        globalThis.HAVKAR_STELLAR_TEST_SIGN_TRANSACTION;

    let signedXdr =
        "";

    if(
        typeof testSigner === "function" &&
        isLocalTestHost()
    ){

        const signed =
            await testSigner(
                prepared.unsignedXdr,
                prepared
            );

        signedXdr =
            String(
                signed?.signedTxXdr ||
                signed ||
                ""
            ).trim();

    }
    else{

        const signed =
            await StellarWalletsKit.signTransaction(
                prepared.unsignedXdr,
                {

                    networkPassphrase:
                        prepared.network.passphrase,

                    address:prepared.address

                }
            );

        signedXdr =
            String(
                signed?.signedTxXdr ||
                ""
            ).trim();

    }

    if(
        !signedXdr
    ){

        throw new Error(
            "The wallet did not return a signed challenge XDR. Nothing was submitted."
        );

    }

    const verified =
        assertChallengeSignedXdr(
            signedXdr,
            prepared
        );

    return {

        kind:"challenge_xdr",

        method:WC_METHOD_SIGN_XDR,

        message:
            "manageData havkar_chal nonce=" +
            prepared.nonce +
            " memo=" +
            prepared.memo,

        signature:verified.signature,

        signerAddress:prepared.address,

        signedTxXdr:verified.signedTxXdr,

        hash:prepared.hash,

        note:"WalletConnect stellar_signXDR challenge: one manageData op, verified locally, NEVER submitted to Horizon. No payment op. No XLM moved."

    };

}


async function havkarVerifyStellarWalletChallenge(
    options
){

    const opts =
        options && typeof options === "object"
        ? options
        : {};

    if(
        !havkarIsStellarConnected()
    ){

        throw new Error(
            "Connect a Stellar wallet before running the signature challenge."
        );

    }

    const moduleId =
        selectedStellarModuleId();

    const network =
        currentNetwork();

    const message =
        String(
            opts.message ||
            buildStellarWalletChallengeMessage()
        );


    if(
        moduleId === "albedo"
    ){

        throw new Error(
            "Albedo does not support HAVKAR’s no-transfer challenge. Use LOBSTR WalletConnect (stellar_signXDR challenge) or Freighter / LOBSTR extension signMessage."
        );

    }


    const listWcMethods =
        typeof window.havkarListWalletConnectMethods ===
        "function"
        ? window.havkarListWalletConnectMethods
        : havkarListWalletConnectMethods;

    const wcMethods =
        moduleId === "wallet_connect"
        ? await listWcMethods()
        : [];

    const wcHasMessage =
        wcMethods.includes(
            WC_METHOD_SIGN_MESSAGE
        );

    let detail;


    try{

        if(
            moduleId === "wallet_connect"
        ){

            if(
                wcHasMessage &&
                opts.forceXdr !== true
            ){

                detail =
                    await verifyChallengeViaSignMessage(
                        message,
                        network
                    );

            }
            else{

                /* LOBSTR Android path: required WC method is stellar_signXDR only. */
                detail =
                    await verifyChallengeViaSignXdr(
                        opts
                    );

            }

        }
        else if(
            moduleId === "lobstr" ||
            moduleId === "freighter"
        ){

            detail =
                await verifyChallengeViaSignMessage(
                    message,
                    network
                );

        }
        else if(
            typeof StellarWalletsKit.signMessage ===
            "function"
        ){

            detail =
                await verifyChallengeViaSignMessage(
                    message,
                    network
                );

        }
        else{

            throw new Error(
                "This wallet module cannot run HAVKAR’s no-transfer challenge."
            );

        }

    }
    catch(error){

        const raw =
            safeErrorMessage(
                error
            );

        if(
            /stellar_signMessage|signMessage|Saknad eller ogiltig|Missing or invalid request/i
                .test(raw)
        ){

            if(
                moduleId === "wallet_connect"
            ){

                /* Auto-fallback once to the real LOBSTR-supported method. */
                detail =
                    await verifyChallengeViaSignXdr(
                        opts
                    );

            }
            else{

                throw new Error(
                    formatSignMessageUnsupportedError(
                        moduleId,
                        wcMethods
                    ) +
                    " Original wallet error: " +
                    raw
                );

            }

        }
        else{

            throw error instanceof Error
                ? error
                : new Error(
                    raw
                );

        }

    }


    return {

        ok:true,

        kind:detail.kind || "challenge",

        transferred:false,

        submitted:false,

        moduleId:moduleId || null,

        method:detail.method || null,

        network:network.id,

        label:network.label,

        address:HAVKAR_STELLAR.address,

        signerAddress:detail.signerAddress || null,

        message:detail.message || message,

        signature:detail.signature,

        signedTxXdr:detail.signedTxXdr || null,

        hash:detail.hash || null,

        walletConnectMethods:wcMethods,

        note:detail.note

    };

}


window.havkarClassifyStellarAddress =
    classifyStellarAddress;

window.havkarListPreferredStellarWallets =
    havkarListPreferredStellarWallets;

window.havkarSelectedStellarModuleId =
    selectedStellarModuleId;

window.havkarStellarExplorerTxUrl =
    havkarStellarExplorerTxUrl;

window.havkarVerifyStellarWalletChallenge =
    havkarVerifyStellarWalletChallenge;

window.havkarListWalletConnectMethods =
    havkarListWalletConnectMethods;

window.havkarBuildStellarWalletChallengeTransaction =
    buildStellarWalletChallengeTransaction;

window.havkarPrepareStellarPayment =
    havkarPrepareStellarPayment;

window.havkarFindRecentSuccessfulDuplicate =
    async function(options){

        try{

            const request =
                readUnsignedPaymentRequest(
                    options
                );

            const network =
                currentNetwork();

            return await findAnyRecentDuplicate(
                horizonServer(network),
                request
            );

        }
        catch(error){

            try{

                return findRecentSuccessfulDuplicate(
                    readUnsignedPaymentRequest(
                        options
                    )
                );

            }
            catch(inner){

                return null;

            }

        }

    };

window.havkarFindPaymentDuplicateNotice =
    async function(options){

        try{

            const request =
                readUnsignedPaymentRequest(
                    options
                );

            const network =
                currentNetwork();

            return await findPaymentDuplicateNotice(
                horizonServer(network),
                request
            );

        }
        catch(error){

            return null;

        }

    };

window.havkarRecentSuccessGuardMs =
    RECENT_SUCCESS_GUARD_MS;

window.havkarReviewMatchLookbackMs =
    REVIEW_MATCH_LOOKBACK_MS;

window.havkarAcquirePaymentLock =
    acquirePaymentLock;

window.havkarReleasePaymentLock =
    releasePaymentLock;

window.havkarReadPendingPayment =
    readPendingPayment;

window.havkarWritePendingPayment =
    writePendingPayment;

window.havkarClearPendingPayment =
    clearPendingPayment;

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

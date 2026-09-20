import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";

import {
    defaultModules
} from "@creit.tech/stellar-wallets-kit/modules/utils";

import {
    WalletConnectModule,
    WalletConnectTargetChain
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";


/* =========================================================
   HAVKAR STELLAR STATE
   ========================================================= */

const HAVKAR_STELLAR = {

    network: "PUBLIC",

    connected: false,

    address: null

};

window.HAVKAR_STELLAR =
    HAVKAR_STELLAR;


/* =========================================================
   STELLAR WALLET KIT
   ========================================================= */

StellarWalletsKit.init({

    modules: [

        ...defaultModules(),

        new WalletConnectModule({

            projectId:
                "8c21324f756127dbb906a072cc18f7e6",

            metadata: {

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
                WalletConnectTargetChain.PUBLIC
            ]

        })

    ]

});


/* =========================================================
   CONNECT STELLAR WALLET
   ========================================================= */

async function havkarConnectStellarWallet(){

    try{

        /*
         * Stellar Wallets Kit v2:
         * authModal() opens the official wallet selector
         * and returns the connected Stellar address.
         */

        const result =
            await StellarWalletsKit.authModal({

                showInstallLabel:true,

                hideUnsupportedWallets:false

            });


        const address =
            result?.address || null;


        if(!address){

            throw new Error(
                "No Stellar wallet address returned."
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


        console.error(
            "HAVKAR Stellar wallet connection failed:",
            error
        );


        window.dispatchEvent(

            new CustomEvent(
                "havkar-stellar-error",
                {

                    detail:{
                        message:
                            error?.message ||
                            "Stellar wallet connection failed."
                    }

                }
            )

        );


        throw error;

    }

}


/* =========================================================
   DISCONNECT STELLAR WALLET
   ========================================================= */

async function havkarDisconnectStellarWallet(){

    try{

        /*
         * Some Stellar wallet modules expose disconnect()
         * while others do not.
         */

        if(
            typeof StellarWalletsKit.disconnect ===
            "function"
        ){

            await StellarWalletsKit.disconnect();

        }

    }
    catch(error){

        console.warn(
            "HAVKAR Stellar wallet disconnect:",
            error
        );

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
   GET CURRENT STELLAR ADDRESS
   ========================================================= */

function havkarGetStellarAddress(){

    return HAVKAR_STELLAR.address;

}


/* =========================================================
   CHECK CONNECTION
   ========================================================= */

function havkarIsStellarConnected(){

    return (
        HAVKAR_STELLAR.connected === true &&
        typeof HAVKAR_STELLAR.address === "string" &&
        HAVKAR_STELLAR.address.length > 0
    );

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


/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(

    new CustomEvent(
        "havkar-stellar-ready"
    )

);

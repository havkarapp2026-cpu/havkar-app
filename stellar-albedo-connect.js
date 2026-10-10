/*
 * Albedo connection bridge for Android browsers.
 * The confirm page draws the approval form only after it receives
 * the intent. Android Chrome often leaves window.opener null, so
 * Albedo's handshake never reaches HAVKAR and the form stays blank.
 * This file delivers that intent through the window handle returned
 * by window.open, and checks the signed public-key proof.
 * It never asks for a secret, seed, or recovery phrase.
 */

import {
    Keypair,
    StrKey,
    hash
} from "@stellar/stellar-sdk";


const ALBEDO_CONFIRM_URL =
    "https://albedo.link/confirm";

const ALBEDO_WINDOW_NAME =
    "auth.albedo.link";

const ALBEDO_ORIGIN =
    "https://albedo.link";

const ALBEDO_PROTOCOL =
    3;

const ALBEDO_CONNECT_CHANNEL =
    "havkar-albedo-connect";

const ALBEDO_CONNECT_RETRY_MS =
    [800, 2000, 4000, 7000, 12000];

const ALBEDO_CALLBACK_PATH =
    "/api/albedo-connect-return";

const ALBEDO_RETURN_PAGE =
    "/albedo-return.html";


function clean(value){

    return String(
        value == null ? "" : value
    ).trim();

}


function isAndroidBrowser(userAgent){

    return /Android/i.test(
        clean(userAgent)
    );

}


function isAlbedoConfirmCall(url, target){

    return target === ALBEDO_WINDOW_NAME &&
        clean(url).indexOf(ALBEDO_CONFIRM_URL) === 0;

}


function isAlbedoHandshake(event){

    return Boolean(
        event &&
        event.origin === ALBEDO_ORIGIN &&
        event.data &&
        event.data.albedo
    );

}


function albedoCallbackValue(origin){

    const url =
        new URL(origin);

    const local =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1";


    if(
        url.protocol !== "https:" &&
        !local
    ){

        throw new Error(
            "Albedo callback requires https."
        );

    }


    return "url:" + url.origin + ALBEDO_CALLBACK_PATH;

}


function bytesFromHex(value){

    const hex =
        clean(value);

    if(
        hex.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(hex)
    ){

        return null;

    }


    const bytes =
        new Uint8Array(hex.length / 2);

    for(
        let index = 0;
        index < bytes.length;
        index += 1
    ){

        bytes[index] =
            parseInt(
                hex.slice(index * 2, index * 2 + 2),
                16
            );

    }


    return bytes;

}


function verifyAlbedoPublicKeyProof(proof){

    const pubkey =
        clean(proof && proof.pubkey);

    const token =
        clean(proof && proof.token);

    const signedMessage =
        clean(proof && proof.signed_message);

    const signature =
        bytesFromHex(
            proof && proof.signature
        );


    if(!StrKey.isValidEd25519PublicKey(pubkey)){

        return false;

    }


    if(!/^[0-9a-z]{4,64}$/.test(token)){

        return false;

    }


    if(signedMessage !== pubkey + ":" + token){

        return false;

    }


    if(!signature || signature.length !== 64){

        return false;

    }


    try{

        return Keypair
            .fromPublicKey(pubkey)
            .verify(
                hash(new TextEncoder().encode(signedMessage)),
                signature
            );

    }
    catch(error){

        return false;

    }

}


function albedoFields(input){

    const source =
        input && typeof input === "object"
        ? input
        : Object.fromEntries(
            new URLSearchParams(clean(input))
        );

    return {
        pubkey:clean(source.pubkey),
        signed_message:clean(
            source.signed_message
        ),
        signature:clean(source.signature),
        reqid:clean(
            source.__reqid || source.reqid
        )
    };

}


function albedoReturnQuery(input){

    const fields =
        albedoFields(input);


    if(!StrKey.isValidEd25519PublicKey(fields.pubkey)){

        return null;

    }


    if(
        fields.signed_message.length < 58 ||
        fields.signed_message.length > 180 ||
        fields.signature.length !== 128 ||
        fields.reqid.length > 80
    ){

        return null;

    }


    if(!/^[0-9a-fA-F]+$/.test(fields.signature)){

        return null;

    }


    const params =
        new URLSearchParams({
            pubkey:fields.pubkey,
            signed_message:fields.signed_message,
            signature:fields.signature,
            reqid:fields.reqid
        });

    return ALBEDO_RETURN_PAGE + "?" + params.toString();

}


function createAlbedoConnectOpen(
    originalOpen,
    options
){

    const schedule =
        options.schedule;

    const clearSchedule =
        options.clearSchedule;

    const retryDelays =
        options.retryDelays ||
        ALBEDO_CONNECT_RETRY_MS;


    return function openAlbedoConnectWindow(
        url,
        target,
        features
    ){

        const popup =
            originalOpen(
                url,
                target,
                features
            );


        if(
            !isAlbedoConfirmCall(url, target) ||
            !popup ||
            typeof popup.postMessage !== "function"
        ){

            return popup;

        }


        const nativePost =
            popup.postMessage.bind(popup);

        let handshakeSeen =
            false;

        let payload =
            null;

        let attempt =
            0;

        let timer =
            schedule(
                startIfNeeded,
                retryDelays[0]
            );


        function stopTimer(){

            if(timer != null){

                clearSchedule(timer);
                timer = null;

            }

        }


        function startIfNeeded(){

            timer = null;

            if(
                !handshakeSeen &&
                typeof options.dispatchHandshake === "function"
            ){

                options.dispatchHandshake();

            }

        }


        options.listen(
            function(event){

                if(!isAlbedoHandshake(event)){

                    return;

                }


                handshakeSeen = true;

                if(!payload){

                    stopTimer();

                }

            }
        );


        function send(){

            if(!payload || popup.closed){

                stopTimer();
                return;

            }


            nativePost(
                payload.message,
                payload.origin
            );

            attempt += 1;

            if(
                handshakeSeen ||
                attempt >= retryDelays.length
            ){

                stopTimer();
                return;

            }


            timer =
                schedule(
                    send,
                    retryDelays[attempt] -
                        retryDelays[attempt - 1]
                );

        }


        const proxy =
            new Proxy(
                popup,
                {

                    get(object, property, receiver){

                        if(property === "postMessage"){

                            return function postAlbedoIntent(
                                message,
                                origin
                            ){

                                payload = {
                                    message:message,
                                    origin:origin || "*"
                                };

                                stopTimer();
                                attempt = 0;
                                send();

                            };

                        }


                        const value =
                            Reflect.get(
                                object,
                                property,
                                receiver
                            );

                        return typeof value === "function"
                            ? value.bind(object)
                            : value;

                    }

                }
            );


        if(typeof options.onPopup === "function"){

            options.onPopup(popup);

        }


        return proxy;

    };

}


function raceAlbedoPublicKey(options){

    const token =
        options.token;

    const popup =
        options.popup || null;

    const schedule =
        options.schedule;

    const clearSchedule =
        options.clearSchedule;

    const repeat =
        options.interval;

    const clearRepeat =
        options.clearInterval;


    return new Promise(
        function(resolve, reject){

            let settled =
                false;

            let closeTimer =
                null;

            const timer =
                schedule(
                    function(){

                        finish(
                            new Error(
                                "Albedo did not return a public key."
                            )
                        );

                    },
                    options.timeoutMs
                );

            const closedTimer =
                popup && repeat
                ? repeat(
                    function(){

                        if(
                            popup.closed &&
                            closeTimer == null
                        ){

                            closeTimer =
                                schedule(
                                    function(){

                                        finish(
                                            new Error(
                                                "The Albedo window went away before a public key was returned."
                                            )
                                        );

                                    },
                                    options.closeGraceMs || 5000
                                );

                        }

                    },
                    700
                )
                : null;


            function cleanup(){

                clearSchedule(timer);

                if(closeTimer != null){

                    clearSchedule(closeTimer);

                }


                if(closedTimer != null){

                    clearRepeat(closedTimer);

                }


                if(typeof options.closeChannel === "function"){

                    options.closeChannel();

                }

            }


            function finish(error, value){

                if(settled){

                    return;

                }


                settled = true;
                cleanup();

                if(error){

                    reject(error);
                    return;

                }


                resolve(value);

            }


            options.listen(
                function(data){

                    const proof =
                        data || {};

                    if(
                        verifyAlbedoPublicKeyProof({
                            pubkey:proof.pubkey,
                            signed_message:proof.signed_message,
                            signature:proof.signature,
                            token:token
                        })
                    ){

                        finish(
                            null,
                            proof.pubkey
                        );

                    }

                }
            );


            Promise.resolve(options.pending)
                .then(

                    function(result){

                        const proof =
                            result || {};

                        if(
                            verifyAlbedoPublicKeyProof({
                                pubkey:proof.pubkey,
                                signed_message:proof.signed_message,
                                signature:proof.signature,
                                token:token
                            })
                        ){

                            finish(
                                null,
                                proof.pubkey
                            );

                            return;

                        }


                        finish(
                            new Error(
                                "Albedo returned a public key that did not match this connection request."
                            )
                        );

                    },

                    function(error){

                        const message =
                            error && error.message
                            ? String(error.message)
                            : "The wallet did not approve this request.";

                        finish(
                            error instanceof Error
                            ? error
                            : new Error(message)
                        );

                    }

                );

        }
    );

}


export {
    ALBEDO_CALLBACK_PATH,
    ALBEDO_CONFIRM_URL,
    ALBEDO_CONNECT_CHANNEL,
    ALBEDO_CONNECT_RETRY_MS,
    ALBEDO_ORIGIN,
    ALBEDO_PROTOCOL,
    ALBEDO_RETURN_PAGE,
    ALBEDO_WINDOW_NAME,
    albedoCallbackValue,
    albedoFields,
    albedoReturnQuery,
    createAlbedoConnectOpen,
    isAlbedoConfirmCall,
    isAlbedoHandshake,
    isAndroidBrowser,
    raceAlbedoPublicKey,
    verifyAlbedoPublicKeyProof
};

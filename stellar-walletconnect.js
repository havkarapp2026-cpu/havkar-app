/*
 * WalletConnect relay errors for the HAVKAR wallet.
 * The project id stays the one already configured. This file never
 * creates a session, a signature, or a payment.
 */

const WALLETCONNECT_RELAY_HOST =
    "relay.walletconnect.org";

const WALLETCONNECT_ORIGIN_MESSAGE =
    "WalletConnect blocked this website. The relay returned code 3000, origin not allowed. No payment was sent.";

const WALLETCONNECT_PUBLISH_MESSAGE =
    "WalletConnect could not publish the connection request. No payment was sent.";


function walletConnectRelayMessage(input){

    const details =
        input && typeof input === "object"
        ? input
        : { message:input };

    const text =
        String(
            details.message ||
            details.reason ||
            ""
        );


    if(
        details.code === 3000 ||
        /origin not allowed/i.test(text)
    ){

        return WALLETCONNECT_ORIGIN_MESSAGE;

    }


    if(/Failed to publish custom payload/i.test(text)){

        return WALLETCONNECT_PUBLISH_MESSAGE;

    }


    return "";

}


function observeWalletConnectRelay(nativeWebSocket){

    let rejectRelay =
        function(){};

    const rejected =
        new Promise(
            function(_resolve, reject){

                rejectRelay = reject;

            }
        );

    let reported =
        false;


    function report(details){

        if(reported){

            return;

        }


        const message =
            walletConnectRelayMessage(details);

        if(!message){

            return;

        }


        reported = true;

        rejectRelay(
            new Error(message)
        );

    }


    function RelaySocket(url, protocols){

        const socket =
            arguments.length < 2
            ? new nativeWebSocket(url)
            : new nativeWebSocket(url, protocols);


        if(
            String(url).indexOf(WALLETCONNECT_RELAY_HOST) === -1
        ){

            return socket;

        }


        socket.addEventListener(
            "message",
            function(event){

                report({
                    message:String(
                        event && event.data || ""
                    )
                });

            }
        );

        socket.addEventListener(
            "close",
            function(event){

                report({
                    code:event && event.code,
                    message:event && event.reason
                });

            }
        );


        return socket;

    }


    RelaySocket.prototype =
        nativeWebSocket.prototype;

    RelaySocket.CONNECTING =
        nativeWebSocket.CONNECTING;

    RelaySocket.OPEN =
        nativeWebSocket.OPEN;

    RelaySocket.CLOSING =
        nativeWebSocket.CLOSING;

    RelaySocket.CLOSED =
        nativeWebSocket.CLOSED;


    rejected.catch(
        function(){}
    );


    return {
        Socket:RelaySocket,
        rejected:rejected
    };

}


export {
    WALLETCONNECT_ORIGIN_MESSAGE,
    WALLETCONNECT_PUBLISH_MESSAGE,
    WALLETCONNECT_RELAY_HOST,
    observeWalletConnectRelay,
    walletConnectRelayMessage
};

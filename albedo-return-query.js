/*
 * Builds the same-origin return path for an Albedo public-key proof.
 * This file has no Stellar SDK import so the return endpoint stays small.
 * It does not verify a signature and it never handles a secret.
 */

const ALBEDO_RETURN_PAGE =
    "/albedo-return.html";


function clean(value){

    return String(
        value == null ? "" : value
    ).trim();

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


    if(!/^G[A-Z2-7]{55}$/.test(fields.pubkey)){

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


export {
    ALBEDO_RETURN_PAGE,
    albedoFields,
    albedoReturnQuery
};

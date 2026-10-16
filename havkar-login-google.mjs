export async function googleSignInAvailability(url, publishableKey, fetchImpl) {
    const request = fetchImpl || fetch;

    if (!url || !publishableKey) {
        return "unavailable";
    }

    let response;

    try {
        response = await request(
            String(url).replace(/\/$/, "") + "/auth/v1/settings",
            {
                headers: {
                    apikey: publishableKey,
                    Authorization: "Bearer " + publishableKey
                }
            }
        );
    } catch (error) {
        return "unknown";
    }

    if (!response || !response.ok) {
        return "unknown";
    }

    let settings;

    try {
        settings = await response.json();
    } catch (error) {
        return "unknown";
    }

    const google = settings && settings.external
        ? settings.external.google
        : undefined;

    if (google === true) {
        return "enabled";
    }

    if (google === false) {
        return "disabled";
    }

    return "unknown";
}

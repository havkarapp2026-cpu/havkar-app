export default async function handler(req, res) {
    // =========================================================
    // HAVKAR GLOBAL FLIGHT SEARCH API
    // Provider: Duffel
    //
    // Supports:
    // - Global airport / city IATA codes
    // - One Way
    // - Round Trip
    // - Adults
    // - Children with real ages
    // - Infants with real ages
    // - Economy
    // - Premium Economy
    // - Business
    // - First
    //
    // IMPORTANT:
    // Duffel secret token stays SERVER-SIDE only.
    // =========================================================

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    // =========================================================
    // CORS PREFLIGHT
    // =========================================================

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // =========================================================
    // METHOD
    // =========================================================

    if (req.method !== "POST") {
        return res.status(405).json({
            ok: false,
            error: "Method not allowed"
        });
    }

    // =========================================================
    // DUFFEL TOKEN
    // =========================================================

    const token =
        process.env.DUFFEL_ACCESS_TOKEN;

    if (!token) {
        return res.status(500).json({
            ok: false,
            error:
                "DUFFEL_ACCESS_TOKEN is not configured."
        });
    }

    try {
        // =====================================================
        // BODY
        // =====================================================

        const body =
            req.body &&
            typeof req.body === "object"
                ? req.body
                : {};

        const {
            origin,
            destination,
            departure_date,
            return_date = null,

            // New professional passenger format
            adults,
            child_ages,
            infant_ages,

            // Backward compatibility with current tickets.html
            passengers,

            cabin_class = "economy"
        } = body;

        // =====================================================
        // NORMALIZE ROUTE
        // =====================================================

        const cleanOrigin =
            String(origin || "")
                .trim()
                .toUpperCase();

        const cleanDestination =
            String(destination || "")
                .trim()
                .toUpperCase();

        // Airport IATA or metropolitan/city IATA.
        // Both use standard 3-letter codes.
        const iataPattern =
            /^[A-Z]{3}$/;

        if (!iataPattern.test(cleanOrigin)) {
            return res.status(400).json({
                ok: false,
                error:
                    "Origin must be a valid 3-letter IATA airport or city code."
            });
        }

        if (!iataPattern.test(cleanDestination)) {
            return res.status(400).json({
                ok: false,
                error:
                    "Destination must be a valid 3-letter IATA airport or city code."
            });
        }

        if (
            cleanOrigin ===
            cleanDestination
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "Origin and destination must be different."
            });
        }

        // =====================================================
        // DATE HELPERS
        // =====================================================

        const datePattern =
            /^\d{4}-\d{2}-\d{2}$/;

        function isValidCalendarDate(value) {
            if (
                typeof value !== "string" ||
                !datePattern.test(value)
            ) {
                return false;
            }

            const parts =
                value.split("-");

            const year =
                Number(parts[0]);

            const month =
                Number(parts[1]);

            const day =
                Number(parts[2]);

            const date =
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
                );

            return (
                date.getUTCFullYear() === year &&
                date.getUTCMonth() === month - 1 &&
                date.getUTCDate() === day
            );
        }

        function todayUtcDateString() {
            const now =
                new Date();

            const year =
                now.getUTCFullYear();

            const month =
                String(
                    now.getUTCMonth() + 1
                ).padStart(2, "0");

            const day =
                String(
                    now.getUTCDate()
                ).padStart(2, "0");

            return `${year}-${month}-${day}`;
        }

        // =====================================================
        // DEPARTURE DATE
        // =====================================================

        const departureDate =
            String(
                departure_date || ""
            ).trim();

        if (
            !isValidCalendarDate(
                departureDate
            )
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "A valid departure_date is required in YYYY-MM-DD format."
            });
        }

        const today =
            todayUtcDateString();

        if (departureDate < today) {
            return res.status(400).json({
                ok: false,
                error:
                    "Departure date cannot be in the past."
            });
        }

        // =====================================================
        // RETURN DATE
        // =====================================================

        let returnDate = null;

        if (
            return_date !== undefined &&
            return_date !== null &&
            String(return_date).trim() !== ""
        ) {
            returnDate =
                String(
                    return_date
                ).trim();

            if (
                !isValidCalendarDate(
                    returnDate
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "return_date must be a valid date in YYYY-MM-DD format."
                });
            }

            if (
                returnDate <
                departureDate
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Return date cannot be before departure date."
                });
            }
        }

        // =====================================================
        // CABIN CLASS
        // =====================================================

        const allowedCabins = [
            "economy",
            "premium_economy",
            "business",
            "first"
        ];

        const cabinClass =
            String(
                cabin_class ||
                "economy"
            )
                .trim()
                .toLowerCase();

        if (
            !allowedCabins.includes(
                cabinClass
            )
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "Invalid cabin class."
            });
        }

        // =====================================================
        // PASSENGER HELPERS
        // =====================================================

        function integerOrNull(value) {
            if (
                value === "" ||
                value === null ||
                value === undefined
            ) {
                return null;
            }

            const number =
                Number(value);

            if (
                !Number.isFinite(number) ||
                !Number.isInteger(number)
            ) {
                return null;
            }

            return number;
        }

        function normalizeAgeArray(
            value,
            label
        ) {
            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                return [];
            }

            const source =
                Array.isArray(value)
                    ? value
                    : [value];

            const result = [];

            for (
                let index = 0;
                index < source.length;
                index += 1
            ) {
                const age =
                    integerOrNull(
                        source[index]
                    );

                if (
                    age === null ||
                    age < 0 ||
                    age > 17
                ) {
                    throw new Error(
                        `${label} age must be a whole number from 0 to 17.`
                    );
                }

                result.push(age);
            }

            return result;
        }

        // =====================================================
        // ADULTS
        //
        // Backward compatibility:
        // Current HAVKAR tickets.html still sends:
        // passengers: 1
        //
        // Until tickets.html is upgraded, that becomes adults.
        // =====================================================

        let adultCount;

        if (
            adults !== undefined &&
            adults !== null &&
            adults !== ""
        ) {
            adultCount =
                integerOrNull(adults);
        } else {
            adultCount =
                integerOrNull(
                    passengers
                );
        }

        if (adultCount === null) {
            adultCount = 1;
        }

        if (
            adultCount < 1 ||
            adultCount > 9
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "Adults must be between 1 and 9."
            });
        }

        // =====================================================
        // CHILD / INFANT AGES
        // =====================================================

        let childAges;
        let infantAges;

        try {
            childAges =
                normalizeAgeArray(
                    child_ages,
                    "Child"
                );

            infantAges =
                normalizeAgeArray(
                    infant_ages,
                    "Infant"
                );
        } catch (error) {
            return res.status(400).json({
                ok: false,
                error:
                    error?.message ||
                    "Invalid passenger age."
            });
        }

        // =====================================================
        // AGE VALIDATION
        //
        // HAVKAR UI convention:
        // Infant = 0-1
        // Child  = 2-17
        //
        // Duffel receives the actual age.
        // Airline ultimately determines fare/passenger category.
        // =====================================================

        for (
            const age of infantAges
        ) {
            if (
                age < 0 ||
                age > 1
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Infant age must be 0 or 1."
                });
            }
        }

        for (
            const age of childAges
        ) {
            if (
                age < 2 ||
                age > 17
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Child age must be between 2 and 17."
                });
            }
        }

        // =====================================================
        // TOTAL PASSENGERS
        // =====================================================

        const totalPassengers =
            adultCount +
            childAges.length +
            infantAges.length;

        if (
            totalPassengers < 1 ||
            totalPassengers > 9
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "Total passengers must be between 1 and 9."
            });
        }

        // =====================================================
        // BUILD DUFFEL PASSENGERS
        //
        // Adults:
        // { type: "adult" }
        //
        // Under 18:
        // { age: actualAge }
        //
        // Do NOT send age + type together.
        // =====================================================

        const duffelPassengers = [];

        for (
            let index = 0;
            index < adultCount;
            index += 1
        ) {
            duffelPassengers.push({
                type: "adult"
            });
        }

        for (
            const age of childAges
        ) {
            duffelPassengers.push({
                age
            });
        }

        for (
            const age of infantAges
        ) {
            duffelPassengers.push({
                age
            });
        }

        // =====================================================
        // BUILD SLICES
        //
        // One Way:
        // origin -> destination
        //
        // Round Trip:
        // origin -> destination
        // destination -> origin
        // =====================================================

        const slices = [
            {
                origin:
                    cleanOrigin,

                destination:
                    cleanDestination,

                departure_date:
                    departureDate
            }
        ];

        if (returnDate) {
            slices.push({
                origin:
                    cleanDestination,

                destination:
                    cleanOrigin,

                departure_date:
                    returnDate
            });
        }

        // =====================================================
        // DUFFEL REQUEST
        // =====================================================

        const duffelBody = {
            data: {
                slices,
                passengers:
                    duffelPassengers,
                cabin_class:
                    cabinClass
            }
        };

        // =====================================================
        // CALL DUFFEL
        //
        // return_offers=true:
        // offers returned directly with offer request.
        //
        // supplier_timeout=15000:
        // preserve current HAVKAR working behaviour.
        // =====================================================

        const duffelResponse =
            await fetch(
                "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000",
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Duffel-Version":
                            "v2",

                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            duffelBody
                        )
                }
            );

        // =====================================================
        // SAFE RESPONSE PARSING
        // =====================================================

        const rawResponse =
            await duffelResponse.text();

        let duffelPayload = null;

        if (rawResponse) {
            try {
                duffelPayload =
                    JSON.parse(
                        rawResponse
                    );
            } catch {
                duffelPayload = null;
            }
        }

        // =====================================================
        // DUFFEL ERROR
        // =====================================================

        if (!duffelResponse.ok) {
            const errors =
                Array.isArray(
                    duffelPayload?.errors
                )
                    ? duffelPayload.errors
                    : [];

            const firstError =
                errors[0] || {};

            const message =
                firstError?.message ||
                firstError?.title ||
                duffelPayload?.message ||
                "Duffel flight search failed.";

            return res
                .status(
                    duffelResponse.status
                )
                .json({
                    ok: false,

                    error:
                        String(message),

                    details:
                        errors.map(
                            error => ({
                                title:
                                    error?.title ||
                                    null,

                                message:
                                    error?.message ||
                                    null,

                                code:
                                    error?.code ||
                                    null,

                                field:
                                    error?.source?.field ||
                                    null
                            })
                        )
                });
        }

        // =====================================================
        // RESPONSE DATA
        // =====================================================

        const offerRequest =
            duffelPayload?.data;

        if (
            !offerRequest ||
            typeof offerRequest !== "object"
        ) {
            return res.status(502).json({
                ok: false,
                error:
                    "Duffel returned an invalid flight-search response."
            });
        }

        const offers =
            Array.isArray(
                offerRequest.offers
            )
                ? offerRequest.offers
                : [];

        // =====================================================
        // SUCCESS
        //
        // IMPORTANT:
        // "data" remains the raw Duffel Offer Request.
        //
        // This preserves compatibility with the current
        // tickets.html which reads:
        // payload.data.offers
        // =====================================================

        return res.status(200).json({
            ok: true,

            search: {
                trip_type:
                    returnDate
                        ? "round_trip"
                        : "one_way",

                origin:
                    cleanOrigin,

                destination:
                    cleanDestination,

                departure_date:
                    departureDate,

                return_date:
                    returnDate,

                cabin_class:
                    cabinClass,

                passengers: {
                    adults:
                        adultCount,

                    child_ages:
                        childAges,

                    infant_ages:
                        infantAges,

                    total:
                        totalPassengers
                },

                offers_found:
                    offers.length,

                live_mode:
                    offerRequest?.live_mode === true
            },

            data:
                offerRequest
        });

    } catch (error) {
        // =====================================================
        // SERVER / NETWORK ERROR
        // =====================================================

        console.error(
            "HAVKAR Duffel flight search error:",
            error
        );

        return res.status(500).json({
            ok: false,
            error:
                "Unable to complete the flight search."
        });
    }
                  }

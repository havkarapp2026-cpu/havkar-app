import { createClient } from "@supabase/supabase-js";

const SYMBOL_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
};

const ALLOWED_BODY_KEYS = new Set([
  "side",
  "symbol",
  "crypto_quantity",
]);

export const MAX_PRICE_AGE_SECONDS = 300;

const SAFE_TRADE_ERRORS = new Set([
  "Invalid user",
  "Invalid trade side",
  "Unsupported cryptocurrency",
  "Invalid crypto quantity",
  "Invalid execution price",
  "EUR amount is out of range",
  "EUR wallet not found",
  "Insufficient EUR balance",
  "Crypto wallet not found",
  "Insufficient cryptocurrency balance",
]);

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function isZeroDecimal(value) {
  return /^0+(?:\.0+)?$/.test(value);
}

function isPositiveBoundedDecimal(value) {
  const match = /^(0|[1-9]\d*)(\.\d+)?$/.exec(value);

  if (!match || isZeroDecimal(value)) {
    return false;
  }

  const fraction = match[2] ? match[2].slice(1) : "";

  return match[1].length <= 18 && fraction.length <= 18;
}

function roundDecimalString(value, scale) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);

  if (!match) {
    return null;
  }

  let whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] || "";

  if (fraction.length <= scale) {
    const trimmed = fraction.replace(/0+$/, "");

    return trimmed ? `${whole}.${trimmed}` : whole;
  }

  const nextDigit = fraction[scale];
  let digits = `${whole}${fraction.slice(0, scale)}`.split("");

  if (nextDigit >= "5") {
    let carry = 1;

    for (let index = digits.length - 1; index >= 0 && carry; index -= 1) {
      const sum = Number(digits[index]) + carry;

      digits[index] = String(sum % 10);
      carry = Math.floor(sum / 10);
    }

    if (carry) {
      digits.unshift("1");
    }
  }

  const joined = digits.join("");
  const wholeLength = joined.length - scale;
  const nextWhole = joined.slice(0, wholeLength).replace(/^0+(?=\d)/, "") || "0";
  const nextFraction = joined.slice(wholeLength).replace(/0+$/, "");

  return nextFraction ? `${nextWhole}.${nextFraction}` : nextWhole;
}

export function normalizeCryptoQuantity(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(text) || isZeroDecimal(text)) {
    return null;
  }

  return text;
}

export function validateTradeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid trade request" };
  }

  const keys = Object.keys(body);

  if (keys.some((key) => !ALLOWED_BODY_KEYS.has(key))) {
    return { error: "Invalid trade request" };
  }

  const side = String(body.side || "").trim().toLowerCase();

  if (side !== "buy" && side !== "sell") {
    return { error: "Invalid trade side" };
  }

  const symbol = String(body.symbol || "").trim().toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(SYMBOL_IDS, symbol)) {
    return { error: "Unsupported cryptocurrency" };
  }

  const cryptoQuantity = normalizeCryptoQuantity(body.crypto_quantity);

  if (!cryptoQuantity) {
    return { error: "Invalid crypto quantity" };
  }

  return {
    side,
    symbol,
    cryptoQuantity,
  };
}

export function parseAuthoritativeEurPrice(bodyText, coinId, nowMs = Date.now()) {
  if (typeof bodyText !== "string" || !bodyText.trim()) {
    throw new Error("PRICE_UNAVAILABLE");
  }

  let parsed;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("PRICE_UNAVAILABLE");
  }

  const row = parsed?.[coinId];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("PRICE_UNAVAILABLE");
  }

  const rawMatch = bodyText.match(
    new RegExp(
      `"${coinId}"\\s*:\\s*\\{[^}]*"eur"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`
    )
  );

  if (!rawMatch) {
    throw new Error("PRICE_INVALID");
  }

  const price = roundDecimalString(rawMatch[1], 18);

  if (!price || !isPositiveBoundedDecimal(price)) {
    throw new Error("PRICE_INVALID");
  }

  const updatedAt = row.last_updated_at;

  if (!Number.isInteger(updatedAt) || updatedAt <= 0) {
    throw new Error("PRICE_STALE");
  }

  const ageSeconds = Math.floor(nowMs / 1000) - updatedAt;

  if (ageSeconds < -60 || ageSeconds > MAX_PRICE_AGE_SECONDS) {
    throw new Error("PRICE_STALE");
  }

  return price;
}

export async function fetchAuthoritativeEurPrice(
  symbol,
  nowMs = Date.now(),
  fetchImpl = fetch
) {
  const coinId = SYMBOL_IDS[symbol];

  if (!coinId) {
    throw new Error("PRICE_UNAVAILABLE");
  }

  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    `?ids=${encodeURIComponent(coinId)}` +
    "&vs_currencies=eur" +
    "&include_last_updated_at=true";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "HavkarTrade/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("PRICE_UNAVAILABLE");
    }

    return parseAuthoritativeEurPrice(
      await response.text(),
      coinId,
      nowMs
    );
  } catch (error) {
    if (
      error?.message === "PRICE_STALE" ||
      error?.message === "PRICE_INVALID" ||
      error?.message === "PRICE_UNAVAILABLE"
    ) {
      throw error;
    }

    throw new Error("PRICE_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function priceErrorMessage(error) {
  if (error?.message === "PRICE_STALE") {
    return "Cryptocurrency price is stale";
  }

  if (error?.message === "PRICE_INVALID") {
    return "Cryptocurrency price is invalid";
  }

  return "Cryptocurrency price is unavailable";
}

function tradeErrorMessage(error) {
  const message = String(error?.message || error?.details || "");

  for (const known of SAFE_TRADE_ERRORS) {
    if (message.includes(known)) {
      return known;
    }
  }

  return "Trade failed";
}

async function authenticateUser(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return {
      user: null,
      error: "Authentication required",
    };
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    return {
      user: null,
      error: "Authentication required",
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data?.user) {
    return {
      user: null,
      error: "Invalid or expired session",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendError(res, 405, "Method not allowed");
  }

  const authorization = req.headers.authorization || "";

  if (
    !authorization.startsWith("Bearer ") ||
    !authorization.slice(7).trim()
  ) {
    return sendError(res, 401, "Authentication required");
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error("Missing required server environment variables");

    return sendError(res, 500, "Server configuration error");
  }

  try {
    const {
      user,
      error: authError,
    } = await authenticateUser(req);

    if (authError || !user) {
      return sendError(
        res,
        401,
        authError || "Authentication required"
      );
    }

    const trade = validateTradeBody(req.body);

    if (trade.error) {
      return sendError(res, 400, trade.error);
    }

    let executionPrice;

    try {
      executionPrice = await fetchAuthoritativeEurPrice(trade.symbol);
    } catch (error) {
      return sendError(res, 503, priceErrorMessage(error));
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc("trade_crypto", {
      p_user_id: user.id,
      p_side: trade.side,
      p_symbol: trade.symbol,
      p_amount: trade.cryptoQuantity,
      p_price_eur: executionPrice,
    });

    if (error || !data?.success || !data?.trade_id) {
      console.error("Crypto trade failed");

      return sendError(res, 400, tradeErrorMessage(error));
    }

    return res.status(200).json({
      ok: true,
      trade: {
        id: data.trade_id,
        side: data.side,
        symbol: data.symbol,
        crypto_quantity: data.crypto_quantity,
        eur_amount: data.eur_amount,
        execution_price: data.execution_price,
        created_at: data.created_at,
      },
    });
  } catch (error) {
    console.error("Crypto trade request failed");

    return sendError(res, 500, "Trade failed");
  }
}

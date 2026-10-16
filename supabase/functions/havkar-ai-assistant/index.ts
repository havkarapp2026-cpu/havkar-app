import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assistantInstruction,
  providerErrorStatus,
  providerFailureMessage,
  providerRetryDelayMs,
  providerStatusIsRetryable,
  validateAssistantRequest
} from "./policy.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://havkar-app.vercel.app",
  "https://testnet.havkar.online",
  "https://staging.havkar.online"
]);

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_PROVIDER_ATTEMPTS = 3;
const MAX_SIMULTANEOUS_PROVIDER_CALLS = 8;
let activeProviderCalls = 0;
const MAX_PROVIDER_RESPONSE_CHARACTERS = 20000;
const MAX_ASSISTANT_MESSAGE_CHARACTERS = 4000;

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  const token = header.slice(7).trim();

  if (!token || token.startsWith("sb_") || token.split(".").length !== 3) {
    return "";
  }

  return token;
}

function modelName() {
  const configured = String(Deno.env.get("HAVKAR_AI_MODEL") || DEFAULT_MODEL).trim();

  return /^[A-Za-z0-9._-]{1,80}$/.test(configured)
    ? configured
    : DEFAULT_MODEL;
}

function providerContents(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
}

function generationConfig(model, maxOutputTokens) {
  const config: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens,
    candidateCount: 1
  };

  if (model.startsWith("gemini-2.5-flash")) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

function reserveProviderSlot() {
  if (activeProviderCalls >= MAX_SIMULTANEOUS_PROVIDER_CALLS) {
    return false;
  }

  activeProviderCalls += 1;
  return true;
}

function releaseProviderSlot() {
  if (activeProviderCalls > 0) {
    activeProviderCalls -= 1;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logProviderFailure(httpStatus, payload) {
  const errorStatus = providerErrorStatus(payload) || "none";
  console.error(
    "gemini_http_status=" + String(httpStatus) +
    " gemini_error_status=" + errorStatus
  );
}

function assistantMessage(payload, limit) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()
    .slice(0, limit);
}

async function readProviderPayload(response) {
  try {
    const text = await response.text();

    if (!text || text.length > MAX_PROVIDER_RESPONSE_CHARACTERS) {
      return null;
    }

    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestAssistantContent(
  model: string,
  validation: { languageName: string; task: string; messages: { role: string; content: string }[]; maxOutputTokens: number },
  providerKey: string
) {
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: assistantInstruction(validation.languageName, validation.task) }]
    },
    contents: providerContents(validation.messages),
    generationConfig: generationConfig(model, validation.maxOutputTokens)
  });
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    try {
      const providerResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" +
          encodeURIComponent(model) +
          ":generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": providerKey
          },
          signal: AbortSignal.timeout(12000),
          body
        }
      );

      if (providerResponse.ok) {
        return {
          ok: true,
          status: providerResponse.status,
          payload: await readProviderPayload(providerResponse)
        };
      }

      lastStatus = providerResponse.status;
      const retryAfter = providerResponse.headers.get("retry-after") || "";
      logProviderFailure(lastStatus, await readProviderPayload(providerResponse));

      if (!providerStatusIsRetryable(lastStatus) || attempt === MAX_PROVIDER_ATTEMPTS - 1) {
        return { ok: false, status: lastStatus, payload: null };
      }

      await sleep(providerRetryDelayMs(attempt, retryAfter));
    } catch {
      logProviderFailure(0, null);
      lastStatus = 0;

      if (attempt === MAX_PROVIDER_ATTEMPTS - 1) {
        return { ok: false, status: 0, payload: null };
      }

      await sleep(providerRetryDelayMs(attempt, ""));
    }
  }

  return { ok: false, status: lastStatus, payload: null };
}

async function readJson(request) {
  const text = await request.text();

  if (text.length > 12000) {
    return { error: "The request is too large." };
  }

  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: "Send a JSON request." };
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  const origin = request.headers.get("Origin");

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { ok: false, error: "Origin is not allowed." }, headers);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, headers);
  }

  const parsed = await readJson(request);

  if (parsed.error) {
    return json(400, { ok: false, error: parsed.error }, headers);
  }

  const validation = validateAssistantRequest(parsed.body);

  if (!validation.ok) {
    return json(400, { ok: false, error: validation.error }, headers);
  }

  const accessToken = bearerToken(request);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const providerKey = Deno.env.get("HAVKAR_AI_API_KEY") || "";

  if (!accessToken) {
    return json(401, { ok: false, error: "Sign in before using the assistant." }, headers);
  }

  if (!supabaseUrl || !serviceRoleKey || !providerKey) {
    return json(503, { ok: false, error: "The assistant is not configured." }, headers);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const userResult = await admin.auth.getUser(accessToken);

  if (userResult.error || !userResult.data?.user?.id) {
    return json(401, { ok: false, error: "Sign in before using the assistant." }, headers);
  }

  if (!reserveProviderSlot()) {
    return json(429, {
      ok: false,
      error: providerFailureMessage(429)
    }, {
      ...headers,
      "Retry-After": "2"
    });
  }

  try {
    const budget = await admin.rpc("consume_ai_budget", {
      p_user_id: userResult.data.user.id,
      p_characters: validation.characters
    });
    const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;

    if (budget.error || !budgetRow || typeof budgetRow.allowed !== "boolean") {
      const budgetText = budget.error && budget.error.message ? String(budget.error.message) : "";
      const budgetCode = budget.error && budget.error.code ? String(budget.error.code) : "";

      if (
        validation.characters > 2000 &&
        (budgetCode === "22023" || budgetText.includes("invalid assistant budget request"))
      ) {
        return json(400, { ok: false, error: "This draft is longer than the active assistant limit." }, headers);
      }

      return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
    }

    if (!budgetRow.allowed) {
      const retryAfter = Number(budgetRow.retry_after) > 0
        ? String(budgetRow.retry_after)
        : "60";

      return json(429, {
        ok: false,
        error: "The assistant limit has been reached. Please wait and try again."
      }, {
        ...headers,
        "Retry-After": retryAfter
      });
    }

    const providerResult = await requestAssistantContent(
      modelName(),
      validation,
      providerKey
    );

    if (!providerResult.ok) {
      const status = providerResult.status === 429 || providerResult.status === 503
        ? providerResult.status
        : 502;

      return json(status, {
        ok: false,
        error: providerFailureMessage(providerResult.status)
      }, status === 502 ? headers : {
        ...headers,
        "Retry-After": "3"
      });
    }

    const payload = providerResult.payload;
    const blocked = payload?.promptFeedback?.blockReason;

    if (blocked) {
      return json(400, { ok: false, error: "This request cannot be answered." }, headers);
    }

    const message = assistantMessage(
      payload,
      validation.task === "menu" ? 12000 : MAX_ASSISTANT_MESSAGE_CHARACTERS
    );

    if (!message) {
      logProviderFailure(providerResult.status, payload);
      return json(502, { ok: false, error: providerFailureMessage(0) }, headers);
    }

    return json(200, {
      ok: true,
      language: validation.language,
      message
    }, headers);
  } finally {
    releaseProviderSlot();
  }
});

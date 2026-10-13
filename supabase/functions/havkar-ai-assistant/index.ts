import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LIMITS,
  assistantInstruction,
  providerErrorStatus,
  validateAssistantRequest
} from "./policy.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://havkar-app.vercel.app",
  "https://testnet.havkar.online"
]);

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
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

function generationConfig(model) {
  const config: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens: LIMITS.maxOutputTokens,
    candidateCount: 1
  };

  if (model.startsWith("gemini-2.5-flash")) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

function logProviderFailure(httpStatus, payload) {
  const errorStatus = providerErrorStatus(payload) || "none";
  console.error(
    "gemini_http_status=" + String(httpStatus) +
    " gemini_error_status=" + errorStatus
  );
}

function assistantMessage(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()
    .slice(0, MAX_ASSISTANT_MESSAGE_CHARACTERS);
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

  const budget = await admin.rpc("consume_ai_budget", {
    p_user_id: userResult.data.user.id,
    p_characters: validation.characters
  });
  const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;

  if (budget.error || !budgetRow || typeof budgetRow.allowed !== "boolean") {
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

  const model = modelName();
  let providerResponse;

  try {
    providerResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": providerKey
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: assistantInstruction(validation.languageName) }]
          },
          contents: providerContents(validation.messages),
          generationConfig: generationConfig(model)
        })
      }
    );
  } catch {
    logProviderFailure(0, null);
    return json(502, { ok: false, error: "The assistant could not answer. Please try again." }, headers);
  }

  if (!providerResponse.ok) {
    logProviderFailure(providerResponse.status, await readProviderPayload(providerResponse));
    return json(502, { ok: false, error: "The assistant could not answer. Please try again." }, headers);
  }

  const payload = await readProviderPayload(providerResponse);
  const blocked = payload?.promptFeedback?.blockReason;

  if (blocked) {
    return json(400, { ok: false, error: "This request cannot be answered." }, headers);
  }

  const message = assistantMessage(payload);

  if (!message) {
    logProviderFailure(providerResponse.status, payload);
    return json(502, { ok: false, error: "The assistant could not answer. Please try again." }, headers);
  }

  return json(200, {
    ok: true,
    language: validation.language,
    message
  }, headers);
});

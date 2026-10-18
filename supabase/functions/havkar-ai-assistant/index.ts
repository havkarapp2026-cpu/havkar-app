import { createClient } from "npm:@supabase/supabase-js@2";
import {
  IMAGE_1K_OUTPUT_TOKENS,
  assistantInstruction,
  geminiImageUsage,
  geminiTextUsage,
  imageBytesFromProvider,
  imagePrompt,
  imageRequestBody,
  pngHasAlpha,
  providerFailureLog,
  providerFailureMessage,
  providerRetryDelayMs,
  providerStatusIsRetryable,
  spendLimitMicros,
  streamPayloads,
  attachmentReadyForModel,
  inspectImageBytes,
  validateAssistantRequest,
  validateAttachment,
  validateImageRequest
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

function providerContents(messages, image) {
  return messages.map((message, index) => {
    const parts: Array<Record<string, unknown>> = [{ text: message.content }];
    const lastUser = index === messages.length - 1 && message.role === "user";

    if (lastUser && image) {
      parts.push({
        inlineData: {
          mimeType: image.mime,
          data: image.data
        }
      });
    }

    return {
      role: message.role === "assistant" ? "model" : "user",
      parts
    };
  });
}

function imageMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return "";
}

async function loadInspectedAttachment(admin, userId, path) {
  const review = await admin.from("ai_file_reviews")
    .select("scan_status, bucket_id, user_id")
    .eq("path", path)
    .eq("user_id", userId)
    .maybeSingle();
  const reviewBucket = review.data && review.data.bucket_id;
  const reviewOwner = review.data && review.data.user_id;

  if (review.error || !review.data || reviewBucket !== "ai-attachments" || String(reviewOwner).toLowerCase() !== String(userId).toLowerCase()) {
    return { ok: false, error: "This file has not been scanned for malware." };
  }

  const downloaded = await admin.storage.from("ai-attachments").download(path);

  if (downloaded.error || !downloaded.data) {
    return { ok: false, error: "The image could not be read." };
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const inspection = inspectImageBytes(bytes, path);
  const status = inspection.ok && attachmentReadyForModel("clean") ? "clean" : "rejected";
  const marked = await admin.rpc("record_ai_attachment_inspection", {
    p_user_id: userId,
    p_path: path,
    p_status: status,
    p_byte_count: bytes.length
  });

  if (!inspection.ok || marked.error || marked.data !== true || !attachmentReadyForModel(status)) {
    return {
      ok: false,
      error: inspection.ok
        ? "This file has not been scanned for malware."
        : "Only JPEG, PNG, and WebP images can be attached."
    };
  }

  return { ok: true, image: { mime: inspection.mime, data: bytesToBase64(bytes) } };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
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

function spendOverrideArgs() {
  return {
    p_user_day_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_USER_DAY_USD_MICROS")),
    p_user_month_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_USER_MONTH_USD_MICROS")),
    p_plan_day_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_PLAN_DAY_USD_MICROS")),
    p_plan_month_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_PLAN_MONTH_USD_MICROS")),
    p_global_day_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_GLOBAL_DAY_USD_MICROS")),
    p_global_month_micros: spendLimitMicros(Deno.env.get("HAVKAR_AI_SPEND_GLOBAL_MONTH_USD_MICROS"))
  };
}

function spendRow(result) {
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function reserveProviderLease(admin, userId) {
  const result = await admin.rpc("reserve_ai_provider_lease", { p_user_id: userId });
  if (result.error) return { ok: false, leaseId: "" };
  return { ok: true, leaseId: result.data ? String(result.data) : "" };
}

async function releaseProviderLease(admin, leaseId) {
  if (!leaseId) return;
  await admin.rpc("release_ai_provider_lease", { p_lease_id: leaseId });
}

function spendGateConfigured() {
  return Object.values(spendOverrideArgs()).some((value) => value != null);
}

async function spendGateMayApply(admin) {
  if (spendGateConfigured()) return true;
  const result = await admin.rpc("ai_spend_limit_active");
  if (result.error) return true;
  return result.data === true;
}

async function spendLimitReached(admin, userId) {
  const result = await admin.rpc("ai_spend_limit_reached", {
    p_user_id: userId,
    ...spendOverrideArgs()
  });
  return Boolean(result.error) || result.data !== false;
}

function countedTokens(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 10000000) return null;
  return number;
}

async function countProviderInputTokens(model, body, providerKey) {
  let requestBody = "";
  try {
    const parsed = JSON.parse(body);
    const request: Record<string, unknown> = {
      model: "models/" + model
    };
    if (parsed && parsed.systemInstruction) request.systemInstruction = parsed.systemInstruction;
    if (parsed && parsed.contents) request.contents = parsed.contents;
    // generationConfig does not change the input count. CountTokens accepts
    // this request only inside generateContentRequest.
    requestBody = JSON.stringify({ generateContentRequest: request });
  } catch {
    console.error("ai_count_tokens_http=0");
    return null;
  }
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":countTokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": providerKey
        },
        signal: AbortSignal.timeout(8000),
        body: requestBody
      }
    );
    if (!response.ok) {
      logProviderFailure(response.status, await readProviderPayload(response));
      console.error("ai_count_tokens_http=" + String(response.status));
      return null;
    }
    const payload = await response.json();
    const tokens = countedTokens(payload && payload.totalTokens);
    if (tokens == null) console.error("ai_count_tokens_http=" + String(response.status));
    return tokens;
  } catch {
    console.error("ai_count_tokens_http=0");
    return null;
  }
}

function textProviderBody(model, validation, image) {
  return JSON.stringify({
    systemInstruction: {
      parts: [{ text: assistantInstruction(validation.languageName, validation.task) }]
    },
    contents: providerContents(validation.messages, image),
    generationConfig: generationConfig(model, validation.maxOutputTokens)
  });
}

function usageLog(prefix, usage) {
  if (!usage) return;
  console.log(
    prefix +
    " prompt=" + String(usage.promptTokens) +
    " output_text=" + String(usage.outputTextTokens) +
    " thoughts=" + String(usage.thoughtTokens) +
    " image=" + String(usage.imageOutputTokens) +
    " total=" + String(usage.totalTokens) +
    " cached=" + String(usage.cachedTokens) +
    " tool=" + String(usage.toolTokens) +
    " unitemized=" + String(usage.unitemizedTokens) +
    " fully_priced=" + String(usage.fullyPriced)
  );
}

async function reserveSpend(admin, userId, kind, model, outputCap, inputTokens) {
  const overrides = spendOverrideArgs();
  console.log(
    "ai_global_spend_limits=day:" + String(overrides.p_global_day_micros) +
    ",month:" + String(overrides.p_global_month_micros)
  );
  const result = await admin.rpc("reserve_ai_spend", {
    p_user_id: userId,
    p_kind: kind,
    p_model: model,
    p_output_cap_tokens: outputCap,
    // The image token cap is the published 1K block. The database adds one
    // more block at the same image-output rate for unitemized internal tokens.
    p_image_cap_tokens: kind === "image" ? IMAGE_1K_OUTPUT_TOKENS : 0,
    p_input_tokens: countedTokens(inputTokens),
    ...overrides
  });
  const row = spendRow(result);
  if (result.error || !row || typeof row.allowed !== "boolean") {
    return { ok: false, allowed: false, holdId: "", reason: "unavailable" };
  }
  return {
    ok: true,
    allowed: row.allowed === true,
    holdId: row.hold_id ? String(row.hold_id) : "",
    reason: String(row.reason || "")
  };
}

async function releaseSpendHold(admin, holdId) {
  if (!holdId) return;
  await admin.rpc("release_ai_spend_hold", { p_hold_id: holdId });
}

async function markSpendHoldStarted(admin, userId, holdId) {
  if (!holdId) return false;
  const result = await admin.rpc("mark_ai_spend_hold_started", {
    p_hold_id: holdId,
    p_user_id: userId
  });
  return !result.error && result.data === true;
}

async function recordProviderUsage(admin, userId, holdId, kind, model, called, httpStatus, usage) {
  const priced = called && usage ? usage : null;
  await admin.rpc("record_ai_provider_usage", {
    p_user_id: userId,
    p_hold_id: holdId || null,
    p_kind: kind,
    p_model: model,
    p_provider_called: called === true,
    p_http_status: httpStatus > 0 ? httpStatus : null,
    p_prompt_tokens: priced ? priced.promptTokens : null,
    p_output_text_tokens: priced ? priced.outputTextTokens : null,
    p_thought_tokens: priced ? priced.thoughtTokens : null,
    p_image_output_tokens: priced ? priced.imageOutputTokens : null,
    p_total_tokens: priced && priced.totalTokens != null ? priced.totalTokens : null,
    p_usage_source: priced ? "provider" : "missing",
    p_force_unpriced: priced ? priced.fullyPriced !== true : called === true,
    p_unitemized_tokens: priced && Number.isInteger(priced.unitemizedTokens) ? priced.unitemizedTokens : null
  });
}

function spendDenied(headers) {
  return json(429, {
    ok: false,
    error: "The assistant spending limit has been reached. Please wait and try again."
  }, {
    ...headers,
    "Retry-After": "3600"
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logProviderFailure(httpStatus, body) {
  console.error(providerFailureLog(httpStatus, body));
}

function assistantMessage(payload, limit, trimEdges = true) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  const text = parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  const visible = trimEdges ? text.trim() : text;

  return visible.slice(0, limit);
}

async function readProviderPayload(response, maxCharacters = MAX_PROVIDER_RESPONSE_CHARACTERS) {
  try {
    const text = await response.text();

    if (!text || text.length > maxCharacters) {
      return null;
    }

    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestAssistantContent(
  model: string,
  body: string,
  providerKey: string,
  singleAttempt: boolean
) {
  let lastStatus = 0;
  const maxAttempts = singleAttempt ? 1 : MAX_PROVIDER_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

      if (!providerStatusIsRetryable(lastStatus) || attempt === maxAttempts - 1) {
        return { ok: false, status: lastStatus, payload: null };
      }

      await sleep(providerRetryDelayMs(attempt, retryAfter));
    } catch {
      logProviderFailure(0, null);
      lastStatus = 0;

      if (attempt === maxAttempts - 1) {
        return { ok: false, status: 0, payload: null };
      }

      await sleep(providerRetryDelayMs(attempt, ""));
    }
  }

  return { ok: false, status: lastStatus, payload: null };
}

function sseEncode(encoder, payload) {
  return encoder.encode("data: " + JSON.stringify(payload) + "\n\n");
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function storeGeneratedImage(admin, userId, bytes, mime, validation) {
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const path = userId + "/" + crypto.randomUUID() + "." + extension;
  const uploaded = await admin.storage.from("ai-generated").upload(path, bytes, {
    contentType: mime,
    upsert: false
  });
  if (uploaded.error) return { ok: false, error: "The image could not be stored." };
  const recorded = await admin.from("ai_generated_files").insert({
    user_id: userId,
    path,
    mime,
    aspect: validation.aspect,
    model: validation.model,
    byte_count: bytes.length,
    transparent: pngHasAlpha(bytes),
    list_price_usd_micros: validation.listPriceUsdMicros
  });
  if (recorded.error) {
    await admin.storage.from("ai-generated").remove([path]);
    return { ok: false, error: "The image could not be stored." };
  }
  return { ok: true, path, mime, transparent: pngHasAlpha(bytes) };
}

async function cleanupExpiredFiles(admin, userId) {
  const listed = await admin.rpc("list_expired_ai_files", { p_user_id: userId });
  const rows = Array.isArray(listed.data) ? listed.data : [];
  for (const row of rows) {
    if (!row || (row.bucket_id !== "ai-generated" && row.bucket_id !== "ai-attachments")) continue;
    await admin.storage.from(row.bucket_id).remove([row.path]);
  }
  if (rows.length) await admin.rpc("delete_expired_ai_file_rows", { p_user_id: userId });
}

async function requestGeneratedImage(validation, providerKey, signal) {
  const prompt = imagePrompt(validation);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": providerKey
    },
    signal,
    body: JSON.stringify(imageRequestBody(validation, prompt))
  });
  const payload = await readProviderPayload(response, 12000000);
  if (!response.ok) {
    logProviderFailure(response.status, payload);
    return { ok: false, status: response.status, payload: null };
  }
  return { ok: true, status: response.status, payload };
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

async function textBudgetGate(admin, userId, characters, headers) {
  const budget = await admin.rpc("consume_ai_budget", {
    p_user_id: userId,
    p_characters: characters
  });
  const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;

  if (budget.error || !budgetRow || typeof budgetRow.allowed !== "boolean") {
    const budgetText = budget.error && budget.error.message ? String(budget.error.message) : "";
    const budgetCode = budget.error && budget.error.code ? String(budget.error.code) : "";

    if (
      characters > 2000 &&
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

  return null;
}

function eventResponse(request, headers, release, run) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => controller.enqueue(sseEncode(encoder, payload));
      try {
        await run(send, request.signal);
      } catch {
        send({
          type: request.signal.aborted ? "interrupted" : "error",
          ...(request.signal.aborted ? {} : { error: providerFailureMessage(0) })
        });
      } finally {
        try { await release(); } catch { /* Lease release is best-effort after the response. */ }
        try { controller.close(); } catch { /* The client may already have closed the stream. */ }
      }
    }
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no"
    }
  });
}

function imageStreamResponse(request, headers, admin, userId, validation, providerKey, release) {
  return eventResponse(request, headers, release, async (send, signal) => {
    send({ type: "status", status: "accepted" });
    await cleanupExpiredFiles(admin, userId);
    const produced = [];
    for (let index = 0; index < validation.variations; index += 1) {
      if (signal.aborted) {
        send({ type: "interrupted" });
        return;
      }
      let inputTokens = null;
      if (await spendGateMayApply(admin)) {
        if (await spendLimitReached(admin, userId)) {
          console.error("ai_spend_denied=already_reached");
          send({ type: "error", error: "The assistant spending limit has been reached. Please wait and try again." });
          return;
        }
        inputTokens = await countProviderInputTokens(
          validation.model,
          JSON.stringify({
            contents: [{ role: "user", parts: [{ text: imagePrompt(validation) }] }]
          }),
          providerKey
        );
        if (inputTokens == null) {
          console.error("ai_input_tokens=unpriced");
          send({ type: "error", error: "The assistant spending limit has been reached. Please wait and try again." });
          return;
        }
      }
      const spend = await reserveSpend(admin, userId, "image", validation.model, 0, inputTokens);
      if (!spend.ok) {
        send({ type: "error", error: "The assistant is temporarily unavailable." });
        return;
      }
      if (!spend.allowed) {
        console.error("ai_spend_denied=" + spend.reason);
        send({ type: "error", error: "The assistant spending limit has been reached. Please wait and try again." });
        return;
      }
      const budget = await admin.rpc("consume_ai_image_budget", {
        p_user_id: userId,
        p_images: 1
      });
      const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;
      if (budget.error || !budgetRow || budgetRow.allowed !== true) {
        await releaseSpendHold(admin, spend.holdId);
        send({
          type: "error",
          error: budgetRow && budgetRow.allowed === false
            ? "The image limit has been reached."
            : "The assistant is temporarily unavailable."
        });
        return;
      }
      let called = false;
      let httpStatus = 0;
      let usage = null;
      try {
        if (spend.holdId) {
          const started = await markSpendHoldStarted(admin, userId, spend.holdId);
          if (!started) {
            await releaseSpendHold(admin, spend.holdId);
            send({ type: "error", error: "The assistant is temporarily unavailable." });
            return;
          }
        }
        send({ type: "status", status: "provider" });
        const providerResult = await requestGeneratedImage(
          validation,
          providerKey,
          AbortSignal.any([signal, AbortSignal.timeout(50000)])
        );
        called = providerResult.status > 0;
        httpStatus = providerResult.status;
        if (!providerResult.ok) {
          send({ type: "error", error: providerFailureMessage(providerResult.status) });
          return;
        }
        usage = geminiImageUsage(providerResult.payload);
        usageLog("ai_image_usage", usage);
        if (providerResult.payload && providerResult.payload.promptFeedback && providerResult.payload.promptFeedback.blockReason) {
          send({ type: "error", error: "This request cannot be answered." });
          return;
        }
        const extracted = imageBytesFromProvider(providerResult.payload);
        const bytes = extracted ? decodeBase64(extracted.data) : new Uint8Array();
        const mime = imageMime(bytes);
        if (!mime || bytes.length > 8 * 1024 * 1024) {
          const responseKeys = Object.keys(providerResult.payload || {}).join(",");
          console.error("image_response_keys=" + responseKeys);
          send({ type: "error", error: "The image could not be generated." });
          return;
        }
        const stored = await storeGeneratedImage(admin, userId, bytes, mime, validation);
        if (!stored.ok) {
          send({ type: "error", error: stored.error });
          return;
        }
        produced.push(stored);
        send({
          type: "image",
          path: stored.path,
          mime: stored.mime,
          transparent: stored.transparent,
          aspect: validation.aspect
        });
      } finally {
        await recordProviderUsage(
          admin,
          userId,
          spend.holdId,
          "image",
          validation.model,
          called,
          httpStatus,
          usage
        );
      }
    }
    if (validation.transparentRequested && produced.some((item) => item.transparent !== true)) {
      send({ type: "notice", message: "This file does not have a transparent background." });
    }
    send({ type: "done" });
  });
}

async function streamTextResponse(request, headers, admin, userId, validation, providerKey, holdId, release, providerBody) {
  return eventResponse(request, headers, release, async (send, signal) => {
    const model = modelName();
    let called = false;
    let httpStatus = 0;
    let usage = null;
    const record = () => recordProviderUsage(admin, userId, holdId, "text", model, called, httpStatus, usage);
    let providerResponse;
    try {
      if (holdId) {
        const started = await markSpendHoldStarted(admin, userId, holdId);
        if (!started) {
          await releaseSpendHold(admin, holdId);
          send({ type: "error", error: "The assistant is temporarily unavailable." });
          return;
        }
      }
      providerResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" +
          encodeURIComponent(model) +
          ":streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": providerKey
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
          body: providerBody
        }
      );
      called = providerResponse.status > 0;
      httpStatus = providerResponse.status;
      if (!providerResponse.ok || !providerResponse.body) {
        logProviderFailure(providerResponse.status, await readProviderPayload(providerResponse));
        send({ type: "error", error: providerFailureMessage(providerResponse.status) });
        return;
      }
      const reader = providerResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let eventCount = 0;
      const limit = validation.task === "menu" ? 12000 : MAX_ASSISTANT_MESSAGE_CHARACTERS;
      const applyPayloads = (items) => {
        for (const payload of items) {
          eventCount += 1;
          const measured = geminiTextUsage(payload);
          if (measured) {
            usage = measured;
            usageLog("ai_text_usage", usage);
          }
          if (payload && payload.promptFeedback && payload.promptFeedback.blockReason) {
            send({ type: "error", error: "This request cannot be answered." });
            return false;
          }
          const text = assistantMessage(payload, limit, false);
          if (!text) continue;
          const incoming = full && text.startsWith(full) ? text.slice(full.length) : text;
          if (!incoming) continue;
          const next = (full + incoming).slice(0, limit);
          const delta = next.slice(full.length);
          full = next;
          if (delta) send({ type: "delta", text: delta });
        }
        return true;
      };
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = streamPayloads(buffer, false);
        buffer = parsed.rest;
        if (!applyPayloads(parsed.payloads)) return;
      }
      if (!signal.aborted) {
        buffer += decoder.decode();
        const flushed = streamPayloads(buffer, true);
        if (!applyPayloads(flushed.payloads)) return;
      }
      if (!full) {
        const streamType = String(providerResponse.headers.get("content-type") || "none").split(";")[0].trim().slice(0, 80);
        console.error("stream_events=" + String(eventCount) + " stream_chars=0 stream_type=" + streamType);
      }
      if (signal.aborted) {
        send({ type: "interrupted", message: full });
        return;
      }
      if (!full) send({ type: "error", error: providerFailureMessage(0) });
      else send({ type: "done", message: full });
    } finally {
      await record();
    }
  });
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

  const imageMode = Boolean(parsed.body && parsed.body.mode === "image");
  const validation = imageMode
    ? validateImageRequest(parsed.body)
    : validateAssistantRequest(parsed.body);

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

  const userId = userResult.data.user.id;
  const lease = await reserveProviderLease(admin, userId);
  const releaseAll = async () => {
    releaseProviderSlot();
    await releaseProviderLease(admin, lease.leaseId);
  };

  if (!lease.ok || !lease.leaseId) {
    await releaseAll();
    if (!lease.ok) {
      return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
    }
    return json(429, {
      ok: false,
      error: providerFailureMessage(429)
    }, {
      ...headers,
      "Retry-After": "2"
    });
  }

  if (imageMode) {
    return imageStreamResponse(request, headers, admin, userId, validation, providerKey, releaseAll);
  }

  const attachment = validateAttachment(parsed.body && parsed.body.attachment, userId);

  if (!attachment.ok) {
    await releaseAll();
    return json(400, { ok: false, error: attachment.error }, headers);
  }

  let image = null;

  if (attachment.path) {
    const inspected = await loadInspectedAttachment(admin, userId, attachment.path);

    if (!inspected.ok) {
      await releaseAll();
      return json(400, { ok: false, error: inspected.error }, headers);
    }

    image = inspected.image;
  }

  const model = modelName();
  const providerBody = textProviderBody(model, validation, image);
  let inputTokens = null;
  if (await spendGateMayApply(admin)) {
    if (await spendLimitReached(admin, userId)) {
      console.error("ai_spend_denied=already_reached");
      await releaseAll();
      return spendDenied(headers);
    }
    inputTokens = await countProviderInputTokens(model, providerBody, providerKey);
    if (inputTokens == null) {
      console.error("ai_input_tokens=unpriced");
      await releaseAll();
      return spendDenied(headers);
    }
  }
  const spend = await reserveSpend(admin, userId, "text", model, validation.maxOutputTokens, inputTokens);
  if (!spend.ok) {
    await releaseAll();
    return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
  }
  if (!spend.allowed) {
    console.error("ai_spend_denied=" + spend.reason);
    await releaseAll();
    return spendDenied(headers);
  }

  if (parsed.body && parsed.body.stream === true) {
    const denied = await textBudgetGate(admin, userId, validation.characters, headers);
    if (denied) {
      await releaseSpendHold(admin, spend.holdId);
      await releaseAll();
      return denied;
    }
    return streamTextResponse(request, headers, admin, userId, validation, providerKey, spend.holdId, releaseAll, providerBody);
  }

  let called = false;
  let httpStatus = 0;
  let usage = null;
  try {
    const denied = await textBudgetGate(admin, userId, validation.characters, headers);
    if (denied) {
      await releaseSpendHold(admin, spend.holdId);
      return denied;
    }

    if (spend.holdId) {
      const started = await markSpendHoldStarted(admin, userId, spend.holdId);
      if (!started) {
        await releaseSpendHold(admin, spend.holdId);
        return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
      }
    }

    const providerResult = await requestAssistantContent(
      model,
      providerBody,
      providerKey,
      spend.holdId !== ""
    );
    called = providerResult.status > 0;
    httpStatus = providerResult.status;
    usage = providerResult.ok ? geminiTextUsage(providerResult.payload) : null;
    usageLog("ai_text_usage", usage);

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
    if (called || spend.holdId) {
      try {
        await recordProviderUsage(admin, userId, spend.holdId, "text", model, called, httpStatus, usage);
      } catch {
        console.error("ai_usage_record=failed");
      }
    }
    await releaseAll();
  }
});

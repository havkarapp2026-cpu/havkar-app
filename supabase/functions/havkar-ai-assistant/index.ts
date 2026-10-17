import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assistantInstruction,
  imageBytesFromProvider,
  imagePrompt,
  imageRequestBody,
  pngHasAlpha,
  providerFailureLog,
  providerFailureMessage,
  providerRetryDelayMs,
  providerStatusIsRetryable,
  streamPayloads,
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
  validation: { languageName: string; task: string; messages: { role: string; content: string }[]; maxOutputTokens: number },
  providerKey: string,
  image: { mime: string; data: string } | null
) {
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: assistantInstruction(validation.languageName, validation.task) }]
    },
    contents: providerContents(validation.messages, image),
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

async function releaseImageCredit(admin, userId) {
  await admin.rpc("release_ai_image_budget", { p_user_id: userId, p_images: 1 });
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

function eventResponse(request, headers, admin, userId, validation, providerKey, image, run) {
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
        releaseProviderSlot();
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

function imageStreamResponse(request, headers, admin, userId, validation, providerKey) {
  return eventResponse(request, headers, admin, userId, validation, providerKey, null, async (send, signal) => {
    send({ type: "status", status: "accepted" });
    await cleanupExpiredFiles(admin, userId);
    const produced = [];
    for (let index = 0; index < validation.variations; index += 1) {
      if (signal.aborted) {
        send({ type: "interrupted" });
        return;
      }
      const budget = await admin.rpc("consume_ai_image_budget", {
        p_user_id: userId,
        p_images: 1
      });
      const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;
      if (budget.error || !budgetRow || budgetRow.allowed !== true) {
        send({
          type: "error",
          error: budgetRow && budgetRow.allowed === false
            ? "The image limit has been reached."
            : "The assistant is temporarily unavailable."
        });
        return;
      }
      send({ type: "status", status: "provider" });
      const providerResult = await requestGeneratedImage(
        validation,
        providerKey,
        AbortSignal.any([signal, AbortSignal.timeout(50000)])
      );
      if (!providerResult.ok) {
        await releaseImageCredit(admin, userId);
        send({ type: "error", error: providerFailureMessage(providerResult.status) });
        return;
      }
      if (providerResult.payload && providerResult.payload.promptFeedback && providerResult.payload.promptFeedback.blockReason) {
        await releaseImageCredit(admin, userId);
        send({ type: "error", error: "This request cannot be answered." });
        return;
      }
      const extracted = imageBytesFromProvider(providerResult.payload);
      const bytes = extracted ? decodeBase64(extracted.data) : new Uint8Array();
      const mime = imageMime(bytes);
      if (!mime || bytes.length > 8 * 1024 * 1024) {
        await releaseImageCredit(admin, userId);
        const responseKeys = Object.keys(providerResult.payload || {}).join(",");
        console.error("image_response_keys=" + responseKeys);
        send({ type: "error", error: "The image could not be generated." });
        return;
      }
      const stored = await storeGeneratedImage(admin, userId, bytes, mime, validation);
      if (!stored.ok) {
        await releaseImageCredit(admin, userId);
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
    }
    if (validation.transparentRequested && produced.some((item) => item.transparent !== true)) {
      send({ type: "notice", message: "This file does not have a transparent background." });
    }
    send({ type: "done" });
  });
}

async function streamTextResponse(request, headers, validation, providerKey, image) {
  return eventResponse(request, headers, null, "", validation, providerKey, image, async (send, signal) => {
    const model = modelName();
    const providerResponse = await fetch(
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
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: assistantInstruction(validation.languageName, validation.task) }]
          },
          contents: providerContents(validation.messages, image),
          generationConfig: generationConfig(model, validation.maxOutputTokens)
        })
      }
    );
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

  if (imageMode) {
    return imageStreamResponse(request, headers, admin, userId, validation, providerKey);
  }

  const attachment = validateAttachment(parsed.body && parsed.body.attachment, userId);

  if (!attachment.ok) {
    releaseProviderSlot();
    return json(400, { ok: false, error: attachment.error }, headers);
  }

  let image = null;

  if (attachment.path) {
    const downloaded = await admin.storage.from("ai-attachments").download(attachment.path);

    if (downloaded.error || !downloaded.data) {
      releaseProviderSlot();
      return json(400, { ok: false, error: "The image could not be read." }, headers);
    }

    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());

    if (bytes.length < 16 || bytes.length > 4 * 1024 * 1024) {
      releaseProviderSlot();
      return json(400, { ok: false, error: "The image could not be read." }, headers);
    }

    const mime = imageMime(bytes);

    if (!mime) {
      releaseProviderSlot();
      return json(400, { ok: false, error: "Only JPEG, PNG, and WebP images can be attached." }, headers);
    }

    image = { mime, data: bytesToBase64(bytes) };
  }

  if (parsed.body && parsed.body.stream === true) {
    const denied = await textBudgetGate(admin, userId, validation.characters, headers);
    if (denied) {
      releaseProviderSlot();
      return denied;
    }
    return streamTextResponse(request, headers, validation, providerKey, image);
  }

  try {
    const denied = await textBudgetGate(admin, userId, validation.characters, headers);
    if (denied) return denied;

    const providerResult = await requestAssistantContent(
      modelName(),
      validation,
      providerKey,
      image
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

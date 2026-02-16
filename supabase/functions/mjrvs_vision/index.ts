import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type MediaType = "image" | "video";

type GeminiPart = {
  text?: string;
  fileData?: { mimeType: string; fileUri: string };
  inlineData?: { mimeType: string; data: string };
};

type GeminiCallResult = {
  text: string;
  model: string;
};

class HttpError extends Error {
  status: number;
  payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GEMINI_PRIMARY_MODEL = (Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash").trim();
const GEMINI_MODEL_CANDIDATES = Array.from(
  new Set([
    GEMINI_PRIMARY_MODEL,
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-8b",
  ].map((model) => model.trim()).filter((model) => model.length > 0)),
);
const GROK_VISION_MODEL = "grok-2-vision-1212";
const VOYAGE_MODEL = "voyage-4-large";
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

const GROK_SYSTEM_INSTRUCTION =
  "You are a precise visual analysis assistant for media indexing. Provide factual, concise descriptions emphasizing entities, scene context, actions, visible text, and notable details useful for semantic search and follow-up Q&A.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function inferMediaTypeFromUrl(url: string): MediaType {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) ? "video" : "image";
}

function inferVideoMimeTypeFromUrl(url: string): string {
  if (/\.webm(\?.*)?$/i.test(url)) return "video/webm";
  if (/\.mov(\?.*)?$/i.test(url)) return "video/quicktime";
  if (/\.m4v(\?.*)?$/i.test(url)) return "video/x-m4v";
  return "video/mp4";
}

function parseMediaType(value: unknown): MediaType {
  if (value === "image" || value === "video") {
    return value;
  }
  throw new HttpError(400, "media_type must be 'image' or 'video'");
}

function getRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `Missing or invalid ${field}`);
  }
  return value.trim();
}

function getOptionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value);
}

function assertHttpUrl(value: string, fieldName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, `${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, `${fieldName} must use http or https`);
  }
}

function normalizeBase64(value: string): string {
  return value.replace(/\s+/g, "");
}

function estimateBase64Size(base64Data: string): number {
  const clean = normalizeBase64(base64Data);
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return (clean.length * 3) / 4 - padding;
}

function ensureMimeMatchesMediaType(mediaType: MediaType, mimeType: string): void {
  if (mediaType === "image" && !mimeType.toLowerCase().startsWith("image/")) {
    throw new HttpError(400, `mime_type must be an image MIME type, received '${mimeType}'`);
  }
  if (mediaType === "video" && !mimeType.toLowerCase().startsWith("video/")) {
    throw new HttpError(400, `mime_type must be a video MIME type, received '${mimeType}'`);
  }
}

function parseDataUrl(value: string): { mimeType: string; base64Data: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  const mimeType = match[1]?.trim();
  const base64Data = normalizeBase64(match[2] ?? "");
  if (!mimeType || !base64Data) {
    throw new HttpError(400, "Invalid data URL payload");
  }
  return { mimeType, base64Data };
}

// Helper: convert bytes to base64 without argument overflows.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function extractOpenAIStyleContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function normalizeAnalysisPrompt(body: Record<string, unknown>): string {
  const customPrompt = getOptionalString(body, "custom_prompt");
  const prompt = getOptionalString(body, "prompt");
  return customPrompt ?? prompt ?? "Describe this media in detail.";
}

async function callGemini(parts: GeminiPart[]): Promise<GeminiCallResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new HttpError(500, "Missing GEMINI_API_KEY");

  let lastNotFoundError = "";

  for (const model of GEMINI_MODEL_CANDIDATES) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      const isModelNotFound = response.status === 404 ||
        /not found|not supported for generateContent/i.test(err);
      if (isModelNotFound) {
        lastNotFoundError = err;
        console.warn(`[mjrvs_vision] Gemini model unavailable, retrying fallback: ${model}`);
        continue;
      }
      throw new HttpError(response.status, `Gemini error (${response.status})`, { error: err, model });
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

    if (!text) {
      throw new HttpError(502, `No text in Gemini response for model '${model}'`);
    }

    return { text, model };
  }

  throw new HttpError(502, "No supported Gemini model available", {
    models_tried: GEMINI_MODEL_CANDIDATES,
    last_error: lastNotFoundError,
  });
}

async function callGrokVision(
  imageContent: { type: "url"; url: string } | { type: "base64"; data: string; mimeType: string },
  prompt: string,
): Promise<string> {
  const apiKey = Deno.env.get("XAI_API_KEY");
  if (!apiKey) throw new HttpError(500, "Missing XAI_API_KEY");

  let base64Data: string;
  let mimeType: string;

  if (imageContent.type === "url") {
    assertHttpUrl(imageContent.url, "media_url");
    const imageResponse = await fetch(imageContent.url);
    if (!imageResponse.ok) {
      throw new HttpError(400, `Failed to fetch image (${imageResponse.status})`);
    }

    mimeType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.toLowerCase().startsWith("image/")) {
      throw new HttpError(400, `URL did not return an image content-type (${mimeType})`);
    }

    const imageBytes = await imageResponse.arrayBuffer();
    if (imageBytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
      throw new HttpError(
        413,
        `Image exceeds 20MB limit (${(imageBytes.byteLength / 1024 / 1024).toFixed(1)}MB)`,
      );
    }

    base64Data = bytesToBase64(new Uint8Array(imageBytes));
  } else {
    mimeType = imageContent.mimeType;
    base64Data = normalizeBase64(imageContent.data);

    const dataSize = estimateBase64Size(base64Data);
    if (dataSize > MAX_IMAGE_SIZE_BYTES) {
      throw new HttpError(413, `Image exceeds 20MB limit (${(dataSize / 1024 / 1024).toFixed(1)}MB)`);
    }
  }

  const imageUrl = `data:${mimeType};base64,${base64Data}`;

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_VISION_MODEL,
      messages: [
        {
          role: "system",
          content: GROK_SYSTEM_INSTRUCTION,
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new HttpError(response.status, `Grok Vision error (${response.status})`, { error: err });
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = extractOpenAIStyleContent(data.choices?.[0]?.message?.content);
  if (!text) throw new HttpError(502, "No text in Grok Vision response");
  return text;
}

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new HttpError(500, "Missing VOYAGE_API_KEY");

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new HttpError(response.status, `Voyage error (${response.status})`, { error: err });
  }

  const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
  return data.data?.[0]?.embedding || [];
}

async function extractTags(analysisText: string): Promise<string[]> {
  const tagPrompt =
    `Extract 3-5 short topic tags from this analysis. Return ONLY a comma-separated list, no explanation:\n\n${analysisText}`;
  const geminiResult = await callGemini([{ text: tagPrompt }]);
  return geminiResult.text
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, 5);
}

async function handleAnalyze(body: Record<string, unknown>): Promise<Response> {
  const mediaUrl = getRequiredString(body, "media_url");
  const mediaType = parseMediaType(body.media_type);
  const userId = getOptionalString(body, "user_id") ?? "system";
  const analysisPrompt = normalizeAnalysisPrompt(body);

  assertHttpUrl(mediaUrl, "media_url");

  const { data: upload, error: uploadError } = await supabase
    .from("mjrvs_video_uploads")
    .insert({
      user_id: userId,
      media_url: mediaUrl,
      media_type: mediaType,
      upload_status: "completed",
    })
    .select()
    .single();

  if (uploadError || !upload) {
    throw new HttpError(500, `Upload insert failed: ${uploadError?.message ?? "Unknown upload error"}`);
  }

  let analysisText: string;
  let modelUsed: string;

  if (mediaType === "image") {
    analysisText = await callGrokVision({ type: "url", url: mediaUrl }, analysisPrompt);
    modelUsed = GROK_VISION_MODEL;
  } else {
    const providedMimeType = getOptionalString(body, "mime_type");
    const mimeType = providedMimeType && providedMimeType.toLowerCase().startsWith("video/")
      ? providedMimeType
      : inferVideoMimeTypeFromUrl(mediaUrl);

    const geminiResult = await callGemini([
      { fileData: { mimeType, fileUri: mediaUrl } },
      { text: analysisPrompt },
    ]);
    analysisText = geminiResult.text;
    modelUsed = geminiResult.model;
  }

  const embedding = await getEmbedding(analysisText);
  const tags = await extractTags(analysisText);

  const { data: analysis, error: analysisError } = await supabase
    .from("mjrvs_video_analyses")
    .insert({
      video_id: upload.id,
      analysis_text: analysisText,
      model_used: modelUsed,
      embedding,
      tokens_used: Math.floor(analysisText.length / 4),
    })
    .select()
    .single();

  if (analysisError || !analysis) {
    throw new HttpError(500, `Analysis insert failed: ${analysisError?.message ?? "Unknown analysis error"}`);
  }

  if (tags.length > 0) {
    const { error: tagsError } = await supabase.from("mjrvs_video_tags").insert(
      tags.map((tag) => ({
        video_id: upload.id,
        tag_name: tag,
        confidence: 0.8,
      })),
    );
    if (tagsError) {
      console.error("[mjrvs_vision] Tag insert failed:", tagsError);
    }
  }

  return jsonResponse({
    vision_id: upload.id,
    analysis_id: analysis.id,
    media_type: mediaType,
    model_used: modelUsed,
    analysis_text: analysisText,
    tags,
    tokens_used: analysis.tokens_used,
    status: "completed",
  });
}

async function handleAnalyzeBase64(body: Record<string, unknown>): Promise<Response> {
  const rawBase64Input = getRequiredString(body, "base64_data");
  const mediaType = parseMediaType(body.media_type);
  const userId = getOptionalString(body, "user_id") ?? "system";
  const analysisPrompt = normalizeAnalysisPrompt(body);

  // Compatibility: allow callers to pass an HTTP URL in base64_data.
  if (isHttpUrl(rawBase64Input)) {
    return await handleAnalyze({
      ...body,
      media_url: rawBase64Input,
      media_type: mediaType,
    });
  }

  let mimeType = getOptionalString(body, "mime_type");
  let base64Data = normalizeBase64(rawBase64Input);

  const parsedDataUrl = parseDataUrl(rawBase64Input);
  if (parsedDataUrl) {
    mimeType = parsedDataUrl.mimeType;
    base64Data = parsedDataUrl.base64Data;
  }

  if (!mimeType) {
    throw new HttpError(400, "Missing mime_type for base64 payload");
  }
  ensureMimeMatchesMediaType(mediaType, mimeType);

  const dataSize = estimateBase64Size(base64Data);
  if (mediaType === "image" && dataSize > MAX_IMAGE_SIZE_BYTES) {
    throw new HttpError(413, `Image exceeds 20MB limit (${(dataSize / 1024 / 1024).toFixed(1)}MB)`);
  }

  const { data: upload, error: uploadError } = await supabase
    .from("mjrvs_video_uploads")
    .insert({
      user_id: userId,
      media_url: `data:${mimeType};base64,[embedded]`,
      media_type: mediaType,
      upload_status: "completed",
    })
    .select()
    .single();

  if (uploadError || !upload) {
    throw new HttpError(500, `Upload insert failed: ${uploadError?.message ?? "Unknown upload error"}`);
  }

  let analysisText: string;
  let modelUsed: string;

  if (mediaType === "image") {
    analysisText = await callGrokVision(
      { type: "base64", data: base64Data, mimeType },
      analysisPrompt,
    );
    modelUsed = GROK_VISION_MODEL;
  } else {
    const geminiResult = await callGemini([
      { inlineData: { mimeType, data: base64Data } },
      { text: analysisPrompt },
    ]);
    analysisText = geminiResult.text;
    modelUsed = geminiResult.model;
  }

  const embedding = await getEmbedding(analysisText);
  const tags = await extractTags(analysisText);

  const { data: analysis, error: analysisError } = await supabase
    .from("mjrvs_video_analyses")
    .insert({
      video_id: upload.id,
      analysis_text: analysisText,
      model_used: modelUsed,
      embedding,
      tokens_used: Math.floor(analysisText.length / 4),
    })
    .select()
    .single();

  if (analysisError || !analysis) {
    throw new HttpError(500, `Analysis insert failed: ${analysisError?.message ?? "Unknown analysis error"}`);
  }

  if (tags.length > 0) {
    const { error: tagsError } = await supabase.from("mjrvs_video_tags").insert(
      tags.map((tag) => ({
        video_id: upload.id,
        tag_name: tag,
        confidence: 0.8,
      })),
    );
    if (tagsError) {
      console.error("[mjrvs_vision] Tag insert failed:", tagsError);
    }
  }

  return jsonResponse({
    vision_id: upload.id,
    analysis_id: analysis.id,
    media_type: mediaType,
    model_used: modelUsed,
    analysis_text: analysisText,
    tags,
    tokens_used: analysis.tokens_used,
    status: "completed",
  });
}

async function handleChat(body: Record<string, unknown>): Promise<Response> {
  const visionId = getRequiredString(body, "vision_id");
  const message = getRequiredString(body, "message");

  const { data: analysis, error: analysisError } = await supabase
    .from("mjrvs_video_analyses")
    .select("analysis_text")
    .eq("video_id", visionId)
    .single();

  if (analysisError || !analysis) {
    return jsonResponse({ error: "Vision ID not found" }, 404);
  }

  const { data: history, error: historyError } = await supabase
    .from("mjrvs_video_chat_history")
    .select("role, message")
    .eq("video_id", visionId)
    .order("created_at", { ascending: true });

  if (historyError) {
    throw new HttpError(500, `Failed to load chat history: ${historyError.message}`);
  }

  const chatHistory = history || [];
  const systemContext =
    `You are analyzing this media:\n\n${analysis.analysis_text}\n\nAnswer follow-up questions about it.`;

  const parts: GeminiPart[] = [
    { text: systemContext },
    ...chatHistory.map((entry: { role: string; message: string }) => ({
      text: `${entry.role}: ${entry.message}`,
    })),
    { text: `user: ${message}` },
  ];

  const geminiResult = await callGemini(parts);
  const response = geminiResult.text;

  const { error: chatInsertError } = await supabase.from("mjrvs_video_chat_history").insert([
    { video_id: visionId, role: "user", message },
    { video_id: visionId, role: "assistant", message: response },
  ]);
  if (chatInsertError) {
    console.error("[mjrvs_vision] Chat insert failed:", chatInsertError);
  }

  return jsonResponse({
    vision_id: visionId,
    response,
    status: "completed",
  });
}

async function handleSearch(body: Record<string, unknown>): Promise<Response> {
  const query = getRequiredString(body, "query");
  const incomingLimit = body.limit;
  const matchCount = typeof incomingLimit === "number" && Number.isFinite(incomingLimit)
    ? Math.min(Math.max(Math.floor(incomingLimit), 1), 20)
    : 5;

  const queryEmbedding = await getEmbedding(query);

  const { data, error } = await supabase.rpc("match_video_analyses", {
    query_embedding: queryEmbedding,
    match_threshold: 0.7,
    match_count: matchCount,
  });

  if (error) throw new HttpError(500, `Search failed: ${error.message}`);

  return jsonResponse({
    results: data || [],
    count: data?.length || 0,
  });
}

async function handleGet(visionId: string): Promise<Response> {
  const { data: upload, error: uploadError } = await supabase
    .from("mjrvs_video_uploads")
    .select("*, mjrvs_video_analyses(*), mjrvs_video_tags(*), mjrvs_video_chat_history(*)")
    .eq("id", visionId)
    .single();

  if (uploadError || !upload) {
    return jsonResponse({ error: "Vision ID not found" }, 404);
  }

  return jsonResponse(upload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const visionId = url.searchParams.get("vision_id");
      if (!visionId) {
        return jsonResponse({ error: "Missing vision_id parameter" }, 400);
      }
      return await handleGet(visionId);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Request body must be a JSON object" }, 400);
    }

    const typedBody = body as Record<string, unknown>;
    const action = getOptionalString(typedBody, "action");
    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    switch (action) {
      case "analyze":
        return await handleAnalyze(typedBody);
      case "analyze_url": {
        const rawUrl = getOptionalString(typedBody, "url") ?? "";
        const mediaType = getOptionalString(typedBody, "media_type")
          ? parseMediaType(typedBody.media_type)
          : inferMediaTypeFromUrl(rawUrl);

        return await handleAnalyze({
          ...typedBody,
          media_url: rawUrl,
          media_type: mediaType,
          custom_prompt: typedBody.custom_prompt ?? typedBody.prompt,
        });
      }
      case "analyze_base64":
        return await handleAnalyzeBase64(typedBody);
      case "chat":
        return await handleChat(typedBody);
      case "search":
        return await handleSearch(typedBody);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      const body = error.payload
        ? { error: error.message, details: error.payload }
        : { error: error.message };
      return jsonResponse(body, error.status);
    }

    console.error("[mjrvs_vision] Unhandled error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

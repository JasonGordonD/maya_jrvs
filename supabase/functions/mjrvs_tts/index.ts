type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
};

type TtsRequest = {
  text?: string;
  voice_id?: string;
  output_format?: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TEXT_LENGTH = 7000;
const DEFAULT_VOICE_ID = "gE0owC0H9C8SzfDyIUtB";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_64";
const DEFAULT_MODEL_ID = "eleven_v3";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const normalizeVoiceSettings = (value: unknown): VoiceSettings | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const normalized: VoiceSettings = {};

  if (typeof raw.stability === "number" && Number.isFinite(raw.stability)) {
    normalized.stability = Math.min(Math.max(raw.stability, 0), 1);
  }
  if (typeof raw.similarity_boost === "number" && Number.isFinite(raw.similarity_boost)) {
    normalized.similarity_boost = Math.min(Math.max(raw.similarity_boost, 0), 1);
  }
  if (typeof raw.style === "number" && Number.isFinite(raw.style)) {
    normalized.style = Math.min(Math.max(raw.style, 0), 1);
  }
  if (typeof raw.use_speaker_boost === "boolean") {
    normalized.use_speaker_boost = raw.use_speaker_boost;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const getApiKey = (): string => {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) {
    throw new HttpError(500, "Missing ELEVENLABS_API_KEY");
  }
  return key;
};

const isSafeToken = (value: string): boolean => /^[a-zA-Z0-9_-]+$/.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json() as TtsRequest;

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      throw new HttpError(400, "Missing text");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new HttpError(413, `Text exceeds ${MAX_TEXT_LENGTH} characters`);
    }

    const voiceId = typeof payload.voice_id === "string" && payload.voice_id.trim().length > 0
      ? payload.voice_id.trim()
      : DEFAULT_VOICE_ID;
    if (!isSafeToken(voiceId)) {
      throw new HttpError(400, "Invalid voice_id");
    }

    const outputFormat = typeof payload.output_format === "string" && payload.output_format.trim().length > 0
      ? payload.output_format.trim()
      : DEFAULT_OUTPUT_FORMAT;
    if (!isSafeToken(outputFormat)) {
      throw new HttpError(400, "Invalid output_format");
    }

    const modelId = typeof payload.model_id === "string" && payload.model_id.trim().length > 0
      ? payload.model_id.trim()
      : DEFAULT_MODEL_ID;
    if (!isSafeToken(modelId)) {
      throw new HttpError(400, "Invalid model_id");
    }

    const voiceSettings = normalizeVoiceSettings(payload.voice_settings);
    const apiKey = getApiKey();

    const endpoint =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
      }),
    });

    if (!upstream.ok) {
      const rawError = await upstream.text();
      throw new HttpError(upstream.status, `ElevenLabs error (${upstream.status})`, { error: rawError });
    }

    const audio = await upstream.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      const payload = error.payload ? { error: error.message, details: error.payload } : { error: error.message };
      return jsonResponse(payload, error.status);
    }
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    console.error("[mjrvs_tts] Unhandled error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

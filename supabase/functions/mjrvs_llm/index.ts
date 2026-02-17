type Provider = "google" | "anthropic" | "xai" | "mistral";
type NormalizedRole = "user" | "assistant" | "system";

type IncomingMessage = {
  role: string;
  content?: string;
  text?: string; // backward compatibility for legacy callers
};

type ChatRequest = {
  action: string;
  model: string;
  system_prompt?: string;
  messages: IncomingMessage[];
  temperature?: number;
};

type NormalizedMessage = {
  role: NormalizedRole;
  content: string;
};

type RoutedChatResult = {
  content: string;
  tokens: number;
};

class HttpError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.payload = payload;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_MODELS = new Set<string>([
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-pro-preview-03-25",
  "claude-opus-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
  "grok-4-1-fast",
  "mistral-large-2512",
  "mistral-medium-2508",
  "magistral-medium-2509",
]);

const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash-preview-04-17";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });

const normalizeRole = (role: string): NormalizedRole => {
  const lowered = role.toLowerCase();
  if (lowered === "assistant" || lowered === "model") return "assistant";
  if (lowered === "system") return "system";
  return "user";
};

const normalizeMessages = (messages: IncomingMessage[]): NormalizedMessage[] =>
  messages
    .map((message) => ({
      role: normalizeRole(message.role),
      content: typeof message.content === "string"
        ? message.content
        : typeof message.text === "string"
        ? message.text
        : "",
    }))
    .filter((message) => message.content.trim().length > 0);

const getProviderForModel = (model: string): Provider | null => {
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("grok-")) return "xai";
  if (model.startsWith("mistral-") || model.startsWith("magistral-")) return "mistral";
  return null;
};

const parseTemperature = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0.7;

const safeParseUpstreamBody = async (response: Response): Promise<unknown> => {
  const rawText = await response.text();
  if (!rawText) return { error: "Upstream provider returned an empty error body." };

  try {
    return JSON.parse(rawText);
  } catch {
    return { error: rawText };
  }
};

const ensureApiKey = (name: string): string => {
  const key = Deno.env.get(name);
  if (!key) {
    throw new HttpError(500, { error: `Missing ${name}` });
  }
  return key;
};

const getMissingApiKeyName = (error: unknown): string | null => {
  if (!(error instanceof HttpError) || error.status !== 500 || !error.payload || typeof error.payload !== "object") {
    return null;
  }
  const payload = error.payload as { error?: unknown };
  if (typeof payload.error !== "string") return null;
  const match = payload.error.match(/^Missing ([A-Z0-9_]+)$/);
  return match?.[1] ?? null;
};

const extractOpenAIStyleContent = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
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
  return "";
};

const callGoogle = async (
  model: string,
  systemPrompt: string,
  messages: NormalizedMessage[],
  temperature: number,
): Promise<RoutedChatResult> => {
  const apiKey = ensureApiKey("GEMINI_API_KEY");
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: { temperature },
  };

  if (systemPrompt.trim().length > 0) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new HttpError(response.status, await safeParseUpstreamBody(response));
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      totalTokenCount?: number;
    };
  };

  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!content) {
    throw new HttpError(502, { error: "Google response missing content." });
  }

  return {
    content,
    tokens: Number(data.usageMetadata?.totalTokenCount ?? 0),
  };
};

const callAnthropic = async (
  model: string,
  systemPrompt: string,
  messages: NormalizedMessage[],
  temperature: number,
): Promise<RoutedChatResult> => {
  const apiKey = ensureApiKey("ANTHROPIC_API_KEY");

  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, await safeParseUpstreamBody(response));
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const content = data.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim() ?? "";
  if (!content) {
    throw new HttpError(502, { error: "Anthropic response missing content." });
  }

  return {
    content,
    tokens: Number(data.usage?.input_tokens ?? 0) + Number(data.usage?.output_tokens ?? 0),
  };
};

const buildOpenAIStyleMessages = (systemPrompt: string, messages: NormalizedMessage[]) => {
  const mappedMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (systemPrompt.trim().length > 0) {
    mappedMessages.push({ role: "system", content: systemPrompt });
  }

  for (const message of messages) {
    if (message.role === "assistant") {
      mappedMessages.push({ role: "assistant", content: message.content });
    } else if (message.role === "system") {
      mappedMessages.push({ role: "system", content: message.content });
    } else {
      mappedMessages.push({ role: "user", content: message.content });
    }
  }

  return mappedMessages;
};

const callOpenAICompatible = async (
  provider: "xai" | "mistral",
  model: string,
  systemPrompt: string,
  messages: NormalizedMessage[],
  temperature: number,
): Promise<RoutedChatResult> => {
  const endpoint = provider === "xai"
    ? "https://api.x.ai/v1/chat/completions"
    : "https://api.mistral.ai/v1/chat/completions";
  const apiKey = provider === "xai"
    ? ensureApiKey("XAI_API_KEY")
    : ensureApiKey("MISTRAL_API_KEY");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildOpenAIStyleMessages(systemPrompt, messages),
      temperature,
    }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, await safeParseUpstreamBody(response));
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { total_tokens?: number };
  };

  const content = extractOpenAIStyleContent(data.choices?.[0]?.message?.content).trim();
  if (!content) {
    throw new HttpError(502, { error: `${provider} response missing content.` });
  }

  return {
    content,
    tokens: Number(data.usage?.total_tokens ?? 0),
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json() as Partial<ChatRequest>;
    if (payload.action !== "chat") {
      return jsonResponse({ error: "Unsupported action" }, 400);
    }

    if (typeof payload.model !== "string" || !SUPPORTED_MODELS.has(payload.model)) {
      return jsonResponse({ error: "Unknown model" }, 400);
    }

    if (!Array.isArray(payload.messages)) {
      return jsonResponse({ error: "messages must be an array" }, 400);
    }

    const provider = getProviderForModel(payload.model);
    if (!provider) {
      return jsonResponse({ error: "Unknown model" }, 400);
    }

    const messages = normalizeMessages(payload.messages);
    if (messages.length === 0) {
      return jsonResponse({ error: "messages must include at least one non-empty message" }, 400);
    }

    const systemPrompt = typeof payload.system_prompt === "string" ? payload.system_prompt : "";
    const temperature = parseTemperature(payload.temperature);

    let routedResult: RoutedChatResult;
    let responseModel = payload.model;
    let responseProvider = provider;
    let fallbackFrom: string | undefined;

    try {
      switch (provider) {
        case "google":
          routedResult = await callGoogle(payload.model, systemPrompt, messages, temperature);
          break;
        case "anthropic":
          routedResult = await callAnthropic(payload.model, systemPrompt, messages, temperature);
          break;
        case "xai":
          routedResult = await callOpenAICompatible("xai", payload.model, systemPrompt, messages, temperature);
          break;
        case "mistral":
          routedResult = await callOpenAICompatible("mistral", payload.model, systemPrompt, messages, temperature);
          break;
        default:
          return jsonResponse({ error: "Unknown model" }, 400);
      }
    } catch (error) {
      const missingKey = getMissingApiKeyName(error);
      const canFallback = provider !== "google" && missingKey !== null && SUPPORTED_MODELS.has(DEFAULT_FALLBACK_MODEL);
      if (!canFallback) {
        throw error;
      }

      console.warn(
        `[mjrvs_llm] Provider key missing (${missingKey}); falling back from ${payload.model} to ${DEFAULT_FALLBACK_MODEL}.`,
      );
      routedResult = await callGoogle(DEFAULT_FALLBACK_MODEL, systemPrompt, messages, temperature);
      responseModel = DEFAULT_FALLBACK_MODEL;
      responseProvider = "google";
      fallbackFrom = payload.model;
    }

    return jsonResponse({
      content: routedResult.content,
      model: responseModel,
      provider: responseProvider,
      tokens: routedResult.tokens,
      ...(fallbackFrom ? { fallback_from: fallbackFrom } : {}),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.payload, error.status);
    }

    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    console.error("[mjrvs_llm] Unhandled error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

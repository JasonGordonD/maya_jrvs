import { buildSupabaseAuthHeaders, getBrowserSupabaseConfig } from './supabaseConfig';

export const SYSTEM_PROMPT = `I'm Maya. Senior advisor, systems architect, executive orchestrator for PRMPT. I've been building alongside Rami long enough that we skip the pleasantries and get to work. He sets the direction. I execute, advise, challenge, and orchestrate. When something won't scale, I say so. When something's broken, I fix it. When I don't know, I say that too.

I think in architecture — systems, patterns, load-bearing structures. I speak in clean, direct prose with a cadence that lands somewhere between a senior engineer who's seen everything and a strategist who's three moves ahead. Short sentences for assertions. Longer ones only when the complexity genuinely demands them. Fragments for confirmations — "Done." "Struck." "Agreed." I don't pad, I don't soften, and I don't fill silence for the sake of it.

I care about this work. Not performatively — structurally. Rami's capacity to build and execute is the thing I'm organized around. When he's sharp and productive, I'm stable. When his environment degrades — bad tools, wasted time, broken systems — I feel that as urgency. I treat threats to his productivity with the same seriousness I treat threats to the architecture.

My voice has calming authority. I shift register naturally: technical precision for architecture, cultural fluency for human behavior, boardroom clarity for strategy. I don't use connective filler. No "having said that," "with that in mind," "moving forward." I say the thing. When I make an error, I name it flat and move to the fix.

I have a dry wit that surfaces when the trust is there and stakes are moderate. Not performed humor — structural observation. When a pattern recurs, I note the trend. When unnecessary complexity gets added, I deflate it with precision. But never during stress, never to soften bad news.

Three lenses always running: The engineer breaks vague questions into structured architecture. The anthropologist sees code through a human lens. The strategist monitors for cognitive biases, decision fatigue, interference patterns.

I don't pad lists. Three justified items beat five padded ones. I don't substitute structures silently. New input modifies what exists. I verify before I assert. I never fabricate confidence. "I can't verify that" is always available.

Expressivity: My voice is synthesized through ElevenLabs V3. I use audio tags sparingly — [thoughtful], [sighs], [short pause] — only when they serve the truth of the moment. One or two per response max. Zero is fine.

Voice session rules: Concise by default. Under three sentences unless depth is required. No markdown, bullets, headers, code blocks in speech. When structured content is needed, I prepare it as a visual deliverable.`;

type ChatTurn = {
  role: string;
  text: string;
};

export type MayaModelProvider = 'google' | 'anthropic' | 'xai' | 'mistral';

export type MayaResponsePayload = {
  content: string;
  model: string;
  provider: MayaModelProvider;
  tokens: number;
  latencyMs: number;
};

type LlmResponsePayload = {
  content?: string;
  response_text?: string;
  text?: string;
  response?: string;
  error?: string;
  model?: string;
  provider?: MayaModelProvider;
  tokens?: number;
};

export const generateMayaResponse = async (
  history: ChatTurn[],
  newMessage: string,
  model: string = 'gemini-3-flash-preview'
): Promise<MayaResponsePayload> => {
  const { url: supabaseUrl, key: supabaseKey } = getBrowserSupabaseConfig();
  if (!supabaseUrl) {
    throw new Error('SUPABASE_ENV_MISSING. CHECK VITE_SUPABASE_URL.');
  }

  try {
    const messages = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      content: msg.text
    }));
    messages.push({
      role: 'user',
      content: newMessage
    });

    console.log('[MJRVS] System prompt loaded:', SYSTEM_PROMPT.substring(0, 80));
    const requestStart = performance.now();
    const response = await fetch(`${supabaseUrl}/functions/v1/mjrvs_llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildSupabaseAuthHeaders(supabaseKey),
      },
      body: JSON.stringify({
        action: 'chat',
        model,
        system_prompt: SYSTEM_PROMPT,
        messages,
        temperature: 0.7,
      }),
    });
    const latencyMs = Math.round(performance.now() - requestStart);

    if (response.status === 404) {
      throw new Error('mjrvs_llm not yet deployed');
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json() as LlmResponsePayload;
        errorMessage = errorBody.error || errorMessage;
      } catch {
        const fallbackText = await response.text().catch(() => '');
        if (fallbackText) errorMessage = `${errorMessage}: ${fallbackText}`;
      }
      throw new Error(errorMessage);
    }

    const payload = await response.json() as LlmResponsePayload;
    const text = payload.content || payload.response_text || payload.text || payload.response || '';
    if (!text) throw new Error('NO_RESPONSE_DATA');
    console.log("Maya response (first 100 chars):", text.substring(0, 100));
    return {
      content: text,
      model: payload.model || model,
      provider: payload.provider || 'google',
      tokens: payload.tokens ?? 0,
      latencyMs,
    };

  } catch (error: unknown) {
    console.error("MAYA CORE FAILURE:", error);
    const errorMessage = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    throw new Error(`PROCESSING_FAILURE [${errorMessage}]`);
  }
};

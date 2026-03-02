// Supabase Edge Function: mjrvs_summarize_session
// Session segmentation pipeline — compresses a completed JRVS conversation into a
// dense handoff summary and writes it to mjrvs_memories for session continuity.
//
// Called by the dashboard timer at the 40-minute mark.
// Fetches transcript from ElevenLabs, summarizes with Claude Opus 4.6,
// embeds with Voyage AI, and stores in mjrvs_memories.
//
// Deploy: supabase functions deploy mjrvs_summarize_session --project-ref svqbfxdhpsmioaosuhkb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// --- CORS ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-scope, x-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- SUPABASE CLIENT ---
let _client: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}

// --- VOYAGE AI EMBEDDING ---
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "voyage-4-large", input: [text], input_type: "document" }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI error (${response.status}): ${err}`);
  }
  const data = await response.json();
  return data.data[0].embedding as number[];
}

// --- ELEVENLABS TRANSCRIPT FETCH ---
interface TranscriptTurn {
  role: string;
  message?: string;
}

async function fetchTranscript(conversationId: string): Promise<TranscriptTurn[]> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
    { headers: { "xi-api-key": apiKey } }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${err}`);
  }
  const data = await response.json();
  const transcript = data.transcript ?? [];
  if (!Array.isArray(transcript) || transcript.length === 0) {
    throw new Error(`No transcript found for conversation ${conversationId}`);
  }
  return transcript as TranscriptTurn[];
}

function formatTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .filter((t) => t.message && t.message.trim().length > 0)
    .map((t) => {
      const speaker = t.role === "agent" ? "Maya" : "Rami";
      return `${speaker}: ${t.message}`;
    })
    .join("\n");
}

// --- CLAUDE OPUS 4.6 SUMMARIZATION ---
const SUMMARIZER_SYSTEM_PROMPT =
  `You are a session summarizer for Maya, an AI assistant.
Compress this conversation into a dense handoff summary that preserves:
- All decisions made and conclusions reached
- All open items or unresolved questions
- Key technical facts established (agent IDs, file paths, commit hashes, etc.)
- Rami's current emotional state and communication patterns observed
- Any behavioral corrections Maya made or received
- The last topic discussed and where it was cut off

Output format — plain prose, no headers, no bullets. Maximum 400 tokens.
Write in second person directed at Maya: "In the previous session, you and Rami..."`;

async function summarizeWithClaude(formattedTranscript: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 600,
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: formattedTranscript }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }
  const data = await response.json();
  const summary = data.content?.[0]?.text;
  if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("Claude returned empty or invalid summary");
  }
  return summary.trim();
}

// --- MAIN HANDLER ---
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { conversation_id?: string; session_duration_minutes?: number; turn_count?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { conversation_id, session_duration_minutes, turn_count } = body;
  if (!conversation_id || typeof conversation_id !== "string") {
    return errorResponse("'conversation_id' is required", 400);
  }
  if (session_duration_minutes == null || typeof session_duration_minutes !== "number") {
    return errorResponse("'session_duration_minutes' is required and must be a number", 400);
  }
  if (turn_count == null || typeof turn_count !== "number") {
    return errorResponse("'turn_count' is required and must be a number", 400);
  }

  try {
    // 1 — Fetch and format transcript
    const transcript = await fetchTranscript(conversation_id);
    const formattedTranscript = formatTranscript(transcript);
    if (formattedTranscript.trim().length === 0) {
      return errorResponse("Transcript is empty — nothing to summarize", 422);
    }

    // 2 — Summarize with Claude Opus 4.6
    const summary = await summarizeWithClaude(formattedTranscript);

    // 3 — Embed with Voyage AI (voyage-4-large, input_type: document)
    const embedding = await generateEmbedding(summary);

    // 4 — Write to mjrvs_memories
    const supabase = getSupabaseClient();
    const summarizedAt = new Date().toISOString();

    const { data: memory, error: insertError } = await supabase
      .from("mjrvs_memories")
      .insert({
        content: summary,
        category: "session_continuity",
        confidence: "verified",
        impact: "high",
        importance: 0.90,
        source: "session_summarizer",
        metadata: {
          tag: "session_handoff",
          load_trigger: "session_start",
          source_conversation_id: conversation_id,
          session_duration_minutes: session_duration_minutes,
          turn_count: turn_count,
          summarized_at: summarizedAt,
        },
        embedding: JSON.stringify(embedding),
      })
      .select("id")
      .single();

    if (insertError) {
      return errorResponse(`Database insert error: ${insertError.message}`, 500);
    }

    return jsonResponse({
      success: true,
      memory_id: memory.id,
      summary_preview: summary.slice(0, 100),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Internal error: ${message}`, 500);
  }
});

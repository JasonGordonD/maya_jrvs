import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
// --- CORS ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-scope, x-session-id",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, DELETE, OPTIONS"
};
function corsResponse() {
  return new Response("ok", {
    headers: corsHeaders
  });
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({
    error: message
  }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
// --- SUPABASE CLIENT ---
let _client = null;
function getSupabaseClient() {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return _client;
}
// --- VOYAGE AI EMBEDDINGS ---
async function generateEmbedding(text, model, inputType) {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");
  const body = {
    model,
    input: [
      text
    ]
  };
  if (inputType) body.input_type = inputType;
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI error (${response.status}): ${err}`);
  }
  const data = await response.json();
  return {
    embedding: data.data[0].embedding,
    tokens_used: data.usage?.total_tokens ?? 0
  };
}
// --- CONSTANTS ---
const VALID_CATEGORIES = [
  "identity",
  "relationship",
  "principle",
  "tool_knowledge",
  "episodic",
  "process_improvement",
  "promoted_constraint"
];
const VALID_CONFIDENCE = [
  "verified",
  "inferred",
  "speculative"
];
const VALID_IMPACT = [
  "critical",
  "high",
  "moderate",
  "low"
];
const RECALL_THRESHOLD = 0.3; // Lower than original 0.7 — conversational queries need fuzzier matching
const RECALL_MEMORY_COUNT = 10;
const RECALL_EPISODE_COUNT = 5;
const RECALL_CONVERSATION_COUNT = 8;
const DOCS_THRESHOLD = 0.4;
const DOCS_DEFAULT_COUNT = 5;
const DOCS_MAX_COUNT = 20;
const DISCOVER_THRESHOLD = 0.3;
const VALID_OWNER_SCOPES = [
  "maya",
  "dr_tijoux"
];
// ============================================================
// ACTION: orient
// ============================================================
// Session start context load. No embedding needed.
// Pulls: recent episodes, current state, critical memories, recent ruptures.
// Gives Maya a full picture of where things stand when a call starts.
async function handleOrient() {
  const supabase = getSupabaseClient();
  // Parallel fetch — all four queries at once
  const [episodesResult, stateResult, memoriesResult, rupturesResult] = await Promise.all([
    // Last 5 episodes with key session data
    supabase.from("mjrvs_episodes").select("id, session_id, title, summary, topics_discussed, decisions_made, open_items, corrections_given, outcome, errors_made, duration_secs, turn_count, created_at").order("created_at", {
      ascending: false
    }).limit(5),
    // Current state — caution_level, trust_level, formality_level omitted (stale hardcoded values)
    supabase.from("mjrvs_state").select("id, relationship_depth, rupture_severity, operator_cognitive_load, operator_emotional_valence, intervention_mode, confidence_summary, known_gaps, recent_errors, err_padding_corrections, err_character_contamination, err_silent_substitutions, err_verification_failures, err_state_drift, err_capability_claims, capacity_b_online, clinical_strategist_online, shadow_draft_online, gow_online, session_id, created_at, updated_at, last_session_id, last_session_time, last_session_summary, last_session_title, last_session_duration_secs, last_session_open_items").limit(1).single(),
    // Critical and high impact memories, not superseded
    // Also include ALL promoted memories regardless of impact
    supabase.from("mjrvs_memories").select("id, content, category, confidence, impact, source, session_id, is_promoted, metadata, created_at, updated_at").is("superseded_at", null).or("impact.in.(critical,high),is_promoted.eq.true").order("updated_at", {
      ascending: false
    }).limit(25),
    // Last 3 rupture events (relational continuity)
    supabase.from("mjrvs_rupture_log").select("id, session_id, tier, trigger_description, trigger_category, recovery_completed_at, caution_level_at_rupture, caution_level_after, created_at").order("created_at", {
      ascending: false
    }).limit(3)
  ]);
  if (stateResult.error) return errorResponse(`State fetch error: ${stateResult.error.message}`, 500);
  return jsonResponse({
    recent_episodes: episodesResult.data ?? [],
    episode_count: episodesResult.data?.length ?? 0,
    state: stateResult.data ?? {},
    memories: memoriesResult.data ?? [],
    memory_count: memoriesResult.data?.length ?? 0,
    recent_ruptures: rupturesResult.data ?? [],
    rupture_count: rupturesResult.data?.length ?? 0
  });
}
// ============================================================
// ACTION: recall
// ============================================================
// Semantic search across memories, episodes, AND conversations.
// Returns categorized results so Maya knows what type of info she found.
// Falls back to text search on episodes if semantic search returns nothing.
async function handleRecall(body) {
  const { query, match_count = RECALL_MEMORY_COUNT, offset = 0 } = body;
  if (!query || typeof query !== "string") return errorResponse("'query' is required for recall");
  const clampedOffset = Math.max(0, Number(offset) || 0);
  const clampedCount = match_count;
  const { embedding, tokens_used } = await generateEmbedding(query, "voyage-4-large", "query");
  const supabase = getSupabaseClient();
  const embeddingJson = JSON.stringify(embedding);
  // Parallel semantic search across all three tables
  const [memoriesResult, episodesResult, conversationsResult] = await Promise.all([
    // Memories: semantic search with lowered threshold
    supabase.rpc("mjrvs_match_memories", {
      query_embedding: embeddingJson,
      match_threshold: RECALL_THRESHOLD,
      match_count: clampedCount,
      match_offset: clampedOffset,
      filter_category: null,
      active_only: true
    }),
    // Episodes: semantic search
    supabase.rpc("mjrvs_match_episodes", {
      query_embedding: embeddingJson,
      match_threshold: RECALL_THRESHOLD,
      match_count: RECALL_EPISODE_COUNT,
      match_offset: clampedOffset
    }),
    // Conversations: semantic search on individual turns
    supabase.rpc("mjrvs_match_conversations", {
      query_embedding: embeddingJson,
      match_threshold: RECALL_THRESHOLD,
      match_count: RECALL_CONVERSATION_COUNT,
      match_offset: clampedOffset
    })
  ]);
  // If episodes semantic search returned nothing, try text search fallback
  let episodeFallback = null;
  if (!episodesResult.data || episodesResult.data.length === 0) {
    const { data: textResults } = await supabase.rpc("mjrvs_text_search_episodes", {
      search_text: query,
      match_count: RECALL_EPISODE_COUNT
    });
    if (textResults && textResults.length > 0) {
      episodeFallback = textResults;
    }
  }
  const memories = memoriesResult.data ?? [];
  const episodes = episodesResult.data ?? episodeFallback ?? [];
  const conversations = conversationsResult.data ?? [];
  const totalResults = memories.length + episodes.length + conversations.length;
  return jsonResponse({
    memories,
    episodes,
    conversations,
    total_results: totalResults,
    has_more: memories.length === clampedCount || episodes.length === RECALL_EPISODE_COUNT || conversations.length === RECALL_CONVERSATION_COUNT,
    tokens_used,
    search_note: totalResults === 0 ? "No results found. Try rephrasing — use different keywords or be more specific about the topic." : undefined
  });
}
// ============================================================
// ACTION: history
// ============================================================
// Returns conversation turns for a specific session, or the most
// recent session if no session_id provided. Useful for "what did
// I actually say" or "go back to that exact exchange."
async function handleHistory(body) {
  const { session_id = null, limit = 50, offset = 0 } = body;
  const clampedOffset = Math.max(0, Number(offset) || 0);
  const clampedLimit = limit;
  const supabase = getSupabaseClient();
  let targetSessionId = session_id;
  // If no session_id, find the most recent one
  if (!targetSessionId) {
    const { data: latestEpisode } = await supabase.from("mjrvs_episodes").select("session_id").order("created_at", {
      ascending: false
    }).limit(1).single();
    if (!latestEpisode) return jsonResponse({
      turns: [],
      message: "No sessions found."
    });
    targetSessionId = latestEpisode.session_id;
  }
  const { data: turns, error } = await supabase.from("mjrvs_conversations").select("id, turn_number, role, speaker, content, caution_level_at_turn, rupture_severity_at_turn, created_at").eq("session_id", targetSessionId).order("turn_number", {
    ascending: true
  }).range(clampedOffset, clampedOffset + clampedLimit - 1);
  if (error) return errorResponse(`History fetch error: ${error.message}`, 500);
  return jsonResponse({
    session_id: targetSessionId,
    turns: turns ?? [],
    turn_count: turns?.length ?? 0,
    has_more: (turns?.length ?? 0) === clampedLimit
  });
}
// ============================================================
// ACTION: search (legacy compatibility) — identical to recall
// ============================================================
async function handleSearch(body) {
  // Legacy search still works but now routes through recall logic
  // for backward compatibility with any existing callers
  const { query, match_count = 10, match_threshold = RECALL_THRESHOLD, filter_category = null, active_only = true, offset = 0 } = body;
  if (!query || typeof query !== "string") return errorResponse("'query' is required and must be a string");
  const clampedOffset = Math.max(0, Number(offset) || 0);
  const clampedCount = match_count;
  const { embedding, tokens_used } = await generateEmbedding(query, "voyage-4-large", "query");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("mjrvs_match_memories", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: match_threshold,
    match_count: clampedCount,
    match_offset: clampedOffset,
    filter_category,
    active_only
  });
  if (error) return errorResponse(`Database error: ${error.message}`, 500);
  return jsonResponse({
    memories: data ?? [],
    count: data?.length ?? 0,
    has_more: (data?.length ?? 0) === clampedCount,
    tokens_used
  });
}
// ============================================================
// ACTION: store (unchanged from original)
// ============================================================
async function handleStore(body, req) {
  const { content, category, confidence = "inferred", impact = "moderate", source = "self_observation", session_id: bodySessionId = null, metadata = {}, related_memory_ids = [], connection_type = "related_to" } = body;
  const session_id = bodySessionId || req.headers.get("x-session-id") || null;
  if (!content || typeof content !== "string") return errorResponse("'content' is required and must be a string");
  if (!category || !VALID_CATEGORIES.includes(category)) return errorResponse(`'category' must be one of: ${VALID_CATEGORIES.join(", ")}`);
  if (!VALID_CONFIDENCE.includes(confidence)) return errorResponse(`'confidence' must be one of: ${VALID_CONFIDENCE.join(", ")}`);
  if (!VALID_IMPACT.includes(impact)) return errorResponse(`'impact' must be one of: ${VALID_IMPACT.join(", ")}`);
  const { embedding, tokens_used } = await generateEmbedding(content, "voyage-4-large", "document");
  const supabase = getSupabaseClient();

  // Dedup check — if a near-identical memory exists (>0.92 similarity), increment confirmation instead
  const { data: similar, error: dedupError } = await supabase.rpc("mjrvs_match_memories", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.92,
    match_count: 1,
    filter_category: null,
    active_only: false
  });

  if (!dedupError && similar && similar.length > 0) {
    // Near-duplicate found — increment times_confirmed instead of inserting
    const existingId = similar[0].id;
    const existingConfirmed = similar[0].times_confirmed ?? 0;
    await supabase.from("mjrvs_memories")
      .update({
        times_confirmed: existingConfirmed + 1,
        last_confirmed_at: new Date().toISOString()
      })
      .eq("id", existingId);
    return jsonResponse({ status: "confirmed_existing", memory_id: existingId, times_confirmed: existingConfirmed + 1, tokens_used });
  }

  const { data: memory, error: insertError } = await supabase.from("mjrvs_memories").insert({
    content,
    category,
    confidence,
    impact,
    source,
    session_id,
    metadata,
    embedding: JSON.stringify(embedding)
  }).select().single();
  if (insertError) return errorResponse(`Database error: ${insertError.message}`, 500);
  if (Array.isArray(related_memory_ids) && related_memory_ids.length > 0 && memory) {
    const connections = related_memory_ids.map((targetId)=>({
        source_memory_id: memory.id,
        target_memory_id: targetId,
        connection_type,
        strength: 0.5
      }));
    const { error: connError } = await supabase.from("mjrvs_connections").insert(connections);
    if (connError) console.warn("Connection insert warning:", connError.message);
  }
  return jsonResponse({
    memory,
    tokens_used
  });
}
// ============================================================
// ACTION: log_rupture
// ============================================================
async function handleLogRupture(body, req) {
  const { rupture_id = null, tier, trigger_description, trigger_category = null, caution_level_at_rupture = null, trust_level_at_rupture = null, recovery_completed_at = null, recovery_phases_completed = [], caution_level_after = null, trust_level_after = null, operator_accelerated = false, metadata = {}, conversation_id = null } = body;
  const supabase = getSupabaseClient();
  // Use explicit conversation_id parameter first (LLM must pass this), fall back to header
  const session_id = conversation_id || req.headers.get("x-session-id") || null;
  // UPDATE: close/recovery path
  if (rupture_id) {
    if (typeof rupture_id !== "string") return errorResponse("'rupture_id' must be a string UUID");
    const updatePayload = {};
    if (recovery_completed_at !== null) updatePayload.recovery_completed_at = recovery_completed_at;
    if (Array.isArray(recovery_phases_completed) && recovery_phases_completed.length > 0) updatePayload.recovery_phases_completed = recovery_phases_completed;
    if (caution_level_after !== null) updatePayload.caution_level_after = caution_level_after;
    if (trust_level_after !== null) updatePayload.trust_level_after = trust_level_after;
    if (operator_accelerated) updatePayload.operator_accelerated = operator_accelerated;
    const { data, error } = await supabase.from("mjrvs_rupture_log").update(updatePayload).eq("id", rupture_id).select().single();
    if (error) return errorResponse(`Update error: ${error.message}`, 500);
    return jsonResponse({
      rupture: data,
      action: "updated"
    });
  }
  // INSERT: new rupture
  if (!session_id) return errorResponse("session_id could not be determined — ensure x-session-id header is present");
  if (!tier || typeof tier !== "number") return errorResponse("'tier' is required and must be a number (1=minor, 2=moderate, 3=severe)");
  if (!trigger_description || typeof trigger_description !== "string") return errorResponse("'trigger_description' is required and must be a string");
  const { data, error } = await supabase.from("mjrvs_rupture_log").insert({
    session_id,
    tier,
    trigger_description,
    trigger_category,
    caution_level_at_rupture,
    trust_level_at_rupture,
    metadata
  }).select().single();
  if (error) return errorResponse(`Insert error: ${error.message}`, 500);
  return jsonResponse({
    rupture: data,
    action: "created"
  });
}
// ============================================================
// ACTION: status (unchanged from original)
// ============================================================
async function handleStatus() {
  const supabase = getSupabaseClient();
  // caution_level, trust_level, formality_level omitted — stale hardcoded values
  const { data, error } = await supabase.from("mjrvs_state").select("id, relationship_depth, rupture_severity, operator_cognitive_load, operator_emotional_valence, intervention_mode, confidence_summary, known_gaps, recent_errors, err_padding_corrections, err_character_contamination, err_silent_substitutions, err_verification_failures, err_state_drift, err_capability_claims, capacity_b_online, clinical_strategist_online, shadow_draft_online, gow_online, session_id, created_at, updated_at, last_session_id, last_session_time, last_session_summary, last_session_title, last_session_duration_secs, last_session_open_items").limit(1).single();
  if (error) return errorResponse(`State fetch error: ${error.message}`, 500);
  return jsonResponse({
    state: data
  });
}
// ============================================================
// ACTION: docs
// ============================================================
// Searches the MJRVS document knowledge base (project files, configs,
// architecture docs, code, research, white papers, transcripts).
// Separate tables from memory/episode/conversation system.
// owner_scope is determined by X-Owner-Scope header, NOT by LLM parameter.
// Auto-fallback: if filters return nothing, re-queries without filters
// using the same embedding (no second Voyage API call).
async function handleDocs(body, ownerScope) {
  const { query, mode = "search", offset = 0, match_count = DOCS_DEFAULT_COUNT, keyword = null, filter_agent = null, filter_archetype = null, filter_folder = null, filter_key_path = null } = body;
  if (!query || typeof query !== "string") {
    return errorResponse("'query' is required for docs search");
  }
  // 5B-1: Auto-extract keyword from query if LLM didn't populate it
  let effectiveKeyword = keyword;
  if (!effectiveKeyword && query) {
    const patterns = [];
    const underscored = query.match(/\b[a-zA-Z]+_[a-zA-Z_]+\b/g);
    if (underscored) patterns.push(...underscored);
    const fileExts = query.match(/\b[\w.-]+\.(json|py|md|ts|js|sql|txt|docx|yaml|yml)\b/gi);
    if (fileExts) patterns.push(...fileExts);
    const camelCase = query.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g);
    if (camelCase) patterns.push(...camelCase);
    const acronyms = query.match(/\b[A-Z]{2,}\b/g);
    if (acronyms) patterns.push(...acronyms);
    if (patterns.length > 0) {
      effectiveKeyword = patterns.join(' ');
    }
  }
  // Validate owner_scope from header
  if (!VALID_OWNER_SCOPES.includes(ownerScope)) {
    return errorResponse(`Invalid owner_scope: '${ownerScope}'. Must be: ${VALID_OWNER_SCOPES.join(", ")}`, 403);
  }
  // Safe numeric coercion — LLMs sometimes send strings or garbage
  const clampedCount = Math.max(1, Math.min(Number(match_count) || DOCS_DEFAULT_COUNT, DOCS_MAX_COUNT));
  const clampedOffset = Math.max(0, Number(offset) || 0);
  // Embed the query — wrapped in try/catch for graceful failure
  let embedding;
  let tokens_used;
  try {
    const result = await generateEmbedding(query, "voyage-4-large", "query");
    embedding = result.embedding;
    tokens_used = result.tokens_used;
  } catch (err) {
    console.error("Voyage API error in docs:", err);
    return errorResponse("Document search is temporarily unavailable. Try again in a moment.", 503);
  }
  const supabase = getSupabaseClient();
  const embeddingJson = JSON.stringify(embedding);
  // --- DISCOVER MODE ---
  if (mode === "discover") {
    const { data, error } = await supabase.rpc("mjrvs_discover_docs", {
      query_embedding: embeddingJson,
      filter_owner: ownerScope,
      match_count: clampedCount,
      match_threshold: DISCOVER_THRESHOLD,
      match_offset: clampedOffset,
      keyword_query: effectiveKeyword || null
    });
    if (error) {
      return errorResponse(`Document discover error: ${error.message}`, 500);
    }
    return jsonResponse({
      results: data ?? [],
      has_more: data?.[0]?.has_more ?? false,
      mode: "discover",
      tokens_used
    });
  }
  // --- SEARCH MODE (default) ---
  const hasFilters = filter_agent || filter_archetype || filter_folder || filter_key_path;
  // 5C-1: Lower threshold for short queries whose embeddings score weakly
  const effectiveThreshold = (query.length <= 20) ? 0.3 : DOCS_THRESHOLD;
  const { data, error } = await supabase.rpc("mjrvs_match_docs_v2", {
    query_embedding: embeddingJson,
    filter_owner: ownerScope,
    match_count: clampedCount,
    match_threshold: effectiveThreshold,
    match_offset: clampedOffset,
    filter_top_folder: filter_folder || null,
    filter_agent: filter_agent || null,
    filter_archetype: filter_archetype || null,
    filter_key_path: filter_key_path || null,
    keyword_query: effectiveKeyword || null
  });
  if (error) {
    return errorResponse(`Document search error: ${error.message}`, 500);
  }
  let results = data ?? [];
  // Auto-fallback: if filters returned nothing, retry without filters
  // using the SAME embedding (no second Voyage call). Keep offset and keyword.
  if (results.length === 0 && hasFilters) {
    const { data: fallbackData, error: fallbackError } = await supabase.rpc("mjrvs_match_docs_v2", {
      query_embedding: embeddingJson,
      filter_owner: ownerScope,
      match_count: clampedCount,
      match_threshold: effectiveThreshold,
      match_offset: clampedOffset,
      filter_top_folder: null,
      filter_agent: null,
      filter_archetype: null,
      filter_key_path: null,
      keyword_query: effectiveKeyword || null
    });
    if (!fallbackError && fallbackData) {
      results = fallbackData;
    }
  }
  return jsonResponse({
    results,
    has_more: results?.[0]?.has_more ?? false,
    mode: "search",
    tokens_used,
    search_note: results.length === 0 ? "No matching documents found. Try different keywords or use mode='discover' to browse by topic." : undefined
  });
}
// ============================================================
// TOOL CALL DEDUP & HARD STOP ENFORCEMENT (JRVS-WO-004)
// ============================================================
const TERMINAL_ERROR = {
  is_error: true,
  content: "TERMINAL: This tool call has been permanently blocked after repeated failure. Do not call this tool again this session. Inform Rami directly that the memory lookup failed and ask how to proceed."
};

// Stable JSON stringify with sorted keys for consistent hashing
function sortedStringify(val: unknown): string {
  if (val === null || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return "[" + val.map(sortedStringify).join(",") + "]";
  const obj = val as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
}

async function computeParamsHash(action: string, body: Record<string, unknown>): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { action: _a, ...params } = body;
  const str = sortedStringify({ action, params });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Returns the new call_count for this (conv_id, action, params_hash).
// Uses atomic DB upsert so concurrent requests are safe.
async function incrementToolCallCount(
  supabase: ReturnType<typeof getSupabaseClient>,
  conversationId: string,
  action: string,
  paramsHash: string
): Promise<number> {
  const { data, error } = await supabase.rpc("mjrvs_increment_tool_call", {
    p_conversation_id: conversationId,
    p_action: action,
    p_params_hash: paramsHash
  });
  if (error) {
    console.warn("tool_call_log increment error:", error.message);
    return 1; // fail open — do not block on DB error
  }
  return data as number;
}

// Returns true if a TERMINAL has already been issued for this conversation
// (any (action, params_hash) combo in this session with call_count >= 2).
async function isConversationTerminated(
  supabase: ReturnType<typeof getSupabaseClient>,
  conversationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("mjrvs_tool_call_log")
    .select("id")
    .eq("conversation_id", conversationId)
    .gte("call_count", 2)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

// ============================================================
// ROUTER
// ============================================================
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Use POST", 405);
  try {
    const body = await req.json();
    // --- DEBUG: Log raw request body ---
    getSupabaseClient().from("mjrvs_debug_log").insert({
      endpoint: "mjrvs_memory",
      raw_body: JSON.stringify(body),
      headers: JSON.stringify(Object.fromEntries(req.headers.entries())),
      timestamp: new Date().toISOString()
    }).then(()=>{}).catch(()=>{}); // fire-and-forget, never blocks
    const { action } = body;

    // --- HARD STOP ENFORCEMENT ---
    // conversation_id comes from the x-session-id header (ElevenLabs injects
    // {{system__conversation_id}} there). Fall back to body.conversation_id if present.
    const conversationId = req.headers.get("x-session-id") || (body.conversation_id as string | undefined) || null;
    if (conversationId) {
      const supabase = getSupabaseClient();
      // Phase 1: If a TERMINAL was already issued this session, block immediately.
      // This implements tool_choice:{type:"none"} at the tool level for the session.
      if (await isConversationTerminated(supabase, conversationId)) {
        return jsonResponse(TERMINAL_ERROR, 200);
      }
      // Phase 2: Track this call. If identical params have been attempted >= 2 times, block.
      // mjrvs_reset_tool_ban is exempt — it must never be self-blocked.
      if (action && action !== 'mjrvs_reset_tool_ban') {
        const paramsHash = await computeParamsHash(action, body as Record<string, unknown>);
        const newCount = await incrementToolCallCount(supabase, conversationId, action, paramsHash);
        if (newCount >= 2) {
          return jsonResponse(TERMINAL_ERROR, 200);
        }
      }
    }

    // --- EMPTY PARAMS SAFETY NET ---
    if (!action) {
      return jsonResponse({
        error: "missing_action",
        message: "I need to know what to do. Ask the user to clarify what they need — should I check my memory, search documents, or look something up?",
        hint: "Tool was called with no action parameter. LLM should send action: orient|recall|history|status|store|log_rupture|docs"
      }, 400);
    }
    const query = body.query;
    if ((action === "recall" || action === "docs") && !query) {
      return jsonResponse({
        error: "missing_query",
        message: "I need a search term. What specifically should I look for?",
        hint: "Tool was called with action but no query parameter."
      }, 400);
    }
    switch(action){
      case "orient":
        return await handleOrient();
      case "recall":
        return await handleRecall(body);
      case "history":
        return await handleHistory(body);
      case "status":
        return await handleStatus();
      case "store":
        return await handleStore(body, req);
      case "log_rupture":
        return await handleLogRupture(body, req);
      case "search":
        return await handleSearch(body); // legacy compat
      case "docs":
        {
          const ownerScope = req.headers.get("x-owner-scope") || "maya";
          return await handleDocs(body, ownerScope);
        }
      default:
        return errorResponse(`Unknown action: '${action}'. Valid: orient | recall | history | status | store | log_rupture | search | docs`);
    }
  } catch (err) {
    console.error("mjrvs_memory error:", err);
    return errorResponse(err.message, 500);
  }
});

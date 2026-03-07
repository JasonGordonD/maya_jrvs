import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsResponse() {
  return new Response("ok", { headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// Deletes all mjrvs_tool_call_log rows for the current conversation_id.
// Lifts any active TERMINAL blocks for all tools in this session.
// EXEMPT from tool call log tracking — never log calls to this function.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Use POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId =
      (body.conversation_id as string | undefined) ||
      req.headers.get("x-session-id") ||
      null;

    if (!conversationId) {
      return jsonResponse({ error: "conversation_id required" }, 400);
    }

    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from("mjrvs_tool_call_log")
      .delete({ count: "exact" })
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("mjrvs_reset_tool_ban error:", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ reset: true, cleared_rows: count ?? 0 });
  } catch (err) {
    console.error("mjrvs_reset_tool_ban error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

# Conversation Failure Analysis — conv_2801khnhjqynetqrp7f2xzg67jp8

**Agent**: JVRS (`agent_0401khmtcyfef6hbpcvchjv5jj02`)  
**Status**: `failed`  
**Duration**: 88 seconds  
**Error**: WebSocket close code `1011` — "Unexpected server error."

---

## Executive Summary

The conversation failed with an **unexpected server error (1011)** immediately after a workflow transition from the **Qualification** node to the **Thought Partner** node. The failure is caused by a combination of an **incorrect workflow transition** and a **critical LLM backend mismatch** between the two nodes.

---

## Timeline of Events

| Turn | Time (s) | Node | Role | Event |
|------|----------|------|------|-------|
| 1 | 0 | Qualification | Agent | First message: "This is Maya Passepartout, how may I assist you?" |
| 2 | 3 | Qualification | User | "Hey, Maya, how are you?" |
| 3 | 8 | Qualification | Agent | Responds normally (custom-llm, 4134 input tokens, 45 output tokens) |
| 4 | 18 | Qualification | User | "It's going very good, my dear..." |
| 5 | 28 | Qualification | Agent | Responds normally (custom-llm, 3734 input tokens, 71 output tokens) |
| 6 | 43 | Qualification | User | "I wanna, like, try out your different, um, modes and stuff." |
| 7 | 49 | Qualification | Agent | Explains available modes (custom-llm, 4327 input tokens, 121 output tokens) |
| 8 | 78 | Qualification | User | "I want you to look at your KB and see. Tell me, what is missing from you? How would you assess yourself?" |
| 9 | 87 | Qualification | Agent | **Triggers `notify_condition_1_met`** — workflow routes to Thought Partner node |
| 10 | 87 | — | System | Transfer to `node_01khmv2q6reh480cszqbxp56qa` (Thought Partner) succeeds |
| — | 88 | — | System | **CRASH: Error 1011 — Unexpected server error** |

---

## Root Cause Analysis

### 1. Primary Cause: LLM Backend Mismatch After Node Transfer

This is the direct cause of the crash.

**Qualification node** (working):
- LLM: `custom-llm`
- Custom LLM endpoint: `https://api.anthropic.com/v1`
- Model: `claude-opus-4-6`
- API type: `chat_completions`
- API key: configured via `secret_id: "yrYwgLxgCS8SjHIdZF3b"`
- Custom headers: `anthropic-beta: fast-mode-2026-02-01,prompt-caching-2024-07-31`

**Thought Partner node** (crashed):
- LLM: `claude-sonnet-4-5` (ElevenLabs native model)
- Custom LLM: **explicitly `null`**
- No custom endpoint, no API key passthrough

When the workflow transferred the conversation to the Thought Partner node, the system attempted to switch from the **custom LLM backend** (direct Anthropic API) to **ElevenLabs' native `claude-sonnet-4-5` integration**. This switch caused the server error. The likely mechanism:

- The conversation context/history was built up over 4 turns using the custom-llm backend with a specific message format (Chat Completions via Anthropic).
- Upon transfer, ElevenLabs tried to initialize a new LLM session on their native `claude-sonnet-4-5` with this accumulated context.
- The format mismatch, context handoff failure, or model availability issue on the native integration caused an unrecoverable server error.

### 2. Contributing Cause: Incorrect Workflow Transition

The user asked: *"I want you to look at your KB and see. Tell me, what is missing from you? How would you assess yourself?"*

This is a **self-assessment/introspective request** — the user wants Maya to examine her own knowledge base and reflect on gaps. This is fundamentally a conversational request that the Qualification node should have handled directly.

Instead, the LLM interpreted this as needing a "thought partner" and fired `notify_condition_1_met`, which maps to edge `edge_01khmv2q6teh480ct7rwc5wwgk` with forward condition: *"When the agent determines that the user needs agent to be a thought partner."*

The Qualification node's `additional_prompt` instructs:
> "IF the user begins requesting something that does not align with the goals of this node, THEN identify the nature of the new request AND determine the best sub-agent node"

The self-assessment request didn't actually misalign with the Qualification node's goals — it was still conversational. The LLM was too eager to route.

### 3. Contributing Factor: `api_type` Configuration

The custom LLM uses `api_type: "chat_completions"` but points to `https://api.anthropic.com/v1`. Anthropic's API uses its own Messages API format, not OpenAI's Chat Completions format. While this clearly works (4 successful turns), it suggests ElevenLabs is performing some translation/adaptation layer. This adapted format may not translate cleanly when the system hands off context to a different LLM backend mid-conversation.

### 4. Observation: Prompt Caching Not Functioning

Despite enabling `prompt-caching-2024-07-31` in the Anthropic beta headers, all turns show:
- `input_cache_read`: 0 tokens
- `input_cache_write`: 0 tokens

This means prompt caching through the custom LLM integration is **not working**. This doesn't cause the crash, but it means every turn pays full input token costs, and the `fast-mode-2026-02-01` beta feature may also not be functioning as expected through this integration path.

---

## Affected Nodes

| Node | LLM Config | Status |
|------|-----------|--------|
| Qualification | `custom-llm` → Anthropic API direct (`claude-opus-4-6`) | Works |
| Thought Partner | `claude-sonnet-4-5` native, `custom_llm: null` | **Crashes on transfer** |
| Coding | `claude-sonnet-4-5` native, `custom_llm: null` | **Would likely crash too** |
| Heavy Duty | `claude-sonnet-4-5` native, `custom_llm: null` | **Would likely crash too** |
| Dr. Tijoux | `claude-sonnet-4-5` native, `custom_llm: null` | **Would likely crash too** |

All four sub-agent nodes use the same pattern: `llm: "claude-sonnet-4-5"` with `custom_llm: null`. This means **any workflow transition from the Qualification node will likely fail with the same error**.

---

## Recommended Fixes

### Fix Option A: Per-node custom LLM endpoints with different models (Recommended)

Keep the Qualification node on `custom-llm` with `claude-opus-4-6`, and give each sub-agent node its own `custom_llm` block pointing to the same Anthropic API but with `claude-sonnet-4-5` as the model. This avoids the backend switch entirely while preserving different models per node.

In each sub-agent node's `conversation_config.agent.prompt`, change:
```json
{
    "llm": "claude-sonnet-4-5",
    "custom_llm": null
}
```
to:
```json
{
    "llm": "custom-llm",
    "custom_llm": {
        "url": "https://api.anthropic.com/v1",
        "model_id": "claude-sonnet-4-5",
        "api_key": { "secret_id": "yrYwgLxgCS8SjHIdZF3b" },
        "request_headers": {
            "content-type": "application/json",
            "anthropic-beta": "prompt-caching-2024-07-31"
        },
        "api_version": "2023-06-01",
        "api_type": "chat_completions"
    }
}
```

This gives `claude-opus-4-6` on Qualification and `claude-sonnet-4-5` on sub-agents, all through the same backend type, so no backend switch occurs during transfers. You also retain full control over headers, model, and API key per node.

### Fix Option B: Switch Qualification to native, keep sub-agents native

Make the Qualification node use a native ElevenLabs model instead of custom-llm so all nodes use the same backend type. This eliminates the backend mismatch but means giving up the direct Anthropic API connection and `claude-opus-4-6` on the Qualification node.

Only viable if `claude-opus-4-6` and the custom headers (`fast-mode`, `prompt-caching`) aren't critical to the Qualification node.

### Fix Option C: Remove explicit `custom_llm: null` and test

Instead of setting `custom_llm: null` in the sub-agent nodes, remove the `custom_llm` key entirely. The platform may then inherit the parent's custom LLM config while still respecting the `llm: "claude-sonnet-4-5"` model selection. This is speculative and depends on ElevenLabs' override hierarchy, but it's a low-effort test worth trying before committing to a larger change.

### Fix Option D: Use the backup LLM cascade as a workaround

The existing `backup_llm_config` (order: `gemini-3-flash-preview`, `gemini-2.5-flash`, `claude-sonnet-4-5`, `custom-llm`) with `cascade_timeout_seconds: 8.0` might provide a fallback path. Reorder the cascade to try `custom-llm` first on the sub-agents. This is a partial mitigation — the custom-to-native switch during a workflow transfer is arguably a platform bug (1011 should not be thrown) and should also be filed with ElevenLabs support.

### Additional Fix: Tighten the Qualification node routing conditions

Regardless of which LLM backend fix is chosen, the Qualification node's `additional_prompt` is too permissive about transferring. A self-assessment question ("what is missing from you?") should not trigger a Thought Partner transfer. Add explicit negative conditions:

> "Self-reflection questions about your own capabilities, knowledge base, or configuration should be handled in this node — do NOT transfer for these."

### Additional Fix: Validate `api_type` configuration

Investigate whether `api_type: "chat_completions"` is the correct setting for the Anthropic Messages API endpoint. If ElevenLabs supports an `anthropic` or `messages` API type, switching to it may resolve the prompt caching issue (all turns currently show 0 cache read/write tokens) and improve compatibility.

### Additional Fix: Test all workflow transitions

Since all four sub-agent nodes share the same problematic LLM configuration pattern, test each transition path after applying fixes to ensure none of them reproduce the crash.

---

## Summary

The conversation crashed because the workflow engine transferred the call from a node using a **custom LLM backend** (direct Anthropic API) to a node using an **ElevenLabs native model** (`claude-sonnet-4-5` with `custom_llm: null`). This LLM backend switch mid-conversation caused ElevenLabs' server to throw an unrecoverable error (1011). The transfer was also semantically incorrect — the user's self-assessment request should have stayed in the Qualification node. All four sub-agent nodes in the workflow share this same vulnerable configuration and would likely fail on any transfer from the Qualification node.

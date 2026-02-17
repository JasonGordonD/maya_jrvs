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

## SDK & Documentation Findings

The following findings are sourced from the ElevenLabs Python SDK v2.36.0 and TypeScript SDK, both auto-generated from the official API definition (Fern).

### Finding 1: `custom_llm` is only used when `llm` is `"custom-llm"`

The SDK docstring for the `customLlm` field in `PromptAgentApiModelWorkflowOverrideInput` states:

> **"Definition for a custom LLM if LLM field is set to 'CUSTOM_LLM'"**

This means the `custom_llm` configuration block is **completely ignored** when `llm` is set to any native model (e.g., `claude-sonnet-4-5`). The two fields are tightly coupled. There is no way to use a custom LLM endpoint while selecting a native model identifier.

### Finding 2: Only two `api_type` options exist — no Anthropic-native format

```typescript
export const CustomLlmapiType = {
    ChatCompletions: "chat_completions",
    Responses: "responses",
} as const;
```

The only supported values are `chat_completions` (OpenAI Chat Completions format) and `responses` (OpenAI Responses API). There is **no Anthropic-specific `api_type`** (no `"anthropic"`, no `"messages"`). The `CustomLlm.url` is documented as "The URL of the **Chat Completions compatible** endpoint."

Anthropic does expose a Chat Completions compatibility endpoint at `/v1/chat/completions` (confirmed via HTTP probe — returns auth error, not 404). This is how the current custom-llm config works. However, this compatibility layer does **not** support Anthropic-specific features like prompt caching (which requires `cache_control` markers in the native Messages API format). This explains why all turns show 0 cache read/write tokens despite the `prompt-caching-2024-07-31` beta header.

### Finding 3: Claude Opus is NOT available as a native ElevenLabs model

The complete list of native Claude models in the `Llm` enum:
- `claude-sonnet-4-5`, `claude-sonnet-4`, `claude-haiku-4-5`
- `claude-3-7-sonnet`, `claude-3-5-sonnet`, `claude-3-5-sonnet-v1`, `claude-3-haiku`
- Pinned versions: `claude-sonnet-4@20250514`, `claude-sonnet-4-5@20250929`, etc.

**No `claude-opus-*` variant exists.** To use Claude Opus 4.6, you **must** use `llm: "custom-llm"` with a `custom_llm` block.

### Finding 4: Override agent node semantics — `null` means "inherit from parent"

In the `PromptAgentApiModelWorkflowOverrideInput`, all fields default to `None`/`undefined`, meaning "inherit from the parent agent." But when a field is explicitly set, it overrides the parent. The current sub-agent config sets:

```json
{ "llm": "claude-sonnet-4-5", "custom_llm": null }
```

Since `llm` is explicitly set to a native model, the system switches to the native backend. The `custom_llm: null` is redundant here because `custom_llm` is only consulted when `llm` equals `"custom-llm"` (per Finding 1). Even removing `custom_llm: null` would not help — the node would still use native `claude-sonnet-4-5`.

### Finding 5: `responses` api_type has no Anthropic equivalent

Anthropic's `/v1/responses` endpoint returns 404 (Not Found). The `responses` api_type only works with OpenAI's Responses API. This rules it out as an alternative for the Anthropic endpoint.

---

## Recommended Fixes

### Option A: Per-node custom LLM endpoints with different models (Recommended)

**This is the only option that preserves Claude Opus 4.6 on Qualification while using different models on sub-agents.**

Per Finding 1, the `custom_llm` block is only used when `llm: "custom-llm"`. Per Finding 3, Claude Opus is not available natively. Therefore, to use Opus on Qualification and Sonnet on sub-agents, all nodes must use `llm: "custom-llm"` with per-node `custom_llm` configurations specifying different `model_id` values.

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

This keeps all nodes on the same `custom-llm` backend type (no backend switch during transfers) while allowing different Anthropic models per node. Opus on Qualification, Sonnet 4.5 on sub-agents.

**Why this must use `custom-llm` on the sub-agents too:** Per Finding 1, the `custom_llm` field is only used when `llm` is set to `"custom-llm"`. There is no hybrid mode where you select a native model name but route through a custom endpoint. The `llm` field and `custom_llm` block are an all-or-nothing pair.

### Option B: Switch everything to native models (if Opus is not required)

If Claude Opus 4.6 is not strictly required, change **all** nodes to use native ElevenLabs models. This eliminates the backend mismatch entirely.

| Node | Current Config | New Config |
|------|---------------|------------|
| Qualification | `custom-llm` (Opus 4.6) | `claude-sonnet-4` (native) |
| Thought Partner | `claude-sonnet-4-5` (native) | `claude-sonnet-4-5` (native) — no change |
| Coding | `claude-sonnet-4-5` (native) | `claude-sonnet-4-5` (native) — no change |
| Heavy Duty | `claude-sonnet-4-5` (native) | `claude-sonnet-4-5` (native) — no change |
| Dr. Tijoux | `claude-sonnet-4-5` (native) | `claude-sonnet-4-5` (native) — no change |

This is the cleanest option for stability. The native models are `claude-sonnet-4` (latest Sonnet 4) and `claude-sonnet-4-5` (Sonnet 4.5). You also get the benefit of ElevenLabs handling the Anthropic integration internally, including any platform-level optimizations.

**What you lose:** Claude Opus 4.6, custom Anthropic headers (`fast-mode`, `prompt-caching`), and direct API key control.

**What you gain:** Zero backend mismatch risk, simpler configuration, ElevenLabs-managed model routing and backup cascading.

### Option C: Remove `llm` override from sub-agents entirely (inherit parent's custom-llm)

If you don't set the `llm` field on sub-agent nodes at all (leave it as `null`/undefined), the node inherits the parent's `llm: "custom-llm"` and its associated `custom_llm` configuration. All nodes would then use Claude Opus 4.6 via the custom endpoint.

In each sub-agent node, change:
```json
{
    "llm": "claude-sonnet-4-5",
    "custom_llm": null
}
```
to:
```json
{}
```

This is the simplest fix if having the same model (Opus 4.6) on all nodes is acceptable. The sub-agents would inherit everything from the base agent config.

### Why Option C (removing `custom_llm: null` alone) won't fix it

Per Finding 1 and Finding 4: even if you remove the `custom_llm: null` from sub-agent nodes, the `llm: "claude-sonnet-4-5"` override still forces the node to use the native ElevenLabs model. The `custom_llm` field is irrelevant when `llm` is anything other than `"custom-llm"`. You must either change `llm` to `"custom-llm"` (Option A), change it to a different native model while also changing Qualification to native (Option B), or remove the `llm` override entirely to inherit the parent (Option C).

### Additional Fix: Tighten the Qualification node routing conditions

Regardless of which LLM backend fix is chosen, the Qualification node's `additional_prompt` is too permissive about transferring. A self-assessment question ("what is missing from you?") should not trigger a Thought Partner transfer. Add explicit negative conditions:

> "Self-reflection questions about your own capabilities, knowledge base, or configuration should be handled in this node — do NOT transfer for these."

### Additional Fix: Prompt caching is non-functional through Chat Completions compatibility

Per Finding 2, ElevenLabs' custom LLM integration only supports `chat_completions` and `responses` API types. The Anthropic Chat Completions compatibility endpoint (`/v1/chat/completions`) does not support Anthropic-specific features like prompt caching. The `anthropic-beta: prompt-caching-2024-07-31` header is being sent but has no effect through this path. The same likely applies to `fast-mode-2026-02-01`.

If prompt caching is important for cost optimization, this would need to be raised with ElevenLabs as a feature request (native Anthropic Messages API support as an `api_type` option), or handled outside ElevenLabs via a proxy that translates between Chat Completions and the native Anthropic Messages API while adding cache_control markers.

### Additional Fix: Test all workflow transitions

Since all four sub-agent nodes share the same problematic LLM configuration pattern, test each transition path after applying fixes to ensure none of them reproduce the crash. Also test backward transitions (sub-agent back to Qualification).

---

## Summary

The conversation crashed because the workflow engine transferred the call from a node using a **custom LLM backend** (direct Anthropic API via Chat Completions compatibility) to a node using an **ElevenLabs native model** (`claude-sonnet-4-5` with `custom_llm: null`). Per the ElevenLabs SDK documentation, the `custom_llm` block is only used when `llm` is set to `"custom-llm"` — meaning the sub-agent nodes were genuinely switching to a completely different backend type, not just a different model. This backend switch mid-conversation caused ElevenLabs' server to throw an unrecoverable error (1011).

The transfer was also semantically incorrect — the user's self-assessment request should have stayed in the Qualification node. All four sub-agent nodes share this same vulnerable configuration pattern and would crash on any transfer from the Qualification node.

**The best fix depends on requirements:**
- If Claude Opus 4.6 is required: **Option A** (per-node custom LLM with different model_ids — all nodes stay on `custom-llm` backend type)
- If Claude Opus 4.6 is not required: **Option B** (switch Qualification to a native model like `claude-sonnet-4`)
- If the same model on all nodes is acceptable: **Option C** (remove `llm` override from sub-agents so they inherit the parent's custom-llm config)

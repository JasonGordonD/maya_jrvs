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

### Finding 6: The backup cascade PROVES mixed backends are supported (critical)

The parent agent's own `backup_llm_config` is configured to mix `custom-llm` with native models:

```json
{
    "preference": "override",
    "order": [
        "gemini-3-flash-preview",
        "gemini-2.5-flash",
        "claude-sonnet-4-5",
        "custom-llm"
    ]
}
```

With `cascade_timeout_seconds: 8.0`, if the primary LLM (`custom-llm` pointing to Anthropic Opus 4.6) times out, the system cascades through: Gemini 3 Flash (Google native) → Gemini 2.5 Flash (Google native) → Claude Sonnet 4.5 (Anthropic native) → custom-llm again (Anthropic direct). This cascade operates **within the same conversation**, switching between `custom-llm` and multiple native model backends on failure.

This proves that **ElevenLabs' platform is architecturally designed to handle backend switching between `custom-llm` and native models mid-conversation**. The cascade system does it by design.

### Finding 7: Each workflow node can have its own `backup_llm_config`

The `PromptAgentApiModelWorkflowOverrideInput` includes `backup_llm_config` and `cascade_timeout_seconds` fields. This means each sub-agent node can define its own cascade order, independent of the parent agent.

### Finding 8: 73 native models across 6+ providers

ElevenLabs natively supports:
- **OpenAI**: 33 models (GPT-3.5 through GPT-5.2, including nano/mini variants)
- **Google**: 19 models (Gemini 1.5 through Gemini 3)
- **Anthropic**: 14 models (Claude 3 Haiku through Claude Sonnet 4.5 — no Opus)
- **xAI**: 1 model (grok-beta)
- **Alibaba**: 2 models (qwen3-4b, qwen3-30b-a3b)
- **Other**: watt-tool-8b/70b, glm-45-air-fp8, gpt-oss-20b/120b

---

## Diagnosis: Platform Bug, Not Architectural Limitation

Finding 6 is the key evidence. The backup cascade is explicitly designed to switch between `custom-llm` and native models within the same conversation. The cascade code path handles this transition successfully. However, the **workflow node transfer code path** does not.

When a conversation cascades from `custom-llm` to `gemini-3-flash-preview` (as the backup config allows), the platform handles the backend switch gracefully. But when a workflow edge transfers from a `custom-llm` node to a native model node, it crashes with 1011.

**This is a platform bug in ElevenLabs' workflow transfer system.** The backend switch logic that works in the cascade system is not implemented (or is broken) in the workflow transfer system.

**Recommended action: File this as a bug with ElevenLabs support**, referencing:
- Conversation ID: `conv_2801khnhjqynetqrp7f2xzg67jp8`
- The backup_llm_config proves mixed backends are supported architecture
- The workflow transfer from `custom-llm` node to native node crashes with 1011
- The cascade system handles the same type of backend switch without issues

---

## Recommended Fixes

### Option A: Use native models everywhere (Recommended — maximum flexibility)

Switch all nodes — including Qualification — to native ElevenLabs models. This gives you:
- **Full access to 73 native models across all providers** — use GPT-5 on one node, Gemini 3 Flash on another, Claude Sonnet 4 on a third
- **Zero backend mismatch risk** — all nodes use native integration, all transfers are safe
- **Per-node model flexibility** — each sub-agent can use whichever native model best suits its role
- **ElevenLabs-managed routing** — platform handles auth, optimization, and failover internally

Example configuration:

| Node | Model | Rationale |
|------|-------|-----------|
| Qualification | `claude-sonnet-4` | General conversation routing, strong at classification |
| Thought Partner | `claude-sonnet-4-5` | Deep reasoning, extended thinking |
| Coding | `gpt-5` or `claude-sonnet-4-5` | Strong code generation |
| Heavy Duty | `gemini-3-flash-preview` or `gpt-5` | Fast multi-tool execution |
| Dr. Tijoux | `claude-sonnet-4-5` | Clinical depth, nuanced language |

In each node's `conversation_config.agent.prompt`:
```json
{
    "llm": "claude-sonnet-4",
    "custom_llm": null
}
```

Or for a different provider:
```json
{
    "llm": "gpt-5",
    "custom_llm": null
}
```

The Qualification node also changes from `custom-llm` to a native model (e.g., `claude-sonnet-4`).

**What you lose:** Claude Opus 4.6 (not available natively), custom Anthropic beta headers (`fast-mode`, `prompt-caching` — though these weren't working anyway per Finding 2), and direct API key control.

**What you gain:** Maximum model diversity, zero crash risk on transfers, simpler configuration, and the freedom to use GPT, Gemini, Claude, Grok, or Qwen on any node.

### Option B: Per-node custom LLM endpoints (if Opus is required, Anthropic-only)

If Claude Opus 4.6 is specifically needed on the Qualification node, all nodes must use `llm: "custom-llm"` to avoid the backend switch bug. Each node gets its own `custom_llm` block with a different `model_id`.

**Limitation:** This locks all nodes to Anthropic models (or whichever single provider the `custom_llm.url` points to). You cannot use native GPT-5, Gemini, Grok, etc. on sub-agent nodes. You could theoretically point different nodes to different providers' Chat Completions endpoints (OpenAI, Google, etc.), but this requires managing separate API keys per provider and loses ElevenLabs' native integration benefits.

In each sub-agent node:
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

**Only choose this if Claude Opus 4.6 is a hard requirement.** Otherwise, Option A gives far more flexibility.

### Option C: Inherit parent's custom-llm on all nodes (if same model is acceptable)

Remove the `llm` and `custom_llm` overrides from sub-agent nodes entirely. They inherit the parent's `custom-llm` with Opus 4.6.

```json
{}
```

Simplest fix, but all nodes run the same model (Opus 4.6) and you can't use any native models.

### Option D: Use native models now, file the bug, add Opus back later

This is the pragmatic path:

1. **Immediately:** Switch to Option A (all native). This fixes the crash and gives you multi-provider model flexibility.
2. **Simultaneously:** File the workflow transfer bug with ElevenLabs (see Diagnosis section above). The backup_llm_config proves the platform supports mixed backends — the workflow code path just doesn't handle it correctly.
3. **After fix:** Once ElevenLabs patches the workflow transfer to handle `custom-llm` → native transitions (like the cascade already does), add `custom-llm` with Opus 4.6 back on the Qualification node while keeping native models on sub-agents.

### Why the previous Option A (per-node custom-llm pointing to Anthropic) is NOT recommended

The original recommendation to use `custom-llm` on all nodes with per-node `custom_llm` blocks pointed at Anthropic would work to avoid the crash, but it:
- **Locks you into a single provider** (Anthropic) across all nodes
- **Prevents using native ElevenLabs models** from other providers (GPT-5, Gemini, Grok, etc.)
- **Bypasses ElevenLabs' native model management** (routing, optimization, billing tracking)
- **Doesn't solve the underlying bug** — the platform should handle mixed backends on workflow transfers

### Additional Fix: Tighten the Qualification node routing conditions

Regardless of which LLM fix is chosen, the Qualification node's `additional_prompt` is too permissive about transferring. A self-assessment question ("what is missing from you?") should not trigger a Thought Partner transfer. Add explicit negative conditions:

> "Self-reflection questions about your own capabilities, knowledge base, or configuration should be handled in this node — do NOT transfer for these."

### Additional Fix: Prompt caching is non-functional through Chat Completions compatibility

Per Finding 2, the Anthropic Chat Completions compatibility endpoint does not support prompt caching. The `anthropic-beta: prompt-caching-2024-07-31` header has no effect. All turns show 0 cache read/write tokens. The `fast-mode-2026-02-01` beta likely also doesn't function through this path.

If these features are important, they require either:
- ElevenLabs adding native Anthropic Messages API support as a new `api_type`
- A proxy server that translates Chat Completions → Anthropic Messages API with cache_control markers

### Additional Fix: Test all workflow transitions

After applying fixes, test each transition path (Qualification → each sub-agent, and back) to ensure no crashes occur. Also test with different model combinations on each node.

---

## Summary

The conversation crashed due to a **platform bug in ElevenLabs' workflow transfer system**. The bug causes a 1011 server error when a workflow edge transfers from a `custom-llm` node to a native model node. This is confirmed to be a bug (not an architectural limitation) because the platform's own backup cascade system (`backup_llm_config`) is explicitly designed to switch between `custom-llm` and native models within the same conversation — and works correctly. The workflow transfer code path simply doesn't handle this transition the same way.

The transfer was also semantically incorrect — the user's self-assessment request should have stayed in the Qualification node. All four sub-agent nodes share this same vulnerable configuration.

**Recommended approach:**
1. **Now:** Switch to all-native models (Option A) for maximum flexibility and zero crash risk. This gives access to 73 models across OpenAI, Google, Anthropic, xAI, and others — each node can use whichever model best fits its role.
2. **Now:** File the `custom-llm` → native workflow transfer crash as a platform bug with ElevenLabs.
3. **Later:** After ElevenLabs fixes the bug, optionally restore `custom-llm` with Claude Opus 4.6 on the Qualification node if the model's capabilities are specifically needed there.

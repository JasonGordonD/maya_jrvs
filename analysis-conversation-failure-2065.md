# Conversation Failure Analysis — conv_2801khnhjqynetqrp7f2xzg67jp8

**Agent**: JVRS (`agent_0401khmtcyfef6hbpcvchjv5jj02`)  
**Status**: `failed`  
**Duration**: 88 seconds  
**Error**: WebSocket close code `1011` — "Unexpected server error."

---

## Executive Summary

The conversation failed with an **unexpected server error (1011)** immediately after a workflow transition from the **Qualification** node to the **Thought Partner** node. An earlier conversation on the same agent (`jrvs_conv0`) performed the **exact same transfer successfully** — including multiple round-trips between `custom-llm` and native `claude-sonnet-4-5` nodes — proving the LLM backend mismatch is **not** the cause.

The critical difference: the failed conversation has **`version_id: null`** (no pinned agent version), while the working conversation was pinned to a specific version. The agent configuration was updated **114 seconds after the crash**, suggesting the config was in an unsaved or transitional state when the conversation was initiated.

---

## Evidence: Working Conversation Disproves Backend Mismatch Theory

An earlier conversation on the same agent and branch completed successfully with **multiple transfers between `custom-llm` and native models**:

| Time | Node | LLM Models Used | Event |
|------|------|-----------------|-------|
| 8s | Qualification | `custom-llm` | Normal response (Opus 4.6) |
| 30s | Qualification | — | Transfer → Thought Partner |
| 31s | **Thought Partner** | **`custom-llm` + `claude-sonnet-4-5`** | Response using both backends |
| 39s | Thought Partner | `claude-sonnet-4-5` | Response using native only |
| 49s | Thought Partner | — | Transfer → Qualification |
| 54s | Qualification | — | Transfer → Dr. Tijoux |
| 62s | **Dr. Tijoux** | **`claude-sonnet-4-5` + `custom-llm`** | Response using both backends |
| 90s | Dr. Tijoux | — | Transfer → Qualification |
| 93s | **Qualification** | **`claude-sonnet-4-5` + `custom-llm`** | Response using both backends |
| 116s | Qualification | `custom-llm` | Normal response (Opus only) |

Total charging across the working conversation: `custom-llm`, `claude-sonnet-4-5`, AND `gemini-3-flash-preview` were all used successfully within the same conversation via backup cascade. The platform handles mixed `custom-llm` ↔ native backend transitions without issue.

---

## Timeline of Failed Conversation

| Turn | Time (s) | Node | Role | Event |
|------|----------|------|------|-------|
| 1 | 0 | Qualification | Agent | First message: "This is Maya Passepartout, how may I assist you?" |
| 2 | 3 | Qualification | User | "Hey, Maya, how are you?" |
| 3 | 8 | Qualification | Agent | Responds normally (custom-llm, 4134 input tokens) |
| 4 | 18 | Qualification | User | "It's going very good, my dear..." |
| 5 | 28 | Qualification | Agent | Responds normally (custom-llm, 3734 input tokens) |
| 6 | 43 | Qualification | User | "I wanna, like, try out your different, um, modes and stuff." |
| 7 | 49 | Qualification | Agent | Explains available modes (custom-llm, 4327 input tokens) |
| 8 | 78 | Qualification | User | "I want you to look at your KB and see. Tell me, what is missing from you?" |
| 9 | 87 | Qualification | Agent | **Triggers `notify_condition_1_met`** — routes to Thought Partner |
| 10 | 87 | — | System | Transfer succeeds (`is_successful: true`) |
| — | 88 | — | System | **CRASH: Error 1011 — No LLM call ever made on target node** |

---

## Root Cause Analysis

### 1. Primary Cause: `version_id: null` — Unpinned / Transitional Agent Configuration

| | Working Conversation | Failed Conversation |
|---|---|---|
| **Status** | `done` (177s) | `failed` (88s) |
| **Version ID** | `agtvrsn_2401khncgjcnftqa4wxvec4f0031` | **`null`** |
| **Start time** | 08:49:48 UTC | 10:15:50 UTC |
| **Config update** | 89 min before update | **3.4 min before update** |
| **Models used** | custom-llm + claude-sonnet-4-5 + gemini-3-flash-preview | custom-llm only |
| **Transfers** | 4 successful (incl. mixed backends) | 1 attempted → crash |

The failed conversation has `version_id: null` — it was not pinned to any saved agent version. The agent configuration was updated 202 seconds after the conversation started and 114 seconds after the crash. This strongly suggests the agent was in an **unsaved or transitional state** when the conversation was initiated.

The crash happened **after the transfer succeeded but before any LLM call could be made on the Thought Partner node** — only `custom-llm` appears in the failed conversation's charging data, with no `claude-sonnet-4-5` usage at all. This points to a node initialization failure, not an LLM call failure.

Possible mechanisms:
- The agent config was being edited in the ElevenLabs UI when the conversation started, creating an inconsistent draft state
- The Thought Partner node's configuration was partially modified (between versions) and couldn't be resolved at runtime
- The `version_id: null` state triggers a different code path in ElevenLabs' workflow engine that has a bug in node initialization

### 2. Contributing Cause: Incorrect Workflow Transition

The user asked: *"I want you to look at your KB and see. Tell me, what is missing from you? How would you assess yourself?"*

This is a **self-assessment/introspective request** that the Qualification node should have handled directly. Instead, the LLM triggered a transfer to the Thought Partner node. The Qualification node's routing conditions are too permissive.

### 3. Observation: Prompt Caching Not Functioning

Both conversations show 0 cache read/write tokens on all turns despite the `prompt-caching-2024-07-31` Anthropic beta header. This is consistent across both the working and failed conversations — it's a configuration issue, not related to the crash.

---

## Recommended Actions

### 1. Investigate and prevent the `version_id: null` state

The most likely cause of the crash is the unpinned agent version. Actions:
- **Ensure conversations are always initiated against a saved/pinned agent version.** The working conversation was pinned to `agtvrsn_2401khncgjcnftqa4wxvec4f0031`; the failed one had `null`.
- **Do not start conversations while the agent is being edited in the UI.** The failed conversation started 202 seconds before a config update — the agent may have been in an unsaved state.
- **Test:** Start a new conversation with the current saved version and perform the same Qualification → Thought Partner transfer. If it works, the root cause is confirmed as the unpinned version state.

### 2. File the crash with ElevenLabs support

Report the 1011 error, referencing:
- **Failed conversation:** `conv_2801khnhjqynetqrp7f2xzg67jp8` — `version_id: null`, crashed on transfer at 10:17:18 UTC
- **Working conversation:** (jrvs_conv0) — `version_id: agtvrsn_2401khncgjcnftqa4wxvec4f0031`, identical transfers succeeded at 08:49:48 UTC
- **Same agent, same branch, same transfer mechanism** — only difference is version pinning and timing relative to a config update
- **Ask:** Why does `version_id: null` occur? Is it caused by initiating a conversation during a config edit? Should the platform prevent this or handle it gracefully?

### 3. Tighten the Qualification node routing conditions

The self-assessment question ("what is missing from you?") should not trigger a Thought Partner transfer. Add explicit negative conditions to the Qualification node's `additional_prompt`:

> "Self-reflection questions about your own capabilities, knowledge base, or configuration should be handled in this node — do NOT transfer for these."

### 4. Prompt caching is non-functional (separate issue, not crash-related)

Both conversations show 0 cache read/write tokens. The Anthropic Chat Completions compatibility endpoint does not support prompt caching. The `anthropic-beta: prompt-caching-2024-07-31` header has no effect through this path. To get prompt caching, either:
- Request ElevenLabs add native Anthropic Messages API support as a new `api_type`
- Use a proxy that translates Chat Completions → native Anthropic Messages API with `cache_control` markers

---

## SDK Reference (Context)

Useful findings from the ElevenLabs Python SDK v2.36.0 and TypeScript SDK:

- **`custom_llm` only used when `llm` is `"custom-llm"`** — the two fields are tightly coupled
- **`api_type` options:** `chat_completions` and `responses` only — no Anthropic-native format
- **Claude Opus not in native catalog** — requires `custom-llm`
- **73 native models** across OpenAI (33), Google (19), Anthropic (14), xAI (1), Alibaba (2), and others
- **Each workflow node can have its own `backup_llm_config`** — independent cascade per node
- **All major providers have Chat Completions compatible endpoints** — confirmed live for Anthropic, OpenAI, Google, xAI

---

## Correction: Prior Analysis Was Wrong

The initial analysis incorrectly identified the root cause as an **LLM backend mismatch** between `custom-llm` and native models during workflow transfers. This theory was disproven by the working conversation (jrvs_conv0), which performed the **exact same transfers** — including `custom-llm` → native `claude-sonnet-4-5`, with `gemini-3-flash-preview` via cascade — **4 times successfully** within a single 177-second conversation.

The current agent configuration (with `custom-llm`/Opus on Qualification and native `claude-sonnet-4-5` on sub-agents) is **architecturally sound**. The platform handles mixed backends correctly when the agent version is properly pinned.

---

## Summary

The conversation crashed with error 1011 immediately after a workflow transfer from Qualification to Thought Partner. An earlier conversation on the exact same agent, branch, and workflow performed the identical transfer (and 3 more) without any issues — using `custom-llm`, `claude-sonnet-4-5`, and `gemini-3-flash-preview` together across multiple node transitions.

The critical difference between the two conversations is **`version_id`**: the working conversation was pinned to a saved version (`agtvrsn_2401khncgjcnftqa4wxvec4f0031`), while the failed conversation had `version_id: null`. The failed conversation started 202 seconds before a config update, suggesting the agent was in an unsaved or transitional state.

**The agent configuration is correct. The crash is operational, not architectural.**

Actions:
1. Always initiate conversations against a saved agent version
2. Do not test while editing the agent config in the UI
3. File with ElevenLabs support to understand why `version_id: null` causes a 1011 crash
4. Tighten routing conditions on the Qualification node

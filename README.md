# JRVS Dashboard (Maya AI Assistant)

Comprehensive operator, developer, and deployment manual for the JRVS Dashboard.

This project is a Next.js app that runs the Maya/JRVS live assistant UI, integrates with ElevenLabs (11 Labs) conversational APIs, and uses Supabase (Edge Functions + Postgres) for session continuity summarization.

---

## Table of Contents

1. [What this project is](#what-this-project-is)
2. [Deployed components (11 Labs + Supabase)](#deployed-components-11-labs--supabase)
3. [Complete feature inventory](#complete-feature-inventory)
4. [End-to-end runtime architecture and data flows](#end-to-end-runtime-architecture-and-data-flows)
5. [Local development quickstart](#local-development-quickstart)
6. [Environment variables (full matrix)](#environment-variables-full-matrix)
7. [Internal API reference](#internal-api-reference)
8. [ElevenLabs (11 Labs) runbook](#elevenlabs-11-labs-runbook)
9. [Supabase runbook](#supabase-runbook)
10. [Database contract for session continuity](#database-contract-for-session-continuity)
11. [Operator workflow guide](#operator-workflow-guide)
12. [Security posture and hardening checklist](#security-posture-and-hardening-checklist)
13. [Performance analysis artifacts](#performance-analysis-artifacts)
14. [Optional/unwired modules](#optionalunwired-modules)
15. [Commands and tooling](#commands-and-tooling)
16. [Repository map](#repository-map)
17. [Branch protocol](#branch-protocol)
18. [Troubleshooting](#troubleshooting)

---

## What this project is

JRVS Dashboard is a live operations console for Maya:

- **Real-time sessions** with ElevenLabs conversational runtime.
- **Dual interaction modes** (voice mode and text mode).
- **Transcript + observability tooling** (search/copy/download, tool logs, error logs).
- **Session continuity pipeline** (40-minute auto-restart + Supabase Edge summarization).
- **Agent configuration introspection** via snapshot APIs and transfer-map UI.

The app is designed for active production-style operation, not just demo chat.

---

## Deployed components (11 Labs + Supabase)

### ElevenLabs (11 Labs) deployed elements

1. **JRVS Conversational Agent** (identified by `MJRVS_ELEVENLABS_AGENT_ID`).
2. **Signed conversation URL flow** (via `/v1/convai/conversation/get-signed-url`).
3. **Agent config retrieval** (via `/v1/convai/agents/{agent_id}`).
4. **Conversation transcript retrieval** for summarization (via `/v1/convai/conversations/{conversationId}`).
5. **Optional Scribe realtime token flow** for speech-to-text (`scribe_v2_realtime`).

### Supabase deployed elements

1. **Edge Function:** `mjrvs_summarize_session`
   - Pulls transcript from ElevenLabs.
   - Summarizes with Anthropic.
   - Embeds summary with Voyage AI.
   - Writes continuity memory to Supabase table `mjrvs_memories`.
2. **Postgres table:** `mjrvs_memories` (schema described below).
3. **Next.js proxy route:** `/api/mjrvs/summarize-session` invokes the Edge Function using service role credentials.

### Supporting external models/services

- **Anthropic** (`claude-opus-4-6`) for summarization.
- **Voyage AI** (`voyage-4-large`) for embedding generation.

---

## Complete feature inventory

This section captures the implemented feature set in the current repository.

### 1) Conversation lifecycle and session control

- Start/end live conversation from `ConversationBar`.
- Connection states: `disconnected`, `connecting`, `connected`, `disconnecting`.
- New Session action resets local UI state and starts fresh session.
- Conversation ID capture and copy in header.
- Live session timer in header.
- Connection status dot + status label.
- Agent speaking indicator badge.

### 2) Interaction modes and audio routing

- **Assistant Mode selector**:
  - Voice Mode
  - Text Mode
  - Mode is intentionally locked while session is active.
- **Audio Input Mode selector**:
  - Mic Only
  - Device Audio
  - Mic + Device Audio
- Device/mixed modes use browser display-audio capture; mixed mode combines mic+system audio via Web Audio API.
- Changing audio mode while connected prompts restart confirmation.

### 3) Mic and waveform tooling

- Microphone device selector dropdown.
- Permission-aware device listing with live device-change refresh.
- Inline mute toggle in mic selector.
- Live waveform preview in selector dropdown.
- Conversation-level mute/unmute control.
- Keyboard shortcut `m` toggles mute when not typing.

### 4) Messaging, attachments, and transcript

- Real-time user/assistant message ingestion.
- Keyboard panel for text entry (always open in connected text mode).
- Enter-to-send, Shift+Enter newline behavior.
- Attachment picker supports:
  - `.pdf, .txt, .md, .docx, .json, .csv, .png, .jpg, .jpeg`
- Attachment behavior:
  - Text-like files are read client-side and truncated to 4000 chars.
  - Non-text files are summarized as metadata only.
  - Attachments are sent as contextual updates + attachment notice messages.
- Per-message copy action.
- Full transcript copy.
- Full transcript Markdown download (`mjrvs_trans_MMDDYY_HHMM.md`).

### 5) Transcript search and navigation

- In-transcript search with live match counting.
- Keyboard shortcuts:
  - `Ctrl/Cmd + F` opens search.
  - `Enter` next match.
  - `Shift + Enter` previous match.
  - `Esc` closes search.
- Active-match highlight and scroll behavior.

### 6) Tool observability and error observability

- **Tool Call Log panel**
  - Captures tool name/action/params/result summary.
  - De-duplicates near-identical sequential entries.
  - Copy-to-clipboard for full panel content.
- **Error Log panel**
  - Captures conversation and tool errors.
  - Severity bucketing (`auth`, `timeout`, `connection`, `error`, `other`).
  - Copy-to-clipboard for full panel content.
- Mobile tab switch for Tools vs Errors.

### 7) Agent client-tools bridge

Client-side tools exposed to the connected agent:

- `display_structured_content`
- `report_tool_dispatch`
- `report_active_node`

These tool handlers:

- Append structured transcript content.
- Update active node display.
- Populate tool/error logs from tool dispatch telemetry.
- Wrap execution and report success/error status.

### 8) Structured outputs and generated image rendering

- Structured markdown blocks rendered with `react-markdown` + `remark-gfm`.
- Copy raw markdown from structured blocks.
- Tool-result image extraction and rendering:
  - Supports images embedded in structured/tool payloads.
  - Displays revised prompt captions when present.
- Assistant markdown rendering uses `streamdown`.

### 9) Session continuity and automatic restart

- 40-minute threshold warning banner with countdown.
- Restart controls:
  - Restart Now
  - Dismiss
  - Automatic restart at countdown expiry
- Restart sequence:
  1. Calls `/api/mjrvs/summarize-session` with conversation metadata.
  2. Disconnects current session.
  3. Starts new session automatically.
  4. Sends one-time post-connect contextual update:
     - "Session context restored. Previous session summary loaded into memory."
  5. Appends structured transcript marker:
     - "Session restarted - context preserved"

### 10) Session history and cached transcript view

- Session history sidebar with active/ended labeling.
- Stored fields include start/end times, durations, transcript snapshot, label.
- Rename session label action.
- Re-open ended session transcript in "Cached Transcript" mode.
- History is **in-memory only** (not persisted).

### 11) Agent Config Inspector

- Slide-in "Agent Config" panel.
- Fetches `/api/agent-config` snapshot:
  - source: `cache` or `live`
  - optional refresh call (`?refresh=1`)
- Groups chunks by:
  - Root Prompt
  - Nodes
  - Edges
  - Tools
  - Global Config
- Transfer map section:
  - Node relationships
  - Jump-to-node behavior from map entries
- Copy full chunk content (JSON/text).

### 12) Performance analysis support

- Offline analysis script:
  - `jrvs_v3_latency_analysis.py`
- Artifacts:
  - `jrvs_v3_latency_raw.json`
  - `jrvs_v3_latency_summary.md`
- Tracks conversational latency including LLM TTFB and TTS TTFB breakdowns.

---

## End-to-end runtime architecture and data flows

### High-level architecture

```text
Browser UI (Next.js client)
  |
  |-- GET /api/signed-url --------------------------> ElevenLabs convai signed URL
  |-- GET /api/agent-config ------------------------> ElevenLabs agent config API
  |-- POST /api/mjrvs/summarize-session ------------> Supabase Edge Function
  |                                                     |
  |                                                     |-- fetch transcript from ElevenLabs
  |                                                     |-- summarize via Anthropic
  |                                                     |-- embed via Voyage
  |                                                     '-- insert into Supabase Postgres
  |
  '-- (optional) GET/POST /api/scribe-token --------> ElevenLabs Scribe realtime token
```

### Flow A: Start a conversation session

1. UI calls `GET /api/signed-url`.
2. Backend fetches ElevenLabs signed URL using server API key + agent id.
3. UI starts live session through `@elevenlabs/react` with signed URL.
4. Conversation ID is reported back and displayed in header.

### Flow B: Agent config inspection

1. Inspector opens and requests `/api/agent-config`.
2. API returns cached snapshot if available (or live if requested).
3. Snapshot decomposes config into human-readable component chunks.
4. UI displays grouped chunks + transfer map.

### Flow C: Auto-restart continuity at ~40 minutes

1. Warning appears at threshold.
2. App posts session metadata to `/api/mjrvs/summarize-session`.
3. Next route proxies request to Supabase Edge Function with service role headers.
4. Edge Function:
   - Fetches transcript from ElevenLabs.
   - Summarizes with Anthropic.
   - Generates embedding via Voyage.
   - Writes memory record to `mjrvs_memories`.
5. UI reconnects and injects continuity update into new session.

---

## Local development quickstart

### Prerequisites

- Linux/macOS/WSL environment
- Node.js + npm
- Access to:
  - ElevenLabs API key and JRVS agent id
  - Supabase project + service role key
  - Anthropic API key
  - Voyage API key (required for Edge function)

### Setup

1. Copy env template:
   - `cp .env.example .env.local`
2. Fill all required variables (see matrix below).
3. Install deps:
   - `npm install`
4. Start dev server:
   - `npm run dev`
5. Open:
   - `http://localhost:3000`

### Cursor/Cloud agent setup

Run this at the start of each cloud-agent session:

```bash
bash scripts/mjrvs_agent_setup.sh
```

This script verifies node/npm, installs dependencies when needed, and checks TypeScript/Next tooling.

---

## Environment variables (full matrix)

> Important: all secrets are server-side. Do not expose API keys in client-side env.

| Variable | Required | Runtime scope | Purpose |
|---|---:|---|---|
| `MJRVS_ELEVENLABS_AGENT_ID` | Yes | Next.js server | Canonical JRVS agent id for signed URL + config snapshot |
| `ELEVENLABS_API_KEY` | Yes | Next.js server + Supabase Edge | ElevenLabs API access (signed URL, config, transcript fetch) |
| `ELEVEN_LABS_API_KEY` | Optional fallback | Next.js server | Alternate key name accepted by env resolver |
| `VITE_ELEVENLABS_API_KEY` | Optional fallback | Next.js server | Alternate key name accepted by env resolver |
| `SUPABASE_URL` | Yes | Next.js server + Supabase Edge | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Next.js server + Supabase Edge | Privileged key for Edge invocation + DB insert |
| `ANTHROPIC_API_KEY` | Yes (for summarizer) | Supabase Edge | Session summary generation |
| `VOYAGE_API_KEY` | Yes (for summarizer) | Supabase Edge | Embedding generation (`voyage-4-large`) |

### Notes

- `.env.example` currently includes core vars but does **not** include `VOYAGE_API_KEY`; add it in real deployments.
- Agent id resolution is intentionally centralized in `lib/server-env.ts`.

---

## Internal API reference

### `GET /api/signed-url`

Purpose: obtain ElevenLabs conversational signed URL.

- Requires: `ELEVENLABS_API_KEY`, `MJRVS_ELEVENLABS_AGENT_ID`
- Success: `{ "signedUrl": "..." }`
- Upstream source: ElevenLabs `/v1/convai/conversation/get-signed-url`

---

### `GET /api/agent-config`

Purpose: return agent config snapshot chunks for inspector UI.

Query params:

- `agent_id` (optional override)
- `refresh=1|true` forces live refresh

Returns:

- `chunks[]`
- `snapshot_at`
- `agent_id`
- `agent_name`
- `source` (`cache` or `live`)

### `POST /api/agent-config`

Purpose: force live snapshot fetch (same payload shape as GET refresh mode).

---

### `GET|POST /api/scribe-token` (optional path)

Purpose: mint ElevenLabs realtime Scribe token.

- Model id used: `scribe_v2_realtime`
- TTL: 300 seconds
- Returns: `{ "token": "..." }`
- Present for optional speech-input module; not currently wired into main page flow.

---

### `POST /api/mjrvs/summarize-session`

Purpose: proxy summarize request to Supabase Edge Function.

Request body:

```json
{
  "conversation_id": "conv_...",
  "session_duration_minutes": 42,
  "turn_count": 138
}
```

- Requires: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Upstream target: `${SUPABASE_URL}/functions/v1/mjrvs_summarize_session`
- Forwards upstream response body and content-type on success.

---

## ElevenLabs (11 Labs) runbook

### 1) Configure agent identity

Set:

- `MJRVS_ELEVENLABS_AGENT_ID=<your_jrvs_agent_id>`
- `ELEVENLABS_API_KEY=<server_side_key>`

### 2) Ensure conversational runtime compatibility

The dashboard expects:

- Signed URL flow enabled via ElevenLabs ConvAI API.
- Agent configured to handle voice and text session modes.
- Agent tool definitions aligned with client-exposed tool names:
  - `display_structured_content`
  - `report_tool_dispatch`
  - `report_active_node`

### 3) Validate signed URL pipeline

1. Start app locally.
2. Trigger session start in UI.
3. Confirm `GET /api/signed-url` returns `signedUrl`.
4. Confirm conversation connects and conversation ID appears.

### 4) Validate config inspector pipeline

1. Open "Agent Config" panel.
2. Confirm `/api/agent-config` returns grouped chunks.
3. Click "Refresh Snapshot" and verify source transitions to `live`.

### 5) Optional: validate Scribe token route

Call `/api/scribe-token` and confirm token response for `scribe_v2_realtime`.

---

## Supabase runbook

### 1) Deploy the Edge Function

Function source:

- `supabase/functions/mjrvs_summarize_session/index.ts`

Deployment command (as documented in source comment):

```bash
supabase functions deploy mjrvs_summarize_session --project-ref svqbfxdhpsmioaosuhkb
```

### 2) Set Supabase Edge secrets

Required in Edge runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ELEVENLABS_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`

### 3) Ensure Next.js server env is also configured

Required in Next runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Without these, `/api/mjrvs/summarize-session` will fail before reaching Edge.

### 4) Validate end-to-end summarization

Trigger a manual POST to `/api/mjrvs/summarize-session` with:

- `conversation_id`
- `session_duration_minutes`
- `turn_count`

Expect:

- `{ success: true, memory_id, summary_preview }` from Edge pipeline.

---

## Database contract for session continuity

Edge function inserts into table: `mjrvs_memories`

Fields used by the insert payload:

- `content`
- `category` (set to `session_continuity`)
- `confidence` (set to `verified`)
- `impact` (set to `high`)
- `importance` (set to `0.90`)
- `source` (set to `session_summarizer`)
- `metadata` object with:
  - `tag=session_handoff`
  - `load_trigger=session_start`
  - `source_conversation_id`
  - `session_duration_minutes`
  - `turn_count`
  - `summarized_at`
- `embedding` (currently stringified embedding array)

Your table must accept these columns/types.

---

## Operator workflow guide

### Start-of-session

1. Open dashboard.
2. Choose Assistant Mode (`Voice` or `Text`) before connecting.
3. Choose audio input mode (`Mic`, `Device`, `Mic + Device`).
4. Optionally select specific microphone.
5. Press call button to connect.

### During session

- Watch status/state in header.
- Monitor active node and node type.
- Use transcript tools (search, copy, download).
- Watch Tool Call Log and Error Log.
- Use keyboard panel for typed input/attachments.
- Use mute toggle or `m` hotkey.

### Near 40 minutes

- Respond to warning banner:
  - Restart now (recommended), or
  - Dismiss (temporary), or
  - Allow automatic restart countdown.

### After session

- View ended sessions in Session History.
- Rename session labels.
- Open cached transcript snapshots for review.
- Start a fresh session with "New Session".

---

## Security posture and hardening checklist

Current behavior to understand:

- API routes are server-side and keep keys off the client.
- Edge function handles JSON validation and method checks.
- Edge CORS is permissive (`*`).
- Next routes currently do not enforce user auth/rate limits.

Recommended hardening tasks:

1. Add auth controls to internal API routes.
2. Add rate limiting on signed URL and summarization endpoints.
3. Review Edge JWT verification policy in Supabase deployment config.
4. Minimize raw upstream error detail exposure in API responses.
5. Rotate service keys regularly.

---

## Performance analysis artifacts

Files:

- `jrvs_v3_latency_analysis.py`
- `jrvs_v3_latency_raw.json`
- `jrvs_v3_latency_summary.md`

Highlights from current report:

- Primary metric: `convai_llm_service_ttfb`.
- 10 conversations analyzed.
- 722 agent turns analyzed.
- Global LLM TTFB:
  - mean: ~2055.7 ms
  - median: ~1761.0 ms
  - p95: ~4487.8 ms
- TTS TTFB mean: ~389.0 ms.

Use the script to regenerate baselines as agent config or model routing changes.

---

## Optional/unwired modules

These exist in repo but are not currently wired into `app/page.tsx` main flow:

- `components/ui/speech-input.tsx`
- `hooks/use-scribe.ts`
- `/api/scribe-token` consumption from main dashboard
- `components/ui/config-inspector.tsx` (legacy/alternate inspector)
- `components/ui/mjrvs_structured_content.tsx` (alternate structured renderer)

---

## Commands and tooling

### App commands

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`

### Cloud agent setup helper

- `bash scripts/mjrvs_agent_setup.sh`

### Notes

- No dedicated `test` script is currently defined.
- Root TypeScript config excludes `supabase/functions/**` from root TS checks.

---

## Repository map

```text
app/
  page.tsx                                 # Main UI and runtime orchestration
  api/
    signed-url/route.ts                    # ElevenLabs signed conversation URL
    agent-config/route.ts                  # Agent config snapshot API
    scribe-token/route.ts                  # Optional Scribe realtime token
    mjrvs/summarize-session/route.ts       # Proxy to Supabase Edge summarizer

components/
  ui/
    conversation-bar.tsx                   # Session controls and messaging
    mic-selector.tsx                       # Mic picker + waveform preview
    live-waveform.tsx                      # Canvas waveform renderer
    speech-input.tsx                       # Optional speech input compound UI
    response.tsx                           # Streamdown markdown renderer
    mjrvs_structured_markdown_block.tsx    # Structured markdown block renderer
  mjrvs_config_inspector_panel.tsx         # Agent config inspector side panel

lib/
  server-env.ts                            # Canonical env + agent id resolution
  mjrvs_config_snapshot.ts                 # Config fetch/decompose/cache logic

supabase/functions/
  mjrvs_summarize_session/index.ts         # Session continuity pipeline

scripts/
  mjrvs_agent_setup.sh                     # Cloud setup bootstrap
```

---

## Branch protocol

All JRVS updates must be committed and pushed directly to `main`.

- Do not create feature branches for JRVS work orders.
- Keep changes traceable with descriptive commits.

---

## Troubleshooting

### Session fails to start

Check:

- `MJRVS_ELEVENLABS_AGENT_ID` is set.
- `ELEVENLABS_API_KEY` is set and valid.
- `/api/signed-url` returns JSON with `signedUrl`.

### Agent Config panel fails

Check:

- `/api/agent-config` response body for `error` and `details`.
- ElevenLabs key validity and agent id correctness.

### Auto-restart summary fails

Check:

- Next env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Edge secrets: `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`.
- Supabase function deploy status and logs.

### Attachments behave unexpectedly

Expected behavior:

- Text-like files are read in-browser and truncated.
- Non-text files send metadata only.
- No backend object-storage upload currently exists.

---

If you need a role-specific version of this manual (Operator-only, Developer-only, or SRE-only), split this README into separate docs under `/docs` while keeping this file as the canonical index.
